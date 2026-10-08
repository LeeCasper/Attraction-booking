<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { orderChannelRecord } from '@/constants/business';
import { fetchGetHourlyTrend, fetchGetRealtime, fetchGetScenicAreas } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { formatPrice } from '@/utils/business';

const { hasAuth } = useAuth();

/** 页面只读，权限由路由 meta.roles 兜底，此处再做一次校验避免无权限时发请求 */
const canRead = computed(() => hasAuth('stats:read'));

/** 自动刷新间隔（毫秒） */
const REFRESH_INTERVAL = 10_000;

/** 分时趋势横轴：00:00 ~ 23:00 */
const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

interface MetricItem {
  key: string;
  label: string;
  value: number | string;
  desc: string;
  color?: 'danger' | 'warning';
}

const areas = ref<Api.Scenic.Area[]>([]);
const areaId = ref<number | null>(null);
const autoRefresh = ref(true);
const loading = ref(false);
/** 最近一次成功刷新的时间 */
const refreshedAt = ref('');
/** 最近一次刷新是否失败（失败时保留上次数据） */
const refreshFailed = ref(false);
const realtime = ref<Api.Stats.Realtime | null>(null);
const hourly = ref<Api.Stats.HourlyPoint[]>([]);

const chartRef = ref<HTMLDivElement | null>(null);
const channels = computed(() => realtime.value?.channels ?? []);

let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function percent(rate: number | null | undefined) {
  return `${((rate ?? 0) * 100).toFixed(1)}%`;
}

function formatClock(date: Date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

function metricValueClass(color?: MetricItem['color']) {
  if (color === 'danger') return 'text-red-500';
  if (color === 'warning') return 'text-orange-500';

  return '';
}

/** 承载率 0~1 → 进度条百分比（上限 100） */
const capacityPercent = computed(() => {
  const rate = realtime.value?.capacityRate ?? 0;

  return Math.min(100, Math.max(0, Number((rate * 100).toFixed(1))));
});

/** 承载率 ≥90% 危险、≥80% 警告（ElProgress 用 status 表达颜色） */
const capacityStatus = computed<'' | 'warning' | 'exception'>(() => {
  const rate = realtime.value?.capacityRate ?? 0;

  if (rate >= 0.9) return 'exception';
  if (rate >= 0.8) return 'warning';

  return '';
});

const capacityLevel = computed(() => {
  const rate = realtime.value?.capacityRate ?? 0;

  if (rate >= 0.9) return { text: '承载超限预警', tag: 'danger' as UI.ThemeColor, color: 'text-red-500' };
  if (rate >= 0.8) return { text: '接近承载上限', tag: 'warning' as UI.ThemeColor, color: 'text-orange-500' };

  return { text: '承载正常', tag: 'success' as UI.ThemeColor, color: 'text-primary' };
});

const metrics = computed<MetricItem[]>(() => {
  const d = realtime.value;

  if (!d) return [];

  return [
    {
      key: 'reserved',
      label: '今日预约人数',
      value: d.reservedToday,
      desc: '已支付预约单的预约人数'
    },
    {
      key: 'verified',
      label: '今日核销人数',
      value: d.verifiedToday,
      desc: `核销 ${d.verificationCount} 笔`
    },
    {
      key: 'verifyRate',
      label: '核销率',
      value: percent(d.verifyRate),
      desc: '核销人数 / 预约人数'
    },
    {
      key: 'gateOnlineRate',
      label: '闸机在线率',
      value: percent(d.gateOnlineRate),
      desc: `${d.gateOnline} / ${d.gateTotal} 台在线`
    },
    {
      key: 'inToday',
      label: '今日入园',
      value: d.inToday,
      desc: '仅统计通过 / 应急放行'
    },
    {
      key: 'outToday',
      label: '今日出园',
      value: d.outToday,
      desc: '仅统计通过 / 应急放行'
    },
    {
      key: 'rejectedToday',
      label: '今日拒绝通行',
      value: d.rejectedToday,
      desc: '凭证无效 / 重复核销等'
    },
    {
      key: 'alarmPending',
      label: '待处理告警',
      value: d.alarmPending,
      desc: `其中严重告警 ${d.alarmCritical} 条`,
      color: d.alarmPending > 0 ? 'danger' : undefined
    }
  ];
});

/** 按小时对齐，缺失小时补 0 */
function pickByHour(field: 'inCount' | 'outCount' | 'verifyCount') {
  const map = new Map(hourly.value.map(point => [point.hour, point]));

  return HOUR_LABELS.map((_, hour) => map.get(hour)?.[field] ?? 0);
}

function renderChart() {
  const el = chartRef.value;

  if (!el) return;

  if (!chart) {
    chart = echarts.init(el);
  }

  const dark = document.documentElement.classList.contains('dark');
  const axisColor = dark ? 'rgba(224, 224, 224, 0.65)' : 'rgba(31, 31, 31, 0.55)';
  const splitColor = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      top: 4,
      data: ['入园', '出园', '核销'],
      textStyle: { color: axisColor }
    },
    grid: {
      left: 12,
      right: 20,
      top: 44,
      bottom: 8,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: HOUR_LABELS,
      axisLabel: { color: axisColor, interval: 1 },
      axisLine: { lineStyle: { color: splitColor } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      {
        name: '入园',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#5b7cfa' },
        areaStyle: { color: 'rgba(91, 124, 250, 0.12)' },
        data: pickByHour('inCount')
      },
      {
        name: '出园',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#26deca' },
        data: pickByHour('outCount')
      },
      {
        name: '核销',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#f5a623' },
        data: pickByHour('verifyCount')
      }
    ]
  };

  chart.setOption(option, true);
}

function initChart() {
  const el = chartRef.value;

  if (!el || chart) return;

  chart = echarts.init(el);

  // 容器尺寸变化（窗口缩放 / 侧边栏折叠）时自适应
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(el);
}

function destroyChart() {
  resizeObserver?.disconnect();
  resizeObserver = null;

  chart?.dispose();
  chart = null;
}

async function loadData() {
  if (!canRead.value) return;

  loading.value = true;
  refreshFailed.value = false;

  const [realtimeRes, hourlyRes] = await Promise.all([
    fetchGetRealtime(areaId.value ?? undefined),
    fetchGetHourlyTrend(areaId.value ?? undefined)
  ]);

  // 失败时保留上一次成功的数据，仅置位提示
  if (realtimeRes.error) {
    refreshFailed.value = true;
  } else {
    realtime.value = realtimeRes.data;
  }

  if (hourlyRes.error) {
    refreshFailed.value = true;
  } else {
    hourly.value = hourlyRes.data;
  }

  if (!refreshFailed.value) {
    refreshedAt.value = formatClock(new Date());
  }

  await nextTick();
  renderChart();

  loading.value = false;
}

function startTimer() {
  stopTimer();
  timer = setInterval(loadData, REFRESH_INTERVAL);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function handleAreaChange() {
  loadData();
}

watch(autoRefresh, enabled => {
  if (enabled) {
    startTimer();
  } else {
    stopTimer();
  }
});

onMounted(async () => {
  if (!canRead.value) return;

  const { data: areaList, error } = await fetchGetScenicAreas();

  if (!error && areaList.length > 0) {
    areas.value = areaList;
    // 一期单景区：默认选中第一个；多景区时用户在顶部切换
    areaId.value = areaList[0].id;
  }

  initChart();
  renderChart();

  await loadData();

  if (autoRefresh.value) {
    startTimer();
  }
});

/** 被 keep-alive 缓存时暂停轮询，回到页面再恢复 */
onActivated(() => {
  if (autoRefresh.value && canRead.value) {
    startTimer();
  }
});

onDeactivated(() => {
  stopTimer();
});

onUnmounted(() => {
  stopTimer();
  destroyChart();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert
      v-if="!canRead"
      title="当前账号没有数据看板查看权限（stats:read），请联系系统管理员"
      type="warning"
      :closable="false"
      show-icon
    />

    <template v-else>
      <ElCard class="card-wrapper" :body-style="{ padding: '12px 16px' }">
        <div class="flex flex-wrap items-center justify-between gap-12px">
          <div class="flex items-center gap-8px">
            <span class="text-14px text-gray-500">景区</span>
            <ElSelect v-model="areaId" placeholder="全部景区" class="w-220px" @change="handleAreaChange">
              <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
            </ElSelect>
          </div>
          <div class="flex flex-wrap items-center gap-16px">
            <ElSwitch v-model="autoRefresh" active-text="自动刷新（10 秒）" />
            <span class="text-13px text-gray-500">最后刷新：{{ refreshedAt || '—' }}</span>
            <ElText v-if="refreshFailed" type="danger">刷新失败，展示最近一次成功数据</ElText>
            <ElButton type="primary" plain :loading="loading" @click="loadData">刷新</ElButton>
          </div>
        </div>
      </ElCard>

      <div v-loading="loading" element-loading-background="rgba(127, 127, 127, 0.08)" class="flex-col-stretch gap-16px">
        <template v-if="realtime">
          <!-- 核心指标：当前在园人数（最醒目） -->
          <ElCard class="card-wrapper">
            <div class="flex flex-wrap items-center gap-32px">
              <div class="min-w-220px">
                <div class="text-14px text-gray-500">当前在园人数</div>
                <div class="mt-8px flex items-baseline gap-8px">
                  <span class="text-56px font-600 leading-none" :class="capacityLevel.color">
                    {{ realtime.presence.toLocaleString() }}
                  </span>
                  <span class="text-16px text-gray-400">人</span>
                </div>
              </div>

              <div class="min-w-280px flex-1">
                <div class="mb-8px flex items-center justify-between">
                  <span class="text-13px text-gray-500">承载率</span>
                  <span class="text-13px font-600" :class="capacityLevel.color">
                    {{ percent(realtime.capacityRate) }}
                  </span>
                </div>
                <ElProgress :percentage="capacityPercent" :status="capacityStatus" :stroke-width="16" striped />
                <div class="mt-8px text-12px text-gray-400">
                  承载上限 {{ realtime.maxCapacity.toLocaleString() }} 人 · 在园人数为实时值（Redis 计数，每 5
                  分钟以通行记录校准）
                </div>
              </div>

              <ElTag :type="capacityLevel.tag" effect="dark">{{ capacityLevel.text }}</ElTag>
            </div>
          </ElCard>

          <!-- 其余核心指标 -->
          <ElRow :gutter="16">
            <ElCol v-for="item in metrics" :key="item.key" :xs="12" :sm="8" :lg="6" class="mb-16px">
              <ElCard class="h-full card-wrapper" :body-style="{ padding: '16px' }">
                <div class="flex-col gap-6px">
                  <span class="text-13px text-gray-500">{{ item.label }}</span>
                  <span class="text-32px font-600 leading-tight" :class="metricValueClass(item.color)">
                    {{ item.value }}
                  </span>
                  <span class="text-12px text-gray-400">{{ item.desc }}</span>
                </div>
              </ElCard>
            </ElCol>
          </ElRow>
        </template>

        <ElCard v-else class="card-wrapper">
          <ElEmpty description="正在加载看板数据…" />
        </ElCard>

        <ElRow :gutter="16">
          <ElCol :xs="24" :lg="16">
            <ElCard class="card-wrapper">
              <template #header>
                <div class="flex items-center justify-between">
                  <p>分时趋势</p>
                  <ElText type="info">今日 00:00 ~ 23:00</ElText>
                </div>
              </template>
              <div ref="chartRef" class="h-360px w-full overflow-hidden"></div>
            </ElCard>
          </ElCol>

          <ElCol :xs="24" :lg="8">
            <ElCard class="h-full card-wrapper">
              <template #header>
                <p>渠道分布</p>
              </template>
              <ElTable :data="channels" border size="small">
                <ElTableColumn prop="channel" label="渠道" min-width="110">
                  <template #default="{ row }">{{ orderChannelRecord[row.channel] ?? row.channel }}</template>
                </ElTableColumn>
                <ElTableColumn prop="count" label="订单数" width="100" align="right" />
                <ElTableColumn prop="amount" label="金额" width="130" align="right">
                  <template #default="{ row }">{{ formatPrice(row.amount) }}</template>
                </ElTableColumn>
              </ElTable>
            </ElCard>
          </ElCol>
        </ElRow>
      </div>
    </template>
  </div>
</template>

<style scoped></style>
