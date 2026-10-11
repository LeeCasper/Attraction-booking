<script setup lang="ts">
/**
 * 购票页「选择票种」—— 设计稿 `#ticketPicker`（这一节是**后加的**，见下）。
 *
 * 为什么必须有它：设计稿的购票页把票种**写死成「成人全票 ¥120」**（顶卡那一行），
 * 它是按单景区、单票种画的。而后台一个景点可以配多个票种（成人/优待/…），
 * 原来的实现是「首页点哪张票卡就买哪种，没点过就取第一个」—— 从「景点选择」页
 * 进来的用户（这是现在的主路径）**根本没有任何入口换票种**，默认永远是成人票。
 *
 * 版式沿用同一个页面的「入园时段」那一节（选中 = `border-2 border-primary` + 浅青绿底），
 * 只是从 2 列栅格改成整行列表：票种名比「08:30 - 10:30」长得多，两列会折行。
 *
 * ⚠️ **选中标记用行首的圆形单选圈，不用时段格那个右下角 check 角标** —— 角标会盖住
 * 右侧的价格（实测把 `/人` 压掉了一半：角的 24×24 正好落在价格末尾）。这一节本质是
 * 「N 选 1 的单选列表」，圆圈的语义也更对；styling 与同一页「出行游客登记」那个圈
 * 逐字相同（`VisitorPicker.vue`），未选态的推断口径也在那边的注解里。
 *
 * 组件根节点自己带列表容器的类（`flex flex-col gap-space-sm`），原因同 DateCards/SlotGrid。
 *
 * ⚠️ 只列**按人计价**（`saleUnit === 'person'`）的票种：后端下单是硬编码的
 *    「单价 × 人数」，按张卖的票种（如家庭年卡）进购票流程会把金额算错。
 *    这类票种整条不显示 —— 显示成灰条会让人以为「点了没反应」。
 */
import { type MiniTicket } from '@/api';
import { fen2yuan } from '@/utils/format';

const props = defineProps<{ tickets: MiniTicket[]; value: number | null }>();
const emit = defineEmits<{ change: [id: number] }>();

// —— class 串取自 `design/reference/booking.html`（时段格那四个样本），已消毒 ——
const LIST = 'flex flex-col gap-space-sm';
const CARD_BASE =
  'relative overflow-hidden rounded-xl bg-paper-surface p-space-sm shadow-xs cursor-pointer transition-all';
const CARD_SELECTED = 'border-2 border-primary bg-bamboo-light-100_25';
const CARD_NORMAL = 'border border-silk-border hover-border-primary_50';

const ROW = 'flex items-center justify-between gap-3';
/** 左半：单选圈 + 票名/受众。`min-w-0` 是给票名 truncate 用的 */
const ROW_LEFT = 'flex items-center gap-3 min-w-0';
/** 单选圈：与 `VisitorPicker.vue` 逐字相同（未选态是推断值，见那边的注解） */
const RADIO = 'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0';
const RADIO_ON = 'border-primary bg-primary_10';
const RADIO_OFF = 'border-silk-border';
const RADIO_DOT = 'w-2_5 h-2_5 rounded-full bg-primary';
const TEXT_COL = 'flex flex-col min-w-0';
const NAME_SELECTED = 'font-data-metric-md text-data-metric-md font-bold text-primary';
const NAME_NORMAL = 'font-data-metric-md text-data-metric-md font-semibold text-ink-charcoal-text';
const AUDIENCE = 'text-11px text-ink-light-gray mt-1';
const PRICE_ROW = 'flex items-baseline shrink-0';
const PRICE_SIGN = 'text-13px font-semibold text-cinnabar-red';
const PRICE = 'font-data-metric-lg text-22px font-bold leading-none text-cinnabar-red';
const PRICE_UNIT = 'text-11px text-ink-light-gray ml-0_5';
const isOn = (t: MiniTicket) => t.id === props.value;
const cardClass = (t: MiniTicket) => `${CARD_BASE} ${isOn(t) ? CARD_SELECTED : CARD_NORMAL}`;
const radioClass = (t: MiniTicket) => `${RADIO} ${isOn(t) ? RADIO_ON : RADIO_OFF}`;

/** 只按人计价的票种（见文件头注解）。单位恒为 `/人`，但按 saleUnit 推导而不是写死 */
const unitLabel = (t: MiniTicket) => (t.saleUnit === 'ticket' ? '/张' : '/人');
</script>

<template>
  <view :class="LIST">
    <view v-for="t in props.tickets" :key="t.id" :class="cardClass(t)" @tap="emit('change', t.id)">
      <view :class="ROW">
        <view :class="ROW_LEFT">
          <!-- 选中标记：行首的单选圈（不用右下角角标 —— 会盖住价格，见文件头注解） -->
          <view :class="radioClass(t)">
            <text v-if="isOn(t)" :class="RADIO_DOT" />
          </view>
          <view :class="TEXT_COL">
            <text :class="isOn(t) ? NAME_SELECTED : NAME_NORMAL">{{ t.name }}</text>
            <text v-if="t.audience" :class="AUDIENCE">{{ t.audience }}</text>
          </view>
        </view>
        <view :class="PRICE_ROW">
          <text :class="PRICE_SIGN">¥</text>
          <text :class="PRICE">{{ fen2yuan(t.price) }}</text>
          <text :class="PRICE_UNIT">{{ unitLabel(t) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
