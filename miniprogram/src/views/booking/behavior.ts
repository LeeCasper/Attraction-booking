import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue';

/**
 * 分时预约购票页的行为与数据。
 *
 * 日期 / 时段 / 游客的**默认值全部取自设计稿原文**（10-09 选中、08:30-10:30 选中、张*林 1 人），
 * 所以首屏与设计稿逐像素一致；改动只发生在用户点了之后。
 * Phase ③ 接接口时把这些常量换成 /api/mini/* 的返回即可，组件与交互逻辑不用动。
 *
 * 日期条的横向滚动渐隐是本页的纯视觉动效（Phase ①），逻辑一并放这里。
 */
const EDGE_THRESHOLD = 4;

/** 设计稿「成人全票 ¥120」 */
const UNIT_PRICE = 120;
/** 设计稿「限购 5 人」 */
export const MAX_VISITORS = 5;

export type DateTone = 'ok' | 'tight' | 'full';
export type SlotTone = 'ok' | 'tight';

export interface DateOption {
  value: string;
  week: string;
  label: string;
  tone: DateTone;
}
export interface SlotOption {
  id: string;
  range: string;
  left: number;
  tone: SlotTone;
}
export interface Visitor {
  id: string;
  name: string;
  /** 主出行人 / 同行 … */
  badge: string;
  idCard: string;
  phone: string;
}

/** 设计稿的 8 天（10-09 为默认选中项） */
const DATES: DateOption[] = [
  { value: '2026-10-09', week: '周一', label: '10-09', tone: 'ok' },
  { value: '2026-10-10', week: '周二', label: '10-10', tone: 'ok' },
  { value: '2026-10-11', week: '周三', label: '10-11', tone: 'tight' },
  { value: '2026-10-12', week: '周四', label: '10-12', tone: 'ok' },
  { value: '2026-10-13', week: '周五', label: '10-13', tone: 'tight' },
  { value: '2026-10-14', week: '周六', label: '10-14', tone: 'full' },
  { value: '2026-10-15', week: '周日', label: '10-15', tone: 'ok' },
  { value: '2026-10-16', week: '周一', label: '10-16', tone: 'ok' },
];

/** 设计稿的 4 个时段（08:30-10:30 为默认选中项） */
const SLOTS: SlotOption[] = [
  { id: 's1', range: '08:30 - 10:30', left: 320, tone: 'ok' },
  { id: 's2', range: '10:30 - 12:30', left: 45, tone: 'tight' },
  { id: 's3', range: '12:30 - 14:30', left: 180, tone: 'ok' },
  { id: 's4', range: '14:30 - 16:30', left: 210, tone: 'ok' },
];

/** 设计稿只画了「张*林」一位游客，默认就只列他一个 */
const BASE_VISITORS: Visitor[] = [
  { id: 'v1', name: '张*林', badge: '主出行人', idCard: '身份证 330106********1812', phone: '手机 138****8820' },
];

/**
 * 「新增出行人」按这个模板造一个。
 * 名字沿用设计稿个人中心页里已有的「李*华」（同行），避免自己臆造新文案。
 */
const EXTRA_VISITOR: Omit<Visitor, 'id'> = {
  name: '李*华',
  badge: '同行',
  idCard: '身份证 330106********0943',
  phone: '手机 139****6612',
};

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

  // —— 选日期 / 选时段 / 选游客 ——
  const dates = ref(DATES);
  const slots = ref(SLOTS);
  const visitors = ref<Visitor[]>([...BASE_VISITORS]);

  const date = ref(DATES[0].value);
  const slot = ref(SLOTS[0].id);
  const pickedIds = ref<string[]>([BASE_VISITORS[0].id]);

  const onPickDate = (value: string) => (date.value = value);
  const onPickSlot = (id: string) => (slot.value = id);

  function onToggleVisitor(id: string) {
    const at = pickedIds.value.indexOf(id);
    if (at >= 0) pickedIds.value.splice(at, 1);
    else if (pickedIds.value.length >= MAX_VISITORS) {
      uni.showToast({ title: `最多可选 ${MAX_VISITORS} 人`, icon: 'none' });
      return;
    } else pickedIds.value.push(id);
  }

  let extraSeq = BASE_VISITORS.length;
  function onAddVisitor() {
    if (visitors.value.length >= MAX_VISITORS) {
      uni.showToast({ title: `最多添加 ${MAX_VISITORS} 人`, icon: 'none' });
      return;
    }
    const added: Visitor = { ...EXTRA_VISITOR, id: `v${++extraSeq}` };
    visitors.value.push(added);
    pickedIds.value.push(added.id);
  }

  // —— 底部待付条联动 ——
  const headcount = computed(() => pickedIds.value.length);
  const unitPrice = UNIT_PRICE;
  const totalAmount = computed(() => unitPrice * headcount.value);
  const selectionLabel = computed(() => `已选 ${headcount.value} 人 / 限购 ${MAX_VISITORS} 人`);
  const canSubmit = computed(() => headcount.value > 0);

  function onSubmit() {
    if (!canSubmit.value) return;
    uni.showToast({ title: `下单接口待接入 · ¥${totalAmount.value}`, icon: 'none' });
  }

  return {
    dateFade,
    onDateScroll,
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
  };
}
