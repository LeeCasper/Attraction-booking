<template>
  <view class="pg-page flex flex-col relative w-full pb-safe flex-1 max-w-430px mx-auto">
    <!-- 标题栏：**固定条**（自带状态栏内边距）+ 一个等高的占位块 ——
      与外壳的 PageHeader 同一个结构（设计稿这一条就是 fixed）。
      ⚠️ 固定定位在**二级页**没问题（不是 scroll-view 里的视图，见 CLAUDE.md 第 14 条）。 -->
    <view class="pg-map-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="flex items-center px-4 relative h-12" :style="{ paddingRight: capsuleInset + 'px' }">
        <view class="msi icon-arrow_back_ios_new text-18px text-ink-charcoal p-1 -ml-1" hover-class="pg-hover" @tap="goBack" />
        <view class="absolute inset-x-0 flex items-center justify-center pointer-events-none">
          <text class="font-serif-cn font-semibold text-17px text-ink-charcoal tracking-wider">景区地图与景点</text>
        </view>
      </view>
    </view>
    <view :style="{ height: headerHeight + 'px' }" />
    
    <view class="p-4 pg-poi-list"><PoiCard v-for="p in pois" :key="p.id" :poi="p" @guide="onGuide(p)" @pin="onPin" /></view>
    <view class="py-6 flex flex-col items-center justify-center text-ink-light space-y-1"><view class="w-8 h-1px bg-silk-border" /><text class="text-11px tracking-widest font-serif-cn mt-1">青山青水 · 诗意随行</text></view>
  </view>
</template>

<script setup lang="ts">
import { useMapPage } from './behavior';
import PoiCard from '@/components/PoiCard.vue';
// 页面行为（手写，见 pages/map/behavior.ts）—— 见 scripts/page-bindings.mjs
const {
  statusBarHeight, capsuleInset, headerHeight, goBack,
  pois, onGuide, onPin,
} = useMapPage();
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/map.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（已按 page.drop 去掉给固定页头让位的那些类）。
// 标题栏由 page-bindings 的 before 片段自绘，没有外壳底栏。
.pg-page {
  background-color: $c-paper-base;
}
/* 点位卡之间的间距：设计稿是 `space-y-4`（16px），用户反馈太挤，这里给 24px。
   ⚠️ **classmap 里 `space-y` 最大只有 4 档（16px）**，没有 space-y-5/6，所以要写在页面 style 里
   （与 `.pg-cred-card` 的宽度、日期条的 padding 同一个理由）。
   ⚠️⚠️ **这里必须用 flex + gap，不能写 `> * + *`**（虽然 utilities.scss 里 space-y 就是这么实现的）：
   页面 style 是 **scoped** 的，Vue 的 scoped 编译会把 `data-v-xxx` 贴到**最后一个选择器元素**上 ——
   以 `*` 结尾就变成 `>*+*.data-v-xxx`，**小程序 WXSS 编译器直接失败**
   （工具里报「WXSS 文件编译错误 / error file count: 1」，整页白屏）。全局的 utilities.scss 不受影响
   是因为它**不 scoped**。同理：scoped 里别写任何以 `*` 结尾的选择器。 */
.pg-page .pg-poi-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.pg-page .pg-map-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background-color: rgba($c-paper-base, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba($c-silk-border, 0.6);
}
</style>
