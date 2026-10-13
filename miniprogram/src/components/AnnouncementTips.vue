<script setup lang="ts">
/**
 * 首页顶部的**提示公告**条（多条自动轮播）。
 *
 * 它替换掉设计稿里那一条写死的公告行（`design/reference/home.html` 的 amber 条），
 * 版式与那一行**逐字一致**（class 都是从生成产物里搬过来的消毒名），多出来的只有：
 * ① 多条时每 5 秒轮播一条；② 点整条或右侧「须知」→ 打开弹窗看全文（原来只弹一句 toast）。
 *
 * ⚠️ 定时器**只在 `active` 为真时跑**：四个视图一直挂在外壳里，看不见时还每 5 秒翻一下
 * 纯属白跑（与个人中心那边「刻意不做秒级 ticker」同一条口径）。
 */
import { computed, onUnmounted, watch } from 'vue';
import type { MiniAnnouncement } from '@/api';
import { currentTip, nextTip, openPopup, tipIndex, tips } from '@/store/announcement';

const props = defineProps<{ tips: MiniAnnouncement[]; active: boolean }>();
const emit = defineEmits<{ notice: [id: number] }>();

/** 行内文案：全平台公告没有景点名，就不加「【…】」前缀 */
const label = computed(() => {
  const t = currentTip.value;
  if (!t) return '';
  return t.areaName ? `【${t.areaName}】${t.title}` : t.title;
});

const ROTATE_MS = 5000;
let timer: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function restart() {
  stop();
  if (!props.active || props.tips.length <= 1) return;
  timer = setInterval(nextTip, ROTATE_MS);
}

// 可见性 + 条数变化都要重算（首屏拿到数据前 tips 是空的）
watch(() => [props.active, props.tips.length], restart, { immediate: true });
onUnmounted(stop);

/** 点整条 / 「须知」：打开弹窗看全文（`openPopup` 不受「每天一次」限制 —— 这是用户主动点的） */
function onOpen() {
  const t = currentTip.value;
  if (!t) return;
  openPopup(t.id);
  emit('notice', t.id);
}
</script>

<template>
  <!-- 一条公告都没有时整条不渲染（留个空壳比不显示更像坏了 —— 与原实现同一口径） -->
  <view
    v-if="tips.length"
    class="flex items-center justify-between px-3 py-2 rounded-xl bg-fffcf5 border border-amber-gold_25 text-tertiary shadow-0_2px_8px_rgba21711960_06"
    @tap="onOpen"
  >
    <view class="flex items-center gap-2 overflow-hidden mr-2">
      <view class="w-6 h-6 rounded-full bg-amber-gold_15 flex items-center justify-center shrink-0 text-amber-gold">
        <view class="msi icon-notifications_active text-15px" />
      </view>
      <text class="font-body-sm text-12px truncate text-ink-charcoal-text font-medium">{{ label }}</text>
    </view>
    <!-- 多条时用圆点表示「还有别的」 -->
    <view class="flex items-center gap-1 shrink-0 mr-2">
      <view
        v-for="(t, i) in tips"
        :key="t.id"
        :class="i === tipIndex ? 'w-1_5 h-1_5 rounded-full bg-amber-gold' : 'w-1_5 h-1_5 rounded-full bg-amber-gold_15'"
      />
    </view>
    <view class="font-caption-sm text-11px font-semibold text-tertiary-container flex-shrink-0 flex items-center gap-0_5">
      <text>详情</text>
      <view class="msi icon-chevron_right text-13px" />
    </view>
  </view>
</template>
