<template>
  <view class="pg-page flex-1 flex flex-col relative w-full pt-14 bg-surface pb-safe">
    <view
      v-if="loading && filteredAreas.length === 0"
      class="px-margin pt-space-md mb-space-md text-center text-caption-sm font-caption-sm text-ink-light-gray"
    >
      <text>正在加载景点…</text>
    </view>
    <view v-else-if="error" class="px-margin mt-space-sm">
      <text class="block rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</text>
    </view>
    <view class="flex flex-col w-full"><view class="px-margin pt-space-md pb-space-xs flex flex-col gap-space-sm"><view class="relative flex items-center"><view class="w-full bg-paper-surface rounded-xl shadow-sm flex items-center px-space-md py-2_5 transition-all focus-within-shadow-md"><view class="msi icon-search text-outline text-20px mr-2" /><input class="w-full bg-transparent text-ink-charcoal-text font-body-sm text-body-sm placeholder-text-ink-light-gray focus-outline-none" v-model="keyword" placeholder-style="color: #6b7280" placeholder="搜索景点、场馆、索道、演艺..." type="text" /><view class="h-4 w-1px bg-silk-border mx-2" /><view class="flex items-center gap-1 text-primary transition-opacity pl-1" @tap="openFilter" hover-class="active-opacity-75 pg-hover"><view class="msi icon-tune text-18px" /><text class="font-caption-sm text-caption-sm">筛选</text></view></view></view><CategoryTabs v-if="props.active" :key="tabsKey" :items="categories" :value="category" @change="onPickCategory" /><PresenceBanner :label="presenceLabel" /></view><view class="px-margin flex flex-col gap-3_5 mb-space-md"><view v-if="!loading && filteredAreas.length === 0" class="rounded-2xl bg-paper-surface border border-silk-border shadow-sm p-space-md flex flex-col items-center gap-1_5"><view class="msi icon-explore text-28px text-ink-light-gray" /><text class="font-body-md text-14px font-medium text-ink-charcoal-text">没有匹配的景点</text><text class="font-caption-sm text-12px text-ink-light-gray">{{ keyword ? '换个关键词试试，或点「全部景点」' : '这个分类下还没有开放中的景点' }}</text></view><AreaCard v-for="(a, i) in filteredAreas" :key="a.id" :area="a" :index="i" :status="stockStatus(a)" :active="isActive(a)" @pick="onPickArea" @book="onBook" /></view><view class="px-margin mb-space-xl"><view class="bg-surface-container-low rounded-xl p-4 flex flex-col gap-3 shadow-sm"><view class="flex items-center gap-2 text-primary"><view class="msi icon-verified_user text-20px" /><view class="font-body-lg text-body-lg font-semibold text-ink-charcoal-text"><text>入园过闸与游览贴士</text></view></view><view class="flex flex-col gap-2 font-caption-sm text-caption-sm text-ink-dark-gray leading-relaxed"><view class="flex items-start gap-2"><view class="msi icon-grid_view text-16px text-primary shrink-0 mt-0_5" /><view class=""><text class="text-ink-charcoal-text">多景点闸机全网互联：</text><text>预约成功后，持同一订单动态二维码或登记的二代身份证原件，均可在各指定景点闸机自动感应通过。 </text></view></view><view class="flex items-start gap-2"><view class="msi icon-schedule text-16px text-primary shrink-0 mt-0_5" /><view class=""><text class="text-ink-charcoal-text">建议分时错峰：</text><text>预约时段前后30分钟内有效，若超出游览时段需现场于服务台改签。 </text></view></view><view class="flex items-start gap-2"><view class="msi icon-currency_exchange text-16px text-primary shrink-0 mt-0_5" /><view class=""><text class="text-ink-charcoal-text">未检支持极速退：</text><text>未核销过闸的门票支持在游玩日当天23:00前无损全额退改。 </text></view></view></view><view class="mt-1 pt-2 flex items-center justify-between text-caption-sm font-caption-sm text-outline" :class="{ 'is-hidden': !contactLine }"><text>{{ contactLine }}</text></view></view></view></view>
    
    <view
      v-if="filterVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background-color: rgba(0, 0, 0, 0.5)"
      @tap="closeFilter"
    >
      <view
        class="w-full bg-paper-surface flex flex-col px-4"
        style="border-radius: 24px 24px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))"
        @tap.stop
      >
        <view class="flex justify-center pt-3">
          <view style="width: 36px; height: 4px; border-radius: 2px; background-color: #d8ded9" />
        </view>
        <text class="font-headline-md text-17px font-bold text-ink-charcoal-text pt-3">按分类筛选</text>
        <view
          v-for="opt in filterOptions"
          :key="opt.id"
          class="flex items-center justify-between py-3"
          style="border-bottom: 1px solid #e6ebe8"
          hover-class="pg-hover"
          @tap="onPickCategory(opt.id)"
        >
          <text :class="filterItemClass(opt.id === category)">{{ opt.label }}</text>
          <view class="flex items-center gap-2">
            <text class="font-caption-sm text-12px text-ink-light-gray">{{ opt.count }}</text>
            <view v-if="opt.id === category" class="msi icon-check text-16px text-primary" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import AreaCard from '@/components/AreaCard.vue';
import CategoryTabs from '@/components/CategoryTabs.vue';
import PresenceBanner from '@/components/PresenceBanner.vue';
import { useAreaPage } from './behavior';
// 视图行为（手写，见 views/area/behavior.ts）—— 见 scripts/page-bindings.mjs
const props = defineProps<{ active: boolean }>();
const {
  loading, error,
  tabsKey, keyword, categories, category, filterVisible, filterOptions,
  filteredAreas, presenceLabel, contactLine, stockStatus, isActive,
  onPickCategory, openFilter, closeFilter, onPickArea, onBook, filterItemClass, load,
} = useAreaPage();
// 外壳视图：首次可见时才拉数据（四个视图同时挂载，不这么做启动时会并发四个请求）
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/areas.html 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（pt-16 等），由生成器带上。
// 顶栏与底栏不在这里 —— 它们由外壳 src/pages/main/index.vue 只渲染一次。
.pg-page {
  background-color: $c-surface;
}
.pg-page .is-hidden { display: none; }
</style>
