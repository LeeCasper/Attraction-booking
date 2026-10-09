import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue';
import { areaApi, orderApi, stockApi, ticketApi, visitorApi, type MiniTicket, type StockItem } from '@/api';
import { errorText } from '@/api/request';
import { setCurrentOrderId } from '@/store/order';
import { switchTab } from '@/store/shell';
import { dayOffsetStr, hhmm, shortDate, weekdayOf } from '@/utils/format';

/**
 * 分时预约购票页：数据来自后端，交互状态本地维护。
 *
 * 与设计稿的对应关系（生成器按 id/class 把组件注进设计稿版式）：
 *   日期条 / 时段格 / 出行游客登记 / 底部待付条 —— 四个都是手写组件，见 page-bindings.mjs
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
  const dates = ref<DateOption[]>([]);
  const slots = ref<SlotOption[]>([]);
  const visitors = ref<VisitorCard[]>([]);
  const date = ref('');
  const slot = ref<number | null>(null);
  const pickedIds = ref<number[]>([]);
  const unitPrice = ref(0);
  const submitting = ref(false);

  /**
   * 每个日期的分时余票缓存。
   * 日期条要 8 天的数据，而 `/stocks` 是按「票种 + 日期」查的 —— 没有多日日历接口，
   * 只能按天各查一次；缓存下来，切日期/提交订单时就不必重复请求。
   */
  const stockByDate = new Map<string, StockItem[]>();

  async function loadStocks(d: string): Promise<StockItem[]> {
    const cached = stockByDate.get(d);
    if (cached) return cached;
    const list = await stockApi.byDate(ticketTypeId.value!, d);
    stockByDate.set(d, list);
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

  let loaded = false;
  /** 首次可见时加载；`force` 用于重试 */
  async function load(force = false) {
    if (loaded && !force) return;
    loading.value = true;
    error.value = '';
    try {
      const areas = await areaApi.list();
      const areaId = areas[0]?.id;
      if (!areaId) throw new Error('没有开放中的景区');

      const today = dayOffsetStr(0);
      const tickets = await ticketApi.list(areaId, today);
      const ticket: MiniTicket | undefined = tickets[0];
      if (!ticket) throw new Error('该景区暂无可售票种');

      ticketTypeId.value = ticket.id;
      unitPrice.value = ticket.price;

      // 日期条：今天起 N 天，逐日取余票汇总来分档
      const days = Array.from({ length: DATE_COUNT }, (_, i) => dayOffsetStr(i));
      const dayStocks = await Promise.all(days.map((d) => loadStocks(d)));
      dates.value = days.map((d, i) => {
        const total = dayStocks[i].reduce((sum, s) => sum + s.available, 0);
        return { value: d, week: weekdayOf(d), label: shortDate(d), tone: dateToneOf(total) };
      });

      // 出行人
      await refreshVisitors();

      date.value = dates.value[0]!.value;
      applySlots(dayStocks[0]!);
      loaded = true;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

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
  const canSubmit = computed(
    () => headcount.value > 0 && !!date.value && slot.value !== null && !submitting.value,
  );

  /**
   * 下单 → 模拟支付 → 切到凭证页。
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

      setCurrentOrderId(order.orderId);

      if (order.mock) {
        // 本地联调：直接触发模拟支付成功回调，省得去后台改订单状态
        await orderApi.mockPay(order.orderNo);
      }

      uni.hideLoading();
      uni.showToast({ title: '预约成功', icon: 'success' });
      // 让凭证页知道要展示这一单
      switchTab('credential');
    } catch (err) {
      uni.hideLoading();
      uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
    } finally {
      submitting.value = false;
    }
  }

  return {
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
