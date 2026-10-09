<script setup lang="ts">
/**
 * 顶部轻提示 —— 设计稿 `#toastNotification`。
 *
 * 设计稿自带一段手写 JS：点击「刷新」后把 `opacity-0` 换成 `opacity-100` 显示 2 秒。
 * 这里换成 `visible` prop + 组件内的一行 scoped 样式（比切工具类更可靠：
 * `.opacity-0` 与 `.opacity-100` 都是单类选择器、特异性相同，靠书写顺序决定胜负，
 * 而 scoped 的 `.is-on[data-v-x]` 一定压得过）。
 *
 * 设计稿的 `opacity-0` 保留在根节点上（默认不可见），`visible` 为真时叠加 `is-on`。
 */
withDefaults(defineProps<{ visible?: boolean; text?: string }>(), {
  visible: false,
  text: '离线加密凭证已更新至本地缓存',
});

const TOAST =
  'fixed top-20 left-1_2 -translate-x-1_2 z-50 pointer-events-none opacity-0 transition-opacity duration-300 px-4 py-2 rounded-full bg-115e59 text-white font-body-sm text-caption-sm shadow-md flex items-center gap-1_5';
</script>

<template>
  <view :class="[TOAST, visible ? 'is-on' : '']">
    <view class="msi icon-verified text-16px text-jade-bright-300" />
    <text>{{ text }}</text>
  </view>
</template>

<style lang="scss" scoped>
.is-on {
  opacity: 1;
}
</style>
