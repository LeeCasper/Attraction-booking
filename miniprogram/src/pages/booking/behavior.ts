import { getCurrentInstance, onMounted, reactive, ref } from 'vue';

/**
 * 分时预约购票页的行为。
 *
 * 本阶段只做**纯视觉动效**：日期横向滚动时两端渐隐遮罩的显隐。
 * 选日期 / 选时段 / 勾选游客属于交互状态，需要重新组织数据结构，留到下一阶段
 * （对应设计稿预留的 `slotGrid` id）。
 *
 * 设计稿把日期条写成 `overflow-x-auto` 的 div —— 小程序里普通 view 的横向滚动
 * 不可靠，故生成器按 id 把它改成了 `<scroll-view scroll-x>`。
 */
const EDGE_THRESHOLD = 4;

interface ScrollDetail {
  scrollLeft?: number;
  scrollWidth?: number;
}

export function useBookingPage() {
  /** 两端遮罩是否可见 */
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

  return { dateFade, onDateScroll };
}
