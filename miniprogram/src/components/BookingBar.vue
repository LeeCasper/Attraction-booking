<script setup lang="ts">
/**
 * 底部固定待付条 —— 设计稿里 `.fixed.bottom-16…` 那一条。
 *
 * class 逐字取自 `design/reference/booking.html`。
 * 与设计稿的差异：设计稿的金额是写死的 120、(1人)；这里由 unitPrice × count 算出，
 * 且**一个人都没勾选时按钮置灰**（设计稿只有「已选 1 人」这一种状态，没有禁用样本，
 * 这里直接用设计系统已有的 opacity-60 降级，不新造样式）。
 */
const props = withDefaults(defineProps<{ unitPrice: number; count: number; canSubmit?: boolean }>(), {
  canSubmit: true,
});

const emit = defineEmits<{ submit: [] }>();

const BAR =
  'fixed bottom-16 left-0 right-0 z-40 bg-paper-surface_95 backdrop-blur-md px-margin py-3 border-t border-silk-border_60 shadow-0_-4px_16px_rgba0104950_08';
const BAR_INNER = 'flex items-center justify-between max-w-md mx-auto';
const BTN_BASE =
  'bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary px-8 py-2_5 rounded-full font-medium text-15px shadow-sm hover-opacity-95 active-scale-95 transition-all';

const total = () => props.unitPrice * props.count;

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
