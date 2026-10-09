<template>
  <view class="pg-page flex flex-col relative w-full pt-16 bg-surface">
    <view class="flex flex-col w-full pb-20"><view class="px-4 mt-space-md"><view class="bg-paper-surface rounded-2xl p-space-md border border-silk-border shadow-sm"><view class="flex items-start gap-3"><view class="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-silk-border_60 bg-surface-container-low"><image class="w-full h-full object-cover" src="/static/images/banner-booking.jpg" mode="aspectFill" /></view><view class="flex-1 min-w-0"><view class="flex items-center gap-1_5"><view class="msi icon-landscape text-primary text-17px" /><view class="font-headline-md text-16px text-ink-charcoal-text font-bold truncate"><text>枫林谷国家森林公园 · 景区门票</text></view></view><view class="flex flex-wrap items-center gap-1_5 mt-1_5"><text class="text-10px text-primary bg-mist-cyan-50 px-1_5 py-0_5 rounded font-medium border border-primary_20">实名制预约</text><text class="text-10px text-primary bg-mist-cyan-50 px-1_5 py-0_5 rounded font-medium border border-primary_20">分时入园</text><text class="text-10px text-emerald-pass bg-bamboo-light-100_50 px-1_5 py-0_5 rounded font-medium border border-emerald-pass_20">随时退</text></view></view></view><view class="mt-3 pt-3 border-t border-silk-border_60 flex items-center justify-between"><view class="flex items-center gap-2"><text class="font-body-md text-14px text-ink-charcoal-text font-semibold">成人全票</text><text class="text-11px text-ink-light-gray">含林海栈道及主景区观光</text></view><view class="flex items-baseline"><text class="text-caption-sm font-semibold text-cinnabar-red">¥</text><text class="font-data-metric-lg text-data-metric-lg font-bold text-cinnabar-red ml-0_5">120</text><text class="font-caption-sm text-11px text-ink-light-gray ml-1">/人</text></view></view></view></view><view class="mt-space-lg w-full"><view class="px-4 flex items-center justify-between mb-space-sm"><view class="flex items-center gap-1_5"><text class="w-1_5 h-4 bg-primary rounded-full" /><view class="font-headline-md text-headline-md text-on-surface"><text>选择游览日期</text></view></view><view class="flex items-center gap-1 text-primary font-caption-sm text-caption-sm cursor-pointer hover-opacity-80 transition-opacity"><text class="font-medium">10月日历</text><view class="msi icon-calendar_month text-16px" /></view></view><view class="relative w-full"><view class="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent z-10 opacity-0 transition-opacity duration-200" id="dateScrollLeftFade" :class="{ 'is-on': dateFade.left, 'is-off': !dateFade.left }" /><view class="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent z-10 opacity-90 transition-opacity duration-200" id="dateScrollRightFade" :class="{ 'is-on': dateFade.right, 'is-off': !dateFade.right }" /><scroll-view class="w-full" style="scroll-behavior: smooth" id="calendarScroll" scroll-x="true" show-scrollbar="false" @scroll="onDateScroll"><DateCards :dates="dates" :value="date" @change="onPickDate" /></scroll-view></view></view><view class="px-4 mt-space-lg"><view class="flex items-center justify-between mb-space-sm"><view class="flex items-center gap-1_5"><text class="w-1_5 h-4 bg-primary rounded-full" /><view class="font-headline-md text-headline-md text-on-surface"><text>选择入园时段</text></view></view><view class="flex items-center gap-1 text-ink-light-gray font-caption-sm text-caption-sm"><view class="msi icon-schedule text-14px" /><text class="">分流控量保障游览</text></view></view><SlotGrid :slots="slots" :value="slot" @change="onPickSlot" /></view><view class="px-4 mt-space-lg"><view class="flex items-center justify-between mb-space-sm"><view class="flex items-center gap-1_5"><text class="w-1_5 h-4 bg-primary rounded-full" /><view class="font-headline-md text-headline-md text-on-surface"><text>出行游客登记</text></view></view><text class="font-caption-sm text-caption-sm text-primary font-medium">{{ selectionLabel }}</text></view><VisitorPicker :visitors="visitors" :picked="pickedIds" @toggle="onToggleVisitor" /><view class="mt-2_5 flex items-center justify-between px-1"><view class="border border-dashed border-primary_60 bg-paper-surface hover-bg-mist-cyan-50 text-primary rounded-xl py-2 px-3_5 font-caption-sm text-caption-sm font-medium flex items-center gap-1_5 transition-colors shadow-2xs" @tap="onAddVisitor" hover-class="pg-hover"><view class="msi icon-add text-16px" /><text class="">新增出行人</text></view><text class="font-caption-sm text-11px text-ink-light-gray flex items-center gap-1"><view class="msi icon-verified_user text-13px text-ink-light-gray" />入园须持有效证件</text></view></view><view class="px-4 mt-space-md mb-2"><view class="flex items-center justify-between py-3 px-space-md rounded-xl bg-paper-surface border border-silk-border shadow-xs text-ink-charcoal-text hover-border-primary_40 cursor-pointer transition-colors"><view class="flex items-center gap-2"><view class="msi icon-info text-17px text-primary" /><text class="font-body-sm text-13px text-ink-charcoal-text font-medium">入园须知 · 提前1小时可退改</text></view><view class="msi icon-chevron_right text-16px text-ink-light-gray" /></view></view></view>
    <BookingBar :unit-price="unitPrice" :count="headcount" :can-submit="canSubmit" @submit="onSubmit" />
  </view>
</template>

<script setup lang="ts">
import DateCards from '@/components/DateCards.vue';
import SlotGrid from '@/components/SlotGrid.vue';
import VisitorPicker from '@/components/VisitorPicker.vue';
import BookingBar from '@/components/BookingBar.vue';
import { useBookingPage } from './behavior';
// 视图行为（手写，见 views/booking/behavior.ts）—— 见 scripts/page-bindings.mjs
const props = defineProps<{ active: boolean }>();
const {
  dateFade, onDateScroll,
  dates, date, onPickDate,
  slots, slot, onPickSlot,
  visitors, pickedIds, selectionLabel, onToggleVisitor, onAddVisitor,
  unitPrice, headcount, totalAmount, canSubmit, onSubmit,
} = useBookingPage();
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/booking.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（pt-16 等），由生成器带上。
// 顶栏与底栏不在这里 —— 它们由外壳 src/pages/main/index.vue 只渲染一次。
.pg-page {
  background-color: $c-surface;
}
.pg-page .is-on { opacity: 0.9; }
.pg-page .is-off { opacity: 0; }
</style>
