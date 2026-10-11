import { computed, onUnmounted, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { areaApi, orderApi, visitorApi, type MiniVisitor, type OrderDetail } from '@/api';
import { errorText } from '@/api/request';
import { setCurrentOrderId } from '@/store/order';
import { platformSettings } from '@/store/settings';
import { switchTab } from '@/store/shell';
import { fen2yuan, fen2yuanFixed, hhmm, weekdayOf } from '@/utils/format';

/**
 * 订单支付页。
 *
 * 入口是购票页的「立即预约」：**先把订单建出来**（占住库存、起算支付截止时间），
 * 再 `navigateTo` 到这里付钱。所以本页拿到的是一个真实存在的待支付订单，
 * 倒计时直接读订单自己的 `payDeadline` —— 不是本地另起一个 15 分钟，
 * 那样杀掉小程序再进来就会和库存释放的真实时刻对不上。
 *
 * 数据来源：`GET /api/mini/orders/:id`（金额/时段/游客/截止时间都在里面）。
 * 支付走 `GET /orders/:id/pay-params` → 模拟模式直接打回调、真实模式 `uni.requestPayment`。
 *
 * ## 四处「设计稿写了、后端没有」的地方，口径都在这里
 *
 * 1. **支付方式**：后端只有微信 JSAPI 支付（`wxpay` 模块），亲属卡与数字人民币都不存在。
 *    那两行**版式原样保留**、保持「未选中」的静态样式，点了如实提示「暂未开通」——
 *    删掉它们这一块只剩一行、反而看不出是「支付方式选择」。
 * 2. **费用明细**：只列真实构成（门票 × 人数 = 实付）。设计稿的「景区游览意外险 赠送 ¥0.00」
 *    与「绿色文旅惠民补贴 立减 -¥0.00」后端都没有对应字段 —— **保险尤其不能抄**：
 *    它不是营销话术，是对游客的一项承诺，系统既不签发也不承保。
 * 3. **闸机名**（设计稿写「由 北门 / 东门 闸机通行」）：小程序端没有闸机列表接口，
 *    改成「景区闸机」不带具体门名。另修掉设计稿的「凭动态动态凭证」重复字。
 * 4. **退改说明**：设计稿那句「未核销游玩日前可全额极速退款」既漏了当天手续费、
 *    又把**后台审核**说成了「极速到账」，按 `pay.service.refundFee()` 的真实规则重写。
 */
const pad2 = (n: number) => String(n).padStart(2, '0');

/** `2026-10-09` → `2026年10月09日 周一` */
function cnDate(dateStr: string): string {
  const [y, m, d] = (dateStr ?? '').split('-');
  if (!y || !m || !d) return '—';
  return `${y}年${m}月${d}日 ${weekdayOf(dateStr)}`;
}

export function usePayPage() {
  // —— 二级页自绘标题栏（与 visitor / orders / booking 同一套）——
  //
  // ⚠️ 这里**没有** `capsuleInset`（躲微信胶囊用的右边距）。本页的标题按设计稿是
  // **绝对居中**的（`absolute left-1/2 -translate-x-1/2`），而给整条横条加右内边距会把
  // 居中的基准一起推走、标题肉眼可见地偏左 —— 景点选择页就是这么栽的（见 AreaTopBar.vue）。
  // 标题只有 4 个字（约 72px），居中后离胶囊还有 60 多 pt，本来也撞不上。
  const statusBarHeight = ref(0);

  type WindowMetrics = { statusBarHeight?: number };
  const win: WindowMetrics =
    (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();
  statusBarHeight.value = win.statusBarHeight ?? 0;

  const goBack = () => uni.navigateBack();

  /**
   * 回外壳。
   *
   * 本页可能是「外壳 → 购票页 → 本页」或「外壳 → 我的预约 → 详情 → 本页」，
   * 弹出的层数不固定 —— 所以按当前页面栈深度倒着退到底，而不是写死 delta。
   */
  function backToShell() {
    const pages = getCurrentPages();
    uni.navigateBack({ delta: Math.max(1, pages.length - 1) });
  }

  const orderId = ref(0);
  const order = ref<OrderDetail | null>(null);
  const areaName = ref('');
  const loading = ref(false);
  const error = ref('');
  const paying = ref(false);

  /** 支付截止时刻（毫秒）。来自订单自己的 `payDeadline`，不是本地算的 */
  const deadline = ref(0);
  const nowMs = ref(Date.now());
  const expired = ref(false);

  const remainSeconds = computed(() => Math.max(0, Math.ceil((deadline.value - nowMs.value) / 1000)));
  const timerLabel = computed(() => {
    const s = remainSeconds.value;
    return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  });

  const headcount = computed(() => order.value?.items.length ?? 0);
  /**
   * 金额一律用后端算好的 `order.amount`（分），前端只做展示换算。
   * ⚠️ 用 `fen2yuanFixed`（恒两位小数）而不是 `fen2yuan`：这一页的总额设计稿就是 `240.00`，
   * 而与它同卡片里的单价是 `¥120`（不带小数）—— 两个写法在设计稿里是并存的，照做。
   */
  const totalLabel = computed(() => fen2yuanFixed(order.value?.amount ?? 0));
  /** 单价（分/人）：order_item.price */
  const unitPrice = ref(0);

  const ticketName = computed(() => order.value?.items[0]?.ticketName ?? '景区门票');

  /** 「成人全票 × 2张」 */
  const ticketSummary = computed(() => `${ticketName.value} × ${headcount.value}张`);
  /** 「(¥120/人)」—— 购票流程只会拿到按人计价的票种（见 booking/behavior.ts 的过滤） */
  const unitLabel = computed(() => `(¥${fen2yuan(unitPrice.value)}/人)`);

  /** 「2026年10月09日 周一」 */
  const dateLabel = computed(() => {
    const date = order.value?.reservation?.date;
    return date ? cnDate(date) : '—';
  });

  /** 「08:30 - 10:30 场次」 */
  const slotLabel = computed(() => {
    const s = order.value?.timeSlot;
    return s ? `${hhmm(s.startTime)} - ${hhmm(s.endTime)} 场次` : '—';
  });

  /** 费用明细的门票行：「成人全票 (¥120 × 2)」 */
  const feeItemLabel = computed(
    () => `${ticketName.value} (¥${fen2yuan(unitPrice.value)} × ${headcount.value})`,
  );

  /** 金额卡下方那颗小胶囊：「含 2 位游客门票 · 实名制入园」 */
  const amountHint = computed(() => `含 ${headcount.value} 位游客门票 · 实名制入园`);

  const visitorsTitle = computed(() => `出行游客 (${headcount.value}人)`);

  // —— 协议区 ——
  // 协议名里的**品牌主体**跟着后台「平台信息」走（设计稿写死「枫林谷」）。
  // 平台名存的是「枫林谷景区」，去掉「景区」二字读起来才像一份文件的名字。
  const policyTitle = computed(() => `${platformSettings.value.name.replace(/景区$/, '')}门票分时预约与退改守则`);

  /**
   * 退改说明。
   *
   * ⚠️ 设计稿写的是「未核销游玩日前可全额极速退款，过闸核销后不可退」，与后端实际规则**不符**：
   * `pay.service.refundFee()` 是「距游玩日 ≥ beforeDay(默认 1) 天免手续费、当天收 feeRate(默认 20%)、
   * 过了预约日不退」，而且退款是**提交申请、后台审核后原路退回**，不是「极速到账」。
   * 这里按真实规则写，且**不带数字** —— 那两个比例在后台「参数配置」里可以改，
   * 写死数字迟早会和配置漂移（`smoke:config` 就是为这类漂移准备的）。
   */
  const refundNote = computed(
    () => '未核销订单可申请退款（游玩日前的免手续费，当天按比例收取，核销后不可退），审核通过后原路退回',
  );

  /** 三份协议的正文后端没有，点了如实说，别做成「点了没反应」的死链 */
  function onDoc() {
    uni.showToast({ title: '协议全文待补充', icon: 'none' });
  }

  /** 吞掉冒泡用（金额明细抽屉的本体） */
  const noop = () => {};

  /**
   * 游客列表。持票人的**手机号**订单与凭证都不返回（只回脱敏证件号），
   * 只能回查常用出行人补上 —— 与凭证页水印同一个做法。
   * 「主出行人 / 同行人」按**下单顺序**判定（第一位是主），不是 `isDefault`：
   * 这一单里谁排第一，看的是下单时的勾选顺序。
   */
  const visitors = ref<{ id: number; name: string; idCard: string; phone: string }[]>([]);

  /**
   * 另外两种支付方式**只存在于设计稿里**：后端 `wxpay` 模块只有微信 JSAPI 支付，
   * 亲属卡与数字人民币都没有渠道可调。所以它们保持设计稿的「未选中」静态样式，
   * 点了如实说一句 —— 不假装能选，也不把版式删掉一半。
   */
  function onPickPay(id: 'family' | 'ecny') {
    const title = id === 'family' ? '微信亲属卡 / 零钱通' : '数字人民币 (e-CNY)';
    uni.showToast({ title: `${title} 暂未开通，请使用微信支付`, icon: 'none' });
  }

  // —— 协议勾选：设计稿默认已勾，支付按钮据此置灰 ——
  const agreed = ref(true);
  const agreeIconClass = computed(() =>
    agreed.value ? 'msi icon-check_box text-20px text-primary' : 'msi icon-check_box_outline_blank text-20px text-outline',
  );
  function toggleAgree() {
    agreed.value = !agreed.value;
  }

  const canPay = computed(() => !!order.value && !expired.value && !paying.value && agreed.value);

  // —— 底部「金额明细」抽屉 ——
  //
  // 设计稿的箭头是 `arrow.classList.add('rotate-180')` 动态加的，所以 `rotate-180`
  // **不在设计稿 HTML 里**、也就没进 classmap —— 直接写这个类会静默无样式。
  // 改用本项目自有的 `is-flip`（scoped 样式里定义），与凭证页的 `is-spinning` 同一套。
  const drawerOpen = ref(false);
  const toggleDrawer = () => (drawerOpen.value = !drawerOpen.value);

  const payButtonLabel = computed(() =>
    paying.value ? '支付中…' : `立即支付 ¥${totalLabel.value}`,
  );

  /** 支付成功后的落点：凭证页 */
  function gotoCredential() {
    setCurrentOrderId(orderId.value);
    switchTab('credential');
    backToShell();
  }

  async function load() {
    if (!orderId.value) {
      error.value = '缺少订单号';
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const detail = await orderApi.detail(orderId.value);
      order.value = detail;
      unitPrice.value = detail.items[0]?.price ?? 0;
      // 后端 datetime → JSON 的 ISO 串，本身就是绝对时刻（带 Z），直接取毫秒
      deadline.value = new Date(detail.payDeadline).getTime();

      // 不是待支付：这页没什么可做的。已付的直接送到凭证页（用户多半是重复进来了），
      // 取消/过期/退款的退回去 —— 一律如实说一句再走，别让人对着一个点不动的按钮猜。
      if (detail.status !== 10) {
        const paid = detail.status === 20 || detail.status === 30;
        uni.showToast({ title: paid ? '该订单已支付' : '该订单已不可支付', icon: 'none' });
        if (paid) gotoCredential();
        else setTimeout(backToShell, 900);
        return;
      }

      const [areas, allVisitors] = await Promise.all([
        areaApi.list().catch(() => []),
        visitorApi.list().catch(() => [] as MiniVisitor[]),
      ]);
      areaName.value = areas.find((a) => a.id === detail.scenicAreaId)?.name ?? '';
      const phoneOf = (visitorId: number) => allVisitors.find((v) => v.id === visitorId)?.phoneMask ?? '—';
      visitors.value = detail.items.map((i) => ({
        id: i.id,
        name: i.visitorName || '—',
        idCard: i.visitorIdCard || '—',
        phone: phoneOf(i.visitorId),
      }));
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  // 一秒一跳：既走倒计时，也顺便把「已过期」判掉。
  // 只处理**归零那一瞬**（`!expired`），否则每秒都会弹一次。
  const tick = setInterval(() => {
    nowMs.value = Date.now();
    if (expired.value || !deadline.value) return;
    if (remainSeconds.value > 0) return;
    expired.value = true;
    uni.showModal({
      title: '支付超时',
      content: '名额已释放回公共库存，请重新预约。',
      showCancel: false,
      confirmText: '知道了',
      success: () => backToShell(),
    });
  }, 1000);
  onUnmounted(() => clearInterval(tick));

  async function onPay() {
    if (paying.value) return;
    if (!agreed.value) {
      uni.showToast({ title: '请先阅读并勾选预约与门禁实名制协议', icon: 'none' });
      return;
    }
    if (expired.value) {
      uni.showToast({ title: '订单已超时，请重新预约', icon: 'none' });
      return;
    }
    if (!order.value) return;

    paying.value = true;
    try {
      const p = await orderApi.payParams(orderId.value);
      if (p.mock) {
        // 本地联调：服务端处于模拟模式，直接触发支付成功回调
        await orderApi.mockPay(p.orderNo);
      } else {
        await new Promise<void>((resolve, reject) => {
          uni.requestPayment({
            ...p.payParams,
            success: () => resolve(),
            fail: (e: { errMsg?: string } | undefined) =>
              reject(new Error(e?.errMsg?.includes('cancel') ? '已取消支付' : e?.errMsg || '支付未完成')),
          } as never);
        });
      }
      uni.showToast({ title: '支付成功', icon: 'success' });
      gotoCredential();
    } catch (err) {
      uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
    } finally {
      paying.value = false;
    }
  }

  onLoad((query) => {
    orderId.value = Number((query as Record<string, string> | undefined)?.id ?? 0);
    void load();
  });

  return {
    statusBarHeight,
    goBack,
    loading,
    error,
    order,
    expired,
    paying,
    timerLabel,
    totalLabel,
    headcount,
    feeItemLabel,
    amountHint,
    visitorsTitle,
    visitors,
    areaName,
    ticketName,
    dateLabel,
    slotLabel,
    ticketSummary,
    unitLabel,
    onPickPay,
    agreed,
    toggleAgree,
    agreeIconClass,
    canPay,
    policyTitle,
    refundNote,
    onDoc,
    noop,
    drawerOpen,
    toggleDrawer,
    payButtonLabel,
    onPay,
    load,
  };
}
