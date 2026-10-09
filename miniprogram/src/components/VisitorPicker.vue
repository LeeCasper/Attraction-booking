<script setup lang="ts">
/**
 * 出行游客登记卡 —— 设计稿里 `.rounded-2xl.bg-paper-surface.p-space-md.…flex.flex-col.gap-3` 那张卡。
 *
 * class 逐字取自 `design/reference/booking.html` 的游客卡（张*林）。
 *
 * ⚠️ 一处推断（设计稿没画）：**未勾选态的圆形指示器**。
 *    设计稿只有「已勾选」一个样本 —— 外圈 `border-2 border-primary` + `bg-primary/10`，内层实心点。
 *    这里推断为：外圈改中性描边 `border-silk-border`、去掉 `bg-primary/10`、不渲染内层实心点。
 *    见 README「设计稿未给的状态」。
 *
 * 组件根节点带设计稿那张卡的类（含 flex flex-col gap-3）。
 */
// 不写 export：<script setup> 不允许 ES 模块导出。
interface Visitor {
  id: number;
  name: string;
  /** 主出行人 / 同行 …（后端按 isDefault 推导好直接给） */
  badge: string;
  /** 已脱敏，如 `110***********1234`；**列表里拿不到明文，下单也要靠 id** */
  idCardMask: string;
  /** 已脱敏，无手机号时为空串 */
  phoneMask: string;
}

/**
 * `loading` 是**整页**的加载标志（购票页一次并发拉票种/库存/出行人）。
 * 传进来只为区分「还没拿到」和「确实一位都没有」—— 否则首屏会闪一下「暂未添加出行人」，
 * 明明有数据却先告诉用户没有，比空白卡片更让人困惑。
 */
const props = defineProps<{ visitors: Visitor[]; picked: number[]; loading?: boolean }>();
const emit = defineEmits<{ toggle: [id: number] }>();

const CARD = 'rounded-2xl bg-paper-surface p-space-md border border-silk-border shadow-sm flex flex-col gap-3';
const ROW = 'flex items-center justify-between';
const ROW_LEFT = 'flex items-start gap-3';
const RADIO_BASE = 'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0_5';
const RADIO_ON = 'border-primary bg-primary_10';
const RADIO_OFF = 'border-silk-border'; // 推断值
const DOT = 'w-2_5 h-2_5 rounded-full bg-primary';

const isOn = (v: Visitor) => props.picked.includes(v.id);
</script>

<template>
  <view :class="CARD">
    <!--
      空态：一位出行人都没有时，这张卡（`p-space-md` + 白底）会只是一个空白圆角块，
      看着像渲染坏了 —— 给一句话说明「为什么空的」和「下一步做什么」。
      加载中不说「暂未添加」，那是在没拿到数据时替用户下了结论。
    -->
    <view v-if="!visitors.length" :class="ROW">
      <view :class="ROW_LEFT">
        <view class="w-9 h-9 rounded-full bg-mist-cyan-50 flex items-center justify-center shrink-0">
          <view class="msi icon-nature_people text-18px text-primary" />
        </view>
        <view class="flex flex-col gap-0_5">
          <text class="font-body-md text-14px font-medium text-ink-charcoal-text">
            {{ props.loading ? '正在加载出行人…' : '暂未添加出行人' }}
          </text>
          <text v-if="!props.loading" class="font-caption-sm text-12px text-ink-light-gray">
            点下方「新增出行人」登记，之后可直接勾选下单
          </text>
        </view>
      </view>
    </view>

    <view v-for="v in visitors" :key="v.id" :class="ROW" @tap="emit('toggle', v.id)">
      <view :class="ROW_LEFT">
        <view :class="`${RADIO_BASE} ${isOn(v) ? RADIO_ON : RADIO_OFF}`">
          <text v-if="isOn(v)" :class="DOT" />
        </view>
        <view class="flex flex-col">
          <view class="flex items-center gap-2">
            <text class="font-body-md text-15px font-bold text-ink-charcoal-text">{{ v.name }}</text>
            <text class="text-11px text-primary bg-mist-cyan-50 px-2 py-0_5 rounded-full font-medium border border-primary_20">{{
              v.badge
            }}</text>
          </view>
          <view class="flex flex-col gap-0_5 mt-1_5">
            <text class="font-caption-sm text-12px text-ink-light-gray font-mono">身份证 {{ v.idCardMask }}</text>
            <!-- 手机号是可选的，没填就不占一行 -->
            <text
              v-if="v.phoneMask"
              class="font-caption-sm text-12px text-ink-light-gray font-mono"
            >手机 {{ v.phoneMask }}</text>
          </view>
        </view>
      </view>
      <view class="text-ink-light-gray hover-text-primary transition-colors p-1" hover-class="pg-hover">
        <view class="msi icon-edit_note text-18px" />
      </view>
    </view>
  </view>
</template>
