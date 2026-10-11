<script setup lang="ts">
/**
 * 日期横向条的内容 —— 设计稿 `#calendarScroll` 里那层横向滚动容器。
 *
 * class 逐字取自 `design/reference/booking.html` 的日期卡：
 *   选中卡 = 10-09（设计稿里**唯一**的选中样本）· 普通卡 = 10-10/10-11 · 约满卡 = 10-14
 *
 * ⚠️ 一处推断（设计稿没画）：设计稿的选中卡恒为「充足」，状态胶囊是白透底 `bg-white/20`。
 *    所以这里选中卡的状态胶囊**统一用白透底样式**、只换文案，不叠加琥珀色 ——
 *    白透底在青绿渐变上可读，琥珀色叠上去会脏。见 README「设计稿未给的状态」。
 *
 * 组件根节点必须自己带设计稿那层 flex 滚动容器的类：自定义组件会多一层节点，
 * 如果把容器留在页面上、v-for 放在组件里，横向排布会塌。
 */
// 不写 export：<script setup> 不允许 ES 模块导出。类型按结构匹配，页面侧无需 import。
interface DateOption {
  value: string;
  week: string;
  label: string;
  tone: 'ok' | 'tight' | 'full';
}

const props = defineProps<{ dates: DateOption[]; value: string }>();
const emit = defineEmits<{ change: [value: string] }>();

const TONE_LABEL: Record<DateOption['tone'], string> = { ok: '充足', tight: '紧张', full: '约满' };

// —— 以下字符串与设计稿逐字对应，勿手改措辞 ——
const CARD_BASE = 'shrink-0 snap-start flex flex-col items-center justify-between w-70px h-78px py-2 px-1 rounded-xl';
const CARD_SELECTED =
  'bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22 cursor-pointer border border-primary transition-all relative select-none';
const CARD_NORMAL =
  'bg-paper-surface text-ink-charcoal-text border border-silk-border shadow-xs hover-border-primary_50 cursor-pointer transition-all select-none';
const CARD_FULL =
  'bg-surface-container-low text-ink-light-gray border border-silk-border_60 opacity-60 cursor-not-allowed select-none';

const WEEK_SELECTED = 'font-caption-sm text-11px font-medium tracking-wide opacity-90';
const WEEK_NORMAL = 'font-caption-sm text-11px text-ink-light-gray';
const WEEK_FULL = 'font-caption-sm text-11px';

const LABEL_SELECTED = 'font-data-metric-md text-16px font-bold tracking-tight';
const LABEL_NORMAL = 'font-data-metric-md text-15px font-semibold text-ink-charcoal-text';
const LABEL_FULL = 'font-data-metric-md text-15px line-through text-ink-light-gray';

const PILL_SELECTED = 'text-10px font-medium bg-white_20 px-2 py-0_5 rounded-full backdrop-blur-xs leading-none';
const PILL_OK =
  'text-10px text-primary bg-mist-cyan-50 border border-primary_15 px-2 py-0_5 rounded-full font-medium leading-none';
const PILL_TIGHT =
  'text-10px text-amber-gold bg-amber-500_10 border border-amber-500_20 px-2 py-0_5 rounded-full font-medium leading-none';
const PILL_FULL =
  'text-10px text-ink-light-gray bg-surface-container px-2 py-0_5 rounded-full font-medium leading-none';

const cardClass = (d: DateOption) =>
  d.tone === 'full' ? `${CARD_BASE} ${CARD_FULL}` : `${CARD_BASE} ${d.value === props.value ? CARD_SELECTED : CARD_NORMAL}`;

const weekClass = (d: DateOption) =>
  d.tone === 'full' ? WEEK_FULL : d.value === props.value ? WEEK_SELECTED : WEEK_NORMAL;

const labelClass = (d: DateOption) =>
  d.tone === 'full' ? LABEL_FULL : d.value === props.value ? LABEL_SELECTED : LABEL_NORMAL;

function pillClass(d: DateOption) {
  if (d.value === props.value && d.tone !== 'full') return PILL_SELECTED;
  if (d.tone === 'tight') return PILL_TIGHT;
  if (d.tone === 'full') return PILL_FULL;
  return PILL_OK;
}

/** 约满不可选 */
function pick(d: DateOption) {
  if (d.tone === 'full') return;
  emit('change', d.value);
}
</script>

<template>
  <!--
    ⚠️ 根节点**只留排布**（flex + gap），别把设计稿那层滚动容器的类照搬过来：
      - `overflow-x-auto`：会造出**第二层滚动容器**，于是真正滚动的是它、而不是外面的
        `<scroll-view>` —— 一方面 `@scroll`（左右渐隐遮罩靠它更新）永远不触发，
        另一方面下面那条吸附规则会作用在「滚动内容」上而不是滚动容器上，见下。
      - `px-4`：内边距必须**留在滚动容器上**（见 `page-bindings.mjs` 的 `pg-date-scroll`）。
        挂在滚动内容上时，`scroll-snap-type: x mandatory` 会把第一张 `snap-start` 卡
        吸附到「滚动端口」的起点 —— 而滚动端口是**padding box**，内边距不算在内 ⇒
        吸附时那 16px 被滚掉，**第一张卡直接贴到屏幕左边缘**（实测 0.0pt，
        而票种卡/时段卡都在 16pt，一眼就不齐）。
  -->
  <view class="flex gap-2_5">
    <view v-for="d in dates" :key="d.value" :class="cardClass(d)" @tap="pick(d)">
      <text :class="weekClass(d)">{{ d.week }}</text>
      <text :class="labelClass(d)">{{ d.label }}</text>
      <text :class="pillClass(d)">{{ TONE_LABEL[d.tone] }}</text>
    </view>
  </view>
</template>
