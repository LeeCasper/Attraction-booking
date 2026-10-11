<template>
  <view class="pg-page flex flex-col relative w-full pt-16 bg-surface">
    <view class="flex flex-col w-full px-margin pb-space-xl"><view class="flex items-center justify-between py-2 px-1 mb-2"><view class="inline-flex items-center gap-1_5 px-2_5 py-1 rounded-full bg-surface-container-lowest border border-primary_20 text-ink-charcoal-text shadow-2xs"><text class="w-2 h-2 rounded-full bg-emerald-pass animate-pulse" /><text class="font-caption-sm text-11px font-medium">已开启离线动态缓存 · 闸机即刷即过</text></view><view class="inline-flex items-center gap-1 text-11px font-semibold text-primary bg-mist-cyan-50 px-2 py-0_5 rounded-full border border-primary_20"><view class="msi icon-verified_user text-12px text-emerald-pass" /><text class="">防伪核验中</text></view></view><view v-if="props.active" class="relative -mx-margin mb-2"><view class="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent z-10 transition-opacity duration-200" :style="{ opacity: credFadeLeft ? 0.9 : 0 }" /><view class="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent z-10 transition-opacity duration-200" style="opacity: 0.9" /><scroll-view class="w-full pg-cred-scroll" scroll-x="true" :show-scrollbar="false" style="scroll-behavior: smooth" @scroll="onCredScroll"><view class="flex items-center gap-2_5 min-h-44px"><view v-if="!credentials.length" class="text-12px text-ink-light-gray px-1">暂无可入园的凭证</view><view v-for="c in credentials" :key="c.id" :class="credCardClass(c)" :hover-class="credHoverClass(c)" @tap="onPickCredential(c.id)"><view class="flex items-center justify-between w-full"><text class="font-data-metric-md text-15px font-bold leading-none">{{ c.dateLabel }}</text><text :class="credWeekClass(c)">{{ c.weekLabel }}</text></view><text :class="credAreaClass(c)">{{ c.areaName }}</text><text :class="credTicketClass(c)">{{ c.ticketName || '门票' }}</text><text :class="credPillClass(c)"><text v-if="c.refundPending" :class="credDotClass(c)" /><text>{{ c.refundPending ? '退款中' : `余 ${c.remaining} 人` }}</text></text><view v-if="c.id === activeId" class="absolute -bottom-2 left-1_2 -translate-x-1_2 w-0 h-0 border-x-4 border-x-transparent border-t-6px border-t-primary_30" /></view></view></scroll-view></view><view class="relative w-full bg-paper-surface rounded-2xl shadow-0_4px_20px_rgba0104950_06 border border-silk-border overflow-hidden"><view class="p-4 border-b border-dashed border-silk-border bg-gradient-to-b from-mist-cyan-50_60 to-paper-surface"><view class="flex items-center justify-between"><view class=""><view class="flex items-center gap-1_5"><view class="w-5 h-5 rounded-md bg-primary_10 flex items-center justify-center text-primary"><view class="msi icon-landscape text-15px" /></view><view class="font-headline-md text-17px text-ink-charcoal-text font-bold tracking-wide">{{ areaName }}</view></view><view class="font-caption-sm text-12px text-ink-light-gray mt-1 flex items-center gap-1"><view class="msi icon-confirmation_number text-13px text-primary" /><text>门票通行凭证 · 全园闸机通用</text></view></view><text class="px-2_5 py-1 rounded-full text-11px font-bold bg-bamboo-light-100 text-deep-teal-800 border border-primary_20 shadow-2xs">{{ statusLabel }}</text></view><view class="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-silk-border_60"><view class=""><text class="font-caption-sm text-11px text-ink-light-gray block">入园时段</text><text class="font-data-metric-md text-14px text-ink-charcoal-text font-bold mt-0_5 block">{{ periodLabel }}</text></view><view class=""><text class="font-caption-sm text-11px text-ink-light-gray block">持票人</text><text class="font-data-metric-md text-14px text-ink-charcoal-text font-bold mt-0_5 block">{{ holderLabel }}</text></view></view><view class="flex items-center justify-between pt-2 mt-2 border-t border-silk-border_60" id="credentialNoRow" :class="{ 'is-hidden': !credentialNo }"><text class="font-caption-sm text-11px text-ink-light-gray">凭证号</text><text class="font-data-metric-md text-13px text-ink-charcoal-text font-bold tracking-wide" id="credentialNoText">{{ credentialNo }}</text></view></view><view class="p-5 flex flex-col items-center justify-center bg-paper-surface"><view class="relative w-218px h-218px bg-white rounded-2xl border-2 border-primary_30 p-2_5 shadow-sm flex items-center justify-center ring-4 ring-mist-cyan-50" :class="{ 'is-blocked': refundPending }"><view class="absolute inset-0 pointer-events-none select-none flex flex-col justify-around -rotate-12 opacity-0_06 overflow-hidden"><view class="font-display-kpi-screen text-10px font-bold text-ink-charcoal-text whitespace-nowrap -ml-4" id="watermark-line-1">{{ watermarks[0] }}</view><view class="font-display-kpi-screen text-10px font-bold text-ink-charcoal-text whitespace-nowrap ml-2" id="watermark-line-2">{{ watermarks[1] }}</view><view class="font-display-kpi-screen text-10px font-bold text-ink-charcoal-text whitespace-nowrap -ml-2" id="watermark-line-3">{{ watermarks[2] }}</view></view><view v-if="!refundPending" class="w-full h-full"><DynamicQr :token="qrToken" :hint="qrHint" /></view><view v-else class="w-full h-full flex flex-col items-center justify-center gap-2"><view class="relative w-16 h-16 rounded-full bg-amber-gold_15 flex items-center justify-center"><view class="msi icon-hourglass_top text-28px text-amber-gold animate-pulse" /><text class="absolute -top-1 -right-2 w-2_5 h-2_5 rounded-full bg-amber-gold animate-ping" /></view><text class="font-headline-md text-17px font-bold text-tertiary-container">退款审核中</text><text class="font-caption-sm text-12px text-ink-light-gray">凭证已停用</text></view></view><view class="flex items-center gap-2 mt-3"><text class="w-2 h-2 rounded-full bg-emerald-pass animate-pulse" /><text v-if="!refundPending" class="font-caption-sm text-12px text-ink-light-gray">动态码每 {{ refreshAfterLabel }} 秒刷新 · 剩余 <text class="text-primary font-bold">{{ countdownLabel }}</text></text><text v-else class="font-caption-sm text-12px text-tertiary-container font-medium">审核通过后退款到账；未通过则凭证自动恢复</text><view class="text-ink-light-gray hover-text-primary transition-transform duration-500 ml-0_5 p-0_5" id="refresh-qr-btn" @tap="refreshQr" :class="{ 'is-spinning': qrSpinning }" hover-class="active-rotate-180 pg-hover"><view class="msi icon-refresh text-16px" /></view></view></view></view><view class="mt-4 bg-paper-surface rounded-2xl p-4 border border-silk-border shadow-sm"><view class="flex items-center justify-between mb-3"><view class="flex items-center gap-1_5"><text class="w-1_5 h-3_5 bg-primary rounded-full" /><text class="font-headline-md text-14px font-bold text-ink-charcoal-text">支持通行方式</text></view><text class="font-caption-sm text-11px text-ink-light-gray flex items-center gap-1"><view class="msi icon-wifi text-13px text-emerald-pass" />闸机均已联网</text></view><PassPicker :options="passModes" :value="passMode" @change="onPickPassMode" /></view><view class="mt-4 flex items-center justify-between gap-3"><view class="flex-1 h-11 rounded-full border border-silk-border bg-paper-surface hover-bg-surface-container-low text-ink-charcoal-text font-body-sm text-13px font-semibold flex items-center justify-center gap-1_5 transition-all shadow-2xs" @tap="onOrders" :class="{ 'is-dimmed': refundPending }" hover-class="active-scale-0_98 pg-hover"><view class="msi icon-currency_exchange text-16px text-ink-light-gray" /><text>{{ refundButtonLabel }}</text></view><view class="flex-1 h-11 rounded-full bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary font-body-sm text-13px font-semibold flex items-center justify-center gap-1_5 transition-all shadow-sm" id="export-pass-btn" @tap="onExport" hover-class="active-scale-0_98 pg-hover"><view class="msi icon-download text-16px" /><text class="">导出离线票</text></view></view><view class="mt-3 flex items-center justify-center gap-1 text-11px text-ink-light-gray"><view class="msi icon-verified text-13px text-primary" /><text class="">入园请出示本人身份证或有效凭证，支持闸机无网验票</text></view></view>
    
  </view>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import DynamicQr from '@/components/DynamicQr.vue';
import PassPicker from '@/components/PassPicker.vue';
import { useCredentialPage } from './behavior';
// 视图行为（手写，见 views/credential/behavior.ts）—— 见 scripts/page-bindings.mjs
const props = defineProps<{ active: boolean }>();
const {
  qrToken, qrHint, countdownLabel, refreshAfterLabel, qrSpinning, refreshQr, watermarks, onExport, onOrders,
  passModes, passMode, onPickPassMode,
  periodLabel, areaName, holderLabel, statusLabel,
  credentials, activeId, onPickCredential, credFadeLeft, onCredScroll,
  credCardClass, credWeekClass, credAreaClass, credTicketClass, credPillClass, credDotClass, credHoverClass,
  refundPending, refundHintText, refundButtonLabel, credentialNo, load,
} = useCredentialPage();
// 首次可见时才拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/credential.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（pt-16 等），由生成器带上。
// 顶栏与底栏不在这里 —— 它们由外壳 src/pages/main/index.vue 只渲染一次。
.pg-page {
  background-color: $c-surface;
}
.pg-page .is-spinning { animation: pg-spin 600ms linear; }
/* 凭证选择条（原组件里的那三条，随版式一起挪进页面）：内边距与吸附属于**滚动容器**，
   放内容上会被吸附滚掉、第一张卡贴屏幕边；min-height 是防止真机 hide/show 后塌成 0 */
.pg-page .pg-cred-scroll {
  min-height: 140rpx;
  padding: 15.38rpx 30.77rpx;
  scroll-padding-left: 30.77rpx;
  scroll-padding-right: 30.77rpx;
  scroll-snap-type: x proximity;
}
.pg-page .is-dimmed { opacity: 0.55; }.pg-page .is-hidden { display: none; }
/* 凭证卡片的宽度：208rpx ≈ 108px。
   为什么不挂工具类：classmap 里只有 w-70px / w-88px 两档，而 88px 装不下
   「驻马店市嵖岈山」这种长度的景点名 —— 而**景点名正是这张卡要让人一眼看清的那一行**
   （同一天在不同景点各买了票时，用户就是靠它分辨的，本轮加的）。
   宽度只在这里给一次，卡片 class 里不再写 w-*，避免两处抢同一个属性。 */
.pg-page .pg-cred-card { width: 208rpx; }
/* 退款审核中：二维码那个白框整体换成琥珀（与框里那块说明同一个语义） */
.pg-page .is-blocked {
  border-color: rgba(217, 119, 6, 0.45) !important;
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.1) !important;
  background-color: #fffdf7 !important;
}
</style>
