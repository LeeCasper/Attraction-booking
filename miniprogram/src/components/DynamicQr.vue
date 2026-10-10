<script setup lang="ts">
import { computed } from 'vue';
import { encodeQr, type QrEcc } from '@/utils/qrcode';
import { qrImageDataUri } from '@/utils/qr-render';

/**
 * 动态二维码 —— **真能扫的**那种。
 *
 * 内容是服务端签发的动态凭证 token 本体（`GET /api/mini/orders/:id/credential`）。
 * 闸机就是把扫出来的原文当 `credential` 提交给 `POST /api/gate/verify`，
 * 所以这里**不能**加任何前缀/包装，必须原样整串编码，否则服务端按 `MALFORMED` 拒掉。
 *
 * ## 画法：自己编一张 1 位 PNG，绑给 `<image>`
 *
 * 这个组件先后用过三种画法，前两种都栽在小程序端的渲染上（详见 `utils/qr-render.ts` 的注解）：
 * 一格一个 view（4000+ 节点）、一行一个 view + 硬断点渐变（真机固定少画一行）、
 * canvas type="2d"（开发者工具能画、真机拿不到节点）。
 * 现在换成最朴素的一条：`qrImageDataUri()` 编出一张 ~34KB 的 data URI 交给 `<image>` ——
 * 不依赖任何平台 API、不参与层级合成、H5 与小程序同一份代码。
 *
 * ⚠️ 组件的 `height: 100%` 要有东西可依 —— 调用处必须把它包在有尺寸的容器里
 * （见 `scripts/page-bindings.mjs` 的 credential 节）。
 */
const props = withDefaults(
  defineProps<{
    /** 动态凭证 token。为空 = 没有可入园凭证，显示空态文案 */
    token: string;
    /** 纠错等级。中间没有 logo 压盖，M（可恢复 15%）足够；矩阵越小单模块越大、越好扫 */
    ecc?: QrEcc;
  }>(),
  { ecc: 'M' },
);

const matrix = computed(() => {
  if (!props.token) return null;
  try {
    return encodeQr(props.token, props.ecc);
  } catch {
    // 内容超长等异常：走空态，不让整个凭证页崩掉
    return null;
  }
});

/** 编出来的图。token 一变就重算 —— 这就是「动态」的地方 */
const source = computed(() =>
  matrix.value ? qrImageDataUri(matrix.value.rows, matrix.value.size) : '',
);
</script>

<template>
  <view class="pg-qr w-full h-full z-10">
    <!--
      `scaleToFill` 是刻意的：图是正方形，容器也是正方形，没有变形风险，
      而 aspectFit/aspectFill 会在框里留边或裁切。**不要**改成 aspectFit。
    -->
    <image v-if="source" class="pg-qr__image" :src="source" mode="scaleToFill" />
    <view v-else class="pg-qr__empty">
      <text class="pg-qr__empty-text">暂无可入园凭证</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 外层只是定位基准：尺寸完全由调用方给的容器决定
.pg-qr {
  position: relative;
  overflow: hidden;
}

.pg-qr__image {
  display: block;
  width: 100%;
  height: 100%;
  // 图是按 ~480px 出的、展示框约 198px，多数机型上是缩小（不影响清晰度）；
  // 少数 3x 屏会略微放大，用像素化避免插值糊掉模块边缘。不支持该属性时会忽略。
  image-rendering: pixelated;
}

.pg-qr__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pg-qr__empty-text {
  font-size: 23.08rpx;
  color: $c-ink-light-gray;
}
</style>
