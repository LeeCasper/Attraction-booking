<script setup lang="ts">
/**
 * 订单详情。
 *
 * ⚠️ **设计稿里没有这一页**，版式自拟（照 `src/pages/visitor/index.vue` 的二级页范式）。
 * 对应 PRD 的 U-021：景区、票种、日期、时段、游客、金额、状态。
 *
 * 几个**必须照后端口径**的地方（都验证过）：
 *   - 取消：**只有待支付(10)** 能取消，服务端返回 400 原话时如实展示
 *   - 退款：`POST /orders/:id/refund` 是**提交申请**（后台审核），不是直接退；
 *     **仅已支付(20)** 可申请 —— 部分核销(30)会被拒，因为退款按整单金额算，
 *     放行会把已核销那几张票的钱也退掉
 *   - 退款申请后**订单状态不变**，「退款审核中」只能看 `refund.status`
 *   - 退款金额（手续费/实退）**一律用服务端返回的值**，前端不自己算
 */
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { areaApi, orderApi, type OrderDetail, type RefundInfo } from '@/api';
import { errorText } from '@/api/request';
import { fen2yuan, hhmm, shortDate, weekdayOf } from '@/utils/format';

const statusBarHeight = ref(0);
const capsuleInset = ref(0);

type WindowMetrics = { statusBarHeight?: number; windowWidth: number };
const win: WindowMetrics =
  (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();
statusBarHeight.value = win.statusBarHeight ?? 0;

// #ifdef MP-WEIXIN
const rect = uni.getMenuButtonBoundingClientRect();
if (rect && rect.width > 0) capsuleInset.value = win.windowWidth - rect.left + 8;
// #endif

const ORDER_STATUS_LABEL: Record<number, string> = {
  10: '待支付',
  20: '待入园',
  30: '部分核销',
  40: '已核销',
  50: '已取消',
  60: '已退款',
  70: '已过期',
};
const REFUND_STATUS_LABEL: Record<number, string> = {
  10: '退款审核中',
  20: '退款处理中',
  30: '已退款',
  40: '退款申请被拒绝',
  50: '退款失败',
};

const orderId = ref(0);
const order = ref<OrderDetail | null>(null);
const areaName = ref('');
const loading = ref(false);
const error = ref('');
const busy = ref(false);

const reasonVisible = ref(false);
const reason = ref('');

const statusLabel = computed(() => (order.value ? ORDER_STATUS_LABEL[order.value.status] ?? String(order.value.status) : ''));

/** 申请过退款时显示的那一条 */
const refund = computed<RefundInfo | null>(() => order.value?.refund ?? null);

/**
 * 能不能申请退款。
 * 后端只放行「已支付(20)」——部分核销(30) 会被 400 拒（退款按整单算，会把已核销的票一起退掉）。
 * 已有待审/处理中的申请时也不再给入口（重复申请后端也是 400）。
 */
const canRefund = computed(() => {
  const o = order.value;
  if (!o || o.status !== 20) return false;
  const s = o.refundStatus;
  return s === null || s === 40 || s === 50;
});

const canCancel = computed(() => order.value?.status === 10);

/** 部分核销：明确告诉用户为什么没有退款入口 */
const partialBlocked = computed(() => order.value?.status === 30);

const periodLabel = computed(() => {
  const o = order.value;
  const r = o?.reservation;
  if (!r) return '—';
  const s = o?.timeSlot;
  const d = `${shortDate(r.date)} ${weekdayOf(r.date)}`;
  return s ? `${d} ${hhmm(s.startTime)}-${hhmm(s.endTime)}` : d;
});

const visitors = computed(() =>
  (order.value?.items ?? []).map((i) => ({
    id: i.id,
    name: i.visitorName || '—',
    idCard: i.visitorIdCard || '—',
    price: i.price,
  })),
);

async function load() {
  if (!orderId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [detail, areas] = await Promise.all([
      orderApi.detail(orderId.value),
      // 详情不返回景区名，只有 scenicAreaId；本应用是单景区部署，取列表里对得上的那个
      areaApi.list().catch(() => []),
    ]);
    order.value = detail;
    // 按订单自己的 scenicAreaId 查名字。
    // **不要**再回落到 areas[0] —— 查不到只可能是该景点已下架（/areas 只返回开放中的），
    // 那时顶着一个别的景点的名字比留空更糟
    areaName.value = areas.find((a) => a.id === detail.scenicAreaId)?.name ?? '';
  } catch (err) {
    error.value = errorText(err);
  } finally {
    loading.value = false;
  }
}

/** 取消订单（仅待支付） */
function onCancel() {
  if (busy.value) return;
  uni.showModal({
    title: '取消订单',
    content: '取消后该订单占用的库存会立即释放，确定取消吗？',
    success: async (res) => {
      if (!res.confirm) return;
      busy.value = true;
      try {
        await orderApi.cancel(orderId.value);
        uni.showToast({ title: '已取消', icon: 'success' });
        await load();
      } catch (err) {
        // 例如「该订单当前状态不可取消」「订单状态已变更，请刷新后重试」
        uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
      } finally {
        busy.value = false;
      }
    },
  });
}

/**
 * 「去支付」→ 跳**订单支付页**（与服务端 pay-params 校验无关，状态限定在按钮的 v-if 上）。
 *
 * 这里原先自己拉起 `uni.requestPayment`，现在统一交给 `pages/pay/` ——
 * 那一页有应付总额、倒计时、支付方式与协议勾选，是设计稿专门画的一页；
 * 两处各写一遍支付逻辑只会让「支付成功后去哪」出现两种行为。
 */
function onPay() {
  if (busy.value || !order.value) return;
  uni.navigateTo({ url: `/pages/pay/index?id=${orderId.value}` });
}

function openRefund() {
  reason.value = '';
  reasonVisible.value = true;
}
const closeRefund = () => (reasonVisible.value = false);

/** 提交退款申请。reason 服务端必填 1~255 */
async function submitRefund() {
  if (busy.value) return;
  const text = reason.value.trim();
  if (!text) {
    uni.showToast({ title: '请填写退款原因', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    const res = await orderApi.applyRefund(orderId.value, text);
    reasonVisible.value = false;
    uni.showToast({
      title: `已提交申请，实退 ¥${fen2yuan(res.actualAmount)}`,
      icon: 'none',
      duration: 2500,
    });
    await load();
  } catch (err) {
    // 例如「已有票核销，不支持退款」「该预约已超过可退时间，不可退款」「该订单已有待审核的退款申请」
    uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
  } finally {
    busy.value = false;
  }
}

const goBack = () => uni.navigateBack();

onLoad((query) => {
  orderId.value = Number((query as Record<string, string> | undefined)?.id ?? 0);
  void load();
});

/** class 常量必须放在 `<script setup>` 里才进得了模板（见 orders/index.vue 的注解） */
const CARD = 'flex flex-col bg-paper-surface rounded-2xl border border-silk-border px-4 py-3';
const LABEL = 'font-caption-sm text-11px text-ink-light-gray';
const VALUE = 'font-data-metric-md text-14px text-ink-charcoal-text font-bold mt-0_5';
const BTN_PRIMARY =
  'flex-1 min-h-44px flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary text-15px font-semibold';
const BTN_OUTLINE =
  'flex-1 min-h-44px flex items-center justify-center rounded-xl border border-silk-border text-15px text-ink-charcoal-text';
const BTN_DANGER =
  'flex-1 min-h-44px flex items-center justify-center rounded-xl border border-silk-border text-15px text-cinnabar-red';
const PILL_OK = 'text-11px px-2_5 py-1 rounded-full border border-primary_20 bg-mist-cyan-50 text-primary shrink-0';
const PILL_WARN = 'text-11px px-2_5 py-1 rounded-full border border-amber-gold_30 bg-amber-gold_15 text-tertiary-container shrink-0';
</script>

<template>
  <view class="flex flex-col w-full min-h-screen bg-surface">
    <view :style="{ height: statusBarHeight + 'px' }" />

    <view class="flex items-center gap-2 px-4 py-3" :style="{ paddingRight: capsuleInset + 'px' }">
      <view class="msi icon-arrow_back text-20px text-ink-charcoal-text p-1" hover-class="pg-hover" @tap="goBack" />
      <text class="font-headline-md text-17px font-bold text-ink-charcoal-text">订单详情</text>
    </view>

    <view class="flex flex-col gap-3 px-4 pb-24">
      <view v-if="error" class="rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</view>
      <view v-if="loading && !order" class="text-center text-13px text-ink-light-gray py-3">正在加载…</view>

      <template v-if="order">
        <!-- 状态 + 票种 -->
        <view :class="CARD">
          <view class="flex items-center justify-between gap-2">
            <text class="text-15px font-bold text-ink-charcoal-text truncate">{{ order.items[0]?.ticketName || '门票' }}</text>
            <text :class="order.refundStatus !== null && order.status === 20 ? PILL_WARN : PILL_OK">{{ statusLabel }}</text>
          </view>
          <!-- 退款申请不改订单状态，所以这里单独再把退款进度说一遍 -->
          <text v-if="refund" class="font-caption-sm text-12px text-tertiary-container mt-1_5">
            {{ REFUND_STATUS_LABEL[refund.status] ?? '' }}
            <text v-if="refund.status === 40 && refund.auditRemark">· {{ refund.auditRemark }}</text>
          </text>
          <text v-else-if="partialBlocked" class="font-caption-sm text-12px text-ink-light-gray mt-1_5">
            已有票核销，按规则不支持退款
          </text>
        </view>

        <!-- 景区 / 日期时段 -->
        <view :class="CARD">
          <view class="grid grid-cols-2 gap-3">
            <view>
              <text :class="LABEL">景区</text>
              <text :class="VALUE">{{ areaName || '—' }}</text>
            </view>
            <view>
              <text :class="LABEL">入园时段</text>
              <text :class="VALUE">{{ periodLabel }}</text>
            </view>
          </view>
        </view>

        <!-- 游客 -->
        <view :class="CARD">
          <text :class="LABEL">游客（{{ visitors.length }} 人）</text>
          <view v-for="v in visitors" :key="v.id" class="flex items-center justify-between mt-1_5">
            <view class="flex flex-col min-w-0">
              <text class="text-14px font-medium text-ink-charcoal-text truncate">{{ v.name }}</text>
              <text class="font-caption-sm text-12px text-ink-light-gray font-mono">{{ v.idCard }}</text>
            </view>
            <text class="text-13px text-ink-light-gray shrink-0">¥{{ fen2yuan(v.price) }}</text>
          </view>
        </view>

        <!-- 金额 / 订单号 -->
        <view :class="CARD">
          <view class="flex items-center justify-between">
            <text :class="LABEL">实付金额</text>
            <view class="flex items-baseline text-cinnabar-red">
              <text class="text-13px font-semibold mr-0_5">¥</text>
              <text class="font-data-metric-lg text-22px font-bold leading-none">{{ fen2yuan(order.amount) }}</text>
            </view>
          </view>
          <text class="font-caption-sm text-11px text-ink-light-gray font-mono mt-1_5">订单号 {{ order.orderNo }}</text>
          <!-- 退款金额一律用服务端算好的，前端不自己算 -->
          <text v-if="refund" class="font-caption-sm text-11px text-ink-light-gray mt-1_5">
            申请退款 ¥{{ fen2yuan(refund.amount) }} · 手续费 ¥{{ fen2yuan(refund.fee) }} · 实退 ¥{{ fen2yuan(refund.actualAmount) }}
          </text>
        </view>

        <!-- 操作区 -->
        <view v-if="canCancel || canRefund" class="flex gap-3 mt-1">
          <view v-if="canCancel" :class="BTN_DANGER" hover-class="pg-hover" @tap="onCancel">取消订单</view>
          <view v-if="canCancel" :class="BTN_PRIMARY" hover-class="pg-hover" @tap="onPay">
            {{ busy ? '处理中…' : '去支付' }}
          </view>
          <view v-if="canRefund" :class="BTN_OUTLINE" hover-class="pg-hover" @tap="openRefund">申请退款</view>
        </view>
      </template>
    </view>

    <!-- 退款原因浮层：reason 后端必填 1~255，所以不能空提交 -->
    <view
      v-if="reasonVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background-color: rgba(0, 0, 0, 0.5)"
      @tap="closeRefund"
    >
      <view
        class="w-full bg-paper-surface flex flex-col px-4"
        style="
          border-radius: 24px 24px 0 0;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        "
        @tap.stop
      >
        <view class="flex justify-center pt-3">
          <view style="width: 36px; height: 4px; border-radius: 2px; background-color: #d8ded9" />
        </view>
        <text class="font-headline-md text-17px font-bold text-ink-charcoal-text pt-3">申请退款</text>
        <text class="font-caption-sm text-12px text-ink-light-gray mt-1_5">
          提交后由后台审核，通过后按退改规则原路退回
        </text>

        <view class="flex flex-col gap-1 mt-3">
          <text class="text-12px font-medium text-ink-charcoal-text">退款原因</text>
          <input
            v-model="reason"
            class="bg-surface-container-lowest border border-silk-border rounded-xl px-3 h-14 text-15px text-ink-charcoal-text"
            placeholder="请简单说明退款原因"
            placeholder-style="color: #6b7280"
            :maxlength="255"
          />
        </view>

        <view class="flex gap-3 mt-3">
          <view :class="BTN_OUTLINE" hover-class="pg-hover" @tap="closeRefund">取消</view>
          <view :class="BTN_PRIMARY" hover-class="pg-hover" @tap="submitRefund">
            {{ busy ? '提交中…' : '提交申请' }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
