<script setup lang="ts">
/**
 * 「支持通行方式」三选一 —— 设计稿里**没有留 id**，靠 class 定位
 * （`grid grid-cols-3 gap-2.5 text-center`，全稿唯一）。
 *
 * class 逐字取自 `design/reference/credential.html`：
 *   选中 = 动态二维码 · 未选中 = 实体身份证 / 人脸识别
 *
 * ⚠️ 两处判断（设计稿无法区分）：
 *   1. 第三个 span（`主推荐` / `贴卡即过` / `录入`）的样式是**跟着选项走**的，
 *      不随选中态变化 —— 「主推荐」是这一项的属性，不是「被选中」的表现。
 *   2. 两个未选中项的图标色并不一致（`text-on-surface-variant` / `text-ink-light-gray`），
 *      故按选项各自记在数据里，选中时统一换成 `text-primary`。
 */
// 不写 export：<script setup> 不允许 ES 模块导出。
interface PassMode {
  id: string;
  /** msi 图标名 */
  icon: string;
  label: string;
  hint: string;
  /** 设计稿里只有「主推荐」带胶囊底 */
  hintPill?: boolean;
  /** 未选中时的图标色，设计稿两项不同 */
  hintTone?: 'muted' | 'primary';
}

const props = defineProps<{ options: PassMode[]; value: string }>();
const emit = defineEmits<{ change: [id: string] }>();

const GRID = 'grid grid-cols-3 gap-2_5 text-center';
const CARD_BASE = 'p-2_5 rounded-xl flex flex-col items-center gap-1';
const CARD_ON = 'bg-mist-cyan-50 border border-primary_30 shadow-2xs';
const CARD_OFF = 'bg-surface-container-low border border-silk-border_60';

const LABEL_ON = 'font-body-sm text-12px font-bold text-ink-charcoal-text';
const LABEL_OFF = 'font-body-sm text-12px font-medium text-ink-charcoal-text';

const HINT_PILL = 'font-caption-sm text-10px text-deep-teal-800 bg-bamboo-light-100 px-1_5 py-0_2 rounded-full font-semibold';
const HINT_MUTED = 'font-caption-sm text-10px text-ink-light-gray';
const HINT_PRIMARY = 'font-caption-sm text-10px text-primary font-medium';

const isOn = (o: PassMode) => o.id === props.value;

const cardClass = (o: PassMode) => `${CARD_BASE} ${isOn(o) ? CARD_ON : CARD_OFF}`;
const iconClass = (o: PassMode) =>
  `msi icon-${o.icon} text-20px ${isOn(o) ? 'text-primary' : o.hintTone === 'primary' ? 'text-ink-light-gray' : 'text-on-surface-variant'}`;
const hintClass = (o: PassMode) => (o.hintPill ? HINT_PILL : o.hintTone === 'primary' ? HINT_PRIMARY : HINT_MUTED);
</script>

<template>
  <view :class="GRID">
    <view v-for="o in options" :key="o.id" :class="cardClass(o)" @tap="emit('change', o.id)">
      <view :class="iconClass(o)" />
      <text :class="isOn(o) ? LABEL_ON : LABEL_OFF">{{ o.label }}</text>
      <text :class="hintClass(o)">{{ o.hint }}</text>
    </view>
  </view>
</template>
