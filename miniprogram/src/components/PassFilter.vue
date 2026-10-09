<script setup lang="ts">
/**
 * 「我的预约与凭证」四态筛选 —— 设计稿里**没有留 id**，靠 class 定位
 * （`grid grid-cols-4 gap-2 text-center py-1 relative z-10`，全稿唯一）。
 *
 * class 逐字取自 `design/reference/profile.html`：
 *   选中 = 待入园（唯一选中样本，带角标 2 与底部小三角）
 *
 * ⚠️ 一处推断：设计稿只有「选中 + 有角标」和「未选中 + 无角标」两种组合。
 *    这里按「角标是数据、选中态只管底色/描边/文字」处理 ——
 *    选中但无角标时图标用 `text-primary`，未选中时一律 `text-ink-dark-gray`。
 */
// 不写 export：<script setup> 不允许 ES 模块导出。
interface PassTab {
  id: string;
  /** msi 图标名 */
  icon: string;
  label: string;
  /** 右上角数量角标，0 或缺省则不渲染 */
  badge?: number;
}

const props = defineProps<{ items: PassTab[]; value: string }>();
const emit = defineEmits<{ change: [id: string] }>();

const GRID = 'grid grid-cols-4 gap-2 text-center py-1 relative z-10';
const BTN_BASE = 'flex flex-col items-center justify-center gap-1_5 p-2 rounded-xl transition-colors';
const BTN_ON = 'bg-mist-cyan-50_80 relative ring-1 ring-primary_20';
const BTN_OFF = 'hover-bg-surface-container-low';

const LABEL_ON = 'font-caption-sm text-12px font-bold text-primary';
const LABEL_OFF = 'font-caption-sm text-12px text-ink-dark-gray';

const BADGE =
  'absolute -top-1 -right-2 px-1 rounded-full bg-emerald-pass text-white font-label-badge text-10px font-bold leading-tight';
const CARET =
  'absolute -bottom-2 left-1_2 -translate-x-1_2 w-0 h-0 border-x-4 border-x-transparent border-t-6px border-t-primary_30';

const isOn = (t: PassTab) => t.id === props.value;

const btnClass = (t: PassTab) => `${BTN_BASE} ${isOn(t) ? BTN_ON : BTN_OFF}`;
const iconWrapClass = (t: PassTab) => (isOn(t) ? 'relative text-primary' : 'relative');
const iconClass = (t: PassTab) => `msi icon-${t.icon} text-24px${isOn(t) ? '' : ' text-ink-dark-gray'}`;
</script>

<template>
  <view :class="GRID">
    <view v-for="t in items" :key="t.id" :class="btnClass(t)" @tap="emit('change', t.id)">
      <view :class="iconWrapClass(t)">
        <view :class="iconClass(t)" />
        <text v-if="t.badge" :class="BADGE">{{ t.badge }}</text>
      </view>
      <text :class="isOn(t) ? LABEL_ON : LABEL_OFF">{{ t.label }}</text>
      <view v-if="isOn(t)" :class="CARET" />
    </view>
  </view>
</template>
