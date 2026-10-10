import { computed, ref } from 'vue';
import { areaApi, type AreaOverview } from '@/api';
import { errorText } from '@/api/request';
import { platformSettings } from '@/store/settings';
import { currentAreaId, setCurrentArea } from '@/store/shell';

/**
 * 景区选择页（设计稿叫「景点选择与预约」）。
 *
 * ⚠️ 页面**版式由生成器产出**（`scripts/gen-pages.mjs` 的 `standalone` 模式，
 * 源稿 `design/reference/areas.html`）—— 不要手改 `views/area/index.vue`，会被下次
 * `npm run gen:pages` 覆盖。这里只放行为：取数、搜索、分类筛选、选中/去预约。
 *
 * 与设计稿的**刻意偏离**（详见 README 已知偏差）：
 *   - 卡片的两个角标、三个 tag、余票文案、起价全部换成**真实数据**（设计稿那些
 *     「热度 98%」「国家 5A 级景区」「余 1,420 张」后端没有对应字段，照抄等于编造）
 *   - 「全景套票 ¥260」整块去掉（后端没有套票概念）
 *   - 页脚「服务时间」去掉；「客服热线」改读平台信息，没配就整行隐藏
 *   - 设计稿自带的固定 header（含 88px 假胶囊）不输出 —— 真机上微信会渲染真胶囊，
 *     必然重叠。改为文档流里的标题栏 + 状态栏占位 + 胶囊内边距，与其余二级页一致
 */

export interface CategoryOption {
  id: string;
  label: string;
}

/**
 * 分类口径必须与后端 `scenic_area.category` 的枚举一致
 * （`main` / `nature` / `culture` / `cable` / `night`），`all` 是前端的概念。
 */
export const CATEGORIES: CategoryOption[] = [
  { id: 'all', label: '全部景点' },
  { id: 'main', label: '主景区' },
  { id: 'nature', label: '自然风光' },
  { id: 'culture', label: '历史人文' },
  { id: 'cable', label: '索道缆车' },
  { id: 'night', label: '夜游演艺' },
];

export interface FilterSheetOption extends CategoryOption {
  count: number;
}

/** 余票低于这个数算「紧张」（口径与购票页的 `TIGHT_THRESHOLD` 保持一致） */
const TIGHT_THRESHOLD = 50;

export function useAreaPage() {
  const loading = ref(false);
  const error = ref('');
  const areas = ref<AreaOverview[]>([]);
  /** 全部景点的承载汇总，供顶部横幅用 */
  const summary = ref<{ current: number; maxCapacity: number; capacityRate: number } | null>(null);

  const keyword = ref('');
  const category = ref('all');
  const filterVisible = ref(false);

  const onPickCategory = (id: string) => {
    category.value = id;
    filterVisible.value = false;
  };

  /**
   * 列表 = 分类 ∩ 搜索词。
   *
   * 后端没有搜索接口，也不想为一个下拉列表做分页 —— 景点数量在几百以内，
   * `overview` 一次性取回后本地过滤即可。
   */
  const filteredAreas = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    return areas.value.filter((a) => {
      if (category.value !== 'all' && a.category !== category.value) return false;
      if (!kw) return true;
      return a.name.toLowerCase().includes(kw) || (a.intro ?? '').toLowerCase().includes(kw);
    });
  });

  /** 弹层里每个分类还剩下多少（用真实数据，不是设计稿的固定 6 项） */
  const filterOptions = computed<FilterSheetOption[]>(() =>
    CATEGORIES.map((c) => ({
      ...c,
      count: c.id === 'all' ? areas.value.length : areas.value.filter((a) => a.category === c.id).length,
    })),
  );

  /** 「当前承载舒适 (28%)」——全部开放景点汇总，口径与后台看板「全部景区」一致 */
  const presenceLabel = computed(() => {
    const s = summary.value;
    if (!s || s.maxCapacity <= 0) return '承载数据待接入';
    const pct = Math.round(s.capacityRate * 100);
    const tone = s.capacityRate < 0.5 ? '舒适' : s.capacityRate < 0.8 ? '较忙' : '拥挤';
    return `当前承载${tone} (${pct}%)`;
  });

  /** 页脚客服热线。平台信息里没配电话就整行不显示 —— 不留一个「客服热线：」的空壳 */
  const contactLine = computed(() => {
    const phone = platformSettings.value.contactPhone;
    return phone ? `客服热线：${phone}` : '';
  });

  /** 卡片的余票状态（真实余票推导，取代设计稿写死的「热度 98%」之类） */
  const stockStatus = (a: AreaOverview): 'none' | 'full' | 'tight' | 'ok' => {
    if (!a.hasSlots || a.minPrice === null) return 'none';
    if (a.remaining <= 0) return 'full';
    if (a.remaining < TIGHT_THRESHOLD) return 'tight';
    return 'ok';
  };

  /**
   * 当前选中的是不是它。
   *
   * `currentAreaId === null` 时**列表第一个算默认** —— 与首页/购票页的回落口径一致，
   * 否则用户没选过时六张卡都不高亮，看起来像「一个都没选中」。
   */
  const isActive = (a: AreaOverview) =>
    currentAreaId.value === null ? filteredAreas.value[0]?.id === a.id : currentAreaId.value === a.id;

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      const res = await areaApi.overview();
      areas.value = res.areas;
      summary.value = res.summary;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 选中某个景点。
   *
   * 两个动作都落在这里，区别只是走不走购票页 —— 设计稿只画了「去预约」，
   * 但只想换个景点（还没打算买票）的用户也需要一条路。
   *
   * ⚠️ 本页是外壳的**根 tab**，所以两条路径都**不 `navigateBack`**：
   * 整卡点击只是选中并留在这一页；「去预约」是 `navigateTo` 压一张购票页上去，
   * 从购票页返回时回到的正是这里。
   */
  function pick(a: AreaOverview, goBooking: boolean) {
    setCurrentArea(a.id);
    if (goBooking) {
      uni.navigateTo({ url: '/pages/booking/index' });
      return;
    }
    uni.showToast({ title: `已切换到${a.name}`, icon: 'none', duration: 1200 });
  }

  const onPickArea = (a: AreaOverview) => pick(a, false);
  const onBook = (a: AreaOverview) => pick(a, true);
  const openFilter = () => (filterVisible.value = true);
  const closeFilter = () => (filterVisible.value = false);

  /** 弹层里选中项的样式。条件类走常量标识符，见 `check:classes` 的口径 */
  const FILTER_ITEM = 'text-15px text-ink-charcoal-text';
  const FILTER_ITEM_ON = 'text-15px font-semibold text-primary';
  const filterItemClass = (on: boolean) => (on ? FILTER_ITEM_ON : FILTER_ITEM);

  return {
    loading,
    error,
    keyword,
    category,
    categories: CATEGORIES,
    filterVisible,
    filterOptions,
    filteredAreas,
    presenceLabel,
    contactLine,
    /** 当前默认选中的景点（`null` = 还没选过，列表第一个算默认，与各视图的回落一致） */
    currentAreaId,
    stockStatus,
    isActive,
    onPickCategory,
    openFilter,
    closeFilter,
    onPickArea,
    onBook,
    filterItemClass,
    load,
  };
}
