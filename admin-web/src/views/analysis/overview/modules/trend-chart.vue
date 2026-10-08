<script setup lang="ts">
import { onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { formatPrice } from '@/utils/business';

const props = defineProps<{
  /** 按日趋势（服务端已对无数据日期补 0） */
  data: Api.Analysis.TrendPoint[];
}>();

const chartRef = ref<HTMLDivElement | null>(null);

let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

/** tooltip 定制：在默认系列值之外补一条核销率 */
function buildTooltip(raw: unknown) {
  const list = (Array.isArray(raw) ? raw : [raw]) as Array<{ axisValue?: string; name?: string }>;
  const date = list[0]?.axisValue ?? list[0]?.name ?? '';
  const row = props.data.find(item => item.date === date);

  if (!row) return date;

  return [
    `<div style="font-weight:600">${date}</div>`,
    `预约人数：${row.reserved} 人`,
    `核销人数：${row.verified} 人`,
    `收入：${formatPrice(row.income)}`,
    `核销率：${((row.verifyRate ?? 0) * 100).toFixed(1)}%`
  ].join('<br/>');
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

  const dates = props.data.map(point => point.date);
  const reserved = props.data.map(point => point.reserved);
  const verified = props.data.map(point => point.verified);
  /** 收入分 → 元（右轴） */
  const income = props.data.map(point => Number((point.income / 100).toFixed(2)));

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => buildTooltip(params)
    },
    legend: {
      top: 4,
      data: ['预约人数', '核销人数', '收入'],
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
      boundaryGap: true,
      data: dates,
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: splitColor } }
    },
    yAxis: [
      {
        type: 'value',
        name: '人数',
        minInterval: 1,
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        splitLine: { lineStyle: { color: splitColor } }
      },
      {
        type: 'value',
        name: '收入（元）',
        nameTextStyle: { color: axisColor },
        axisLabel: { color: axisColor },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '预约人数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#5b7cfa' },
        data: reserved
      },
      {
        name: '核销人数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#26deca' },
        data: verified
      },
      {
        name: '收入',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 22,
        itemStyle: { color: '#f5a623', borderRadius: [3, 3, 0, 0] },
        data: income
      }
    ]
  };

  chart.setOption(option, true);
}

function initChart() {
  const el = chartRef.value;

  if (!el || chart) return;

  chart = echarts.init(el);

  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(el);
}

function destroyChart() {
  resizeObserver?.disconnect();
  resizeObserver = null;

  chart?.dispose();
  chart = null;
}

watch(
  () => props.data,
  () => renderChart()
);

onMounted(() => {
  initChart();
  renderChart();
});

/** keep-alive 回到页面时容器尺寸可能已变化 */
onActivated(() => chart?.resize());

onUnmounted(() => destroyChart());
</script>

<template>
  <div ref="chartRef" class="h-360px w-full overflow-hidden"></div>
</template>

<style scoped></style>
