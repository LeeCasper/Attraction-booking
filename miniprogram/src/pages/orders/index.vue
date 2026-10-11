<script setup lang="ts">
/**
 * 我的预约（订单列表）。
 *
 * ⚠️ **设计稿里没有这一页** —— 设计稿只在个人中心画了「全部预约单」这个入口。
 * 版式自拟，但用同一套设计 token 与工具类，观感与其余页面一致。
 * 照着 `src/pages/visitor/index.vue` 的二级页范式写：自绘标题栏 + 状态栏占位 + 胶囊避让。
 *
 * 对应 PRD 的 U-003 / U-020。接口：`GET /api/mini/orders`。
 *
 * 两个必须知道的契约（都踩过）：
 *   1. 列表**没有 items**，只有 `itemCount` 与票种名 `ticketName`（后者是这轮后端补的 ——
 *      否则卡片只能显示订单号，等于没有列表）。
 *   2. 申请退款**不改订单状态**，所以「退款审核中」要看 `refundStatus`，不能只看 `status`。
 */
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { orderApi, type OrderSummary } from '@/api';
import { errorText } from '@/api/request';
import { fen2yuan, hhmm, shortDate } from '@/utils/format';

/** 状态栏高度用**真实 px**（不是 rpx）—— 设备物理量，不随屏宽缩放。二级页不走 PageHeader，得自己让位 */
const statusBarHeight = ref(0);
/** 胶囊左侧到屏幕右边的距离，作为标题栏右内边距，避免被真胶囊盖住 */
const capsuleInset = ref(0);

type WindowMetrics = { statusBarHeight?: number; windowWidth: number };
const win: WindowMetrics =
  (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();
statusBarHeight.value = win.statusBarHeight ?? 0;

// #ifdef MP-WEIXIN
const rect = uni.getMenuButtonBoundingClientRect();
if (rect && rect.width > 0) capsuleInset.value = win.windowWidth - rect.left + 8;
// #endif

/** 筛选项。**与个人中心那 4 个格子同一套桶**，这样从那边点进来能对上 */
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'pending-pay', label: '待支付' },
  { id: 'pending-use', label: '待入园' },
  { id: 'used', label: '已核销' },
  { id: 'refund', label: '退改·售后' },
];

/**
 * 订单状态 → 所在桶。与 `views/profile/behavior.ts` 的 `tabOf` 一致。
 * 50 已取消 / 60 已退款 / 70 已过期 都归到「退改·售后」（设计稿只有 4 个格，标签是定死的）。
 */
function bucketOf(status: number): string {
  if (status === 10) return 'pending-pay';
  if (status === 20 || status === 30) return 'pending-use';
  if (status === 40) return 'used';
  return 'refund';
}

const ORDER_STATUS_LABEL: Record<number, string> = {
  10: '待支付',
  20: '待入园',
  30: '部分核销',
  40: '已核销',
  50: '已取消',
  60: '已退款',
  70: '已过期',
};

/** 退款单状态（与订单状态是两回事） */
const REFUND_STATUS_LABEL: Record<number, string> = {
  10: '退款审核中',
  20: '退款处理中',
  30: '已退款',
  40: '退款被拒',
  50: '退款失败',
};

const orders = ref<OrderSummary[]>([]);
const loading = ref(false);
const error = ref('');
const filter = ref('all');

const shown = computed(() =>
  filter.value === 'all' ? orders.value : orders.value.filter((o) => bucketOf(o.status) === filter.value),
);

/** 每个桶的数量，给筛选项上的小角标 */
const counts = computed(() => {
  const m: Record<string, number> = { all: orders.value.length };
  for (const o of orders.value) m[bucketOf(o.status)] = (m[bucketOf(o.status)] ?? 0) + 1;
  return m;
});

const pickFilter = (id: string) => (filter.value = id);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // 一次取全量再在前端分桶：桶横跨多个 status（待入园 = 20|30），后端只支持按单个 status 筛
    orders.value = await orderApi.list();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    loading.value = false;
  }
}

// 从个人中心带过来的初始筛选（`?filter=pending-use`）
onLoad((query) => {
  const f = (query as Record<string, string> | undefined)?.filter;
  if (f && FILTERS.some((x) => x.id === f)) filter.value = f;
});
// 从详情页返回时要刷新 —— 那边可能取消/申请退款了，状态已经变了
onShow(load);

const goDetail = (id: number) => uni.navigateTo({ url: `/pages/orders/detail?id=${id}` });
const goBack = () => uni.navigateBack();

/** 「10-09 08:00-10:00」，没有预约为空 */
function whenLabel(o: OrderSummary): string {
  const r = o.reservation;
  return r ? `${shortDate(r.date)}` : '';
}

/**
 * class 串写成常量。
 *
 * `check:classes` 会把 `:class` 表达式里带引号的字符串当类名扫，
 * 所以条件类必须走「常量 + 标识符」，不能在模板里写 `cond ? 'a' : 'b'`
 * （这条踩过：`check:classes` 会把三目里的 `'primary'` 报成「没有出处的 class」）。
 * 常量必须声明在 `<script setup>` 里 —— 另起一个 `<script>` 块的话模板拿不到。
 */
const ACTIVE_CHIP =
  'px-3 py-1_5 rounded-full bg-primary text-on-primary text-13px font-medium flex items-center shrink-0';
const IDLE_CHIP =
  'px-3 py-1_5 rounded-full bg-paper-surface border border-silk-border text-13px text-ink-charcoal-text flex items-center shrink-0';
const STATUS_PILL =
  'text-11px px-2 py-0_5 rounded-full border border-primary_20 bg-mist-cyan-50 text-primary shrink-0';
const REFUND_PILL =
  'text-11px px-2 py-0_5 rounded-full border border-amber-gold_30 bg-amber-gold_15 text-tertiary-container shrink-0';
</script>

<template>
  <view class="flex flex-col w-full min-h-screen bg-surface">
    <view :style="{ height: statusBarHeight + 'px' }" />

    <view class="flex items-center gap-2 px-4 py-3" :style="{ paddingRight: capsuleInset + 'px' }">
      <view class="msi icon-arrow_back text-20px text-ink-charcoal-text p-1" hover-class="pg-hover" @tap="goBack" />
      <text class="font-headline-md text-17px font-bold text-ink-charcoal-text">我的预约</text>
    </view>

    <!-- 筛选：横向可滚，避免小屏挤成两行 -->
    <scroll-view scroll-x class="w-full" :show-scrollbar="false">
      <view class="flex items-center gap-2 px-4 pb-4">
        <view
          v-for="f in FILTERS"
          :key="f.id"
          :class="f.id === filter ? ACTIVE_CHIP : IDLE_CHIP"
          hover-class="pg-hover"
          @tap="pickFilter(f.id)"
        >
          <text>{{ f.label }}</text>
          <text v-if="counts[f.id]" class="ml-1 text-11px opacity-60">{{ counts[f.id] }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="flex flex-col gap-3 px-4 pb-24">
      <view v-if="error" class="rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</view>

      <view
        v-for="o in shown"
        :key="o.id"
        class="flex flex-col bg-paper-surface rounded-2xl border border-silk-border px-4 py-3"
        hover-class="pg-hover"
        @tap="goDetail(o.id)"
      >
        <view class="flex items-center justify-between gap-2">
          <text class="text-15px font-bold text-ink-charcoal-text truncate">{{ o.ticketName || '门票' }}</text>
          <text :class="STATUS_PILL">{{ ORDER_STATUS_LABEL[o.status] ?? o.status }}</text>
        </view>

        <view class="flex flex-col gap-0_5 mt-1_5">
          <text class="font-caption-sm text-12px text-ink-light-gray">
            {{ whenLabel(o) || '—' }} · 共 {{ o.itemCount }} 张
          </text>
          <text class="font-caption-sm text-11px text-ink-light-gray font-mono">订单号 {{ o.orderNo }}</text>
        </view>

        <view class="flex items-center justify-between mt-3 pt-3 border-t border-silk-border">
          <view class="flex items-baseline text-cinnabar-red">
            <text class="text-13px font-semibold mr-0_5">¥</text>
            <text class="font-data-metric-lg text-20px font-bold leading-none">{{ fen2yuan(o.amount) }}</text>
          </view>
          <!-- 退款申请不改订单状态，所以「审核中」只能靠 refundStatus 显示 -->
          <text v-if="REFUND_STATUS_LABEL[o.refundStatus ?? -1]" :class="REFUND_PILL">
            {{ REFUND_STATUS_LABEL[o.refundStatus ?? -1] }}
          </text>
        </view>
      </view>

      <view v-if="loading && orders.length === 0" class="text-center text-13px text-ink-light-gray py-3">
        正在加载…
      </view>
      <!-- 加载中不说「暂无订单」—— 那是在没拿到数据时替用户下结论 -->
      <view v-else-if="!loading && shown.length === 0" class="text-center text-13px text-ink-light-gray py-3">
        {{ orders.length === 0 ? '还没有预约记录，去首页看看有什么票吧' : '这个分类下暂时没有订单' }}
      </view>
    </view>
  </view>
</template>
