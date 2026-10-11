<script setup lang="ts">
/**
 * 景点分类条（设计稿 `#categoryTabs`）—— 本轮**重做了外观**，参考同一套设计里的
 * 「游览日期」那一条（`booking.html` 的 `#calendarScroll`）。
 *
 * 为什么必须重做（两条都是真机上才暴露的）：
 *   ① 设计稿画的是**普通 `<view>` + `overflow-x-auto`** 的一排胶囊，而小程序里普通 view 的
 *      `overflow-x` **不能可靠滚动** —— 表现是最后一个分类（索道缆车）被切掉、还滑不动，
 *      看着像页面坏了。横向滚动只能用 `<scroll-view>`（购票页的日期条踩过同一个坑）
 *   ② 一条会被切掉的横排**必须给出「右边还有」的信号**，否则用户不知道能滑
 *
 * 于是照搬日期条那套已经在真机上验证过的做法：
 *   - `<scroll-view scroll-x>`，**内边距与吸附放在滚动容器上**（放内容上会被吸附滚掉，
 *     第一张卡贴屏幕边），`scroll-padding-*` 让吸附点从内边距之后起算
 *   - 两端渐隐遮罩，滚到哪一端就隐藏哪一端（`@scroll` 里算）
 *   - 外观向日期卡看齐：**未选 = 白卡描边 + `shadow-xs`**、**选中 = 青绿渐变**（不是原来那排
 *     灰底胶囊）。**单行**：只有分类名 —— 曾试过第二行放「N 个景点」，读着啰嗦，去掉了
 *     （数量在「筛选」弹层里更合适：一行一个分类，数字一目了然）
 *
 * ⚠️ 组件自带**负外边距**把整条拉成全屏宽（设计稿也是这么做的：`-mx-margin px-margin`）——
 * 内边距那一半挪到了 `<scroll-view>` 上，两端遮罩才能贴着屏幕边。
 * 类名逐字取自设计稿（含 `booking.html` 的日期卡），已消毒 —— 见 `check:classes` 的口径。
 */
import { getCurrentInstance, onMounted, reactive, ref } from 'vue';
import type { CategoryOption } from '@/utils/area';

const props = defineProps<{ items: CategoryOption[]; value: string }>();
const emit = defineEmits<{ change: [id: string] }>();

// —— 两端渐隐（与购票页日期条同一套；判断「还能不能滚」需要先量出可视宽度）——
const fade = reactive({ left: false, right: true });
/** 判定「已经贴到边上」的容差，与购票页的 `EDGE_THRESHOLD` 同值 */
const EDGE = 4;
const viewportWidth = ref(0);

onMounted(() => {
  // ⚠️ `getCurrentInstance()` 必须在**同步**的 setup/生命周期里取（不能挪进回调）
  const instance = getCurrentInstance();
  uni
    .createSelectorQuery()
    .in(instance?.proxy as never)
    .select('.pg-cat-scroll')
    .boundingClientRect((rect) => {
      if (rect && !Array.isArray(rect)) viewportWidth.value = rect.width ?? 0;
    })
    .exec();
});

function onScroll(e: { detail?: { scrollLeft?: number; scrollWidth?: number } }) {
  const scrollLeft = e.detail?.scrollLeft ?? 0;
  const scrollWidth = e.detail?.scrollWidth ?? 0;
  fade.left = scrollLeft > EDGE;
  // 还没量到宽度时保持默认（右边有内容）—— 与日期条同款，宁可多显示一个遮罩
  fade.right = viewportWidth.value ? scrollLeft < scrollWidth - viewportWidth.value - EDGE : true;
}

// —— class 常量（条件类必须走标识符：`check:classes` 会把模板三目里的引号串当类名扫）——
const WRAP = 'relative -mx-margin';
const SCROLLER = 'w-full pg-cat-scroll';
const ROW = 'flex items-center gap-2_5';
const FADE_BASE = 'pointer-events-none absolute top-0 bottom-0 z-10 transition-opacity duration-200';
const FADE_LEFT = `${FADE_BASE} left-0 w-6 bg-gradient-to-r from-surface to-transparent`;
const FADE_RIGHT = `${FADE_BASE} right-0 w-8 bg-gradient-to-l from-surface to-transparent`;

const CARD_BASE =
  'shrink-0 snap-start flex items-center justify-center px-3_5 py-2 rounded-xl border shadow-xs transition-all select-none cursor-pointer';
/** 选中：与日期卡的选中态同一套（青绿渐变 + 描边 + 同一条阴影） */
const CARD_ON = 'border-primary bg-gradient-to-b from-primary to-deep-teal-800 text-on-primary shadow-0_2px_8px_rgba0104950_22';
/** 未选：日期卡的未选态（白卡 + 描边） */
const CARD_OFF = 'border-silk-border bg-paper-surface text-ink-charcoal-text';
const LABEL = 'text-13px font-semibold';

const isOn = (item: CategoryOption) => item.id === props.value;
const cardClass = (item: CategoryOption) => `${CARD_BASE} ${isOn(item) ? CARD_ON : CARD_OFF}`;
</script>

<template>
  <view :class="WRAP">
    <view id="catFadeLeft" :class="FADE_LEFT" :style="{ opacity: fade.left ? 0.9 : 0 }" />
    <view id="catFadeRight" :class="FADE_RIGHT" :style="{ opacity: fade.right ? 0.9 : 0 }" />

    <scroll-view
      :class="SCROLLER"
      scroll-x="true"
      :show-scrollbar="false"
      style="scroll-behavior: smooth"
      @scroll="onScroll"
    >
      <view :class="ROW">
        <view
          v-for="item in props.items"
          :key="item.id"
          :class="cardClass(item)"
          :hover-class="isOn(item) ? 'pg-hover' : 'active-scale-95 pg-hover'"
          @tap="emit('change', item.id)"
        >
          <text :class="LABEL">{{ item.label }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
/*
  三条都是刻意的，与购票页的 `.pg-date-scroll` 同源（那边的注解更详细）：
   1. `padding` 放在**滚动容器**上 —— 放内容上会被吸附滚掉（第一张卡贴屏幕边）
   2. `scroll-padding-*` 让吸附点从这道内边距之后开始算（滚动端口是 padding box、不含 padding）
   3. `proximity` 而不是 `mandatory`：静止时不会强行把第一张卡吸到贴边
  数值与日期条一致（16px 左右内边距、8px 上下），两条横排的卡片边缘因此是对齐的。
*/
.pg-cat-scroll {
  padding: 15.38rpx 30.77rpx;
  scroll-padding-left: 30.77rpx;
  scroll-padding-right: 30.77rpx;
  scroll-snap-type: x proximity;
}
</style>
