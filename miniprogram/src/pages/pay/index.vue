<template>
  <view class="pg-page flex-1 flex flex-col relative w-full bg-surface pb-safe">
    <view :style="{ height: statusBarHeight + 'px' }" />
    <view class="relative h-14 px-gutter flex items-center">
      <view
        class="w-11 h-11 -ml-space-xs flex items-center justify-center text-on-surface"
        hover-class="pg-hover"
        @tap="goBack"
      >
        <view class="msi icon-arrow_back_ios_new text-24px" />
      </view>
      <text class="absolute left-1_2 -translate-x-1_2 font-headline-md text-headline-md text-on-surface tracking-tight">订单支付</text>
    </view>
    <view v-if="loading && !order" class="px-margin pt-space-md text-center font-caption-sm text-caption-sm text-ink-light-gray">
      <text>正在加载订单…</text>
    </view>
    <view v-else-if="error" class="px-margin mt-space-sm">
      <text class="block rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</text>
    </view>
    <view class="flex flex-col w-full pb-24"><view class="px-margin pt-space-sm pb-space-xs"><view class="rounded-xl bg-gradient-to-r from-bamboo-light-100 via-surface-container to-surface-container-low p-space-md shadow-sm relative overflow-hidden"><view class="flex items-center justify-between relative z-10"><view class="flex items-center space-x-space-xs"><view class="msi icon-hourglass_top text-primary text-20px animate-pulse" /><text class="font-body-md text-ink-charcoal-text font-semibold">支付剩余时间</text><text class="font-display-kpi-screen text-headline-md text-primary tracking-tight font-bold bg-paper-surface px-space-xs py-0_5 rounded-md shadow-inner" id="payment-timer">{{ timerLabel }}</text></view><text class="font-label-badge text-label-badge text-amber-gold bg-tertiary-fixed_60 px-space-xs py-0_5 rounded-full flex items-center"><text class="w-1_5 h-1_5 rounded-full bg-amber-gold mr-1" />名额保留中 </text></view><view class="font-caption-sm text-caption-sm text-ink-light-gray mt-1_5 relative z-10 leading-snug"><text> 请在倒计时结束前完成支付，超时名额将自动释放回公共库存。 </text></view></view></view><view class="px-margin py-space-xs"><view class="bg-paper-surface rounded-xl p-space-md shadow-sm relative overflow-hidden text-center"><view class="absolute top-3 right-3"><text class="inline-flex items-center px-2 py-0_5 rounded-full bg-bamboo-light-100 font-label-badge text-label-badge text-primary font-medium"><view class="msi icon-lock_clock text-14px mr-1 text-primary" /> 待支付 </text></view><view class="font-caption-sm text-caption-sm text-ink-light-gray"><text>应付总额</text></view><view class="flex items-baseline justify-center mt-1 text-primary"><text class="font-body-lg text-22px font-bold mr-0_5">¥</text><text class="font-display-kpi-screen text-display-kpi-screen font-extrabold tracking-tight">{{ totalLabel }}</text></view><view class="inline-flex items-center justify-center mt-1_5 px-space-sm py-0_5 rounded-full bg-surface-container-low font-caption-sm text-caption-sm text-on-surface-variant"><view class="msi icon-verified_user text-14px mr-1 text-primary" /><text>{{ amountHint }}</text></view></view></view><view class="px-margin py-space-xs"><view class="bg-paper-surface rounded-xl p-space-md shadow-sm relative"><view class="absolute left-0 top-4 bottom-4 w-1_5 bg-primary rounded-r-full" /><view class="pl-2"><view class="flex items-start justify-between"><view class="pr-2"><text class="font-label-badge text-label-badge text-surface-tint bg-bamboo-light-100 px-1_5 py-0_5 rounded">{{ ticketName }}</text><view class="font-headline-md text-headline-md text-ink-charcoal-text font-bold mt-1 leading-snug">{{ areaName }}</view></view><view class="msi icon-forest text-outline-variant text-28px shrink-0" /></view><view class="mt-space-sm space-y-2 bg-surface-container-low p-space-sm rounded-lg"><view class="flex items-center text-ink-dark-gray font-body-sm text-body-sm"><view class="msi icon-calendar_month text-primary text-18px mr-2 shrink-0" /><text class="font-medium">{{ dateLabel }}</text><text class="mx-1 text-outline">|</text><text class="text-primary font-semibold">{{ slotLabel }}</text></view><view class="flex items-center text-ink-dark-gray font-body-sm text-body-sm"><view class="msi icon-confirmation_number text-primary text-18px mr-2 shrink-0" /><text>{{ ticketSummary }}</text><text class="text-ink-light-gray ml-1_5">{{ unitLabel }}</text></view></view><view class="mt-space-sm flex items-start bg-bamboo-light-100_50 p-2_5 rounded-lg"><view class="msi icon-gate text-primary text-16px mr-1_5 mt-0_5 shrink-0" /><view class="font-caption-sm text-caption-sm text-deep-teal-800 leading-relaxed"><text class="font-semibold">通行保障：</text><text>凭动态凭证或二代身份证在景区闸机感应开闸通行，闸机直连入园。</text></view></view></view></view></view><view class="px-margin py-space-xs"><view class="bg-paper-surface rounded-xl p-space-md shadow-sm"><view class="flex items-center justify-between pb-space-xs mb-space-xs"><view class="flex items-center space-x-1_5"><view class="msi icon-badge text-primary text-18px" /><view class="font-headline-md text-headline-md text-ink-charcoal-text font-bold" id="visitors-title">{{ visitorsTitle }}</view></view><text class="font-label-badge text-label-badge text-emerald-pass bg-mist-cyan-50 px-2 py-0_5 rounded-full flex items-center"><view class="msi icon-check_circle text-13px mr-1" /> 实名认证 </text></view><view class="space-y-space-sm"><view
        v-for="(v, i) in visitors"
        :key="v.id"
        class="bg-surface-container-low p-space-sm rounded-lg flex items-center justify-between"
      >
        <view class="flex items-start space-x-2">
          <view
            class="w-6 h-6 rounded-full flex items-center justify-center font-label-badge text-11px font-bold mt-0_5"
            :class="i === 0 ? 'bg-primary text-on-primary' : 'bg-outline-variant text-on-surface'"
          >
            <text>{{ i + 1 }}</text>
          </view>
          <view>
            <view class="flex items-center space-x-1_5">
              <text class="font-body-md text-body-md font-bold text-ink-charcoal-text">{{ v.name }}</text>
              <text
                class="font-caption-sm text-11px px-1_5 py-0_2 rounded"
                :class="i === 0 ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-surface-container-high text-on-surface-variant'"
              >{{ i === 0 ? '主出行人' : '同行人' }}</text>
            </view>
            <view class="font-caption-sm text-caption-sm text-ink-light-gray mt-0_5 font-mono"><text>身份证: {{ v.idCard }}</text></view>
            <view class="font-caption-sm text-caption-sm text-ink-light-gray font-mono"><text>手机号: {{ v.phone }}</text></view>
          </view>
        </view>
        <view class="msi icon-id_card text-outline-variant text-20px" />
      </view></view><view class="mt-space-sm flex items-center text-primary font-caption-sm text-caption-sm bg-mist-cyan-50 px-2_5 py-1_5 rounded-md"><view class="msi icon-offline_bolt text-16px mr-1 shrink-0" /><text class="">信息已提前同步至景区门禁系统离线白名单，无网亦可通行</text></view></view></view><view class="px-margin py-space-xs"><view class="bg-paper-surface rounded-xl p-space-md shadow-sm"><view class="font-headline-md text-headline-md text-ink-charcoal-text font-bold mb-space-sm"><text>费用明细</text></view><view class="space-y-2 font-body-sm text-body-sm text-ink-dark-gray"><view class="flex justify-between items-center"><text>{{ feeItemLabel }}</text><text class="font-data-metric-md text-ink-charcoal-text font-semibold">¥{{ totalLabel }}</text></view><view class="pt-2 mt-2 flex justify-between items-center font-body-md text-body-md font-bold text-ink-charcoal-text"><text>实付金额</text><text class="font-data-metric-lg text-18px text-primary">¥{{ totalLabel }}</text></view></view></view></view><view class="px-margin py-space-xs"><view class="bg-paper-surface rounded-xl p-space-md shadow-sm"><view class="font-headline-md text-headline-md text-ink-charcoal-text font-bold mb-space-sm"><text>支付方式</text></view><PayMethods value="wechat" @pick="onPickPay" /></view></view><view class="px-margin py-space-sm"><view class="flex items-start space-x-2 px-1"><view class="mt-0_5 flex-shrink-0 text-primary focus-outline-none" id="agree-checkbox" @tap="toggleAgree" hover-class="pg-hover"><view :class="agreeIconClass" /></view><view class="font-caption-sm text-caption-sm text-ink-dark-gray leading-relaxed"><text>我已阅读并同意</text><text class="text-primary font-semibold" @tap="onDoc">《{{ policyTitle }}》</text><text>、</text><text class="text-primary font-semibold" @tap="onDoc">《游客须知》</text><text>及</text><text class="text-primary font-semibold" @tap="onDoc">《门禁实名制隐私协议》</text>
        <view class="text-ink-light-gray mt-0_5"><text>• {{ refundNote }}</text></view></view></view></view><view class="fixed bottom-0 inset-x-0 z-40 bg-paper-surface_95 backdrop-blur-md shadow-0_-4px_16px_rgba0106970_08 pb-safe"><view class="h-16 px-gutter flex items-center justify-between"><view class="flex flex-col cursor-pointer" @tap="toggleDrawer"><text class="font-caption-sm text-caption-sm text-ink-light-gray flex items-center"> 待支付 <view class="msi icon-expand_less text-16px text-ink-light-gray ml-0_5 transform transition-transform" :class="{ 'is-flip': drawerOpen }" /></text><view class="flex items-baseline text-primary font-bold"><text class="font-body-md text-18px font-semibold mr-0_5">¥</text><text class="font-data-metric-lg text-data-metric-lg font-extrabold tracking-tight">{{ totalLabel }}</text></view></view><view class="h-11 px-6 rounded-full bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary font-headline-md text-headline-md flex items-center justify-center space-x-1 shadow-md transition-all" id="submit-pay-btn" @tap="onPay" :class="{ 'opacity-60': !canPay }" hover-class="active-scale-98 active-opacity-90 pg-hover"><view class="msi icon-lock text-18px" /><text>{{ payButtonLabel }}</text></view></view></view><view class="fixed inset-0 z-30 bg-inverse-surface_40 backdrop-blur-xs hidden opacity-0 transition-opacity duration-200" id="details-drawer" @tap="toggleDrawer" :class="{ 'is-open': drawerOpen }"><view class="absolute bottom-16 inset-x-0 bg-paper-surface rounded-t-2xl p-space-md shadow-2xl" @tap.stop="noop"><view class="flex justify-between items-center mb-space-sm pb-space-xs border-b border-surface-container"><view class="font-headline-md text-headline-md font-bold text-ink-charcoal-text"><text>金额明细</text></view><view class="text-ink-light-gray hover-text-ink-charcoal-text" @tap="toggleDrawer" hover-class="pg-hover"><view class="msi icon-close text-20px" /></view></view><view class="space-y-2 font-body-sm text-body-sm text-ink-dark-gray"><view class="flex justify-between"><text>{{ feeItemLabel }}</text><text>¥{{ totalLabel }}</text></view></view></view></view></view>
    
  </view>
</template>

<script setup lang="ts">
import { usePayPage } from './behavior';
import PayMethods from '@/components/PayMethods.vue';
// 页面行为（手写，见 pages/pay/behavior.ts）—— 见 scripts/page-bindings.mjs
const {
  statusBarHeight, goBack,
  loading, error, order,
  timerLabel, totalLabel, amountHint, visitorsTitle, visitors,
  areaName, ticketName, dateLabel, slotLabel, ticketSummary, unitLabel, feeItemLabel,
  onPickPay, toggleAgree, agreeIconClass, canPay,
  drawerOpen, toggleDrawer, payButtonLabel, policyTitle, refundNote, onDoc, noop,
  onPay,
} = usePayPage();
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/pay.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（已按 page.drop 去掉给固定页头让位的那些类）。
// 标题栏由 page-bindings 的 before 片段自绘，没有外壳底栏。
.pg-page {
  background-color: $c-surface;
}
.pg-page .is-open { display: block; opacity: 1; }
.pg-page .is-flip { transform: rotate(180deg); }
</style>
