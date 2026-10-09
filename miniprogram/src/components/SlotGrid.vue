<script setup lang="ts">
/**
 * 入园时段格 —— 设计稿 `#slotGrid`。
 *
 * class 逐字取自 `design/reference/booking.html`：
 *   选中格 = 08:30-10:30（唯一的选中样本，带 check 角标）· 未选中格 = 10:30-12:30（紧张）/ 12:30-14:30（充足）
 *
 * ⚠️ 一处推断：设计稿里「充足」在选中格是 `text-emerald-pass`、在未选中格是 `text-primary`；
 *    「紧张」只给了未选中样本（`text-amber-gold`）。这里按「紧张恒为琥珀」处理 ——
 *    时段卡选中态底色仍是浅色 bg-paper-surface（不像日期卡会变青绿渐变），琥珀在上面可读。
 *
 * 组件根节点自己带 grid 容器的类，原因同 DateCards。
 */
// 不写 export：<script setup> 不允许 ES 模块导出。
interface SlotOption {
  /** 后端时段 id（`timeSlotId`），下单时原样回传 */
  id: number;
  range: string;
  left: number;
  tone: 'ok' | 'tight';
}

const props = defineProps<{ slots: SlotOption[]; value: number | null }>();
const emit = defineEmits<{ change: [id: number] }>();

const GRID = 'grid grid-cols-2 gap-space-sm';
const CARD_BASE = 'relative overflow-hidden rounded-xl bg-paper-surface p-space-sm shadow-xs cursor-pointer transition-all';
const CARD_SELECTED = 'border-2 border-primary bg-bamboo-light-100_25';
const CARD_NORMAL = 'border border-silk-border hover-border-primary_50';

const RANGE_SELECTED = 'font-data-metric-md text-data-metric-md font-bold text-primary';
const RANGE_NORMAL = 'font-data-metric-md text-data-metric-md font-semibold text-ink-charcoal-text';
const LEFT_SELECTED = 'text-11px text-primary font-medium';
const LEFT_NORMAL = 'text-11px text-ink-light-gray';
const TONE_AMBER = 'text-10px text-amber-gold font-medium';
const TONE_EMERALD = 'text-10px text-emerald-pass font-medium';
const TONE_PRIMARY = 'text-10px text-primary font-medium';

const TONE_LABEL: Record<SlotOption['tone'], string> = { ok: '充足', tight: '紧张' };

const isOn = (s: SlotOption) => s.id === props.value;
const cardClass = (s: SlotOption) => `${CARD_BASE} ${isOn(s) ? CARD_SELECTED : CARD_NORMAL}`;
const statusClass = (s: SlotOption) => (s.tone === 'tight' ? TONE_AMBER : isOn(s) ? TONE_EMERALD : TONE_PRIMARY);
</script>

<template>
  <view :class="GRID">
    <view v-for="s in slots" :key="s.id" :class="cardClass(s)" @tap="emit('change', s.id)">
      <view class="flex flex-col">
        <text :class="isOn(s) ? RANGE_SELECTED : RANGE_NORMAL">{{ s.range }}</text>
        <view class="flex items-center gap-1 mt-1">
          <text :class="isOn(s) ? LEFT_SELECTED : LEFT_NORMAL">余 {{ s.left }} 张</text>
          <text :class="statusClass(s)">· {{ TONE_LABEL[s.tone] }}</text>
        </view>
      </view>
      <!-- 选中角标，未选中时不渲染 -->
      <view
        v-if="isOn(s)"
        class="absolute -right-1px -bottom-1px w-6 h-6 bg-primary text-on-primary flex items-center justify-center rounded-tl-lg rounded-br-xl"
      >
        <view class="msi icon-check text-14px" />
      </view>
    </view>
  </view>
</template>
