import { computed, onUnmounted, ref } from 'vue';
import { areaApi, orderApi, visitorApi, type MiniArea, type OrderSummary } from '@/api';
import { errorText } from '@/api/request';
import { currentAreaId } from '@/store/shell';
import { platformSettings } from '@/store/settings';

/**
 * 个人中心。
 *
 * 本轮接上的是「能接的」：
 *   - 四态筛选的角标 ← `GET /api/mini/orders`（不传 status 取全量，前端分组计数）
 *   - 常用出行人     ← `GET /api/mini/visitors`
 *
 * **仍然是静态的**（后端没有对应接口，见 README 已知偏差）：
 *   用户资料（昵称/头像/手机号/实名状态）、统计里的「年卡·优惠券」、
 *   门禁智联三行绑定状态、电子发票、履约信誉，以及进行中行程卡的文案
 *   （**景点名与页脚版本号除外** —— 分别改为当前景点名与平台信息，见下）。
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

/**
 * 订单状态 → 四态的归属。
 *
 * 后端 OrderStatus：10 待支付 / 20 已支付 / 30 部分核销 / 40 已核销 / 50 已取消 / 60 已退款 / 70 已过期。
 *
 * ⚠️ 以前 **70 已过期返回 null**，于是这类订单在个人中心**凭空消失** —— 角标不计、
 * 也点不进任何一态。现在归到「退改·售后」那一桶（设计稿只画了 4 个格子，标签是定死的）。
 * 订单列表页 `pages/orders/index.vue` 的 `bucketOf` 用的是同一套口径。
 */
function tabOf(status: number): string | null {
  if (status === 10) return 'pending-pay';
  if (status === 20 || status === 30) return 'pending-use';
  if (status === 40) return 'used';
  if (status === 50 || status === 60 || status === 70) return 'refund';
  return null;
}

export function useProfilePage() {
  const loading = ref(false);
  const error = ref('');
  const orders = ref<OrderSummary[]>([]);
  const visitors = ref<VisitorCard[]>([]);
  /**
   * 行程卡上的景点名。
   *
   * 这张卡本身**仍是静态 mock**（后端没有「进行中行程」接口），但设计稿把它写死成
   * 「枫林谷森林公园」—— 多景区下顶着某一个景点的名字是错的。这里用**当前景点**顶上：
   * 至少是个真实存在的景点，且与用户此刻在逛的地方一致。
   * 等后端有了行程接口，改成读订单自己的 `scenicAreaId`。
   */
  const areaName = ref('');

  /**
   * 页脚版本行：设计稿写死「枫林谷智慧文旅 V1.2.0」，改成平台信息拼出来。
   *
   * 「智慧文旅」来自 `productName`、`V` 已经含在 `version` 里 —— **不要在这里硬编码**：
   * 平台名本身就可能带「智慧文旅」，版本号也可能自带 V，写死会渲染成
   * 「苏州智慧文旅智慧文旅 VV2.0.0」。
   */
  const appVersionLabel = computed(() => {
    const { name, productName, version } = platformSettings.value;
    return `${name}${productName ?? ''} ${version ?? ''}`.trim();
  });

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
  /**
   * 点四个状态格 → **带着该筛选**进订单列表页。
   *
   * 本页没有订单列表（设计稿在这里画的是行程卡），只改本地筛选态等于点了没反应；
   * 而这一格的语义就是「按状态看我的订单」，所以跳过去并把筛选带上。
   */
  const onPickPassTab = (id: string) => {
    passTab.value = id;
    uni.navigateTo({ url: `/pages/orders/index?filter=${id}` });
  };

  /** 「全部预约单」入口 —— 设计稿画了它，但以前连 @tap 都没有 */
  function onAllOrders() {
    uni.navigateTo({ url: '/pages/orders/index' });
  }

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
      const [orderList, visitorList, areaList] = await Promise.all([
        orderApi.list(),
        visitorApi.list(),
        // 行程卡的景点名是锦上添花，拿不到不该让整页报错
        areaApi.list().catch(() => [] as MiniArea[]),
      ]);
      orders.value = orderList;
      areaName.value =
        (currentAreaId.value ? areaList.find((a) => a.id === currentAreaId.value)?.name : undefined) ??
        areaList[0]?.name ??
        '';
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
    areaName,
    appVersionLabel,
    visitors,
    stats,
    loading,
    error,
    toastVisible,
    toastText: TOAST_TEXT,
    onRefreshOfflineToken,
    onManageVisitors,
    onAllOrders,
    load,
  };
}
