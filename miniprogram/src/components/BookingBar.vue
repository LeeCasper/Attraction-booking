<script setup lang="ts">
/**
 * 底部固定待付条 —— 设计稿里 `.fixed.bottom-16…` 那一条。
 *
 * class 逐字取自 `design/reference/booking.html`。
 * 与设计稿的差异：设计稿的金额是写死的 120、(1人)；这里由上游算好的 `amount` 传入（**单位分**），
 * 且**一个人都没勾选时按钮置灰**（设计稿只有「已选 1 人」这一种状态，没有禁用样本，
 * 这里直接用设计系统已有的 opacity-60 降级，不新造样式）。
 */
import { fen2yuan } from '@/utils/format';

const props = withDefaults(defineProps<{ amount: number; count: number; canSubmit?: boolean }>(), {
  canSubmit: true,
});

const emit = defineEmits<{ submit: [] }>();

// pg-bookingbar 是本项目自有的钩子类，用来在 scoped 样式里覆盖设计稿的 bottom-16，见文末
const BAR =
  'pg-bookingbar fixed bottom-16 left-0 right-0 z-40 bg-paper-surface_95 backdrop-blur-md px-margin py-3 border-t border-silk-border_60 shadow-0_-4px_16px_rgba0104950_08';
const BAR_INNER = 'flex items-center justify-between max-w-md mx-auto';
const BTN_BASE =
  'bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary px-8 py-2_5 rounded-full font-medium text-15px shadow-sm hover-opacity-95 active-scale-95 transition-all';

/** 后端金额是分，展示要转元 */
const total = () => fen2yuan(props.amount);

function onSubmit() {
  if (!props.canSubmit) return;
  emit('submit');
}
</script>

<template>
  <view :class="BAR">
    <view :class="BAR_INNER">
      <view class="flex items-baseline">
        <text class="font-caption-sm text-caption-sm text-ink-light-gray mr-1">待付</text>
        <text class="font-caption-sm text-13px font-bold text-cinnabar-red">¥</text>
        <text class="font-data-metric-lg text-26px font-bold text-cinnabar-red ml-0_5">{{ total() }}</text>
        <text class="font-caption-sm text-11px text-ink-light-gray ml-1_5 font-medium">({{ count }}人)</text>
      </view>
      <view
        :class="[BTN_BASE, canSubmit ? '' : 'opacity-60']"
        :hover-class="canSubmit ? 'active-scale-95 pg-hover' : 'none'"
        @tap="onSubmit"
      >
        <text>立即预约</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 覆盖设计稿的 bottom-16（= 64px）。那个值是按「底栏 64px 且没有安全区」画的，
// 真机带 Home Indicator 时底栏实际是「64px + 安全区(34px)」，待付条会嵌进底栏里 ——
// 和顶栏被状态栏盖住是同一类问题：固定偏移没算安全区。
// scoped 样式带 [data-v-x]，特异性高于工具类，能稳稳覆盖。
.pg-bookingbar {
  // 偏移必须与底栏的实际高度一致，所以用底栏那个「安全区取半」的值，见 tokens.scss
  bottom: calc(#{px2rpx(64)} + #{$safe-bottom-tabbar});
}

// 注意：待付条是 fixed、不占文档流，它下方的内容留白**由设计稿自己给了** ——
// 购票视图内容层的 `pb-20`（80px）就是给待付条让位的（待付条实测 66px，留 14px 余量）。
// 不要在这里再补一个让位块，那会比设计稿多出 80px 的空白。
// （`<main>` 上的 `pb-28` 是给底部 tab 让位的，那部分已由外壳的 TabBar 让位块承担，
//   见 scripts/gen-pages.mjs 的 VIEW_DROP。）
</style>
