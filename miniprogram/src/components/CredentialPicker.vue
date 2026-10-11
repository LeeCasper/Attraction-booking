<script setup lang="ts">
/**
 * 电子凭证页的**凭证选择**条 —— 用户手上不止一张待入园凭证时，先选一张再看码。
 *
 * 为什么要有它：`GET /orders/:id/credential` 是**按订单**签发动态码的，而这一页原先
 * 只认「当前订单」（`store/order.ts` 的 `currentOrderId`，没有就回落到最近一张可入园的）。
 * 于是买了两张票的用户**没法看第二张的码** —— 只能靠别的入口把「当前订单」换掉。
 *
 * 交互与购票页的日期条 / 景点选择页的分类条**同一套**（都已经在真机上验证过）：
 *   - `<scroll-view scroll-x>`，内边距与吸附放在**滚动容器**上，`scroll-padding-*` 让吸附点
 *     从内边距之后起算（放内容上会被吸附滚掉、第一张卡贴屏幕边）
 *   - 两端渐隐遮罩，滚到哪一端就隐藏哪一端
 *   - 选中 = 青绿渐变，未选 = 白卡描边
 *
 * 卡片按**日期卡那套三行结构**（用户对着它说过「参考游览日期」）：
 *   ① 日期 + 星期   ② 票种名（截断）   ③ 状态胶囊（「余 N 人」/「退款中」带呼吸点）
 * 选中 = 青绿渐变 + 白透底胶囊 + 底部一个小三角指向下面的凭证卡（与个人中心那排四格同一处细节）；
 * **退款审核中** = 琥珀色虚线边 + 淡琥珀底，让人点之前就知道它暂时用不了。
 *
 * ⚠️ **只在多于一张时渲染**（只有一张票时多一行选择器纯属噪音）——
 * 判断写在**这里**（根节点的 `v-if`），而不是调用处的 `v-if`：见 `page-bindings.mjs` 的注解，
 * 组件节点上的条件渲染在小程序里会「切走再切回就不见了」。
 */
import { getCurrentInstance, onMounted, reactive, ref } from 'vue';
import type { CredentialOption } from '@/views/credential/behavior';
import { shortDate, weekdayOf } from '@/utils/format';

const props = defineProps<{ items: CredentialOption[]; value: number | null }>();
const emit = defineEmits<{ change: [id: number] }>();

// —— 两端渐隐（与日期条/分类条同一套）——
const fade = reactive({ left: false, right: true });
const EDGE = 4;
const viewportWidth = ref(0);

onMounted(() => {
  // ⚠️ `getCurrentInstance()` 必须在**同步**的 setup/生命周期里取
  const instance = getCurrentInstance();
  uni
    .createSelectorQuery()
    .in(instance?.proxy as never)
    .select('.pg-cred-scroll')
    .boundingClientRect((rect) => {
      if (rect && !Array.isArray(rect)) viewportWidth.value = rect.width ?? 0;
    })
    .exec();
});

function onScroll(e: { detail?: { scrollLeft?: number; scrollWidth?: number } }) {
  const scrollLeft = e.detail?.scrollLeft ?? 0;
  const scrollWidth = e.detail?.scrollWidth ?? 0;
  fade.left = scrollLeft > EDGE;
  fade.right = viewportWidth.value ? scrollLeft < scrollWidth - viewportWidth.value - EDGE : true;
}

// —— class 常量（条件类走标识符：`check:classes` 会把模板三目里的引号串当类名扫）——
// `mb-2` 与设计稿那一块一致（它是 `w-full mb-2`）—— 不写的话这一条会贴着下面的凭证卡
const WRAP = 'relative -mx-margin mb-2';
const SCROLLER = 'w-full pg-cred-scroll';
const ROW = 'flex items-center gap-2_5';
const FADE_BASE = 'pointer-events-none absolute top-0 bottom-0 z-10 transition-opacity duration-200';
const FADE_LEFT = `${FADE_BASE} left-0 w-6 bg-gradient-to-r from-surface to-transparent`;
const FADE_RIGHT = `${FADE_BASE} right-0 w-8 bg-gradient-to-l from-surface to-transparent`;

// `items-start`：卡片是竖排，子元素默认拉伸满宽 —— 胶囊要按内容宽，所以整体左对齐，
// 需要满宽的两行（日期行、票种名）自己写 `w-full`
const CARD_BASE =
  'shrink-0 snap-start relative flex flex-col items-start gap-0_5 w-88px px-2 py-2 rounded-xl border shadow-xs transition-all select-none cursor-pointer';
/** 选中：与日期卡的选中态同一套（青绿渐变 + 描边 + 同一条阴影） */
const CARD_ON = 'border-primary bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
/** 选中 + 退款中：底色还是渐变（保持「选中」这门语言），描边改虚线提示状态异常 */
const CARD_ON_REFUND =
  'border-dashed border-white_20 bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
/** 未选：白卡描边；未选 + 退款中：琥珀虚线 + 淡琥珀底，一眼看出这张不能直接用 */
const CARD_OFF = 'border-silk-border bg-paper-surface text-ink-charcoal-text';
const CARD_REFUND = 'border-dashed border-amber-gold_30 bg-amber-gold_15';

const DATE = 'font-data-metric-md text-15px font-bold leading-none';
const WEEK_ON = 'font-caption-sm text-10px opacity-90';
const WEEK_OFF = 'font-caption-sm text-10px text-ink-light-gray';
const TICKET = 'text-11px text-ink-light-gray w-full truncate';
const TICKET_ON = 'text-11px opacity-90 w-full truncate';

/** 状态胶囊：与日期卡的状态胶囊同一套（选中时一律白透底，见 README 里那条推断口径） */
const PILL_ON = 'flex items-center gap-1 text-10px font-medium bg-white_20 px-2 py-0_5 rounded-full leading-none';
const PILL_LEFT =
  'flex items-center gap-1 text-10px text-primary bg-mist-cyan-50 border border-primary_15 px-2 py-0_5 rounded-full font-medium leading-none';
const PILL_REFUND =
  'flex items-center gap-1 text-10px text-tertiary-container bg-amber-gold_15 border border-amber-gold_30 px-2 py-0_5 rounded-full font-medium leading-none';
/** 退款中的呼吸点：选中（青绿底）用白点，未选（淡琥珀底）用琥珀点 */
const PILL_DOT_ON = 'w-2_5 h-2_5 rounded-full bg-white animate-pulse';
const PILL_DOT_REFUND = 'w-2_5 h-2_5 rounded-full bg-amber-gold animate-pulse';
/** 指向下面那张凭证卡的小三角（与个人中心四格同款） */
const CARET =
  'absolute -bottom-2 left-1_2 -translate-x-1_2 w-0 h-0 border-x-4 border-x-transparent border-t-6px border-t-primary_30';

const isOn = (c: CredentialOption) => c.id === props.value;
const cardClass = (c: CredentialOption) => {
  if (isOn(c)) return `${CARD_BASE} ${c.refundPending ? CARD_ON_REFUND : CARD_ON}`;
  return `${CARD_BASE} ${c.refundPending ? CARD_REFUND : CARD_OFF}`;
};
const weekClass = (c: CredentialOption) => (isOn(c) ? WEEK_ON : WEEK_OFF);
const ticketClass = (c: CredentialOption) => (isOn(c) ? TICKET_ON : TICKET);
/** 「余 N 人」/「退款中」——胶囊样式跟着选中态与状态走 */
const pillClass = (c: CredentialOption) => {
  if (c.refundPending) return isOn(c) ? PILL_ON : PILL_REFUND;
  return isOn(c) ? PILL_ON : PILL_LEFT;
};
const dotClass = (c: CredentialOption) => (isOn(c) ? PILL_DOT_ON : PILL_DOT_REFUND);
</script>

<template>
  <!-- 只有一张凭证时不渲染（判断放这里，不放调用处，见文件头注解） -->
  <view v-if="props.items.length > 1" :class="WRAP">
    <view :class="FADE_LEFT" :style="{ opacity: fade.left ? 0.9 : 0 }" />
    <view :class="FADE_RIGHT" :style="{ opacity: fade.right ? 0.9 : 0 }" />

    <scroll-view
      :class="SCROLLER"
      scroll-x="true"
      :show-scrollbar="false"
      style="scroll-behavior: smooth"
      @scroll="onScroll"
    >
      <view :class="ROW">
        <view
          v-for="c in props.items"
          :key="c.id"
          :class="cardClass(c)"
          :hover-class="isOn(c) ? 'pg-hover' : 'active-scale-95 pg-hover'"
          @tap="emit('change', c.id)"
        >
          <view class="flex items-center justify-between w-full">
            <text :class="DATE">{{ shortDate(c.date) }}</text>
            <text :class="weekClass(c)">{{ weekdayOf(c.date) }}</text>
          </view>
          <text :class="ticketClass(c)">{{ c.ticketName || '门票' }}</text>
          <text :class="pillClass(c)">
            <text v-if="c.refundPending" :class="dotClass(c)" />
            <text>{{ c.refundPending ? '退款中' : `余 ${c.remaining} 人` }}</text>
          </text>
          <view v-if="isOn(c)" :class="CARET" />
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
/* 与 `.pg-date-scroll` / `.pg-cat-scroll` 同源：内边距与吸附属于**滚动容器** */
.pg-cred-scroll {
  padding: 15.38rpx 30.77rpx;
  scroll-padding-left: 30.77rpx;
  scroll-padding-right: 30.77rpx;
  scroll-snap-type: x proximity;
}
</style>
