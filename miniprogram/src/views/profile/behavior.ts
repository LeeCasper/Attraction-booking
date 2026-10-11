import { computed, onUnmounted, ref, watch } from 'vue';
import {
  areaApi,
  orderApi,
  visitorApi,
  type MiniArea,
  type OrderDetail,
  type OrderSummary,
} from '@/api';
import { errorText } from '@/api/request';
import { setCurrentOrderId } from '@/store/order';
import { activeTab, shellShowTick, switchTab } from '@/store/shell';
import { platformSettings } from '@/store/settings';
import { dayOffsetStr, fen2yuan, hhmm, shortDate } from '@/utils/format';

/**
 * 个人中心。
 *
 * 接的是这几样：
 *   - 四态筛选的角标与「最近一单」卡片 ← `GET /api/mini/orders`（不传 status 取全量，前端分组）
 *     + 该单的 `GET /api/mini/orders/:id`（时段/支付截止/退款明细要详情才有）
 *   - 常用出行人     ← `GET /api/mini/visitors`
 *   - 景点名         ← `GET /api/mini/areas`（订单只有 `scenicAreaId`，没有名字）
 *
 * ⚠️ 四格**不再是跳转入口**：点哪一格，下面那张卡就切到**那一态最近的一单**；
 *    进列表的入口是右上的「全部预约单」（列表页自己有四个筛选）。
 *    以前四格都 `navigateTo` 到同一个列表页（只差一个 query），而卡里永远显示同一张
 *    写死的 mock 行程 —— 用户看到的就是「点哪个都一样」。
 *
 * **仍然是静态的**（后端没有对应接口，见 README 已知偏差）：
 *   用户资料（昵称/头像/手机号/实名状态）、统计里的「年卡·优惠券」、
 *   门禁智联三行绑定状态、电子发票、履约信誉。
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
   * 景点 id → 名字。
   *
   * 订单只有 `scenicAreaId`（列表与详情都不带景点名），所以卡片要显示景点名就得自己拼一份。
   * 一次 `GET /areas` 取回全部开放景点即可 —— 订单只可能落在开放中的景点上。
   */
  const areaNames = ref<Map<number, string>>(new Map());

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
  /** 选中的那一格里「最近一单」的详情（时段/支付截止/退款明细要详情才有） */
  const previewDetail = ref<OrderDetail | null>(null);
  /**
   * 「现在」。
   *
   * 卡片上那两句相对时间（「距检票入园还有 18 小时」「剩余 12 分钟未支付」）都要跟**当下**比。
   * computed 里的 `Date.now()` 不会自己触发重算，所以把「现在」做成一个 ref，
   * 在**进入本页 / 切格 / 拉到数据**时刷新一次。
   *
   * 刻意**不做秒级 ticker**：个人中心不是盯着等的地方（支付页那边有 1 秒一跳的倒计时），
   * 而四个视图一直挂在外壳里，秒级定时器会在看不见的时候也一直跑。
   */
  const now = ref(Date.now());

  /**
   * 点某一格 → **就地切换下面那张卡**。
   *
   * 只改本地状态、不再跳转（见文件头的注解）。切格要重取该单详情：
   * 时段区间、支付截止时间、退款金额都只在详情里。
   */
  const onPickPassTab = (id: string) => {
    passTab.value = id;
    now.value = Date.now();
    void loadPreviewDetail();
  };

  /** 「全部预约单」入口 —— 进列表页，不带筛选（列表页自己有四个筛选，而它叫「全部」） */
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
  /**
   * 上次拉到数据时外壳「被显示过几次」（见 `store/shell.ts` 的 `shellShowTick`）。
   * 与当前值对不上 = 期间用户离开过外壳又回来了，手上这份数据可能已经旧了。
   */
  let loadedAtTick = -1;
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
      areaNames.value = new Map(areaList.map((a) => [a.id, a.name]));
      visitors.value = visitorList.map((v) => ({
        id: v.id,
        name: v.name,
        badge: v.badge,
        idCardMask: v.idCardMask,
        phoneMask: v.phoneMask,
        isDefault: v.isDefault,
      }));
      loaded = true;
      loadedAtTick = shellShowTick.value;
      // 列表到手后补一次「最近一单」的详情（时段区间/支付截止/退款金额都只在详情里）。
      // 失败不影响卡片 —— 只用列表字段也能把卡渲染出来，只是时段那格显示日期
      now.value = Date.now();
      void loadPreviewDetail();
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 「这一格又可见了」时该不该重取。
   *
   * 三种情形分开对待：
   *   - **没拉过** → 拉（首次进入本格，与 `load()` 的守卫无关）
   *   - **期间离开过外壳**（去过订单详情/支付页/出行人管理，`shellShowTick` 变了）→ 重取。
   *     用户报的那个 bug 就在这一条：在详情里取消订单后返回，「待支付」那一格
   *     一直挂着已经取消的那一单 —— 因为返回时 `props.active` 没变过，没人去重取
   *   - **只是在这一格里切来切去**（计数没变）→ 什么都不做，沿用「首次可见才拉数据」的初衷
   */
  function ensureFresh() {
    if (!loaded || loadedAtTick !== shellShowTick.value) void load(true);
  }

  /**
   * 外壳重新可见 / 切回本格 → 检查数据是否过期。
   *
   * 两个来源都要盯着：`shellShowTick`（从二级页返回，本格一直显示着）与 `activeTab`
   * （从别的格切回来 —— 中间可能经由支付页付掉了某一单）。
   * 只在**本格正显示着**时重取：四个视图一直挂在外壳里，另外三格没必要跟着打接口。
   */
  watch([shellShowTick, activeTab], () => {
    if (activeTab.value === 'profile') ensureFresh();
  });

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

  /**
   * 某一态下「最近一单」。
   *
   * 口径按各态最关心的时间排：
   *   - **待入园/已核销**：按**预约日**排（待入园取最近要去的、已核销取最近去过的）
   *   - **待支付/退改**：按**下单时间**排（待支付要先处理最新那笔；退款看最近申请的那笔）
   * 同一单只可能落在一个桶里，所以「最近」就是该桶第一条。
   */
  const previewOrder = computed<OrderSummary | null>(() => {
    const inTab = orders.value.filter((o) => tabOf(o.status) === passTab.value);
    if (!inTab.length) return null;
    const byReservation = passTab.value === 'pending-use' || passTab.value === 'used';
    const key = (o: OrderSummary) => (byReservation ? (o.reservation?.date ?? '') : o.createdAt);
    const sorted = [...inTab].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b));
      // 待入园要「最近要去的」= 预约日升序；已核销要「最近去过的」= 降序
      return passTab.value === 'pending-use' ? cmp : -cmp;
    });
    return sorted[0] ?? null;
  });

  /** 该单的时段区间（`08:30 - 10:30`）。详情没到手时为空 */
  const previewSlot = computed(() => {
    const slot = previewDetail.value?.timeSlot;
    return slot ? `${hhmm(slot.startTime)} - ${hhmm(slot.endTime)}` : '';
  });

  /** 「今天 / 明日 / 后天 / 10-12」—— 日期条那套口径（`dayOffsetStr` 是本地业务日） */
  function dayLabel(date: string): string {
    if (date === dayOffsetStr(0)) return '今日';
    if (date === dayOffsetStr(1)) return '明日';
    if (date === dayOffsetStr(2)) return '后天';
    return shortDate(date);
  }

  /**
   * 「距检票入园还有 N 小时」。
   *
   * 用**景点的时段开始时刻**（详情里的 `timeSlot.startTime`）当基准；没有时段就退回当天 0 点。
   * ⚠️ 拼成 `yyyy-MM-ddTHH:mm:ss` 再交给 `new Date()` —— **只给日期串会被按 UTC 解析**
   * （见 CLAUDE.md 第 11 条），带上时间才是本地时刻。
   */
  const untilLabel = computed(() => {
    const o = previewOrder.value;
    if (!o || passTab.value !== 'pending-use') return '';
    const date = o.reservation?.date;
    if (!date) return '';
    const start = previewDetail.value?.timeSlot?.startTime ?? '00:00:00';
    const target = new Date(`${date}T${String(start).slice(0, 8)}`).getTime();
    if (Number.isNaN(target)) return '';
    const mins = Math.round((target - now.value) / 60000);
    if (mins <= 0) return '预约时段已开始';
    if (mins < 60) return `距检票入园还有 ${mins} 分钟`;
    if (mins < 60 * 24) return `距检票入园还有 ${Math.round(mins / 60)} 小时`;
    return `距检票入园还有 ${Math.round(mins / 1440)} 天`;
  });

  /** 「剩余 12 分钟未支付」—— 读 `payDeadline`（与支付页同一个字段，不本地另起） */
  const payLeftLabel = computed(() => {
    const deadline = previewDetail.value?.payDeadline;
    if (passTab.value !== 'pending-pay' || !deadline) return '';
    const mins = Math.floor((new Date(deadline).getTime() - now.value) / 60000);
    if (!Number.isFinite(mins) || mins <= 0) return '已超时，即将自动取消';
    return mins >= 60 ? `剩余 ${Math.floor(mins / 60)} 小时 ${mins % 60} 分未支付` : `剩余 ${mins} 分钟未支付`;
  });

  /** 退款单状态（`refundStatus` 与订单状态是两回事，见 `pages/orders/index.vue` 的注解） */
  const REFUND_LABEL: Record<number, string> = {
    10: '退款审核中',
    20: '退款处理中',
    30: '已退款',
    40: '退款被拒',
    50: '退款失败',
  };
  const ORDER_LABEL: Record<number, string> = {
    10: '待支付',
    20: '待入园',
    30: '部分核销',
    40: '已核销',
    50: '已取消',
    60: '已退款',
    70: '已过期',
  };

  const TAB_LABEL: Record<string, string> = {
    'pending-pay': '待支付',
    'pending-use': '待入园',
    used: '已核销',
    refund: '退改·售后',
  };

  /**
   * 卡片要显示的全部内容 —— 一次性算好，组件只管画。
   *
   * 四态的文案都是**后端真有的东西**：票种名、景点名、预约日与时段、人数、金额、
   * 退款状态。设计稿里那些「北门闸机」「闸机离线核验码已同步」没有字段支撑，
   * 一律换成按状态给的真话（凭证刷新节律 / 超时取消 / 核销后不可再入园 / 退款原路退回）。
   */
  /** 订单列表压根没拉到（与「一单都没有」是两回事，见下面空态的处理） */
  const loadFailed = computed(() => !!error.value && orders.value.length === 0);

  const recentOrder = computed<RecentOrderView>(() => {
    const tabLabel = TAB_LABEL[passTab.value] ?? '';
    const o = previewOrder.value;

    if (!o) {
      // ⚠️ 「一单都没有」与「压根没拉到数据」必须分开说：请求失败时顶上四个角标也是空的，
      // 再说一句「暂无订单」就是把一次网络故障说成了用户的账户事实
      return {
        empty: true,
        title: loadFailed.value ? `${tabLabel} · 加载失败` : `${tabLabel} · 暂无订单`,
        right: '',
        ticketName: '',
        areaName: '',
        main: loadFailed.value
          ? error.value
          : `这里会显示你最近的一张「${tabLabel}」订单`,
        pill: '',
        companions: '',
        hint: '',
        primaryLabel: loadFailed.value ? '重新加载' : '去预约购票',
        primaryIcon: '',
        secondaryLabel: '',
      };
    }

    // 景点名查不到 = 这个景点已经不在开放列表里（`/areas` 只返回开放中的）。
    // 留空比编一个名字好：卡片上少了景点名不影响读懂，写个错的景点名是另一回事。
    const areaName = areaNames.value.get(o.scenicAreaId) ?? '';
    const date = o.reservation?.date ?? '';
    const detail = previewDetail.value;
    /** 详情可能还没到（或失败），一律以列表字段兜底 */
    const amount = `¥${fen2yuan(detail?.amount ?? o.amount)}`;
    const headcount = `共 ${o.itemCount} 人同行`;

    if (passTab.value === 'pending-pay') {
      return {
        empty: false,
        title: '待支付 · 待付款',
        right: payLeftLabel.value,
        ticketName: o.ticketName,
        areaName,
        main: date ? `${amount} · ${dayLabel(date)}入园` : amount,
        pill: '待支付',
        companions: headcount,
        // 底部那行小字只有约 12 个字的宽度（右边还要站两个按钮），一律写短句
        hint: '超时未付自动取消',
        primaryLabel: '去支付',
        primaryIcon: 'payment',
        secondaryLabel: '查看详情',
      };
    }

    if (passTab.value === 'pending-use') {
      const partial = o.status === 30;
      const main = date
        ? [dayLabel(date), previewSlot.value].filter(Boolean).join(' ')
        : o.ticketName;
      return {
        empty: false,
        title: partial ? '部分核销 · 进行中行程' : '待入园 · 进行中行程',
        right: untilLabel.value,
        ticketName: o.ticketName,
        areaName,
        main,
        // 动态码就绪：只有「还有未核销名额」才成立（部分核销时也还有）
        pill: o.status === 20 || partial ? '动态码就绪' : '',
        companions: headcount,
        hint: '动态码每 60 秒刷新',
        primaryLabel: '出示入园码',
        primaryIcon: 'qr_code',
        // 部分核销不给退款入口是**服务端口径**（退款按整单金额算，会把已核销那几张一起退掉）
        secondaryLabel: partial ? '查看详情' : '申请退款',
      };
    }

    if (passTab.value === 'used') {
      return {
        empty: false,
        title: '已核销 · 已完成',
        right: date ? `${shortDate(date)} 已入园` : '',
        ticketName: o.ticketName,
        areaName,
        main: date ? [dayLabel(date), previewSlot.value].filter(Boolean).join(' ') : o.ticketName,
        pill: '已完成',
        companions: headcount,
        hint: '已核销，不可再次入园',
        primaryLabel: '查看详情',
        primaryIcon: '',
        secondaryLabel: '',
      };
    }

    // 退改·售后：退款单状态优先（申请退款**不改订单状态**，只看 status 会一直显示「待入园」）
    const refundLabel =
      (o.refundStatus !== null ? REFUND_LABEL[o.refundStatus] : undefined) ?? ORDER_LABEL[o.status] ?? '';
    return {
      empty: false,
      title: '退改·售后',
      right: refundLabel,
      ticketName: o.ticketName,
      areaName,
      main: detail?.refund?.actualAmount
        ? `${amount} · 实退 ¥${fen2yuan(detail.refund.actualAmount)}`
        : amount,
      pill: refundLabel,
      companions: date ? `${shortDate(date)} 的订单` : '',
      hint: '后台审核后原路退回',
      primaryLabel: '查看详情',
      primaryIcon: '',
      secondaryLabel: '',
    };
  });

  /** 拉「最近一单」的详情。失败只降级（卡片仍有列表字段），不打断整页 */
  async function loadPreviewDetail() {
    const o = previewOrder.value;
    previewDetail.value = null;
    if (!o) return;
    try {
      const detail = await orderApi.detail(o.id);
      // 期间用户可能又切了格，回来的详情要对得上才用
      if (previewOrder.value?.id === detail.id) previewDetail.value = detail;
    } catch {
      /* 详情是增强信息，拿不到就用列表字段 */
    }
  }

  /**
   * 卡片主按钮 —— 按当前格给「这一态最该做的那件事」：
   *   待支付 → 订单支付页；待入园 → 凭证页（要先把这一单设成「当前订单」）；其余 → 订单详情
   * 空态（这一格没有订单）→ 去「景点选择」那一格开始预约。
   */
  function onRecentPrimary() {
    const o = previewOrder.value;
    if (!o) {
      // 空态：加载失败就重试，否则去「景点选择」那一格开始预约
      if (loadFailed.value) void load(true);
      else switchTab('area');
      return;
    }
    if (passTab.value === 'pending-pay') {
      uni.navigateTo({ url: `/pages/pay/index?id=${o.id}` });
      return;
    }
    if (passTab.value === 'pending-use') {
      setCurrentOrderId(o.id);
      switchTab('credential');
      return;
    }
    uni.navigateTo({ url: `/pages/orders/detail?id=${o.id}` });
  }

  /** 次按钮 —— 一律去订单详情：取消、重新支付、申请退款、看退款进度都在那一页 */
  function onRecentSecondary() {
    const o = previewOrder.value;
    if (!o) return;
    uni.navigateTo({ url: `/pages/orders/detail?id=${o.id}` });
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
    recentOrder,
    onRecentPrimary,
    onRecentSecondary,
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

/**
 * 「最近一单」卡片的内容 —— `components/RecentOrderCard.vue` 的 props。
 *
 * 放在 behavior 里而不是组件里：`<script setup>` **不允许任何 ES 导出**（`export interface`
 * 也会被编译器拒掉），而组件又要 `import type` 它。`TicketCard` 当年也是这么做的
 * （类型放 `views/home/behavior.ts`）。
 */
export interface RecentOrderView {
  /** 这一态下没有任何订单 */
  empty: boolean;
  /** 头部标题：「待入园 · 进行中行程」 */
  title: string;
  /** 头部右上小字：「距检票入园还有 18 小时」 */
  right: string;
  /** 票种名（空态/无票种时不渲染） */
  ticketName: string;
  /** 景点名 */
  areaName: string;
  /** 主信息：日期 + 时段，或金额 */
  main: string;
  /** 右侧状态胶囊（可空） */
  pill: string;
  /** 右侧小字：「共 2 人同行」 */
  companions: string;
  /** 底部左侧提示（可空） */
  hint: string;
  /** 主按钮文案与图标；空态时是「去预约购票」 */
  primaryLabel: string;
  primaryIcon: string;
  /** 次按钮文案（可空） */
  secondaryLabel: string;
}
