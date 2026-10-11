<script setup lang="ts">
import { computed, ref } from 'vue';
import { platformSettings } from '@/store/settings';

/**
 * 4 个页面共用的顶部固定栏。
 *
 * 与设计稿的一处刻意偏离：设计稿自绘了一个「胶囊」按钮（more_horiz + 圆点），
 * 但真机上微信会在右上角渲染**真实胶囊**，再画一个必然重叠。
 * 这里只做「按真实胶囊的位置预留空间」，把设计稿的更多按钮对齐到胶囊左侧。
 *
 * 若要看与设计稿完全一致的 H5 预览效果，把 mockCapsule 打开即可画回假胶囊。
 */
const props = withDefaults(defineProps<{ mockCapsule?: boolean }>(), { mockCapsule: false });

// 状态栏高度用真实 px（不是 rpx）—— 这是设备物理量，不该随屏宽缩放
const statusBarHeight = ref(0);
// 胶囊左侧到屏幕右边的距离，作为 header 的右内边距，避免内容被真胶囊盖住
const capsuleInset = ref(0);

// getSystemInfoSync 自基础库 2.20.1 起废弃，会往控制台打弃用告警。
// 优先用拆分后的 getWindowInfo，旧基础库上回退（`?.` 对不存在的方法返回 undefined）。
type WindowMetrics = { statusBarHeight?: number; windowWidth: number };
const win: WindowMetrics =
  (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();

statusBarHeight.value = win.statusBarHeight ?? 0;

// #ifdef MP-WEIXIN
const rect = uni.getMenuButtonBoundingClientRect();
if (rect && rect.width > 0) {
  capsuleInset.value = win.windowWidth - rect.left + 8;
}
// #endif

const headerStyle = computed(() => {
  const padTop = `${statusBarHeight.value}px`;
  const padRight = capsuleInset.value > 0 ? `${capsuleInset.value}px` : '';
  return {
    'padding-top': padTop,
    ...(padRight ? { 'padding-right': padRight } : {}),
  };
});
</script>

<template>
  <view class="pg-header__wrap">
    <!--
      占位块：让出**真实状态栏**的高度，把页面内容顶下去。
      设计稿的 <main> 只有固定的 pt-16（64px），那是按「没有状态栏」画的 ——
      而顶栏实际高度是「状态栏 + 56px」，真机上状态栏有 40+px，
      于是顶栏盖住了下面约 40px 的内容（H5 上看不出来，因为状态栏为 0）。
      这里补上这段差值：H5 上高度为 0、与设计稿完全一致，真机自动让位。
    -->
    <view class="pg-header__spacer" :style="{ height: `${statusBarHeight}px` }" />

    <view class="pg-header" :style="headerStyle">
      <view class="pg-header__bar">
        <view class="pg-header__brand">
          <view class="pg-header__logo">
            <view class="msi icon-park text-19px" />
          </view>
          <view class="pg-header__names">
            <view class="pg-header__title-row">
              <!--
                品牌名来自后台「参数配置 → platform」，不是设计稿里写死的字面量 ——
                设计稿是按单景区画的，而本平台管多个景点，顶栏顶着某一个景点的名字是错的。
              -->
              <text class="pg-header__cn">{{ platformSettings.name }}</text>
              <text class="pg-header__en">{{ platformSettings.nameEn }}</text>
            </view>
            <text class="pg-header__sub">{{ platformSettings.subtitle }}</text>
          </view>
        </view>

        <!-- 真机下此处留空（真胶囊由微信渲染）；H5 预览可画回设计稿的假胶囊 -->
        <view v-if="props.mockCapsule" class="pg-header__capsule">
          <view class="msi icon-more_horiz text-17px" />
          <view class="pg-header__capsule-line" />
          <view class="pg-header__capsule-dot-wrap">
            <view class="pg-header__capsule-dot" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 外层不画任何东西，高度完全由里面的 spacer 决定 ——
// 内部那条 .pg-header 是 position:fixed，不参与文档流，所以不会撑高外层。
.pg-header__wrap {
  flex-shrink: 0;
}

.pg-header__spacer {
  width: 100%;
}

.pg-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 50;
  // backdrop-blur 在小程序渲染器下支持不稳（见 README 已知偏差），
  // 这里用高不透明度底色替代，观感接近设计稿的毛玻璃
  background-color: rgba(239, 252, 249, 0.92);
  border-bottom: 1px solid rgba(0, 104, 95, 0.1);
  box-shadow: 0 px2rpx(2) px2rpx(12) rgba(0, 104, 95, 0.04);
}

.pg-header__bar {
  height: px2rpx(56);
  padding: 0 px2rpx(16);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pg-header__brand {
  display: flex;
  align-items: center;
  gap: px2rpx(10);
}

.pg-header__logo {
  width: px2rpx(32);
  height: px2rpx(32);
  border-radius: px2rpx(8);
  background-image: linear-gradient(to bottom right, $c-primary, $c-deep-teal-800);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 px2rpx(1) px2rpx(2) rgba(0, 0, 0, 0.05);
}

.pg-header__names {
  display: flex;
  flex-direction: column;
}

.pg-header__title-row {
  display: flex;
  align-items: baseline;
  gap: px2rpx(6);
}

.pg-header__cn {
  font-family: $font-serif;
  font-size: px2rpx(17);
  font-weight: 700;
  color: $c-primary;
  letter-spacing: px2rpx(0.4);
}

.pg-header__en {
  // 设计稿这里给的是 Space Grotesk（等宽感），全站统一成两套字体后并进正文族
  // —— 大写 + tracking 的装饰感靠 letter-spacing 保留，见 CLAUDE.md 约束 18
  font-family: $font-body;
  font-size: px2rpx(10);
  font-weight: 700;
  color: rgba(0, 104, 95, 0.7);
  letter-spacing: px2rpx(1.2);
  text-transform: uppercase;
}

.pg-header__sub {
  font-size: px2rpx(10);
  line-height: 1.25;
  color: $c-ink-light-gray;
}

.pg-header__capsule {
  display: flex;
  align-items: center;
  gap: px2rpx(8);
  padding: px2rpx(4) px2rpx(10);
  border-radius: $radius-full;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(188, 201, 198, 0.6);
  box-shadow: 0 px2rpx(1) px2rpx(2) rgba(0, 0, 0, 0.05);
  color: $c-ink-charcoal-text;
}

.pg-header__capsule-line {
  width: 1px;
  height: px2rpx(14);
  background-color: rgba(188, 201, 198, 0.6);
}

.pg-header__capsule-dot-wrap {
  width: px2rpx(14);
  height: px2rpx(14);
  border-radius: $radius-full;
  border: 1.5px solid $c-ink-charcoal-text;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pg-header__capsule-dot {
  width: px2rpx(6);
  height: px2rpx(6);
  border-radius: $radius-full;
  background-color: $c-ink-charcoal-text;
}
</style>
