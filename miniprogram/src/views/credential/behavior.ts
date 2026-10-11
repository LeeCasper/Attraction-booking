import { computed, onUnmounted, ref, watch } from 'vue';
import { areaApi, orderApi, visitorApi, type OrderDetail, type OrderSummary } from '@/api';
import { errorText } from '@/api/request';
import { currentOrderId, setCurrentOrderId } from '@/store/order';
import { platformSettings } from '@/store/settings';
import { activeTab, shellShowTick } from '@/store/shell';
import { hhmm, shortDate, weekdayOf } from '@/utils/format';

/**
 * 动态防伪电子凭证页。
 *
 * 数据来自「订单详情 + 动态凭证」两个接口：
 *   - `GET /api/mini/orders/:id`            → 入园时段（reservation + timeSlot）、持票人（items）、状态
 *   - `GET /api/mini/orders/:id/credential` → token / expiresIn(60) / refreshAfter(50)
 *
 * **二维码编的就是 `token` 本体**，原样整串、不加任何前缀 —— 闸机把扫出来的原文当 `credential`
 * 提交给 `POST /api/gate/verify`，格式一变就会被判 `MALFORMED`。编码在 `DynamicQr` 里做。
 *
 * 没有可入园订单时 `qrToken` 为空，`DynamicQr` 显示空态文案 —— 不再拿设计稿那个假图案顶替。
 *
 * 本轮补上三件事（都是「手上有不止一张票」才会暴露的）：
 *   ① **凭证选择**：动态码是按**订单**签发的，而这一页原来只认「当前订单」，
 *      买了两张票的用户没法在页面上看第二张 —— 现在顶部有一条可滑动的凭证卡（多于一张才出现）
 *   ② **退款审核中不能使用**：申请退款不改订单状态（仍是 20/30），所以只看 `status` 会照常
 *      出码；现在按 `refundStatus` 置灰（服务端也会拒，见核验链路的 `REFUND_PENDING`）
 *   ③ **凭证号**：服务端从预约派生的展示号（`V20261011-000171`），显示在门票信息里
 */

/** 退款单状态：10 待审核 / 20 退款中 —— 这两个状态下凭证不可用 */
const REFUND_PENDING_STATUS = [10, 20];
const PASS_MODES = [
  { id: 'qr', icon: 'qr_code_scanner', label: '动态二维码', hint: '主推荐', hintPill: true },
  { id: 'idcard', icon: 'id_card', label: '实体身份证', hint: '贴卡即过' },
  { id: 'face', icon: 'face', label: '人脸识别', hint: '录入', hintTone: 'primary' as const },
];

/** 服务端给不出 `refreshAfter` 时的兜底：有效期 60 秒里提前 10 秒换码 */
const DEFAULT_REFRESH_LEAD_SECONDS = 10;
/** 同上：兜底认为「每 50 秒换一张」 */
const DEFAULT_REFRESH_AFTER_SECONDS = 50;

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmss = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

export function useCredentialPage() {
  const loading = ref(false);
  const error = ref('');
  const order = ref<OrderDetail | null>(null);
  const token = ref('');
  const remain = ref(0);
  /** 剩余多少秒时换下一张码。服务端 `refreshAfter`(50) → 剩 10 秒刷；拿不到就用兜底值 */
  const refreshLead = ref(DEFAULT_REFRESH_LEAD_SECONDS);
  /** 服务端建议的换码间隔（秒），直接用于「动态码每 N 秒刷新」那句文案 */
  const refreshAfter = ref(DEFAULT_REFRESH_AFTER_SECONDS);
  const spinning = ref(false);
  /** 可入园的凭证（= 待入园/部分核销的订单），给顶部的凭证选择条用 */
  const credentials = ref<CredentialOption[]>([]);
  /** 当前展示的凭证（订单）id。与 `currentOrderId` 同步 —— 用户的选择要活过重启 */
  const activeId = ref<number | null>(null);
  const now = ref(hhmmss());
  /** 持票人的脱敏手机号（水印用）——凭证与订单详情都不给这个字段，只能回查常用出行人 */
  const holderMask = ref('');
  /**
   * 订单所属**景点名**。
   *
   * 决策：凭证页是**跨景点**的 —— 不管用户在哪个景点、也不管「当前景点」选的哪个，
   * 都显示最近一张可入园的订单，但要把它是哪个景点的标出来。
   * 所以这里按**订单自己的 `scenicAreaId`** 查，而不是读 `currentAreaId`。
   */
  const areaName = ref('');

  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let spinTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (tickTimer) clearInterval(tickTimer);
    if (spinTimer) clearTimeout(spinTimer);
    tickTimer = null;
    spinTimer = null;
  };

  /**
   * 喂给 `DynamicQr` 的**动态码原文**。
   *
   * 注意是 token 本体，不是它的哈希 —— 之前这里是 `hashSeed(token)`（拿 token 去重排设计稿的
   * 假图案），那样扫出来是随机噪声，闸机一律 `MALFORMED`。真正的编码在 `DynamicQr` 里做。
   */
  const qrToken = computed(() => token.value);
  const qrSpinning = computed(() => spinning.value);

  /**
   * 只给「55s」这个值 —— 设计稿那行的静态文案里**已经有「剩余」两个字**了
   * （「动态码每 60 秒刷新 · 剩余 ___」），这里再带前缀会渲染成「剩余 剩余 55s」。
   */
  const countdownLabel = computed(() =>
    token.value ? `${Math.max(0, remain.value - refreshLead.value)}s` : '—',
  );

  /**
   * 「动态码每 N 秒刷新」里的 N。
   *
   * 服务端签发时给 `expiresIn=60`（**这张码本身的有效期**）与 `refreshAfter=50`
   * （**建议多久换一张**，留 10 秒余量，保证屏幕上永远不会出现已过期的码）。
   * 所以「刷新间隔」是 `refreshAfter` 而不是有效期 60，两个数不能混用 ——
   * 设计稿那行写死的「每 60 秒刷新」与实际行为对不上。
   * 这里的两个数都从 `refreshAfter` 推出来：N = refreshAfter，剩余 = 距下次换码还有几秒。
   */
  const refreshAfterLabel = computed(() => String(refreshAfter.value));

  const watermarks = computed(() => {
    const who = holderMask.value || '本人';
    return [
      // 品牌名跟着后台的「平台信息」走，不是设计稿里写死的字面量
      `${who} ${now.value} · ${platformSettings.value.name}验真`,
      `${who} ${now.value} · 动态防伪`,
      `${who} ${now.value} · 严禁翻录`,
    ];
  });

  /** 「10-09 08:30-10:30」 */
  const periodLabel = computed(() => {
    const r = order.value?.reservation;
    const s = order.value?.timeSlot;
    if (!r) return '—';
    return s ? `${r.date.slice(5)} ${hhmm(s.startTime)}-${hhmm(s.endTime)}` : r.date.slice(5);
  });

  /** 「张*林 · 成人票」 */
  const holderLabel = computed(() => {
    const item = order.value?.items?.[0];
    if (!item) return '—';
    return item.ticketName ? `${item.visitorName} · ${item.ticketName}` : item.visitorName;
  });

  /** 这一单是不是正在退款（审核中/退款中）—— 是的话凭证不可用 */
  const refundPending = computed(() => REFUND_PENDING_STATUS.includes(order.value?.refundStatus ?? -1));

  const statusLabel = computed(() => {
    // 退款中优先：订单状态还是 20/30（申请退款不改状态），但票已经不能用了，
    // 顶上还显示「待使用」会让人以为可以过闸
    if (refundPending.value) return '退款中';
    switch (order.value?.status) {
      case 20:
        return '待使用';
      case 30:
        return '部分核销';
      case 40:
        return '已核销';
      default:
        return '不可入园';
    }
  });

  /** 凭证号（服务端从预约派生，列表/详情都有） */
  const credentialNo = computed(() => order.value?.reservation?.credentialNo ?? '');

  /**
   * 二维码区没有码可画时的文案。
   *
   * 退款中只说「退款中」——完整那句在框下面那一行（`v-else` 的说明），
   * 两处都写整句会在同一张卡上重复两遍。
   */
  const qrHint = computed(() => (refundPending.value ? '退款中' : '暂无可入园凭证'));

  /**
   * 退款中时框里那块说明的子行。
   *
   * 说的是**接下来会怎样**：审核通过 → 退款到账、凭证作废；审核被拒 → 凭证自动恢复。
   * 只写「暂不可用」用户不知道要等多久、也不知道会不会自己好。
   */
  const refundHintText = computed(() => '审核通过后退款到账；未通过则凭证自动恢复');

  /** 待入园（20）或部分核销（30）——只有这两种状态下才有凭证可看 */
  const usable = (o: OrderSummary) => o.status === 20 || o.status === 30;

  /**
   * 拉出用户手上**所有可入园的凭证**，并决定这一屏展示哪一张。
   *
   * 选择顺序：
   *   ① `currentOrderId`（用户上次选的 / 刚支付的那一单）**且它仍然可入园**
   *   ② 否则取最近一张可入园的（按预约日升序 —— 最近要去的排前面）
   *
   * ⚠️ ① 里那个「仍然可入园」的检查是必须的：`currentOrderId` 是**落盘**的，
   * 那一单可能已经核销、退款或过期了 —— 不检查就会拿一张废票去要凭证，
   * 服务端回「订单当前状态不可入园」，整页变成错误态（踩过）。
   */
  async function loadCredentials(): Promise<number | null> {
    const list = await orderApi.list();
    const rows = list.filter(usable);
    credentials.value = rows
      .slice()
      .sort((a, b) => (a.reservation?.date ?? '').localeCompare(b.reservation?.date ?? ''))
      .map((o) => ({
        id: o.id,
        date: o.reservation?.date ?? '',
        dateLabel: shortDate(o.reservation?.date ?? ''),
        weekLabel: weekdayOf(o.reservation?.date ?? ''),
        ticketName: o.ticketName,
        remaining: Math.max(0, (o.reservation?.totalCount ?? o.itemCount) - (o.reservation?.verifyCount ?? 0)),
        refundPending: REFUND_PENDING_STATUS.includes(o.refundStatus ?? -1),
      }));

    const kept = credentials.value.find((c) => c.id === currentOrderId.value);
    const chosen = kept ?? credentials.value[0] ?? null;
    // 落盘：这样「退出重进」还停在用户刚选的那张
    if (chosen && chosen.id !== currentOrderId.value) setCurrentOrderId(chosen.id);
    return chosen?.id ?? null;
  }

  /** 用户换一张凭证 —— 写进「当前订单」，随后 `watch(currentOrderId)` 会重取详情与动态码 */
  function onPickCredential(id: number) {
    if (id === activeId.value) return;
    setCurrentOrderId(id);
  }

  // —— 凭证选择条的渐隐与卡片样式 ——
  //
  // 这一条**不走组件**（原来是 `CredentialPicker.vue`），直接写在页面模板里 ——
  // 与购票页那条日期条同一个做法，少一层组件边界、也少一次 createSelectorQuery 测量。
  // （当初是为了修「切走再切回就不见了」而改的，但那一版的真凶是开发者工具的陈旧产物，
  //   见 `page-bindings.mjs` 的 `#credentialPicker` 注解 —— 这里保留这个形态是因为它更简单。）
  //
  // 左侧遮罩只在滚过之后出现；**右侧遮罩常显** —— 它从页面底色渐变到透明，
  // 内容装得下时那片区域本来就是底色，看不出来（与分类条同一条口径）。
  const credFadeLeft = ref(false);
  const onCredScroll = (e: { detail?: { scrollLeft?: number } }) => {
    credFadeLeft.value = (e.detail?.scrollLeft ?? 0) > 4;
  };

  const CRED_CARD_BASE =
    'shrink-0 snap-start relative flex flex-col items-start gap-0_5 w-88px px-2 py-2 rounded-xl border shadow-xs transition-all select-none cursor-pointer';
  const CRED_CARD_ON =
    'border-primary bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
  const CRED_CARD_ON_REFUND =
    'border-dashed border-white_20 bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
  const CRED_CARD_OFF = 'border-silk-border bg-paper-surface text-ink-charcoal-text';
  const CRED_CARD_REFUND = 'border-dashed border-amber-gold_30 bg-amber-gold_15';
  const CRED_PILL_ON =
    'flex items-center gap-1 text-10px font-medium bg-white_20 px-2 py-0_5 rounded-full leading-none';
  const CRED_PILL_LEFT =
    'flex items-center gap-1 text-10px text-primary bg-mist-cyan-50 border border-primary_15 px-2 py-0_5 rounded-full font-medium leading-none';
  const CRED_PILL_REFUND =
    'flex items-center gap-1 text-10px text-tertiary-container bg-amber-gold_15 border border-amber-gold_30 px-2 py-0_5 rounded-full font-medium leading-none';
  const CRED_DOT_ON = 'w-2_5 h-2_5 rounded-full bg-white animate-pulse';
  const CRED_DOT_REFUND = 'w-2_5 h-2_5 rounded-full bg-amber-gold animate-pulse';

  const credCardClass = (c: CredentialOption) => {
    const on = c.id === activeId.value;
    if (on) return `${CRED_CARD_BASE} ${c.refundPending ? CRED_CARD_ON_REFUND : CRED_CARD_ON}`;
    return `${CRED_CARD_BASE} ${c.refundPending ? CRED_CARD_REFUND : CRED_CARD_OFF}`;
  };
  const credWeekClass = (c: CredentialOption) =>
    c.id === activeId.value ? 'font-caption-sm text-10px opacity-90' : 'font-caption-sm text-10px text-ink-light-gray';
  const credTicketClass = (c: CredentialOption) =>
    c.id === activeId.value ? 'text-11px opacity-90 w-full truncate' : 'text-11px text-ink-light-gray w-full truncate';
  const credPillClass = (c: CredentialOption) => {
    const on = c.id === activeId.value;
    if (c.refundPending) return on ? CRED_PILL_ON : CRED_PILL_REFUND;
    return on ? CRED_PILL_ON : CRED_PILL_LEFT;
  };
  const credDotClass = (c: CredentialOption) =>
    c.id === activeId.value ? CRED_DOT_ON : CRED_DOT_REFUND;
  const credHoverClass = (c: CredentialOption) =>
    c.id === activeId.value ? 'pg-hover' : 'active-scale-95 pg-hover';

  /** 按订单的 scenicAreaId 查景点名。查不到（景点已下架）就留空，别乱填一个 */
  async function loadAreaName(areaId: number): Promise<string> {
    try {
      const areas = await areaApi.list();
      return areas.find((a) => a.id === areaId)?.name ?? '';
    } catch {
      return '';
    }
  }

  /** 凭证与订单详情都不含持票人手机号，回查常用出行人补上（只用于水印脱敏展示） */
  async function loadHolderMask(detail: OrderDetail) {
    const visitorId = detail.items?.[0]?.visitorId;
    if (!visitorId) return;
    try {
      const list = await visitorApi.list();
      const v = list.find((x) => x.id === visitorId);
      holderMask.value = v?.phoneMask || v?.idCardMask || '';
    } catch {
      /* 拿不到就用兜底文案，不影响凭证本身 */
    }
  }

  /** 换一张动态码：换 token、重置倒计时、转一下刷新图标 */
  async function refresh() {
    const orderId = order.value?.id;
    if (!orderId) return;
    // 退款审核中：不出码（倒计时那条也不会走 —— `token` 为空时 tick 直接返回）
    if (refundPending.value) {
      token.value = '';
      remain.value = 0;
      return;
    }

    spinning.value = true;
    if (spinTimer) clearTimeout(spinTimer);
    spinTimer = setTimeout(() => {
      spinning.value = false;
    }, 600);
    uni.vibrateShort?.({ fail: () => {} });

    try {
      const cred = await orderApi.credential(orderId);
      token.value = cred.token;
      remain.value = cred.expiresIn;
      // 服务端说「50 秒后可以换」→ 就换算成「剩余 ≤ expiresIn - refreshAfter 时换」。
      // 以前这里是写死的 10 秒，服务端把 refreshAfter 调了也感知不到。
      const after = cred.refreshAfter ?? DEFAULT_REFRESH_AFTER_SECONDS;
      refreshAfter.value = after;
      const lead = cred.expiresIn - after;
      refreshLead.value = lead > 0 ? lead : DEFAULT_REFRESH_LEAD_SECONDS;
    } catch (err) {
      error.value = errorText(err);
      token.value = '';
    }
  }

  let loaded = false;
  /** 上次拉到数据时外壳「被显示过几次」（见 `store/shell.ts` 的 `shellShowTick`） */
  let loadedAtTick = -1;
  async function load(force = false) {
    if (loaded && !force) return;
    loading.value = true;
    error.value = '';
    try {
      const orderId = await loadCredentials();
      activeId.value = orderId;
      if (!orderId) {
        order.value = null;
        token.value = '';
        return;
      }
      const detail = await orderApi.detail(orderId);
      order.value = detail;
      // 景点名查不到（该景点已停用/不在开放列表里）就退回**平台名** —— 凭证卡片头上那行
      // 是一整个 `<h1>`，留空会只剩一个孤零零的图标，看着像没渲染出来
      areaName.value = (await loadAreaName(detail.scenicAreaId)) || platformSettings.value.name;
      await loadHolderMask(detail);
      // 退款审核中**不取码**：服务端也会拒（409），不如就地不给码 + 显示说明
      if (refundPending.value) {
        token.value = '';
        remain.value = 0;
      } else {
        await refresh();
      }
      loaded = true;
      loadedAtTick = shellShowTick.value;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 「这一格又可见了」时该不该重取 —— 与个人中心同一套（见 `views/profile/behavior.ts`）。
   *
   * 本页尤其需要：「申请退改」就是 `navigateTo` 到订单详情，用户在那儿提交完退款再返回，
   * `props.active` 没变过、没人重取 → `refundPending` 还是 false，
   * **二维码照旧出得来**（要到下一次换码时服务端回 409 才会塌成错误态，最多 50 秒）。
   * 服务端本来就拦（`REFUND_PENDING`），但界面不该在这段时间里说反话。
   */
  function ensureFresh() {
    if (!loaded || loadedAtTick !== shellShowTick.value) void load(true);
  }

  watch([shellShowTick, activeTab], () => {
    if (activeTab.value === 'credential') ensureFresh();
  });

  /**
   * 「换了一单」→ 强制重取。
   *
   * `load()` 是「加载过就不再来」的（`loaded` 守卫），而**支付成功后就地切到这一格**是
   * 本页最主要的入口之一：刷新早于本视图挂载时（第一次进凭证页）走初始加载就够了，
   * 但已经挂载过、`loaded` 已是 true 时，光切 tab 会一直显示**上一单**的凭证
   * （动态码还是旧的、持票人还是上一批人）。
   */
  watch(currentOrderId, () => {
    if (loaded) void load(true);
  });

  // 全程只有**一个**每秒定时器：水印时间一直走；有动态码时同时递减倒计时，到刷新点自动换码。
  // （曾经另起一个定时器，结果两个 interval 互相覆盖引用，漏掉一个清不掉。）
  tickTimer = setInterval(() => {
    now.value = hhmmss();
    if (!token.value) return;
    remain.value -= 1;
    if (remain.value <= refreshLead.value) void refresh();
  }, 1000);

  onUnmounted(clearTimers);

  // —— 通行方式三选一（前端状态；后端没有「票种支持的通行方式」接口，见 README 已知偏差）——
  const passModes = ref(PASS_MODES);
  const passMode = ref(PASS_MODES[0]!.id);
  const onPickPassMode = (id: string) => (passMode.value = id);

  /** 导出离线票：后端没有这个接口，如实提示而不是假装成功 */
  function onExport() {
    uni.showToast({ title: '导出离线票待接入', icon: 'none' });
  }

  /**
   * 「申请退改」→ 跳该单的订单详情。
   *
   * 后端**没有改签**（只有 `reschedule` 建表与枚举壳子），所以这里只接退款；
   * 退款要填原因、还要能看「审核中/被拒」，放详情页比在凭证页直接弹更合适。
   */
  function onOrders() {
    const id = order.value?.id;
    if (!id) {
      uni.showToast({ title: '暂无进行中的订单', icon: 'none' });
      return;
    }
    // 已经申请过了（审核中/退款中）：按钮那时已改成「退款中」且不可点，
    // 这里再兜一层 —— 点到了就说清楚，而不是跳过去让人再申请一次（服务端会 400）
    if (refundPending.value) {
      uni.showToast({ title: '该订单正在退款审核中，请等待处理', icon: 'none', duration: 2500 });
      return;
    }
    uni.navigateTo({ url: `/pages/orders/detail?id=${id}` });
  }

  /** 「申请退改」按钮的文案：退款中时直接告诉用户当前状态 */
  const refundButtonLabel = computed(() => (refundPending.value ? '退款中' : '申请退改'));

  return {
    loading,
    error,
    credentials,
    activeId,
    onPickCredential,
    credFadeLeft,
    onCredScroll,
    credCardClass,
    credWeekClass,
    credTicketClass,
    credPillClass,
    credDotClass,
    credHoverClass,
    refundPending,
    refundHintText,
    refundButtonLabel,
    credentialNo,
    qrHint,
    qrToken,
    countdownLabel,
    refreshAfterLabel,
    qrSpinning,
    refreshQr: () => void refresh(),
    watermarks,
    onExport,
    onOrders,
    passModes,
    passMode,
    onPickPassMode,
    periodLabel,
    areaName,
    holderLabel,
    statusLabel,
    load,
  };
}

/**
 * 一张可入园凭证 —— `components/CredentialPicker.vue` 的 props 元素类型。
 *
 * 放在 behavior 里而不是组件里：`<script setup>` **不允许任何 ES 导出**，
 * 而组件要 `import type` 它（同 `RecentOrderView` / 当年的 `HomeTicketCard`）。
 */
export interface CredentialOption {
  /** 订单 id —— 选中它就是把它设成「当前订单」 */
  id: number;
  /** `yyyy-MM-dd` */
  date: string;
  /** `10-11`（模板里够不到 utils，格式化放在这里） */
  dateLabel: string;
  /** `周六` */
  weekLabel: string;
  ticketName: string;
  /** 还没核销的人数（`totalCount - verifyCount`）—— 卡片上显示「余 N 人」 */
  remaining: number;
  /** 退款审核中/退款处理中：这张票暂时不可用 */
  refundPending: boolean;
}
