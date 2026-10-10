<script setup lang="ts">
/**
 * 首页「门票选购」里的一张票卡。
 *
 * class 逐字取自 `design/reference/home.html`（经 `gen-pages.mjs` 产出的
 * `views/home/index.vue`）—— 三张卡的 class **完全相同**，所以只能整卡替换成组件：
 * 若改成逐个绑定文本，同一段版式就要在绑定表里重复三遍，改一次得改三处。
 *
 * 组件根节点自带**卡容器**的 class（`p-4 rounded-2xl …`）：
 * `replace` 用在 flex 容器上时，自定义组件会多一层节点，容器类必须落在组件根上，
 * 否则 `flex flex-col gap-3` 那层就散了。见 `page-bindings.mjs` 的 `home` 节。
 *
 * 与设计稿的一处刻意偏离：设计稿三个角标（实名制预约 / 特惠优待 / 超值推荐）与
 * 底部小字（今日可约 · 出票即用 …）都是**营销文案**，后端没有任何对应字段。
 * 这里改成由 `needRealname` / `refundRule` / `saleUnit` 推出来的真数据 ——
 * 照抄营销话术等于替景区做承诺。详见 README 的已知偏差。
 */
import type { HomeTicketCard } from '@/views/home/behavior';

// 不写 export：<script setup> 不允许 ES 模块导出。
const props = defineProps<{ ticket: HomeTicketCard }>();
const emit = defineEmits<{ pick: [card: HomeTicketCard] }>();

const CARD =
  'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant_50 shadow-0_2px_12px_rgba0000_03 flex flex-col gap-3 hover-border-primary_40 transition-all';
const BADGE_PRIMARY = 'px-1_5 py-0_5 rounded text-10px font-semibold bg-primary_10 text-primary border border-primary_20';
/** 中性角标：沿用设计稿里「随时退」那一枚的样式 */
const BADGE_MUTED = 'px-1_5 py-0_5 rounded text-10px font-semibold bg-surface-container text-deep-teal-800';
const BTN =
  'px-4 py-1_5 rounded-full bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary font-body-sm text-13px font-semibold shadow-sm hover-shadow-md transition-all';

/**
 * 角标配色。
 *
 * 写成函数而不是模板里的三目 `:class="b.tone === 'primary' ? A : B"` ——
 * `check:classes` 会把 `:class` 表达式里带引号的串当类名扫，
 * 于是 `'primary'` 会被报成「没有出处的 class」。表达式里放标识符才是它预期的写法。
 */
const badgeClass = (tone: 'primary' | 'muted') => (tone === 'primary' ? BADGE_PRIMARY : BADGE_MUTED);
</script>

<template>
  <view :class="CARD">
    <view class="flex items-start justify-between gap-2">
      <view class="flex flex-col gap-1">
        <view class="flex items-center gap-2 flex-wrap">
          <view class="font-headline-md text-16px font-bold text-ink-charcoal-text">
            <text>{{ props.ticket.name }}</text>
          </view>
          <text
            v-for="b in props.ticket.badges"
            :key="b.text"
            :class="badgeClass(b.tone)"
          >{{ b.text }}</text>
        </view>
        <view v-if="props.ticket.audience" class="font-caption-sm text-12px text-ink-light-gray">
          <text>{{ props.ticket.audience }}</text>
        </view>
      </view>

      <view class="flex flex-col items-end shrink-0">
        <view class="flex items-baseline text-cinnabar-red">
          <text class="text-13px font-semibold mr-0_5">¥</text>
          <text class="font-data-metric-lg text-22px font-bold leading-none">{{ props.ticket.priceLabel }}</text>
          <text class="text-11px text-ink-light-gray font-normal ml-0_5">{{ props.ticket.unitLabel }}</text>
        </view>
      </view>
    </view>

    <view class="flex items-center justify-between pt-2 border-t border-dashed border-outline-variant_40">
      <text class="text-11px text-ink-light-gray flex items-center gap-1">
        <view class="msi icon-verified text-13px text-emerald-pass" />{{ props.ticket.footnote }}
      </text>
      <!-- 只有按钮可点：设计稿里卡容器也没有鼠标指针样式，点整卡是额外发明 -->
      <view :class="BTN" hover-class="active-opacity-90 pg-hover" @tap="emit('pick', props.ticket)">
        <text>立即预约</text>
      </view>
    </view>
  </view>
</template>
