<script setup lang="ts">
/**
 * 个人中心「常用出行人」的两张胶囊卡 —— 设计稿里 `grid grid-cols-2 gap-2.5` 那一块。
 *
 * 卡片有两个变体，设计稿里分别是「本人」和「同行」：
 *   本人 = 该项是**默认出行人**（后端 `isDefault`），青底 + 主色头像
 *   同行 = 其余，中性底 + 琥珀头像
 *
 * ⚠️ 与设计稿的一处**有意差异**：设计稿卡片第二行是「已录入人脸 / 刷身份证过闸」这类
 * **能力标签**，后端没有任何对应字段（人脸按技术方案 §7 三期前也不采集），
 * 所以这里改显示**脱敏证件号** —— 有真实信息量，且不编造能力状态。
 * 文案差异记在 README 的已知偏差里。
 */
interface Visitor {
  id: number;
  name: string;
  badge: string;
  idCardMask: string;
  phoneMask: string;
  isDefault: boolean;
}

const props = defineProps<{ visitors: Visitor[] }>();

const GRID = 'grid grid-cols-2 gap-2_5';
const CARD_SELF = 'flex items-center gap-2 bg-mist-cyan-50_80 border border-e2e8e4_80 px-3 py-2_5 rounded-xl';
const CARD_OTHER =
  'flex items-center gap-2 bg-surface-container-low_60 border border-e2e8e4_80 px-3 py-2_5 rounded-xl';
const AVATAR = 'w-7 h-7 rounded-full flex items-center justify-center font-bold text-caption-sm shrink-0';
const AVATAR_SELF = 'bg-primary_10 text-primary';
const AVATAR_OTHER = 'bg-amber-gold_15 text-amber-gold';
const BADGE_SELF =
  'px-1 py-0_2 rounded bg-secondary-container text-on-secondary-container text-10px shrink-0 font-medium';
const BADGE_OTHER = 'px-1 py-0_2 rounded bg-surface-container text-ink-light-gray text-10px shrink-0';

const cardClass = (v: Visitor) => (v.isDefault ? CARD_SELF : CARD_OTHER);
const avatarClass = (v: Visitor) => `${AVATAR} ${v.isDefault ? AVATAR_SELF : AVATAR_OTHER}`;
const badgeClass = (v: Visitor) => (v.isDefault ? BADGE_SELF : BADGE_OTHER);
</script>

<template>
  <view :class="GRID">
    <view v-for="v in props.visitors" :key="v.id" :class="cardClass(v)">
      <view :class="avatarClass(v)">{{ v.isDefault ? '本人' : '同行' }}</view>
      <view class="flex flex-col min-w-0">
        <view class="flex items-center gap-1">
          <text class="font-body-md text-body-sm font-bold text-1c2826 truncate">{{ v.name }}</text>
          <text :class="badgeClass(v)">{{ v.badge }}</text>
        </view>
        <text class="text-11px text-ink-light-gray truncate">身份证 {{ v.idCardMask }}</text>
      </view>
    </view>
  </view>
</template>
