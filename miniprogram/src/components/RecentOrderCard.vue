<script setup lang="ts">
/**
 * 个人中心「我的预约与凭证」下面那张卡 —— **跟着上面选中的那一格走**。
 *
 * 本轮之前它是一块**写死的静态版式**：无论点「待支付 / 待入园 / 已核销 / 退改·售后」中的哪一个，
 * 都是 `navigateTo('/pages/orders/index?filter=X')` 跳到订单列表，而卡里永远显示同一张
 * mock 行程（「待入园 · 进行中行程 (1) · 距检票入园还有 18 小时 · 共 2 人同行」）——
 * 于是四格看起来点了都一样。现在：**点哪一格，下面这张卡就切到那一态最近的一单**；
 * 「全部预约单」才是进列表的入口（列表页自己有四个筛选）。
 *
 * class 逐字取自 `design/reference/profile.html` 的那张「最近入园行程微卡片」
 * （`#recentPassCard`，本轮补的 id）。组件根节点带**卡片本身**的类
 * （`rounded-xl bg-gradient-to-br … p-3.5 flex flex-col gap-3 -mt-1`）—— replace 之后
 * 组件会多一层节点，卡片类必须落在根上，否则四格下面那个小三角就指不到卡上了。
 *
 * 与设计稿的三处刻意偏离（都是「设计稿在编，后端没有」）：
 *   ① 「北门闸机」那枚胶囊**去掉** —— 小程序端没有闸机列表接口，写死一个门名是编的
 *      （订单支付页的闸机说明也是因为同一个理由没写门名）
 *   ② 「闸机离线核验码已同步」这行小字换成**按状态给的真话**（凭证刷新节律 / 超时取消 /
 *      已核销不可再入园 / 退款原路退回）—— 客户端根本不知道那条码同没同步
 *   ③ 「主景区通票」这类票种名、景点名、日期时段、同行人数、金额**全部来自订单**
 *      （见 `views/profile/behavior.ts` 的 view model）
 */
import type { RecentOrderView } from '@/views/profile/behavior';

const props = defineProps<{ view: RecentOrderView }>();
const emit = defineEmits<{ primary: []; secondary: [] }>();

// —— class 常量（条件类必须走标识符：`check:classes` 会把模板三目里的引号串当类名扫）——
const CARD =
  'relative w-full rounded-xl bg-gradient-to-br from-mist-cyan-50_90 to-surface-container-low_70 border border-primary_20 shadow-xs p-3_5 flex flex-col gap-3 -mt-1';
const HEADER = 'flex items-center justify-between pb-2 border-b border-e2e8e4_70';
const TITLE = 'font-caption-sm text-12px font-bold text-primary';
const RIGHT = 'text-11px text-ink-light-gray font-caption-sm';
const DOT_ON = 'w-1_5 h-1_5 rounded-full bg-emerald-pass';
const DOT_OFF = 'w-1_5 h-1_5 rounded-full bg-outline-variant';
const BODY = 'flex items-start justify-between';
const TICKET =
  'px-1_5 py-0_5 rounded bg-primary text-white font-label-badge text-10px font-bold shrink-0';
const AREA = 'font-headline-md text-sm font-bold text-ink-charcoal-text';
const MAIN = 'font-data-metric-md text-deep-teal-800 font-bold';
const PILL =
  'px-2 py-0_5 rounded-full bg-bamboo-light-100 text-deep-teal-800 font-label-badge text-11px font-semibold';
const COMPANIONS = 'font-caption-sm text-11px text-ink-light-gray mt-1';
const FOOTER = 'w-full flex items-center justify-between pt-2 border-t border-e2e8e4_60';
const HINT_WRAP =
  'flex items-center gap-1 text-ink-light-gray font-caption-sm text-11px whitespace-nowrap min-w-0';
const HINT_TEXT = 'leading-none truncate';
const BTN_GHOST =
  'h-8 px-3 rounded-lg border border-outline-variant_60 bg-white text-ink-charcoal-text font-caption-sm text-12px font-medium transition-colors flex items-center justify-center shadow-xs';
const BTN_PRIMARY =
  'h-8 px-3 rounded-lg bg-primary text-white font-caption-sm text-12px font-medium shadow-xs transition-colors flex items-center justify-center gap-1_5';
</script>

<template>
  <view :class="CARD">
    <!-- 头部：状态点 + 「待入园 · 进行中行程」 … 右侧相对时间 -->
    <view :class="HEADER">
      <view class="flex items-center gap-1_5">
        <text :class="props.view.empty ? DOT_OFF : DOT_ON" />
        <text :class="TITLE">{{ props.view.title }}</text>
      </view>
      <text v-if="props.view.right" :class="RIGHT">{{ props.view.right }}</text>
    </view>

    <!-- 空态：这一态下没有订单。只留一句话 + 一个去处，不摆一张空壳卡 -->
    <view v-if="props.view.empty" class="flex flex-col items-start gap-2">
      <text class="font-caption-sm text-12px text-ink-light-gray">{{ props.view.main }}</text>
      <view :class="BTN_PRIMARY" hover-class="pg-hover" @tap="emit('primary')">
        <text>{{ props.view.primaryLabel }}</text>
      </view>
    </view>

    <template v-else>
      <view :class="BODY">
        <view class="flex flex-col min-w-0">
          <view class="flex items-center gap-1_5 min-w-0">
            <text v-if="props.view.ticketName" :class="TICKET">{{ props.view.ticketName }}</text>
            <!-- 景点名可能为空（该景点已不在开放列表里），此时只留票种那一枚 -->
            <text v-if="props.view.areaName" :class="AREA">{{ props.view.areaName }}</text>
          </view>
          <view class="flex items-center gap-2 mt-1_5">
            <text :class="MAIN">{{ props.view.main }}</text>
          </view>
        </view>
        <view class="flex flex-col items-end shrink-0">
          <text v-if="props.view.pill" :class="PILL">{{ props.view.pill }}</text>
          <text :class="COMPANIONS">{{ props.view.companions }}</text>
        </view>
      </view>

      <view :class="FOOTER">
        <view :class="HINT_WRAP">
          <view class="msi icon-bolt text-15px text-emerald-pass shrink-0" />
          <text :class="HINT_TEXT">{{ props.view.hint }}</text>
        </view>
        <view class="flex items-center gap-2 shrink-0">
          <view
            v-if="props.view.secondaryLabel"
            :class="BTN_GHOST"
            hover-class="pg-hover"
            @tap="emit('secondary')"
          >
            <text>{{ props.view.secondaryLabel }}</text>
          </view>
          <view :class="BTN_PRIMARY" hover-class="pg-hover" @tap="emit('primary')">
            <view v-if="props.view.primaryIcon" class="msi text-16px" :class="`icon-${props.view.primaryIcon}`" />
            <text>{{ props.view.primaryLabel }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>
