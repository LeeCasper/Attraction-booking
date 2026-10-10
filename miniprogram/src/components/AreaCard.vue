<script setup lang="ts">
/**
 * 景区选择页里的一张景点卡。
 *
 * class 逐字取自 `design/reference/areas.html` 经 `gen-pages.mjs` 产出的中间产物
 * （`views/area/index.vue` 里那四张 `<article>` 版式完全相同，所以整块 replace 成组件：
 * 逐个绑定文本的话同一段版式要在绑定表里写四遍）。组件内容**不过 `mapClasses`**，
 * 所以这里的类名必须是消毒后的形式（`gap-2.5` → `gap-2_5`、`bg-black/60` → `bg-black_60`）。
 *
 * **与设计稿的刻意偏离**（README 已知偏差里有记）：设计稿的角标/标签/余票/热度都是营销文案
 * （「国家 5A 级景区」「热度 98%」「余 1,420 张」「北门主闸 / 东门入」），后端没有对应字段。
 * 照抄等于替景区做承诺，所以一律换成**由真实数据推出来的**：
 *   角标一 = 景点分类（`scenic_area.category`）
 *   角标二 = 余票状态（真实余票推导，只在紧张/约满时出现）
 *   三个 tag = 分时预约（有启用时段）/ 实名制（票种 needRealname）/ 随时退（退改规则允许）
 *   余票行 = 今日真实剩余；右侧闸机名无字段，去掉
 *   起价   = 在线可售（按人计价）票种里的最低价；没有可售票种就如实说
 * 这与 `TicketCard.vue` 把首页票卡的营销角标换成 `needRealname`/`refundRule` 推导值是同一套做法。
 */
import { computed } from 'vue';
import type { AreaOverview } from '@/api';
import { fen2yuan } from '@/utils/format';
import { CATEGORIES } from '@/views/area/behavior';

const props = defineProps<{
  area: AreaOverview;
  /** 余票状态：由 behavior 的 `stockStatus()` 统一判定，避免两处口径 */
  status: 'none' | 'full' | 'tight' | 'ok';
  /** 是不是当前选中的景点 */
  active: boolean;
  /** 在列表里的序号，只用来挑兜底封面（见下） */
  index: number;
}>();

const emit = defineEmits<{ pick: [area: AreaOverview]; book: [area: AreaOverview] }>();

/**
 * 封面兜底图。
 *
 * 后端有 `cover_url` 这个字段，但**后台还没有上传入口**，现在每个景点都是 null。
 * 兜底图用的是设计稿里那 4 张示意图（已下载到 `static/images/area-cover-*.jpg`），
 * 按序号轮换 —— 全部用同一张会让列表看起来像卡住了；用首页那张 banner 更糟，
 * 那图里烤着「景区预约首页」的字。
 *
 * ⚠️ 这只是占位。后台能传封面之后，`coverUrl` 一旦有值就取代它。
 */
const FALLBACK_COVERS = [
  '/static/images/area-cover-1.jpg',
  '/static/images/area-cover-2.jpg',
  '/static/images/area-cover-3.jpg',
  '/static/images/area-cover-4.jpg',
];
const cover = computed(
  () => props.area.coverUrl || FALLBACK_COVERS[props.index % FALLBACK_COVERS.length],
);

const categoryLabel = computed(
  () => CATEGORIES.find((c) => c.id === props.area.category)?.label ?? '',
);

/**
 * 标签行：只放**后端真有字段**的规则。
 *
 * 设计稿写了三个（分时错峰预约 / 二代身份证直通 / 无接触核验），后两个没有任何字段支撑。
 * 这里只保留推得出来的两个；都没有就整行不渲染，而不是硬凑三个。
 */
const tags = computed(() => {
  const out: { text: string; primary?: boolean }[] = [];
  if (props.area.hasSlots) out.push({ text: '分时预约', primary: true });
  if (props.area.needRealname) out.push({ text: '实名制' });
  return out;
});

const stockText = computed(() => {
  const n = props.area.remaining;
  switch (props.status) {
    case 'none':
      return '暂无可售票种';
    case 'full':
      return '今日已约满';
    case 'tight':
      return `余票紧张 (仅剩 ${n} 张)`;
    default:
      return `今日余票充裕 (余 ${n} 张)`;
  }
});

const priceLabel = computed(() =>
  props.area.minPrice === null ? '' : `¥${fen2yuan(props.area.minPrice)}`,
);

/** class 常量必须声明在 `<script setup>` 里才进得了模板 */
const CARD =
  'bg-paper-surface rounded-xl overflow-hidden shadow-sm flex flex-col transition-all';
const CARD_ON = ' ring-2 ring-primary_30';
const COVER_WRAP = 'relative w-full h-40';
const OVERLAY = 'absolute inset-0 bg-gradient-to-t from-black_60 via-transparent to-black_20';
const BADGES = 'absolute top-2_5 left-2_5 flex items-center gap-1_5';
const BADGE_CAT =
  'bg-deep-teal-800_90 text-on-primary font-caption-sm text-caption-sm px-2_5 py-0_5 rounded-full backdrop-blur-sm';
const BADGE_WARN =
  'bg-amber-gold text-white font-caption-sm text-caption-sm px-2 py-0_5 rounded-full backdrop-blur-sm flex items-center gap-0_5';
const BADGE_FULL =
  'bg-cinnabar-red_90 text-white font-caption-sm text-caption-sm px-2 py-0_5 rounded-full backdrop-blur-sm flex items-center gap-0_5';
const TITLE_WRAP = 'absolute bottom-2 left-3 right-3 flex justify-between items-end text-white';
const TITLE = 'font-headline-md text-headline-md font-semibold drop-shadow-sm text-white';
const SUBTITLE = 'font-caption-sm text-caption-sm text-bamboo-light-100 drop-shadow-sm';
const BODY = 'p-3_5 flex flex-col gap-2_5';
const TAGS = 'flex flex-wrap items-center gap-1_5';
const TAG_PRIMARY = 'bg-surface-container px-2 py-0_5 rounded text-primary font-caption-sm text-caption-sm';
const TAG_MUTED =
  'bg-surface-container px-2 py-0_5 rounded text-ink-charcoal-text font-caption-sm text-caption-sm';
const STOCK_OK = 'bg-surface-container-low rounded-lg p-2 flex items-center justify-between text-body-sm';
const STOCK_TIGHT = 'bg-tertiary-fixed_40 rounded-lg p-2 flex items-center justify-between text-body-sm';
const DOT_OK = 'w-2 h-2 rounded-full bg-emerald-pass';
const DOT_TIGHT = 'w-2 h-2 rounded-full bg-amber-gold animate-ping';
const STOCK_TEXT = 'font-caption-sm text-caption-sm text-ink-dark-gray truncate';
const STOCK_TEXT_TIGHT = 'font-caption-sm text-caption-sm text-tertiary font-medium truncate';
const PRICE_ROW = 'flex items-center justify-between pt-1';
const PRICE_LABEL = 'font-caption-sm text-caption-sm text-ink-light-gray';
const PRICE = 'font-data-metric-lg text-data-metric-lg text-primary font-bold ml-1';
const BOOK_BTN =
  'bg-primary text-on-primary px-5 py-2 rounded-full font-label-badge text-label-badge shadow-sm transition-colors flex items-center gap-1';

/**
 * 条件类写成函数/常量，**不能在模板里写 `cond ? 'a' : 'b'`** ——
 * `check:classes` 会把 `:class` 表达式里带引号的串当类名扫，于是报「没有出处的 class」。
 * 同理 `:class="f(status === 'tight')"` 也会把 `'tight'` 当成类名，所以状态先算成布尔。
 */
const isTight = computed(() => props.status === 'tight');

const cardClass = (active: boolean) => CARD + (active ? CARD_ON : '');
const stockClass = (tight: boolean) => (tight ? STOCK_TIGHT : STOCK_OK);
const dotClass = (tight: boolean) => (tight ? DOT_TIGHT : DOT_OK);
const stockTextClass = (tight: boolean) => (tight ? STOCK_TEXT_TIGHT : STOCK_TEXT);
const tagClass = (primary: boolean | undefined) => (primary ? TAG_PRIMARY : TAG_MUTED);
</script>

<template>
  <view :class="cardClass(props.active)" hover-class="pg-hover" @tap="emit('pick', props.area)">
    <view :class="COVER_WRAP">
      <image class="w-full h-full object-cover" :src="cover" mode="aspectFill" />
      <view :class="OVERLAY" />

      <view :class="BADGES">
        <text v-if="categoryLabel" :class="BADGE_CAT">{{ categoryLabel }}</text>
        <text v-if="props.status === 'tight'" :class="BADGE_WARN">
          <view class="msi icon-alarm text-12px" /> 余票紧张
        </text>
        <text v-else-if="props.status === 'full'" :class="BADGE_FULL">
          <view class="msi icon-alarm text-12px" /> 今日约满
        </text>
      </view>

      <view :class="TITLE_WRAP">
        <view>
          <view :class="TITLE">
            <text>{{ props.area.name }}</text>
          </view>
          <view v-if="props.area.openTime" :class="SUBTITLE">
            <text>开放时间 {{ props.area.openTime }}</text>
          </view>
        </view>
      </view>
    </view>

    <view :class="BODY">
      <view v-if="tags.length" :class="TAGS">
        <text v-for="t in tags" :key="t.text" :class="tagClass(t.primary)">{{ t.text }}</text>
      </view>

      <view :class="stockClass(isTight)">
        <view class="flex items-center gap-1_5 min-w-0">
          <text :class="dotClass(isTight)" />
          <text :class="stockTextClass(isTight)">{{ stockText }}</text>
        </view>
      </view>

      <view :class="PRICE_ROW">
        <view>
          <template v-if="priceLabel">
            <text :class="PRICE_LABEL">门票起价</text>
            <text :class="PRICE">{{ priceLabel }}</text>
            <text :class="PRICE_LABEL">起</text>
          </template>
          <text v-else :class="PRICE_LABEL">暂无可售票种</text>
        </view>
        <!-- 按钮单独处理：点整卡是「选中并返回」，点它是「选中并去预约」 -->
        <view :class="BOOK_BTN" hover-class="pg-hover" @tap.stop="emit('book', props.area)">
          <text>去预约</text>
          <view class="msi icon-chevron_right text-16px" />
        </view>
      </view>
    </view>
  </view>
</template>
