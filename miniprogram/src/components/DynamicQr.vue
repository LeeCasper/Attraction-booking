<script setup lang="ts">
import { computed } from 'vue';
import { QR_DATA, QR_FINDER, type QrRect } from './qr-pattern';

/**
 * 动态二维码。
 *
 * 为什么不用 canvas 或引入 qrcode 库：一期是静态还原，二维码里的内容是假的
 * （设计稿画的也是一个随机图案）。这里用「百分比定位的 view」复刻设计稿的画法，
 * 好处是首屏渲染与设计稿**逐像素一致**、零依赖、渲染路径确定。
 *
 * seed = 0 时直接用设计稿原图案；其他 seed 按确定性 PRNG 重排数据点，
 * 三个定位角保持不变（真二维码的定位角同样不随内容变化）。
 *
 * ⚠️ 这是**视觉占位**：接入 `GET /api/mini/orders/:id/credential` 后，
 * 应改为用真实凭证 token 生成二维码矩阵（届时可换成 canvas + qrcode 库，
 * 或继续用本组件的 view 网格、只把矩阵来源换成真 token）。
 */
const props = defineProps<{ seed: number }>();

/** 数据点的网格坐标（从设计稿的数据点去重反推），以及单格边长 */
const grid = (() => {
  const xs = [...new Set(QR_DATA.map((r) => r.x))].sort((a, b) => a - b);
  const ys = [...new Set(QR_DATA.map((r) => r.y))].sort((a, b) => a - b);
  return { xs, ys, size: QR_DATA[0]?.w ?? 6 };
})();

/** 确定性 PRNG（线性同余），保证同一 seed 每次渲染一致 */
function pseudoRandom(seed: number) {
  let state = (seed * 2654435761 + 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const dataCells = computed<QrRect[]>(() => {
  // seed 0：原样用设计稿的图案，保证首屏与设计稿一致
  if (!props.seed) return QR_DATA;

  const rand = pseudoRandom(props.seed);
  const cells: QrRect[] = [];
  for (const y of grid.ys) {
    for (const x of grid.xs) {
      // 密度对齐设计稿（49/169 ≈ 29%）
      if (rand() < 0.29) {
        cells.push({ x, y, w: grid.size, h: grid.size, rx: 0, fill: '#121e1c' });
      }
    }
  }
  return cells;
});

const rects = computed(() => [...QR_FINDER, ...dataCells.value]);

/** viewBox 是 0–100，直接当百分比用 */
function styleOf(r: QrRect) {
  const parts = [
    `left:${r.x}%`,
    `top:${r.y}%`,
    `width:${r.w}%`,
    `height:${r.h}%`,
    `background-color:${r.fill}`,
  ];
  // rx 按 viewBox 单位给出（0–100），换算成元素自身边长的百分比；本组数据全是正方形
  if (r.rx > 0 && r.w > 0) parts.push(`border-radius:${((r.rx / r.w) * 100).toFixed(2)}%`);
  return parts.join(';');
}
</script>

<template>
  <view class="pg-svg w-full h-full z-10">
    <view v-for="(r, i) in rects" :key="i" class="pg-qr-rect" :style="styleOf(r)" />
  </view>
</template>
