<script setup lang="ts">
/**
 * 底部 4 Tab 导航 —— 纯受控组件：只报告「点了哪个」，不负责跳转。
 *
 * 为什么不再导航：本项目已改成**单页架构**（一个页面 + 四个视图 v-show）。
 * 之前用微信 tabBar 时，`reLaunch` / `switchTab` / 自定义 tabBar 都躲不开切换闪烁 ——
 * 那是「页面转场必然重建视图层」造成的平台固有问题（社区从 2019 年反馈至今）。
 * 现在切页只是改一个 ref、CSS 显隐，没有页面转场，就不存在闪的可能。
 * 详见 src/pages/main/index.vue 与 README。
 *
 * 由外壳渲染**一次**，四个视图共用，所以底栏自身也不会重建。
 */
type TabKey = 'home' | 'booking' | 'credential' | 'profile';

const props = defineProps<{ active: TabKey }>();
const emit = defineEmits<{ change: [key: TabKey] }>();

/** dataPath 取值与设计稿逐字一致，方便与设计稿 HTML 对照 */
const TABS: { key: TabKey; icon: string; label: string; dataPath: string }[] = [
  { key: 'home', icon: 'forest', label: '首页', dataPath: 'home' },
  { key: 'booking', icon: 'confirmation_number', label: '预约购票', dataPath: 'booking' },
  { key: 'credential', icon: 'qr_code_scanner', label: '电子凭证', dataPath: 'digital-pass' },
  { key: 'profile', icon: 'account_circle', label: '个人中心', dataPath: 'profile' },
];

function onTap(tab: (typeof TABS)[number]) {
  if (tab.key === props.active) return;
  emit('change', tab.key);
}
</script>

<template>
  <view class="pg-tabbar__wrap">
    <!--
      让位块：底栏是 fixed、不占文档流，而视图侧已经去掉了设计稿的 pb-24/pb-28
      （见 scripts/gen-pages.mjs 的 VIEW_DROP），所以这里要自己把高度占回来，
      否则每个视图的内容都会被底栏压住。
      高度与底栏保持一致：64px 内容 + 底部安全区。
    -->
    <view class="pg-tabbar__spacer" />

    <view class="pg-tabbar">
      <view class="pg-tabbar__inner">
        <view
          v-for="tab in TABS"
          :key="tab.key"
          class="pg-tabbar__item"
          :class="tab.key === props.active ? 'is-active' : ''"
          :data-path="tab.dataPath"
          @tap="onTap(tab)"
        >
          <view class="msi text-24px" :class="`icon-${tab.icon}`" />
          <text class="pg-tabbar__label">{{ tab.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 外层只负责占位，不画任何东西；真正的底栏是 fixed，不参与文档流
.pg-tabbar__wrap {
  flex-shrink: 0;
}

.pg-tabbar__spacer {
  // content-box：高度要和底栏的「内容 64px + 底部安全区」严格对齐
  box-sizing: content-box;
  height: px2rpx(64);
  // 必须和 .pg-tabbar 的 padding-bottom 用同一个值，否则底栏与上方内容错位
  padding-bottom: $safe-bottom-tabbar;
}

.pg-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 50;
  // 设计稿为 bg-surface-container-lowest/95 + backdrop-blur-xl；小程序下降级为高不透明度底色
  background-color: rgba(255, 255, 255, 0.95);
  border-top: 1px solid rgba(188, 201, 198, 0.4);
  box-shadow: 0 px2rpx(-2) px2rpx(12) rgba(0, 104, 95, 0.06);
  // 有意用「安全区的一半」而不是完整的 pb-safe，理由见 tokens.scss
  padding-bottom: $safe-bottom-tabbar;
}

.pg-tabbar__inner {
  height: px2rpx(64);
  padding: 0 px2rpx(8);
  display: flex;
  justify-content: space-around;
  align-items: center;
}

.pg-tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: px2rpx(64);
  min-height: px2rpx(44);
  gap: px2rpx(2);
  color: $c-ink-light-gray;
  transition: all 150ms ease-out;

  &.is-active {
    color: $c-primary;
  }
}

.pg-tabbar__label {
  font-size: px2rpx(11);
  line-height: px2rpx(16);
}

.is-active .pg-tabbar__label {
  font-weight: 700;
}
</style>
