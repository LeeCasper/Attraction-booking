<script setup lang="ts">
/**
 * 「景点选择」那一格的标题栏。
 *
 * ## 为什么由外壳渲染，而不是放在视图里
 *
 * 设计稿给这一页画的是**固定**标题栏（`fixed top-0 … pt-safe`）。但这一格是外壳里的一个
 * **视图**，它挂在 `<scroll-view>` 里 —— 而**微信的 `scroll-view` 会形成自己的包含块，
 * 里面的 `position: fixed` 不再相对视口固定**，标题栏会跟着内容一起滚走（实测过：
 * 滚下去之后标题栏消失、内容顶到状态栏下面）。
 *
 * 所以它必须和 `PageHeader` 一样挂在 scroll-view **外面**。这也正是本项目一开始就定的分工：
 * **顶栏/底栏由外壳只渲染一次，视图只管内容**。
 *
 * ## 结构与 PageHeader 完全同款
 *
 * ```
 * 占位块（状态栏高度，在文档流里）→ 把滚动区顶下去
 * 固定条（自己也让开状态栏：padding-top = 状态栏高度）
 * ```
 *
 * 两段相加 = 状态栏 + 56px；视图侧 `<main>` 上设计稿原本的 `pt-14`（56px）正好接在后面。
 *
 * **没有返回键**：它是根 tab，没有「返回」可言（设计稿画返回键是按二级页画的）。
 *
 * ## 标题按**整屏**居中，不做胶囊避让
 *
 * 设计稿的 header 是「返回键 + 居中标题 + 88px 假胶囊」，左右两侧本就是对**称**的。
 * （改成 `justify-center` 之后，两个 88px 占位块也一并去掉 —— 它们只对 `justify-between`
 * 有意义；留着反而在窄屏上挤掉标题的可用宽度。）
 * 这里曾经为了躲开真胶囊，把「胶囊左侧到屏右的距离」当成整条横条的 `padding-right` ——
 * **那是错的**：横条左右内边距一变，`justify-between/center` 的居中基准也跟着偏，
 * 整行被推着往左走，标题肉眼可见不在中间（`capsuleInset` 差不多 100px，偏了 50px）。
 *
 * 正确的做法是**不补偿**：标题只有 7 个字（约 126px），居中后左右各留 132px，
 * 离胶囊（约在屏右 96px 处）还差 30 多 pt，够不着。真要更长的标题再说，
 * `truncate` 已经兜住溢出。
 */
import { ref } from 'vue';

const statusBarHeight = ref(0);

type WindowMetrics = { statusBarHeight?: number };
const win: WindowMetrics =
  (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();
statusBarHeight.value = win.statusBarHeight ?? 0;

const barStyle = { 'padding-top': `${statusBarHeight.value}px` };
</script>

<template>
  <view class="pg-areatop__wrap">
    <view class="pg-areatop__spacer" :style="{ height: `${statusBarHeight}px` }" />

    <view class="pg-areatop" :style="barStyle">
      <view class="h-14 px-margin flex items-center justify-center">
        <text class="font-headline-md text-headline-md text-on-surface tracking-wide truncate">景点选择与预约</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 外层不画东西，高度完全由里面的 spacer 决定（固定条不参与文档流）
.pg-areatop__wrap {
  flex-shrink: 0;
}

.pg-areatop__spacer {
  width: 100%;
}

.pg-areatop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 50;
  // 设计稿是 bg-surface/85 + backdrop-blur-xl；小程序对 backdrop-filter 支持不稳
  // （见 README 已知偏差），沿用 PageHeader 的做法：提高不透明度代替毛玻璃
  background-color: rgba(239, 252, 249, 0.92);
  border-bottom: 1px solid rgba(0, 104, 95, 0.1);
  box-shadow: 0 px2rpx(1) px2rpx(4) rgba(0, 104, 95, 0.08);
}
</style>
