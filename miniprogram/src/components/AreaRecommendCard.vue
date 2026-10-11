<script setup lang="ts">
/**
 * 首页「推荐景点」里的一张景点卡。
 *
 * 首页这个位置**以前是「门票选购」**（三张票卡，卖的是「当前景点」的票）——
 * 那带来两个问题：① 用户一进小程序只看得见一个景点；② 在「景点选择」页点了别的景点，
 * 首页的门票与 banner 会**跟着变**，而用户并没有要求首页变。
 * 现在这一节换成景点维度：列出推荐景点，点一张 → 进那个景点的购票页（票种在那边选）。
 *
 * class 取自 `design/reference/home.html` 里那三张票卡的容器
 * （`p-4 rounded-2xl bg-surface-container-lowest border … flex … hover:border-primary/40`，
 * 整块由绑定 `replace` 成这个组件 ⇒ 容器类必须落在组件根上）与票卡内部的排版语汇
 * （价格 = `font-data-metric-lg text-cinnabar-red`、按钮 = 首页那张青绿渐变胶囊）。
 * 缩略图那组类是购票页「票种头卡」里的（`w-16 h-16 rounded-xl …`）—— 首页没有方形缩略图样本。
 *
 * **内容一律是真实数据**（与 `AreaCard.vue` 同一套口径，都从 `@/utils/area` 取）：
 * 分类名 = `scenic_area.category`，余票 = 今日真实剩余，起价 = 在线可售票种最低价。
 * 设计稿那些营销角标（「特惠优待」「超值推荐」）与「今日可约 · 出票即用」后端没有字段，
 * 照抄等于替景区做承诺 —— 换成由 `remaining` / `minPrice` 推出来的真话。
 */
import { computed } from 'vue';
import { type AreaOverview } from '@/api';
import { fen2yuan } from '@/utils/format';
import { CATEGORIES, areaCoverOf, type StockStatus } from '@/utils/area';

const props = defineProps<{
  area: AreaOverview;
  /** 余票档位：由 behavior 的 `stockStatus()` 统一判定，避免两处口径 */
  status: StockStatus;
  /** 在列表里的序号，只用来挑兜底封面 */
  index: number;
}>();

const emit = defineEmits<{ pick: [area: AreaOverview] }>();

const cover = computed(() => areaCoverOf(props.area, props.index));

const categoryLabel = computed(
  () => CATEGORIES.find((c) => c.id === props.area.category)?.label ?? '',
);

/** 余票一句话。四档的口径与景点选择页一致，只是卡片更窄、说得更短 */
const stockText = computed(() => {
  const n = props.area.remaining;
  switch (props.status) {
    case 'none':
      return '暂无可售票种';
    case 'full':
      return '今日已约满';
    case 'tight':
      return `余票紧张 · 仅剩 ${n} 张`;
    default:
      return `今日余票 ${n} 张`;
  }
});

/** 起价（元，不带 ¥ —— 符号在设计稿里是单独一个节点）。没有可售票种时为空 */
const priceText = computed(() =>
  props.area.minPrice === null ? '' : fen2yuan(props.area.minPrice),
);

// —— class 常量（见 check:classes 的口径：条件类必须走标识符，不能写在模板三目里）——
const CARD =
  'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant_50 shadow-0_2px_12px_rgba0000_03 flex items-center gap-3 hover-border-primary_40 transition-all';
const COVER = 'w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-silk-border_60 bg-surface-container-low';
const BODY = 'flex-1 min-w-0 flex flex-col gap-1_5';
const NAME_ROW = 'flex items-center gap-2';
const NAME = 'font-headline-md text-16px font-bold text-ink-charcoal-text truncate';
const CATEGORY =
  'text-10px text-primary bg-mist-cyan-50 px-1_5 py-0_5 rounded font-medium border border-primary_20 shrink-0';
const STOCK_ROW = 'flex items-center gap-1_5';
const DOT = 'w-2 h-2 rounded-full';
const DOT_OK = 'w-2 h-2 rounded-full bg-emerald-pass';
const DOT_TIGHT = 'w-2 h-2 rounded-full bg-amber-gold animate-ping';
const DOT_MUTED = 'w-2 h-2 rounded-full bg-outline-variant';
const STOCK_OK = 'text-11px text-ink-light-gray';
const STOCK_TIGHT = 'text-11px text-amber-gold font-medium';
const STOCK_MUTED = 'text-11px text-ink-light-gray';
const FOOT_ROW = 'flex items-center justify-between';
const PRICE_ROW = 'flex items-baseline';
const PRICE_SIGN = 'text-13px font-semibold text-cinnabar-red';
const PRICE = 'font-data-metric-lg text-22px font-bold leading-none text-cinnabar-red ml-0_5';
const PRICE_SUFFIX = 'text-11px text-ink-light-gray ml-0_5';
const BOOK_BTN =
  'px-4 py-1_5 rounded-full bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary font-body-sm text-13px font-semibold shadow-sm transition-all';

const dotClass = (s: StockStatus) => (s === 'ok' ? DOT_OK : s === 'tight' ? DOT_TIGHT : DOT_MUTED);
const stockClass = (s: StockStatus) =>
  s === 'ok' ? STOCK_OK : s === 'tight' ? STOCK_TIGHT : STOCK_MUTED;
</script>

<template>
  <view :class="CARD" hover-class="pg-hover" @tap="emit('pick', props.area)">
    <view :class="COVER">
      <image class="w-full h-full object-cover" :src="cover" mode="aspectFill" />
    </view>

    <view :class="BODY">
      <view :class="NAME_ROW">
        <view :class="NAME">{{ props.area.name }}</view>
        <text v-if="categoryLabel" :class="CATEGORY">{{ categoryLabel }}</text>
      </view>

      <view :class="STOCK_ROW">
        <text :class="dotClass(props.status)" />
        <text :class="stockClass(props.status)">{{ stockText }}</text>
      </view>

      <view :class="FOOT_ROW">
        <view v-if="priceText" :class="PRICE_ROW">
          <text :class="PRICE_SIGN">¥</text>
          <text :class="PRICE">{{ priceText }}</text>
          <text :class="PRICE_SUFFIX">起</text>
        </view>
        <!-- 没有可售票种时价格位留空（余票那行已经说了「暂无可售票种」），但按钮仍在：
             点它会如实提示，而不是让整张卡看起来像坏了 -->
        <text v-else :class="stockClass('none')">暂无可在线预约票种</text>
        <view :class="BOOK_BTN">去预约</view>
      </view>
    </view>
  </view>
</template>
