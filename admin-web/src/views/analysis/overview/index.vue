<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { orderChannelRecord } from '@/constants/business';
import {
  exportReport,
  fetchGetAnalysisOverview,
  fetchGetAnalysisTrend,
  fetchGetScenicAreas,
  fetchGetTraffic
} from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { formatDate, formatPrice } from '@/utils/business';
import TrendChart from './modules/trend-chart.vue';
import TrafficChart from './modules/traffic-chart.vue';

const { hasAuth } = useAuth();

/** 页面只读，路由 meta.roles 兜底，这里再做一次校验避免无权限时发请求 */
const canRead = computed(() => hasAuth('stats:read'));

type RangeMode = '7' | '30' | 'custom';
type Granularity = 'hour' | 'day' | 'month';

interface MetricItem {
  key: string;
  label: string;
  value: number | string;
  desc: string;
  color?: 'danger' | 'warning';
}

/** 导出下拉项 */
const EXPORT_OPTIONS: Array<{ command: Api.Analysis.ExportType; label: string }> = [
  { command: 'orders', label: '订单明细' },
  { command: 'verifications', label: '核销记录' },
  { command: 'passages', label: '通行记录' },
  { command: 'refunds', label: '退款单' },
  { command: 'daily', label: '经营日报' }
];

const areas = ref<Api.Scenic.Area[]>([]);
// **0 = 全部景区**，与实时看板同一套（景点 id 从 1 开始，不会冲突）。
// 用 0 而不是 null：ElOption 的 value 类型不收 null
const areaId = ref<number>(0);
const rangeMode = ref<RangeMode>('7');
const dateRange = ref<string[] | null>(getRangeByDays(7));
const granularity = ref<Granularity>('day');

const loading = ref(false);
const exporting = ref(false);
const refreshFailed = ref(false);
const refreshedAt = ref('');

const overview = ref<Api.Analysis.Overview | null>(null);
const trend = ref<Api.Analysis.TrendPoint[]>([]);
const traffic = ref<Api.Analysis.TrafficPoint[]>([]);

function getRangeByDays(days: number): [string, string] {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  return [formatDate(start), formatDate(end)];
}

function formatClock(date: Date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

function percent(rate: number | null | undefined) {
  return `${((rate ?? 0) * 100).toFixed(1)}%`;
}

function metricValueClass(color?: MetricItem['color']) {
  if (color === 'danger') return 'text-red-500';
  if (color === 'warning') return 'text-orange-500';

  return '';
}

/** 当前有效日期区间，未选全时返回 null */
const activeRange = computed(() => {
  const [start, end] = dateRange.value ?? [];

  return start && end ? { start, end } : null;
});

const metrics = computed<MetricItem[]>(() => {
  const data = overview.value;

  if (!data) return [];

  const { conversion: c, finance: f } = data;

  return [
    {
      key: 'verifyRate',
      label: '核销率',
      value: percent(c.verifyRate),
      desc: `预约 ${c.reserved} 人 · 已核销 ${c.verified} 人`
    },
    {
      key: 'noShowRate',
      label: '爽约率',
      value: percent(c.noShowRate),
      desc: `过期未核销 ${c.expired} 人 / 预约 ${c.reserved} 人`,
      color: c.noShowRate >= 0.2 ? 'warning' : undefined
    },
    {
      key: 'refundRate',
      label: '退单率',
      value: percent(c.refundRate),
      desc: `退款订单 ${c.refundedOrders} / 已支付订单 ${c.paidOrders}`,
      color: c.refundRate >= 0.2 ? 'danger' : undefined
    },
    {
      key: 'netAmount',
      label: '实收金额',
      value: formatPrice(f.netAmount),
      desc: `收入 ${formatPrice(f.grossAmount)} - 退款 ${formatPrice(f.refundAmount)}`
    },
    {
      key: 'todayAmount',
      label: '今日收入',
      value: formatPrice(f.todayAmount),
      desc: '按支付时间统计当日实收'
    }
  ];
});

async function loadTraffic() {
  if (!canRead.value) return;

  const range = activeRange.value;

  if (!range) return;

  const { data, error } = await fetchGetTraffic({
    areaId: areaId.value || undefined,
    granularity: granularity.value,
    ...range
  });

  if (error) {
    refreshFailed.value = true;
    window.$message?.error('客流数据加载失败，已保留上次结果');
    return;
  }

  traffic.value = data;
}

async function loadData() {
  if (!canRead.value) return;

  const range = activeRange.value;

  if (!range) {
    window.$message?.warning('请选择完整的日期区间');
    return;
  }

  loading.value = true;
  refreshFailed.value = false;

  const params: Api.Analysis.RangeParams = {
    areaId: areaId.value || undefined,
    ...range
  };

  const [overviewRes, trendRes, trafficRes] = await Promise.all([
    fetchGetAnalysisOverview(params),
    fetchGetAnalysisTrend(params),
    fetchGetTraffic({ ...params, granularity: granularity.value })
  ]);

  // 失败时保留上一次成功的数据，仅置位提示
  if (overviewRes.error) {
    refreshFailed.value = true;
  } else {
    overview.value = overviewRes.data;
  }

  if (trendRes.error) {
    refreshFailed.value = true;
  } else {
    trend.value = trendRes.data;
  }

  if (trafficRes.error) {
    refreshFailed.value = true;
  } else {
    traffic.value = trafficRes.data;
  }

  if (refreshFailed.value) {
    window.$message?.error('部分数据加载失败，已保留上次结果');
  } else {
    refreshedAt.value = formatClock(new Date());
  }

  loading.value = false;
}

function handleRangeModeChange(raw: string | number | boolean | undefined) {
  const mode = raw as RangeMode;

  if (mode === 'custom') {
    // 自定义：等用户在日期选择器中选好区间再查询
    return;
  }

  dateRange.value = getRangeByDays(mode === '30' ? 30 : 7);
  loadData();
}

function handleDateRangeChange() {
  if (rangeMode.value === 'custom' && activeRange.value) {
    loadData();
  }
}

function handleAreaChange() {
  loadData();
}

async function handleExport(command: Api.Analysis.ExportType) {
  const range = activeRange.value;

  if (!range) {
    window.$message?.warning('请选择完整的日期区间');
    return;
  }

  exporting.value = true;

  try {
    await exportReport(command, {
      areaId: areaId.value || undefined,
      ...range
    });
    window.$message?.success('报表已开始下载');
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : '导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

watch(granularity, () => loadTraffic());

onMounted(async () => {
  if (!canRead.value) return;

  const { data: areaList, error } = await fetchGetScenicAreas();

  if (!error && areaList.length > 0) {
    areas.value = areaList;
    // **不默认选中第一个**：停在 0 = 全部景区，与后端口径一致
    // （多景区下把「全部」静默变成「示例山景区」，数字看着合理、其实只是一家的）
    areaId.value = 0;
  }

  await loadData();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert
      v-if="!canRead"
      title="当前账号没有运营分析查看权限（stats:read），请联系系统管理员"
      type="warning"
      :closable="false"
      show-icon
    />

    <template v-else>
      <!-- 顶部工具栏 -->
      <ElCard class="card-wrapper" :body-style="{ padding: '12px 16px' }">
        <div class="flex flex-wrap items-center justify-between gap-12px">
          <div class="flex flex-wrap items-center gap-16px">
            <div class="flex items-center gap-8px">
              <span class="text-14px text-gray-500">景区</span>
              <ElSelect v-model="areaId" placeholder="全部景区" class="w-200px" @change="handleAreaChange">
                <ElOption label="全部景区" :value="0" />
                <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
              </ElSelect>
            </div>

            <ElRadioGroup v-model="rangeMode" @change="handleRangeModeChange">
              <ElRadioButton value="7">近 7 天</ElRadioButton>
              <ElRadioButton value="30">近 30 天</ElRadioButton>
              <ElRadioButton value="custom">自定义</ElRadioButton>
            </ElRadioGroup>

            <ElDatePicker
              v-if="rangeMode === 'custom'"
              v-model="dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              @change="handleDateRangeChange"
            />
          </div>

          <div class="flex flex-wrap items-center gap-12px">
            <span class="text-13px text-gray-500">最后刷新：{{ refreshedAt || '—' }}</span>
            <ElText v-if="refreshFailed" type="danger">刷新失败，展示最近一次成功数据</ElText>

            <ElDropdown :disabled="exporting" @command="handleExport">
              <ElButton type="primary" plain :loading="exporting">
                导出报表
                <icon-ic-round-arrow-drop-down class="ml-4px text-icon" />
              </ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem v-for="item in EXPORT_OPTIONS" :key="item.command" :command="item.command">
                    {{ item.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <ElButton type="primary" :loading="loading" @click="loadData">刷新</ElButton>
          </div>
        </div>
      </ElCard>

      <div v-loading="loading" element-loading-background="rgba(127, 127, 127, 0.08)" class="flex-col-stretch gap-16px">
        <template v-if="overview">
          <!-- 区块一：核心指标卡 -->
          <ElRow :gutter="16">
            <ElCol v-for="item in metrics" :key="item.key" :xs="12" :sm="8" :lg="4" class="mb-16px">
              <ElCard class="h-full card-wrapper" :body-style="{ padding: '16px' }">
                <div class="flex-col gap-6px">
                  <span class="text-13px text-gray-500">{{ item.label }}</span>
                  <span class="text-30px font-600 leading-tight" :class="metricValueClass(item.color)">
                    {{ item.value }}
                  </span>
                  <span class="text-12px text-gray-400">{{ item.desc }}</span>
                </div>
              </ElCard>
            </ElCol>
          </ElRow>

          <!-- 区块二：预约与经营趋势 -->
          <ElCard class="card-wrapper">
            <template #header>
              <div class="flex items-center justify-between">
                <p>预约与经营趋势</p>
                <ElText type="info">{{ overview.range.start }} ~ {{ overview.range.end }}（按日）</ElText>
              </div>
            </template>
            <TrendChart :data="trend" />
          </ElCard>

          <!-- 区块三：客流分析 -->
          <ElCard class="card-wrapper">
            <template #header>
              <div class="flex items-center justify-between">
                <p>客流分析</p>
                <ElRadioGroup v-model="granularity" size="small">
                  <ElRadioButton value="hour">分时</ElRadioButton>
                  <ElRadioButton value="day">按日</ElRadioButton>
                  <ElRadioButton value="month">按月</ElRadioButton>
                </ElRadioGroup>
              </div>
            </template>
            <TrafficChart :data="traffic" :granularity="granularity" />
          </ElCard>

          <ElRow :gutter="16">
            <!-- 区块四：票种分析 -->
            <ElCol :xs="24" :lg="12">
              <ElCard class="h-full card-wrapper">
                <template #header>
                  <p>票种分析</p>
                </template>
                <ElTable :data="overview.ticketTypes" border size="small">
                  <ElTableColumn prop="name" label="票种" min-width="120" show-overflow-tooltip />
                  <ElTableColumn prop="sold" label="销量" width="80" align="right" />
                  <ElTableColumn prop="verified" label="已核销" width="86" align="right" />
                  <ElTableColumn prop="amount" label="收入" width="120" align="right">
                    <template #default="{ row }">{{ formatPrice(row.amount) }}</template>
                  </ElTableColumn>
                  <ElTableColumn prop="soldRatio" label="销量占比" min-width="140">
                    <template #default="{ row }">
                      <div class="flex items-center gap-8px">
                        <ElProgress
                          :percentage="Number(((row.soldRatio ?? 0) * 100).toFixed(1))"
                          :show-text="false"
                          :stroke-width="10"
                          class="flex-1"
                        />
                        <span class="text-12px text-gray-500">{{ percent(row.soldRatio) }}</span>
                      </div>
                    </template>
                  </ElTableColumn>
                  <ElTableColumn prop="amountRatio" label="收入占比" width="90" align="right">
                    <template #default="{ row }">{{ percent(row.amountRatio) }}</template>
                  </ElTableColumn>
                </ElTable>
              </ElCard>
            </ElCol>

            <!-- 区块五：渠道分析 -->
            <ElCol :xs="24" :lg="12">
              <ElCard class="h-full card-wrapper">
                <template #header>
                  <p>渠道分析</p>
                </template>
                <ElAlert
                  class="mb-12px"
                  title="口径说明：预约侧指标（预约 / 核销 / 爽约）按预约日期归集；资金侧指标（收入 / 退款）按支付时间归集"
                  type="info"
                  :closable="false"
                  show-icon
                />
                <ElTable :data="overview.channels" border size="small">
                  <ElTableColumn prop="channel" label="渠道" min-width="110">
                    <template #default="{ row }">{{ orderChannelRecord[row.channel] ?? row.channel }}</template>
                  </ElTableColumn>
                  <ElTableColumn prop="orders" label="订单数" width="90" align="right" />
                  <ElTableColumn prop="amount" label="金额" width="130" align="right">
                    <template #default="{ row }">{{ formatPrice(row.amount) }}</template>
                  </ElTableColumn>
                  <ElTableColumn prop="verifications" label="核销笔数" width="100" align="right" />
                </ElTable>
              </ElCard>
            </ElCol>
          </ElRow>
        </template>

        <ElCard v-else class="card-wrapper">
          <ElEmpty description="正在加载运营分析数据…" />
        </ElCard>
      </div>
    </template>
  </div>
</template>

<style scoped></style>
