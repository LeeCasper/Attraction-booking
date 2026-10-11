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
 * 卡片两行：日期（要看清是哪天的票）+ 票种名；**退款审核中**的凭证额外标一枚「退款中」，
 * 让人在点之前就知道它暂时用不了（点开是那张被置灰的凭证，见 `views/credential/behavior.ts`）。
 *
 * ⚠️ 只在**多于一张**时渲染（`views/credential/index.vue` 的绑定里判的）——
 * 只有一张票时多一行选择器纯属噪音。
 */
import { getCurrentInstance, onMounted, reactive, ref } from 'vue';
import type { CredentialOption } from '@/views/credential/behavior';
import { shortDate } from '@/utils/format';

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
const WRAP = 'relative -mx-margin';
const SCROLLER = 'w-full pg-cred-scroll';
const ROW = 'flex items-center gap-2_5';
const FADE_BASE = 'pointer-events-none absolute top-0 bottom-0 z-10 transition-opacity duration-200';
const FADE_LEFT = `${FADE_BASE} left-0 w-6 bg-gradient-to-r from-surface to-transparent`;
const FADE_RIGHT = `${FADE_BASE} right-0 w-8 bg-gradient-to-l from-surface to-transparent`;

const CARD_BASE =
  'shrink-0 snap-start flex flex-col items-start px-3_5 py-2 rounded-xl border shadow-xs transition-all select-none cursor-pointer';
const CARD_ON = 'border-primary bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
const CARD_OFF = 'border-silk-border bg-paper-surface text-ink-charcoal-text';
const DATE = 'font-data-metric-md text-15px font-bold';
const TICKET = 'text-11px text-ink-light-gray w-88px truncate';
const TICKET_ON = 'text-11px opacity-90 w-88px truncate';
/** 退款中的角标：与列表页那枚「退款审核中」同色系 */
const FLAG = 'text-10px text-tertiary-container bg-amber-gold_15 px-1_5 py-0_5 rounded mt-0_5';

const isOn = (c: CredentialOption) => c.id === props.value;
const cardClass = (c: CredentialOption) => `${CARD_BASE} ${isOn(c) ? CARD_ON : CARD_OFF}`;
const ticketClass = (c: CredentialOption) => (isOn(c) ? TICKET_ON : TICKET);
</script>

<template>
  <view :class="WRAP">
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
          <text :class="DATE">{{ shortDate(c.date) }}</text>
          <text :class="ticketClass(c)">{{ c.ticketName || '门票' }}</text>
          <text v-if="c.refundPending" :class="FLAG">退款中</text>
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
