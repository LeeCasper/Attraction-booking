import { computed, onUnmounted, ref } from 'vue';

/**
 * 动态防伪电子凭证页的行为。
 *
 * 由 scripts/gen-pages.mjs 注入到生成的模板里（见 scripts/page-bindings.mjs），
 * 模板本身仍由设计稿生成，这里只负责「活」的部分。
 *
 * 一期为静态还原：倒计时、二维码、水印时间都是本地模拟。
 * 接接口后的对应关系：
 *   - 倒计时时长 ← `GET /api/mini/orders/:id/credential` 返回的 `expiresIn`（服务端为 60）
 *   - 建议刷新间隔 ← 同接口的 `refreshAfter`（服务端为 50）
 *   - 二维码内容 ← 同接口返回的 `token`（现在是设计稿画的假图案）
 *   - 水印里的手机号 ← 订单详情里持票人的脱敏手机号
 */
const TTL_SECONDS = 60;
/** 设计稿首屏停在 41s，静态还原阶段用它作为初始值，视觉上与设计稿一致 */
const INITIAL_REMAIN = 41;

/** 水印里的手机尾号（设计稿原文）。接接口后换成持票人脱敏手机号 */
const PHONE_MASK = '138****0011';

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmss = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

export function useCredentialPage() {
  const remain = ref(INITIAL_REMAIN);
  /** 二维码图案种子：0 = 设计稿原图案，非 0 = 按种子重排数据点 */
  const seed = ref(0);
  const spinning = ref(false);
  const now = ref(hhmmss());

  let timer: ReturnType<typeof setInterval> | null = null;
  let spinTimer: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    if (timer) clearInterval(timer);
    if (spinTimer) clearTimeout(spinTimer);
    timer = null;
    spinTimer = null;
  }

  /** 刷新凭证：换二维码图案、重置倒计时、转一下刷新图标 */
  function refresh() {
    seed.value = Math.floor(Date.now() / 1000) % 100000;
    remain.value = TTL_SECONDS;
    spinning.value = true;
    if (spinTimer) clearTimeout(spinTimer);
    spinTimer = setTimeout(() => {
      spinning.value = false;
    }, 600);
    uni.vibrateShort?.({ fail: () => {} });
  }

  /** 每秒走一格；归零时自动刷新（对应设计稿「动态码每 60 秒刷新」） */
  timer = setInterval(() => {
    now.value = hhmmss();
    remain.value -= 1;
    if (remain.value <= 0) refresh();
  }, 1000);

  onUnmounted(stop);

  const countdownLabel = computed(() => `剩余 ${remain.value}s`);
  const qrSpinning = computed(() => spinning.value);

  /** 三行防伪水印，都带同一时刻的时间戳（设计稿原文格式） */
  const watermarks = computed(() => [
    `${PHONE_MASK} ${now.value} · 枫林谷验真`,
    `${PHONE_MASK} ${now.value} · 动态防伪`,
    `${PHONE_MASK} ${now.value} · 严禁翻录`,
  ]);

  /** 离线票导出：一期未实现，如实提示而非假装成功 */
  function onExport() {
    uni.showToast({ title: '导出离线票待接入', icon: 'none' });
  }

  return {
    qrSeed: seed,
    countdownLabel,
    qrSpinning,
    refreshQr: refresh,
    watermarks,
    onExport,
  };
}
