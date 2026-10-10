<script setup lang="ts">
/**
 * 顶部「当前承载…」横幅。
 *
 * 设计稿把那圈小点跟文案写在**同一个 span** 里（`<span class="…flex items-center gap-1">
 *   <span class="w-1.5 h-1.5 …"/ > 当前承载舒适 (28%) </span>`），
 * 所以没法只用一个 `text` 绑定换掉文案 —— 那会把呼吸点一起换掉。
 * 整块 replace 成组件，呼吸点由组件自己画（样式沿用设计稿那一枚）。
 *
 * 文案是**真实数据**：全部开放景点汇总的在园率，口径与后台看板「全部景区」一致。
 */
const props = defineProps<{ label: string }>();

const WRAP = 'bg-surface-container-low rounded-xl p-3 flex items-start gap-2_5 shadow-sm';
const ICON_WRAP =
  'w-6 h-6 rounded-full bg-bamboo-light-100 flex items-center justify-center shrink-0 mt-0_5 text-primary';
const LINE = 'font-label-badge text-label-badge text-primary flex items-center gap-1';
const DOT = 'w-1_5 h-1_5 rounded-full bg-emerald-pass animate-pulse';
const TAG = 'text-caption-sm font-caption-sm text-outline';
const DESC = 'font-caption-sm text-caption-sm text-ink-dark-gray mt-0_5 leading-tight';
</script>

<template>
  <view :class="WRAP">
    <view :class="ICON_WRAP">
      <view class="msi icon-sensors text-15px" />
    </view>
    <view class="flex-1 min-w-0">
      <view class="flex items-center gap-2">
        <text :class="LINE">
          <text :class="DOT" /> {{ props.label }}
        </text>
        <text :class="TAG">实时物联网闸机联控</text>
      </view>
      <view :class="DESC">
        <text>实行分时错峰预约，凭动态验票码或身份证直通闸机自动核销入园。</text>
      </view>
    </view>
  </view>
</template>
