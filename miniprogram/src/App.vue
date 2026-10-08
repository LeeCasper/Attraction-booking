<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  // 纯静态还原阶段：无接口调用、无登录态。
  // 接后端时在此做 wx.login → POST /api/mini/auth/login → 存 token。
});
</script>

<style lang="scss">
// 变量与函数来自 uni.scss 的自动注入（见 src/uni.scss），此处只放真正的全局规则。
// 顺序不可颠倒：fonts 声明 @font-face → utilities/icons 是具体的类规则。
@import './styles/fonts.scss';
@import './styles/utilities.scss';
@import './styles/icons.scss';

page {
  background-color: $c-surface;
  color: $c-ink-charcoal-text;
  font-family: $font-body;
  -webkit-font-smoothing: antialiased;
}

// box-sizing 必须全局设成 border-box（等价于 Tailwind 的 preflight）。
// box-sizing 不可继承，所以只能逐个元素声明。
// 漏掉它会让「h-full + p-4」算成「100% 内容高 + 32px 内边距」，
// 撑破固定高度的容器 —— Banner 的覆盖层就是这样溢出了 32px。
// 同时写 view/text/... 与 uni-view/uni-text/...：前者是小程序端的标签名，
// 后者是 uni-app H5 端渲染出的自定义元素名，两边都要覆盖。
view, text, image, scroll-view, swiper, swiper-item, button, input, textarea, picker, form, navigator,
uni-view, uni-text, uni-image, uni-scroll-view, uni-swiper, uni-swiper-item, uni-button, uni-input, uni-textarea, uni-picker, uni-form, uni-navigator {
  box-sizing: border-box;
}

// 设计稿里滚动条是隐藏的（::-webkit-scrollbar{display:none}）
::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
  background: transparent;
}

// ---- 由 scripts/gen-pages.mjs 生成的页面所用到的结构类 ----
// 设计稿的 Banner 是「div + background-image」；WXSS 不能用本地路径做 background-image，
// 且外链图片在国内不可达，故生成器改为插入一个绝对定位的 <image>。
// 这两个类必须存在，否则 <image> 会以固有尺寸参与文档流，把覆盖内容顶出可视区。
.pg-has-bg {
  position: relative;
}
.pg-bgimg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
// 覆盖在背景图之上的原始内容。必须显式定位 + z-index，
// 否则静态定位的内容会被上面那个绝对定位的 <image> 盖住。
.pg-bgcontent {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}

// 生成器给 a/button 转出的 <view> 加的按下态
.pg-hover {
  opacity: 0.85;
}

// ---- 内联 SVG 的替代：小程序没有 <svg> 标签 ----
// 设计稿的二维码 SVG 是 viewBox="0 0 100 100" 下的一组 <rect>，
// 生成器把它转成百分比定位的 <view>，位置与圆角与原图一一对应。
.pg-svg {
  position: relative;
  display: block;
}
.pg-qr-rect {
  position: absolute;
}
</style>
