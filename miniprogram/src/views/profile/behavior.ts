import { computed, onUnmounted, ref } from 'vue';
import { orderApi, visitorApi, type OrderSummary } from '@/api';
import { errorText } from '@/api/request';

/**
 * 个人中心。
 *
 * 本轮接上的是「能接的」：
 *   - 四态筛选的角标 ← `GET /api/mini/orders`（不传 status 取全量，前端分组计数）
 *   - 常用出行人     ← `GET /api/mini/visitors`
 *
 * **仍然是静态的**（后端没有对应接口，见 README 已知偏差）：
 *   用户资料（昵称/头像/手机号/实名状态）、统计里的「年卡·优惠券」、
 *   门禁智联三行绑定状态、电子发票、履约信誉，以及进行中行程卡的文案。
 *
 * 设计稿里本页**没有**「展开/收起」控件，别去找。
 */
export interface PassTab {
  id: string;
  /** msi 图标名 */
  icon: string;
  label: string;
  /** 右上角数量角标，0 或缺省则不渲染 */
  badge?: number;
}

export interface VisitorCard {
  id: number;
  name: string;
  badge: string;
  idCardMask: string;
  phoneMask: string;
  isDefault: boolean;
}

/** 四态的 id / 图标 / 文案；角标由订单数算出来 */
const TAB_META: Omit<PassTab, 'badge'>[] = [
  { id: 'pending-pay', icon: 'payment', label: '待支付' },
  { id: 'pending-use', icon: 'qr_code_2', label: '待入园' },
  { id: 'used', icon: 'task_alt', label: '已核销' },
  { id: 'refund', icon: 'currency_exchange', label: '退改·售后' },
];

/** 设计稿原文（`#toastNotification` 的文案） */
const TOAST_TEXT = '离线加密凭证已更新至本地缓存';
const TOAST_MS = 2000;

/** 订单状态 → 四态的归属（后端 OrderStatus：10 待支付 / 20 已支付 / 30 部分核销 / 40 已核销 / 50 已取消 / 60 已退款） */
function tabOf(status: number): string | null {
  if (status === 10) return 'pending-pay';
  if (status === 20 || status === 30) return 'pending-use';
  if (status === 40) return 'used';
  if (status === 50 || status === 60) return 'refund';
  return null;
}

export function useProfilePage() {
  const loading = ref(false);
  const error = ref('');
  const orders = ref<OrderSummary[]>([]);
  const visitors = ref<VisitorCard[]>([]);

  const passTabs = computed<PassTab[]>(() => {
    const counts = new Map<string, number>();
    for (const o of orders.value) {
      const key = tabOf(o.status);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // 角标为 0 就不显示（PassFilter 组件对 0/缺省做了不渲染）
    return TAB_META.map((t) => ({ ...t, badge: counts.get(t.id) ?? 0 }));
  });

  const passTab = ref('pending-use');
  const onPickPassTab = (id: string) => (passTab.value = id);

  /** 角标上的三个数字口径：可用凭证 = 待入园，历史入园 = 已核销，常用出行人 = 出行人条数 */
  const stats = computed(() => ({
    visitors: visitors.value.length,
    usable: orders.value.filter((o) => o.status === 20 || o.status === 30).length,
    visited: orders.value.filter((o) => o.status === 40).length,
  }));

  let loaded = false;
  async function load(force = false) {
    if (loaded && !force) return;
    loading.value = true;
    error.value = '';
    try {
      const [orderList, visitorList] = await Promise.all([orderApi.list(), visitorApi.list()]);
      orders.value = orderList;
      visitors.value = visitorList.map((v) => ({
        id: v.id,
        name: v.name,
        badge: v.badge,
        idCardMask: v.idCardMask,
        phoneMask: v.phoneMask,
        isDefault: v.isDefault,
      }));
      loaded = true;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  const toastVisible = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** 「刷新离线凭证」：后端没有离线凭证包接口，本轮仍是本地提示（见 README 已知偏差） */
  function onRefreshOfflineToken() {
    toastVisible.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toastVisible.value = false;
    }, TOAST_MS);
  }

  /** 「管理」入口 → 常用出行人管理页（设计稿没有这个页面，是后加的） */
  function onManageVisitors() {
    uni.navigateTo({ url: '/pages/visitor/index' });
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    timer = null;
  });

  return {
    passTabs,
    passTab,
    onPickPassTab,
    visitors,
    stats,
    loading,
    error,
    toastVisible,
    toastText: TOAST_TEXT,
    onRefreshOfflineToken,
    onManageVisitors,
    load,
  };
}
