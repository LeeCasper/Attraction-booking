import { computed, onUnmounted, ref } from 'vue';
import { areaApi, orderApi, visitorApi, type OrderDetail } from '@/api';
import { errorText } from '@/api/request';
import { currentOrderId } from '@/store/order';
import { platformSettings } from '@/store/settings';
import { hhmm } from '@/utils/format';

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
 */
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

  const statusLabel = computed(() => {
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

  /** 没有「当前订单」时，回落到最近一张可入园的订单 —— 杀掉小程序再进来还能看到凭证 */
  async function resolveOrderId(): Promise<number | null> {
    if (currentOrderId.value) return currentOrderId.value;
    const list = await orderApi.list();
    return list.find((o) => o.status === 20 || o.status === 30)?.id ?? null;
  }

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
  async function load(force = false) {
    if (loaded && !force) return;
    loading.value = true;
    error.value = '';
    try {
      const orderId = await resolveOrderId();
      if (!orderId) {
        order.value = null;
        token.value = '';
        return;
      }
      const detail = await orderApi.detail(orderId);
      order.value = detail;
      areaName.value = await loadAreaName(detail.scenicAreaId);
      await loadHolderMask(detail);
      await refresh();
      loaded = true;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

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
    uni.navigateTo({ url: `/pages/orders/detail?id=${id}` });
  }

  return {
    loading,
    error,
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
