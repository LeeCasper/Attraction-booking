<script setup lang="ts">
/**
 * 底部 4 Tab 导航。
 *
 * 不用微信原生 tabBar：原生 tabBar 无法还原设计稿的毛玻璃背景与自定义选中态
 * （选中项 text-primary + font-bold，未选中 text-ink-light-gray）。
 *
 * 切换用 reLaunch 而不是 navigateTo —— 这 4 个是平级主页，用 navigateTo 会让
 * 页面栈无限堆积（小程序页面栈上限 10 层）。
 */
type TabKey = 'home' | 'booking' | 'digital-pass' | 'profile';

const props = defineProps<{ active: TabKey }>();

/** data-path 取值与设计稿逐字一致，方便与设计稿 HTML 对照 */
const TABS: { key: TabKey; icon: string; label: string; path: string }[] = [
  { key: 'home', icon: 'forest', label: '首页', path: '/pages/home/index' },
  { key: 'booking', icon: 'confirmation_number', label: '预约购票', path: '/pages/booking/index' },
  { key: 'digital-pass', icon: 'qr_code_scanner', label: '电子凭证', path: '/pages/credential/index' },
  { key: 'profile', icon: 'account_circle', label: '个人中心', path: '/pages/profile/index' },
];

function switchTo(tab: (typeof TABS)[number]) {
  if (tab.key === props.active) return;
  uni.reLaunch({ url: tab.path });
}
</script>

<template>
  <view class="pg-tabbar">
    <view class="pg-tabbar__inner">
      <view
        v-for="tab in TABS"
        :key="tab.key"
        class="pg-tabbar__item"
        :class="tab.key === props.active ? 'is-active' : ''"
        :data-path="tab.key"
        @tap="switchTo(tab)"
      >
        <view class="msi text-[24px]" :class="`icon-${tab.icon}`" />
        <text class="pg-tabbar__label">{{ tab.label }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
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
  padding-bottom: $safe-bottom;
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
