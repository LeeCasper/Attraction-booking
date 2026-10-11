<script setup lang="ts">
/**
 * 景点分类胶囊条（设计稿 `#categoryTabs`）。
 *
 * 设计稿画了 6 个写死的按钮 + 一段只会切高亮的原生 JS。这里换成组件：
 * 选项由数据驱动、点击**真的**筛列表（分类来自 `scenic_area.category`）。
 *
 * 根节点自带设计稿那个横向滚动容器的类 —— 组件会多一层节点，
 * 容器类不落在根上横向滚动就散了（同 `DateCards.vue` / `SlotGrid.vue` 的注解）。
 */
import type { CategoryOption } from '@/utils/area';

const props = defineProps<{ items: CategoryOption[]; value: string }>();
const emit = defineEmits<{ change: [id: string] }>();

const WRAP = 'flex items-center gap-2 overflow-x-auto py-1_5 no-scrollbar -mx-margin px-margin';
const CHIP_ON =
  'shrink-0 px-3_5 py-1_5 rounded-full bg-primary text-on-primary font-label-badge text-label-badge shadow-sm transition-all';
const CHIP_OFF =
  'shrink-0 px-3_5 py-1_5 rounded-full bg-surface-container text-ink-charcoal-text font-label-badge text-label-badge transition-all';
/** 按下态：设计稿给未选中的胶囊加了 scale，选中的那个只有透明度 */
const HOVER_ON = 'pg-hover';
const HOVER_OFF = 'active-scale-95 pg-hover';

const chipClass = (on: boolean) => (on ? CHIP_ON : CHIP_OFF);
const hoverClass = (on: boolean) => (on ? HOVER_ON : HOVER_OFF);
</script>

<template>
  <view :class="WRAP">
    <view
      v-for="item in props.items"
      :key="item.id"
      :class="chipClass(item.id === props.value)"
      :hover-class="hoverClass(item.id === props.value)"
      @tap="emit('change', item.id)"
    >
      <text>{{ item.label }}</text>
    </view>
  </view>
</template>
