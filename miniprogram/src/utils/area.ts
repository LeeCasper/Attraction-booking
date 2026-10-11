/**
 * 景点展示口径 —— 三处页面共用，**只此一份**，避免同一件事写出三种说法。
 *
 * 为什么要把它们从 `views/area/behavior.ts` 里抽出来：本轮首页也要展示景点
 * （轮播图 + 推荐景点），而「起价 / 余票状态 / 承载档位 / 分类名 / 封面兜底图」
 * 这几样在「景点选择」页早就有了一套口径。复制一份到首页去是最省事的，
 * 但两个页面迟早会漂移（改了一处阈值、另一处不同步，用户看到两个数字打架）。
 *
 * 全是**纯函数/常量**，不碰响应式状态，所以放 utils 而不是某个 behavior 里 ——
 * behavior 是视图的私有状态，跨视图复用的是这层口径。
 */
import { mediaUrl, type AreaOverview } from '@/api';

/** 景点选择页的分类 tab（含前端概念 `all`），口径必须与后端 `scenic_area.category` 的枚举一致 */
export interface CategoryOption {
  id: string;
  label: string;
}

export const CATEGORIES: CategoryOption[] = [
  { id: 'all', label: '全部景点' },
  { id: 'main', label: '主景区' },
  { id: 'nature', label: '自然风光' },
  { id: 'culture', label: '历史人文' },
  { id: 'cable', label: '索道缆车' },
  { id: 'night', label: '夜游演艺' },
];

/** 今日余票低于这个数算「紧张」。购票页的日期条用的是同一个口径 */
export const TIGHT_THRESHOLD = 50;

/**
 * 封面兜底图。
 *
 * `scenic_area.cover_url` 为空时没有图可显示（后台上传入口已有，但不是每个景点都传过）。
 * 用设计稿里那 4 张示意图按序号轮换 —— 全部用同一张会让列表看起来像卡住了；
 * 用首页那张 banner 更糟，那图里烤着「景区预约首页」的字。
 *
 * ⚠️ 只是占位：`coverUrl` 一旦有值就取代它。后台上传的封面存的是**相对路径**，
 * 必须经 `mediaUrl()` 拼成完整地址，否则 `<image>` 会静默空着。
 */
const FALLBACK_COVERS = [
  '/static/images/area-cover-1.jpg',
  '/static/images/area-cover-2.jpg',
  '/static/images/area-cover-3.jpg',
  '/static/images/area-cover-4.jpg',
];

/** 景点封面（完整地址）；没配封面就按 `index` 返回一张兜底图 */
export function areaCoverOf(area: { coverUrl: string | null }, index: number): string {
  return mediaUrl(area.coverUrl) || FALLBACK_COVERS[index % FALLBACK_COVERS.length]!;
}

/** 卡片上的余票档位：无可售票种 / 约满 / 紧张 / 充足 */
export type StockStatus = 'none' | 'full' | 'tight' | 'ok';

/**
 * 余票档位。`none` 与 `full` 是两件事：前者是「这个景点没有在线可售票种」，
 * 后者是「有票种但今天约满了」—— 混成一句会让用户以为景点关了。
 */
export function areaStockStatus(a: AreaOverview): StockStatus {
  if (!a.hasSlots || a.minPrice === null) return 'none';
  if (a.remaining <= 0) return 'full';
  if (a.remaining < TIGHT_THRESHOLD) return 'tight';
  return 'ok';
}

/** 承载档位（在园率分档）。阈值 0.5 / 0.8 与后台看板的承载预警口径一致 */
export type CapacityTone = 'comfortable' | 'busy' | 'crowded';

export function capacityTone(rate: number): CapacityTone {
  if (rate < 0.5) return 'comfortable';
  if (rate < 0.8) return 'busy';
  return 'crowded';
}

/** 景点选择页横幅上的说法：当前承载**舒适** (28%) */
export const CAPACITY_LABEL: Record<CapacityTone, string> = {
  comfortable: '舒适',
  busy: '较忙',
  crowded: '拥挤',
};

/** 首页 banner 状态胶囊上的说法：开园中 · **舒适畅通** */
export const CAPACITY_BANNER_LABEL: Record<CapacityTone, string> = {
  comfortable: '舒适畅通',
  busy: '较为繁忙',
  crowded: '接近饱和',
};
