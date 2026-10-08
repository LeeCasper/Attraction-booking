<script setup lang="ts">
import { onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
  /** 客流点（bucket 随粒度变化：HH / yyyy-MM-dd / yyyy-MM） */
  data: Api.Analysis.TrafficPoint[];
  granularity: 'hour' | 'day' | 'month';
}>();

const chartRef = ref<HTMLDivElement | null>(null);

let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

/** 分时粒度下 bucket 为 HH，补成 HH:00 更易读 */
function bucketLabel(bucket: string) {
  return props.granularity === 'hour' && /^\d{1,2}$/.test(bucket) ? `${bucket.padStart(2, '0')}:00` : bucket;
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

  const labels = props.data.map(point => bucketLabel(point.bucket));

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      top: 4,
      data: ['入园', '出园', '拒绝通行'],
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
      data: labels,
      axisLabel: { color: axisColor },
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
        showSymbol: props.data.length <= 32,
        itemStyle: { color: '#5b7cfa' },
        data: props.data.map(point => point.inCount)
      },
      {
        name: '出园',
        type: 'line',
        smooth: true,
        showSymbol: props.data.length <= 32,
        itemStyle: { color: '#26deca' },
        data: props.data.map(point => point.outCount)
      },
      {
        name: '拒绝通行',
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { color: '#f56c6c', borderRadius: [3, 3, 0, 0] },
        data: props.data.map(point => point.rejected)
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
  () => [props.data, props.granularity],
  () => renderChart()
);

onMounted(() => {
  initChart();
  renderChart();
});

onActivated(() => chart?.resize());

onUnmounted(() => destroyChart());
</script>

<template>
  <div ref="chartRef" class="h-360px w-full overflow-hidden"></div>
</template>

<style scoped></style>
