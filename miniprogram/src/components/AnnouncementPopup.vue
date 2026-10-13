<script setup lang="ts">
/**
 * 弹窗公告（居中卡片）。
 *
 * ⚠️ **它由外壳 `pages/main/index.vue` 渲染**，不在首页视图里 —— 视图挂在 `<scroll-view>` 中，
 * 里面的 `position: fixed` 不相对视口固定、会跟着内容滚走（CLAUDE.md 第 14 条），
 * 而且这个错 **H5 复现不出来**，只在开发者工具/真机暴露。状态在 `store/announcement.ts`。
 *
 * 版式说明：本工程原有的浮层**全是底部抽屉**（出行人表单 / 筛选 / 退款），
 * 居中卡片是这一轮新写的 —— 但遮罩的写法照旧：内联 `rgba(0,0,0,0.5)`（避免为此新造工具类）、
 * 遮罩 `@tap` 关闭、卡片 `@tap.stop` 兜住冒泡。
 *
 * 弹窗用 `v-if` 挂载（每次打开都是新节点），所以内部**不会**踩「`scroll-view` 跨显隐变空白」
 * 那个坑（约束 22 只对 `v-show` 成立）；正文仍用普通 `<view>` + 限高，不引 `scroll-view`。
 */
import { computed, ref, watch } from 'vue';
import { mediaUrl } from '@/api/config';
import { active, closePopup } from '@/store/announcement';
import { switchTab } from '@/store/shell';

/** 跳转目标 → 动作。**映射留在客户端**：服务端只给 `linkType`，它不该知道小程序的路由。 */
const LINK_TEXT: Record<number, string> = { 1: '去购票', 2: '看我的预约', 3: '出示入园码', 4: '看景区地图' };

const linkLabel = computed(() => LINK_TEXT[active.value?.linkType ?? 0] ?? '');
const imageSrc = computed(() => (active.value?.imageUrl ? mediaUrl(active.value.imageUrl) : ''));

/**
 * 配图加载失败就**整块不渲染**（否则是一大块空白，比没有图更难看）。
 *
 * ⚠️ 失败标记记的是 **URL 而不是一个布尔量** —— 布尔量会粘住：图只要在某一瞬间没加载出来
 * （刚上传完、网络抖一下），标记就永远是 true，之后值没变就再也不重置（logo 那次踩过）。
 */
const failedImage = ref('');
watch(imageSrc, () => {
  /* 换了一条公告就重新给图一次机会 */
});
const showImage = computed(() => !!imageSrc.value && failedImage.value !== imageSrc.value);
function onImageError() {
  failedImage.value = imageSrc.value;
}

function onJump() {
  const type = active.value?.linkType ?? 0;
  if (!type) return;
  closePopup();

  // ⚠️ 这里**没有真的 tab 页面**（单页外壳），切 tab 走 store 的 `switchTab`，不是 `uni.switchTab`；
  //    二级页才用 `navigateTo`。弹窗本身就在外壳上，切 tab 不用先退栈。
  if (type === 3) {
    switchTab('credential');
    return;
  }
  const url = type === 1 ? '/pages/booking/index' : type === 2 ? '/pages/orders/index' : '/pages/map/index';
  uni.navigateTo({ url });
}
</script>

<template>
  <view
    v-if="active"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background-color: rgba(0, 0, 0, 0.5)"
    @tap="closePopup"
  >
    <view
      class="w-full max-w-430px bg-paper-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      @tap.stop
    >
      <image v-if="showImage" class="w-full h-40" :src="imageSrc" mode="aspectFill" @error="onImageError" />

      <view class="flex flex-col gap-2 p-5">
        <view class="flex items-start justify-between gap-3">
          <view class="flex-1 min-w-0">
            <text class="font-serif-cn font-bold text-17px text-ink-charcoal-text">{{ active.title }}</text>
            <text v-if="active.areaName" class="block text-11px text-ink-light-gray mt-1">
              {{ active.areaName }}
            </text>
          </view>
          <view class="msi icon-close text-18px text-ink-light-gray shrink-0 p-1" hover-class="pg-hover" @tap="closePopup" />
        </view>

        <!-- 正文：限高，超长时内部滚动。
             ⚠️ 限高与滚动走**内联样式**：`max-h-240px` / `overflow-y-auto` 这两个类
             classmap 里没有（`check:classes` 会拦），而 body 长一点是常态、不能截断。
             也不用 `<scroll-view>`：弹窗在外壳里、是 `v-if` 重建的（不受约束 22 影响），
             但为一个纯排版需求引一个滚动容器没必要。 -->
        <view style="max-height: 240px; overflow-y: auto">
          <text class="text-13px text-ink-charcoal-text leading-relaxed">{{ active.content }}</text>
        </view>

        <view class="flex flex-col gap-2 mt-2">
          <view
            v-if="active.linkType"
            class="min-h-44px rounded-full bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary text-15px font-semibold flex items-center justify-center"
            hover-class="pg-hover"
            @tap="onJump"
          >
            <text>{{ linkLabel }}</text>
          </view>
          <view
            class="min-h-44px rounded-full border border-silk-border text-ink-charcoal-text text-15px flex items-center justify-center"
            hover-class="pg-hover"
            @tap="closePopup"
          >
            <text>我知道了</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
