import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue';
import { areaApi, orderApi, stockApi, ticketApi, visitorApi, type MiniTicket, type StockItem } from '@/api';
import { errorText } from '@/api/request';
import { currentAreaId } from '@/store/shell';
import { dayOffsetStr, fen2yuan, hhmm, shortDate, weekdayOf } from '@/utils/format';

/**
 * 分时预约购票页：数据来自后端，交互状态本地维护。
 *
 * 与设计稿的对应关系（生成器按 id/class 把组件注进设计稿版式）：
 *   票种列表 / 日期条 / 时段格 / 出行游客登记 / 底部待付条 —— 都是手写组件，见 page-bindings.mjs
 *
 * 「选择票种」那一节**是后加的**（设计稿把票种写死在顶卡上，按单景区单票种画的）：
 * 后台一个景点可以配多个票种，而从「景点选择」页进来的用户原先没有任何换票种的入口。
 *
 * 几处**后端没有对应字段、只能前端定口径**的地方，都在下面标了「口径」：
 *   - 日期的「充足/紧张/约满」：后端只给余量数字，没有状态字段 → 按阈值分档
 *   - 「限购 5 人」：后端限制是「单笔 ≤10」，没有这个业务字段 → 保留设计稿的常量
 */
const EDGE_THRESHOLD = 4;

/** 设计稿写的是「限购 5 人」；后端没有对应字段，保留本地常量 */
export const MAX_VISITORS = 5;

/** 日期条显示几天 */
const DATE_COUNT = 8;
/** 口径：余量低于这个数算「紧张」 */
const TIGHT_THRESHOLD = 50;

export type DateTone = 'ok' | 'tight' | 'full';
export type SlotTone = 'ok' | 'tight';

export interface DateOption {
  value: string;
  week: string;
  label: string;
  tone: DateTone;
}
export interface SlotOption {
  id: number;
  range: string;
  left: number;
  tone: SlotTone;
}
export interface VisitorCard {
  id: number;
  name: string;
  badge: string;
  idCardMask: string;
  phoneMask: string;
}

const dateToneOf = (available: number): DateTone =>
  available <= 0 ? 'full' : available < TIGHT_THRESHOLD ? 'tight' : 'ok';
const slotToneOf = (available: number): SlotTone => (available < TIGHT_THRESHOLD ? 'tight' : 'ok');

interface ScrollDetail {
  scrollLeft?: number;
  scrollWidth?: number;
}

export function useBookingPage() {
  // —— 二级页自绘标题栏：状态栏占位 + 胶囊避让（与 visitor / orders 页同一套）——
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

  const goBack = () => uni.navigateBack();

  // —— 日期条两端渐隐（纯视觉，Phase ①）——
  const dateFade = reactive({ left: false, right: true });
  const scrollLeft = ref(0);
  /** scroll-view 的可视宽度 —— @scroll 的 detail 里没有，需要自己量 */
  const viewportWidth = ref(0);
  const contentWidth = ref(0);

  onMounted(() => {
    const instance = getCurrentInstance();
    uni
      .createSelectorQuery()
      .in(instance?.proxy as never)
      .select('#calendarScroll')
      .boundingClientRect((rect) => {
        if (rect && !Array.isArray(rect)) viewportWidth.value = rect.width ?? 0;
      })
      .exec();
  });

  function onDateScroll(e: { detail: ScrollDetail }) {
    scrollLeft.value = e.detail.scrollLeft ?? 0;
    contentWidth.value = e.detail.scrollWidth ?? 0;

    // 内容还没量到时保持默认（右侧有内容），避免首屏右侧遮罩闪一下
    if (!viewportWidth.value || !contentWidth.value) return;

    const maxScroll = contentWidth.value - viewportWidth.value;
    dateFade.left = scrollLeft.value > EDGE_THRESHOLD;
    dateFade.right = scrollLeft.value < maxScroll - EDGE_THRESHOLD;
  }

  // —— 数据（全部来自后端）——
  const loading = ref(false);
  const error = ref('');
  const ticketTypeId = ref<number | null>(null);
  /** 选中的票种本体 —— 顶部那张「票种头卡」要显示它的名称/副标题/价格 */
  const ticket = ref<MiniTicket | null>(null);
  /** 「选择票种」那一节的可选项：本景点**按人计价**的票种（按张卖的进不了购票流程） */
  const ticketOptions = ref<MiniTicket[]>([]);
  /** 当前景点名 —— 头卡标题「{景点} · 景区门票」用它，不再写死某个景点的名字 */
  const areaName = ref('');
  const dates = ref<DateOption[]>([]);
  const slots = ref<SlotOption[]>([]);
  const visitors = ref<VisitorCard[]>([]);
  const date = ref('');
  const slot = ref<number | null>(null);
  const pickedIds = ref<number[]>([]);
  const unitPrice = ref(0);
  const submitting = ref(false);

  /**
   * 每个「票种 + 日期」的分时余票缓存。
   * 日期条要 8 天的数据，而 `/stocks` 是按「票种 + 日期」查的 —— 没有多日日历接口，
   * 只能按天各查一次；缓存下来，切日期/提交订单时就不必重复请求。
   *
   * ⚠️ key **必须带票种**。余票是按票种查的，只拿日期当 key 的话，
   * 从首页换一种票再进来，看到的余票还是上一个票种的。
   */
  const stockByDate = new Map<string, StockItem[]>();
  const stockKey = (d: string) => `${ticketTypeId.value}:${d}`;

  async function loadStocks(d: string): Promise<StockItem[]> {
    const key = stockKey(d);
    const cached = stockByDate.get(key);
    if (cached) return cached;
    const list = await stockApi.byDate(ticketTypeId.value!, d);
    stockByDate.set(key, list);
    return list;
  }

  function applySlots(list: StockItem[]) {
    slots.value = list.map((s) => ({
      id: s.timeSlotId,
      range: `${hhmm(s.startTime)} - ${hhmm(s.endTime)}`,
      left: s.available,
      tone: slotToneOf(s.available),
    }));
    // 当前选中的时段若在新日期里已满/不存在，回落到第一个可用的
    const stillOk = slots.value.find((s) => s.id === slot.value && s.tone !== undefined && s.left > 0);
    if (!stillOk) slot.value = slots.value.find((s) => s.left > 0)?.id ?? slots.value[0]?.id ?? null;
  }

  async function pickDate(value: string) {
    date.value = value;
    const list = await loadStocks(value);
    applySlots(list);
  }

  /**
   * 重算整条日期条的「充足 / 紧张 / 约满」。
   *
   * **换票种之后必须重算**：余票是按「票种 + 日期」查的，新票种在这 8 天里的余量
   * 与旧票种毫无关系（成人票约满的日子，优待票可能还有）。日期条只显示档位、
   * 不显示具体张数，所以这里只重取分档、不动别处。
   */
  async function refreshDateTones() {
    const days = dates.value.map((d) => d.value);
    const lists = await Promise.all(days.map((d) => loadStocks(d)));
    dates.value = dates.value.map((d, i) => ({
      ...d,
      tone: dateToneOf(lists[i]!.reduce((sum, s) => sum + s.available, 0)),
    }));
  }

  /**
   * 换票种。
   *
   * 三件事，顺序不能反：
   *   ① 先改 `ticketTypeId`/`unitPrice` —— 余票缓存的 key 与「底部待付金额」都由它派生
   *   ② 再刷**当前日期**的时段（立刻能看到新票种还剩多少），然后重算整条日期条的分档
   *   ③ 当前日期在新票种下可能已经约满 —— 那就落到最近一个没约满的日子并说明，
   *      否则用户会停在一个「所有时段都点不动」的日期上，看起来像页面坏了
   *
   * 出行人不用动（人级状态，与票种无关）；余票缓存也**不清** —— key 带票种，
   * 换回原来那种票时还能命中。
   */
  async function onPickTicketType(id: number) {
    if (id === ticketTypeId.value) return;
    const chosen = ticketOptions.value.find((t) => t.id === id);
    if (!chosen) return;

    ticketTypeId.value = chosen.id;
    ticket.value = chosen;
    unitPrice.value = chosen.price;

    try {
      applySlots(await loadStocks(date.value));
      await refreshDateTones();
      // ⚠️ 先把原选项整个记下来：`pickDate()` 会把 `date` 改掉，回头再拼文案会变成
      // 「10-12 已约满，已切到 10-12」这种自相矛盾的提示。
      // 文案用的是日期条上的 `label`（`10-12`）而不是 `value`（`2026-10-12`）—— 与卡片一致
      const from = dates.value.find((d) => d.value === date.value);
      if (from?.tone === 'full') {
        const next = dates.value.find((d) => d.tone !== 'full');
        if (next) {
          await pickDate(next.value);
          uni.showToast({
            title: `${from.label} 该票种已约满，已切到 ${next.label}`,
            icon: 'none',
            duration: 2500,
          });
        }
      }
    } catch (err) {
      uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
    }
  }

  /**
   * 「在哪个景点加载过」。`undefined` = 从没加载过。
   *
   * ⚠️ 以前还记着一个 `loadedTicketTypeId`（首页点某张票卡会改票种）。首页那一节
   * 已经改成「推荐景点」、不再售票种，**票种改在本页选**，所以只剩这一个判断。
   */
  let loadedForArea: number | null | undefined;

  /** 进入页面时加载；`force` 用于重试 */
  async function load(force = false) {
    if (!force && loadedForArea !== undefined && loadedForArea === currentAreaId.value) return;
    loading.value = true;
    error.value = '';
    try {
      const areas = await areaApi.list();
      const picked = currentAreaId.value ? areas.find((a) => a.id === currentAreaId.value) : undefined;
      const area = picked ?? areas[0];
      if (!area) throw new Error('没有开放中的景点');
      areaName.value = area.name;

      const today = dayOffsetStr(0);
      const tickets = await ticketApi.list(area.id, today);
      // 只列**按人计价**的票种：按张的（如家庭年卡）后端只有「单价 × 人数」这一种计价，
      // 放进购票流程会把金额算错（¥388 × 人数）。首页/景点选择页都会拦住不让进来，
      // 这里是兜底 —— 万一运营把某个票种改成了按张，也不能算出错的金额。
      const sellable = tickets.filter((t) => t.saleUnit === 'person');
      ticketOptions.value = sellable;
      const chosen = sellable[0];
      // 一个可售票种都没有：如实说，别拿一个按张卖的票种硬顶（那会算错金额）
      if (!chosen) throw new Error('该景区暂无可在线预约的票种');

      // 换景点 → 旧余票全部作废（缓存 key 带景点吗？不带 —— 换景点时票种 id 也可能撞上）
      stockByDate.clear();
      ticketTypeId.value = chosen.id;
      ticket.value = chosen;
      unitPrice.value = chosen.price;

      // 日期条：今天起 N 天，逐日取余票汇总来分档
      const days = Array.from({ length: DATE_COUNT }, (_, i) => dayOffsetStr(i));
      const dayStocks = await Promise.all(days.map((d) => loadStocks(d)));
      dates.value = days.map((d, i) => ({
        value: d,
        week: weekdayOf(d),
        label: shortDate(d),
        tone: dateToneOf(dayStocks[i]!.reduce((sum, s) => sum + s.available, 0)),
      }));

      // 出行人
      await refreshVisitors();

      date.value = dates.value[0]!.value;
      applySlots(dayStocks[0]!);
      // 全部成功后才记「已加载的景点」——中途失败时保持原值，下次进入会自动重试
      loadedForArea = currentAreaId.value;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 切景点 → 作废并重取。
   *
   * 余票缓存**必须在这里清**：它的 key 是「票种 + 日期」，换景点后这两个东西全变了
   * （`ticketOptions` 会整份换掉），留着只会是一堆用不上的数据。
   * 另外选择景点是二级页，push 期间本视图的 `active` 没变化，
   * 所以外壳那个 `watch(props.active)` 不会触发 —— 不主动监听就会「选完返回，购票页还是旧景点」。
   */
  watch(currentAreaId, () => {
    if (loadedForArea === undefined) return;
    loadedForArea = undefined;
    stockByDate.clear();
    void load();
  });

  async function refreshVisitors() {
    const list = await visitorApi.list();
    visitors.value = list.map((v) => ({
      id: v.id,
      name: v.name,
      badge: v.badge,
      idCardMask: v.idCardMask,
      phoneMask: v.phoneMask,
    }));
    // 默认勾选：默认出行人优先，否则第一位；已勾选但已删除的要剔除
    const alive = new Set(visitors.value.map((v) => v.id));
    pickedIds.value = pickedIds.value.filter((id) => alive.has(id));
    if (pickedIds.value.length === 0 && visitors.value.length > 0) {
      const preferred = list.find((v) => v.isDefault) ?? list[0]!;
      pickedIds.value = [preferred.id];
    }
  }

  const onPickDate = (value: string) => void pickDate(value);
  const onPickSlot = (id: number) => {
    slot.value = id;
  };

  function onToggleVisitor(id: number) {
    const at = pickedIds.value.indexOf(id);
    if (at >= 0) pickedIds.value.splice(at, 1);
    else if (pickedIds.value.length >= MAX_VISITORS) {
      uni.showToast({ title: `最多可选 ${MAX_VISITORS} 人`, icon: 'none' });
      return;
    } else pickedIds.value.push(id);
  }

  /** 「新增出行人」跳到管理页（设计稿里这个按钮本来就是入口） */
  function onAddVisitor() {
    uni.navigateTo({ url: '/pages/visitor/index' });
  }

  // —— 底部待付条 ——
  const headcount = computed(() => pickedIds.value.length);
  const totalAmount = computed(() => unitPrice.value * headcount.value);
  const selectionLabel = computed(() => `已选 ${headcount.value} 人 / 限购 ${MAX_VISITORS} 人`);

  // —— 顶部「票种头卡」的四项 —— 以前这几处在生成产物里是写死的
  // （头卡恒显示「成人全票 / 含林海栈道及主景区观光 / ¥120」，与真实选中的票种并不联动）——
  /**
   * 头卡标题。设计稿写死「枫林谷国家森林公园 · 景区门票」（按单景区画的），
   * 多景区下必须跟着**当前景点**走。
   */
  const pageTitle = computed(() => `${areaName.value || '景区'} · 景区门票`);
  const ticketName = computed(() => ticket.value?.name ?? '—');
  const ticketAudience = computed(() => ticket.value?.audience ?? '');
  /** 价格：分 → 元，不带小数（设计稿上就是 `120` 这种） */
  const ticketPrice = computed(() => fen2yuan(ticket.value?.price ?? 0));
  /** 计价单位。目前购票流程只会拿到按人计价的票种，所以这里恒为「/人」，
   *  但按 saleUnit 推导而不是写死 —— 将来接了「按张」不用回来改这里 */
  const unitLabel = computed(() => (ticket.value?.saleUnit === 'ticket' ? '/张' : '/人'));
  const canSubmit = computed(
    () => headcount.value > 0 && !!date.value && slot.value !== null && !submitting.value,
  );

  /**
   * 「立即预约」→ **建单，然后进订单支付页**。
   *
   * ⚠️ 这里只建单、**不在这里付款**（原先是在这一页直接打模拟支付回调、再跳凭证页）。
   * 拆开是因为支付有它自己的界面（应付总额、倒计时、支付方式、协议勾选），
   * 那是设计稿单独画的一页 `pages/pay/`，而且「我的预约 → 详情 → 去支付」也该落到同一个地方。
   *
   * 建单放在**跳转之前**：库存是从建单那一刻锁住的，支付截止时间（`payDeadline`）也同时起算，
   * 支付页的倒计时读的就是这个值 —— 不能在支付页里建单，否则倒计时会比库存锁定晚起。
   * 代价是用户直接返回时名额要等到超时才释放，与设计稿「名额保留中」那句口径一致。
   *
   * 传的是 `visitorId` 而不是明文证件：`GET /api/mini/visitors` 出于隐私只返回脱敏号，
   * 客户端手里根本没有明文（服务端按 id 取记录）。这也是为什么下单接口新支持了这个字段。
   */
  async function onSubmit() {
    if (!canSubmit.value) return;
    if (ticketTypeId.value === null || slot.value === null) return;

    submitting.value = true;
    uni.showLoading({ title: '下单中…', mask: true });
    try {
      const order = await orderApi.create({
        ticketTypeId: ticketTypeId.value,
        date: date.value,
        timeSlotId: slot.value,
        visitors: pickedIds.value.map((id) => ({ visitorId: id })),
      });

      uni.hideLoading();
      // 压栈进支付页：付成功 / 超时 / 用户自己返回，都由那一页负责收尾。
      // 「当前订单」**不在这里记** —— 这一单此刻还是待支付，记下来凭证页会拿它去要凭证、
      // 拿到一句「订单当前状态不可入园」。等真正付成功了由支付页记。
      uni.navigateTo({ url: `/pages/pay/index?id=${order.orderId}` });
    } catch (err) {
      uni.hideLoading();
      uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
    } finally {
      submitting.value = false;
    }
  }

  return {
    statusBarHeight,
    capsuleInset,
    goBack,
    dateFade,
    onDateScroll,
    loading,
    error,
    dates,
    date,
    onPickDate,
    slots,
    slot,
    onPickSlot,
    visitors,
    pickedIds,
    selectionLabel,
    pageTitle,
    ticketName,
    ticketAudience,
    ticketPrice,
    unitLabel,
    ticketTypeId,
    ticketOptions,
    onPickTicketType,
    onToggleVisitor,
    onAddVisitor,
    unitPrice,
    headcount,
    totalAmount,
    canSubmit,
    onSubmit,
    load,
  };
}
