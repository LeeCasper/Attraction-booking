<template>
  <view class="pg-page flex flex-col relative w-full pb-safe flex-1 max-w-430px mx-auto">
    <!-- 标题栏：**固定条**（自带状态栏内边距）+ 一个等高的占位块 ——
      与外壳的 PageHeader 同一个结构。设计稿这一条就是 fixed（下面那条筛选胶囊是 sticky，
      吸在它下沿）；若把标题栏画在文档流里，滚下去以后吸顶的胶囊上方会空出一条。
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
    <view class="sticky top-calc3remenvsafe-area-inset-top0px z-40 bg-paper-base_95 backdrop-blur-md pt-2 pb-3 px-4 border-b border-silk-border_40" :style="{ top: chipsTop }"><scroll-view class="w-full" scroll-x="true" :show-scrollbar="false"><view class="flex items-center gap-2 py-0_5"><view v-for="c in categories" :key="c.id" :class="chipClass(c.id)" hover-class="pg-hover" @tap="onPickCategory(c.id)"><text>{{ c.label }}</text></view></view></scroll-view></view>
    <view class="px-4 py-3_5 space-y-4"><PoiCard v-for="p in shownPois" :key="p.id" :poi="p" @guide="onGuide(p)" @pin="onPin" /></view>
    <view class="py-6 flex flex-col items-center justify-center text-ink-light space-y-1"><view class="w-8 h-1px bg-silk-border" /><text class="text-11px tracking-widest font-serif-cn mt-1">青山青水 · 诗意随行</text></view>
  </view>
</template>

<script setup lang="ts">
import { useMapPage } from './behavior';
import PoiCard from '@/components/PoiCard.vue';
// 页面行为（手写，见 pages/map/behavior.ts）—— 见 scripts/page-bindings.mjs
const {
  statusBarHeight, capsuleInset, headerHeight, chipsTop, goBack,
  categories, category, onPickCategory, chipClass,
  shownPois, onGuide, onPin,
} = useMapPage();
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/map.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（已按 page.drop 去掉给固定页头让位的那些类）。
// 标题栏由 page-bindings 的 before 片段自绘，没有外壳底栏。
.pg-page {
  background-color: $c-paper-base;
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
