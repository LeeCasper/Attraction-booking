<script setup lang="ts">
/**
 * 景区地图页的一张点位卡（栈道 / 峡谷 / 索道 / 夜游）。
 *
 * 版式逐字取自 `design/reference/map.html` 的卡片：98×98 缩略图（左上角一枚角标）
 * + 标题与状态胶囊 + 一行副标题 + 两行指标 + 底部一条「手绘标点 | 查看导览」。
 *
 * ⚠️ 这里的 class 是**消毒后的名**（`gap-3_5` 不是 `gap-3.5`）：
 * 内容写在组件里，不经过 `page-bindings` 的 `replace`，也就不过 `mapClasses`
 * —— 写原始类名会静默无样式（见 CLAUDE.md 第 9 条）。`check:classes` 兜底。
 *
 * 内容（点位名、指标、客流百分比）**全部是静态的**，理由见 `pages/map/behavior.ts` 的文件头。
 */
import type { Poi, PoiMetric } from '@/pages/map/behavior';

const props = defineProps<{ poi: Poi }>();
const emit = defineEmits<{ guide: []; pin: [] }>();

// —— class 常量（条件类走标识符：`check:classes` 会把模板三目里的引号串当类名扫）——
const CARD =
  'w-full bg-paper-pure rounded-card border border-silk-border p-3_5 shadow-0_2px_12px_rgba2840380_03 transition-all';
const THUMB_WRAP = 'relative w-98px h-98px rounded-xl overflow-hidden shrink-0 bg-paper-base';
/** 图左上角那枚角标：前三个点位是墨色半透明，「索道联运」是琥珀色 */
const BADGE_INK =
  'absolute top-1_5 left-1_5 bg-ink-charcoal_75 backdrop-blur-xs text-white text-10px px-1_5 py-0_5 rounded-md font-medium tracking-tight';
const BADGE_WARN =
  'absolute top-1_5 left-1_5 bg-amber-warm_85 backdrop-blur-xs text-white text-10px px-1_5 py-0_5 rounded-md font-medium tracking-tight';
const BODY = 'flex-1 min-w-0 flex flex-col justify-between h-98px py-0_5';
const TITLE = 'font-serif-cn font-bold text-16px text-ink-charcoal truncate';
/** 状态胶囊：常规淡青、限流琥珀 */
const PILL_OK = 'text-11px font-medium text-bamboo-deep bg-bamboo-light px-2 py-0_5 rounded-full shrink-0';
const PILL_WARN = 'text-11px font-medium text-amber-warm bg-amber-soft px-2 py-0_5 rounded-full shrink-0';
const SUBTITLE = 'text-12px text-ink-subtle mt-1 truncate';
const METRIC = 'flex items-center text-11px text-ink-subtle gap-1_5';
const METRIC_WARN = 'flex items-center text-11px text-amber-warm gap-1_5';
const METRIC_ICON = 'msi text-13px text-bamboo-teal';
/** 指标里那一截加粗的数字/时间 —— `font-num` 在 gen-utilities 里指向正文族（全站只有两套字体） */
const METRIC_STRONG = 'font-num text-ink-charcoal font-semibold';
const METRIC_STRONG_WARN = 'font-num font-semibold';
const FOOTER = 'mt-3 pt-2_5 border-t border-silk-border_60 flex items-center justify-between';
const PIN_BTN = 'inline-flex items-center text-12px text-ink-subtle transition-colors';
const GUIDE_BTN =
  'inline-flex items-center px-3_5 py-1_5 rounded-pill bg-bamboo-teal text-white text-12px font-medium transition-transform shadow-xs';

const badgeClass = (poi: Poi) => (poi.badgeTone === 'warn' ? BADGE_WARN : BADGE_INK);
const pillClass = (poi: Poi) => (poi.statusTone === 'warn' ? PILL_WARN : PILL_OK);
const metricClass = (tone?: 'warn') => (tone === 'warn' ? METRIC_WARN : METRIC);
const strongClass = (tone?: 'warn') => (tone === 'warn' ? METRIC_STRONG_WARN : METRIC_STRONG);
/**
 * 指标行的图标：图标名要拼进类名，颜色又跟着 tone 走。
 *
 * ⚠️ 写成函数而不是模板里的 `:class="[`icon-${m.icon}`, m.tone === 'warn' ? '' : '…']"` ——
 * `check:classes` 会把 `:class` 表达式里**带引号的串**当类名扫，`'warn'` 会被报成
 * 「没有出处的 class」（踩过，同 `PayMethods.vue` 的注解）。
 */
const metricIconClass = (m: PoiMetric) =>
  `msi text-13px icon-${m.icon}${m.tone === 'warn' ? '' : ' text-bamboo-teal'}`;
</script>

<template>
  <view :class="CARD">
    <view class="flex gap-3_5 items-start">
      <!-- 缩略图 + 角标 -->
      <view :class="THUMB_WRAP">
        <image class="w-full h-full" :src="props.poi.image" mode="aspectFill" />
        <text :class="badgeClass(props.poi)">{{ props.poi.badge }}</text>
      </view>

      <!-- 标题 / 副标题 / 指标 -->
      <view :class="BODY">
        <view>
          <view class="flex items-center justify-between gap-1_5">
            <text :class="TITLE">{{ props.poi.name }}</text>
            <text :class="pillClass(props.poi)">{{ props.poi.status }}</text>
          </view>
          <text :class="SUBTITLE">{{ props.poi.subtitle }}</text>
        </view>

        <view class="space-y-1">
          <view v-for="m in props.poi.metrics" :key="m.pre" :class="metricClass(m.tone)">
            <view :class="metricIconClass(m)" />
            <text class="truncate">
              <text>{{ m.pre }}</text>
              <text v-if="m.strong" :class="strongClass(m.tone)">{{ m.strong }}</text>
              <text v-if="m.post">{{ m.post }}</text>
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作条 -->
    <view :class="FOOTER">
      <view :class="PIN_BTN" hover-class="pg-hover" @tap="emit('pin')">
        <view class="msi icon-map text-15px text-bamboo-teal mr-1" />
        <text>手绘标点</text>
      </view>
      <view :class="GUIDE_BTN" hover-class="pg-hover" @tap="emit('guide')">
        <view class="msi icon-explore text-13px mr-1" />
        <text>查看导览</text>
      </view>
    </view>
  </view>
</template>
