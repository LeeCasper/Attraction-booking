import { computed, onUnmounted, ref } from 'vue';
import { orderApi, visitorApi, type OrderDetail } from '@/api';
import { errorText } from '@/api/request';
import { currentOrderId } from '@/store/order';
import { hhmm } from '@/utils/format';

/**
 * 动态防伪电子凭证页。
 *
 * 数据来自「订单详情 + 动态凭证」两个接口：
 *   - `GET /api/mini/orders/:id`            → 入园时段（reservation + timeSlot）、持票人（items）、状态
 *   - `GET /api/mini/orders/:id/credential` → token / expiresIn(60) / refreshAfter(50)
 *
 * **二维码是「由 token 派生的图案」而不是可扫的真二维码** —— 真二维码要把 token 编码成矩阵，
 * 需要引入编码器（本项目没有这个依赖）。闸机侧验的是 token 本体，所以这里只做防伪图案。
 * 这一点写在 README 的已知偏差里。
 *
 * 无订单时 `seed = 0`，`DynamicQr` 会退回设计稿原图案 —— 首屏与设计稿逐像素一致。
 */
const PASS_MODES = [
  { id: 'qr', icon: 'qr_code_scanner', label: '动态二维码', hint: '主推荐', hintPill: true },
  { id: 'idcard', icon: 'id_card', label: '实体身份证', hint: '贴卡即过' },
  { id: 'face', icon: 'face', label: '人脸识别', hint: '录入', hintTone: 'primary' as const },
];

/** 剩余不足这么多秒就刷新（服务端 refreshAfter = 50，即 60 秒里剩 10 秒时刷） */
const REFRESH_AT_SECONDS = 10;

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmss = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** 把 token 揉成一个整数种子，喂给 DynamicQr 重排图案 */
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 100000) + 1; // 避开 0（0 是「用设计稿原图案」的哨兵）
}

export function useCredentialPage() {
  const loading = ref(false);
  const error = ref('');
  const order = ref<OrderDetail | null>(null);
  const token = ref('');
  const remain = ref(0);
  const spinning = ref(false);
  const now = ref(hhmmss());
  /** 持票人的脱敏手机号（水印用）——凭证与订单详情都不给这个字段，只能回查常用出行人 */
  const holderMask = ref('');

  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let spinTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (tickTimer) clearInterval(tickTimer);
    if (spinTimer) clearTimeout(spinTimer);
    tickTimer = null;
    spinTimer = null;
  };

  /** 有 token 时用 token 派生图案；没有就回设计稿原图案 */
  const qrSeed = computed(() => (token.value ? hashSeed(token.value) : 0));
  const qrSpinning = computed(() => spinning.value);

  /**
   * 只给「55s」这个值 —— 设计稿那行的静态文案里**已经有「剩余」两个字**了
   * （「动态码每 60 秒刷新 · 剩余 ___」），这里再带前缀会渲染成「剩余 剩余 55s」。
   */
  const countdownLabel = computed(() => (token.value ? `${remain.value}s` : '—'));

  const watermarks = computed(() => {
    const who = holderMask.value || '本人';
    return [
      `${who} ${now.value} · 枫林谷验真`,
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
      order.value = await orderApi.detail(orderId);
      await loadHolderMask(order.value);
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
    if (remain.value <= REFRESH_AT_SECONDS) void refresh();
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

  return {
    loading,
    error,
    qrSeed,
    countdownLabel,
    qrSpinning,
    refreshQr: () => void refresh(),
    watermarks,
    onExport,
    passModes,
    passMode,
    onPickPassMode,
    periodLabel,
    holderLabel,
    statusLabel,
    load,
  };
}
