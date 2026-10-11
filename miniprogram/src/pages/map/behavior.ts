import { computed, ref } from 'vue';

/**
 * 「景区地图与景点」—— 首页「便民服务 → 景区地图」进来的二级页。
 *
 * 对应 Stitch 屏 `987a340983404a88920be442d9e67991`（「景区地图与景点 (青绿简约版)」，
 * 设计稿 `design/reference/map.html`）。
 *
 * ⚠️ **这一页的内容全部是静态的**（照设计稿原样保留）—— 后端没有点位模型：
 * 既没有「栈道 / 峡谷 / 索道 / 夜游」这些**点位**，也没有**点位级**的客流、排队时长与余票。
 * 后端有的是「景点」（`scenic_area`）与**景点级**的在园率 —— 那是另一回事：
 * 把景点级的数字填到点位上就是编数据（同「首页 banner 的天气」「个人中心的门禁凭证状态」，
 * 见 README 的「仍是静态」清单）。
 *
 * 真接数据要等后端有：点位表（名称 / 分类 / 缩略图 / 指标）+ 点位级实时客流。
 * 在那之前，本页唯一**真的有行为**的是顶部的分类筛选（纯前端过滤）与两个如实提示的按钮。
 *
 * 这一版的族名（`font-serif-cn` / `font-sans-cn` / `font-num`）与配色
 * （`bamboo-teal` / `paper-pure` / `ink-subtle`…）来自「青绿简约版」那套设计系统，
 * 与其余页面用的典雅版并存 —— token 见 `styles/tokens.scss`，
 * 三个族名在 `gen-utilities.mjs` 里都指向我们的两套字体（**全站只有两套**，见 CLAUDE.md 18）。
 */

/**
 * 点位指标行：设计稿每行都是「图标 + 一句带加粗数字的话」。
 *
 * ⚠️ `pre` 末尾 / `post` 开头的**空格是设计稿就有的**（`索道排队约 <strong>8</strong> 分钟`），
 * 必须写在字符串里：小程序会丢掉标签之间的空白，而插值里的空格是真的（写了才在真机上留得住）。
 */
export interface PoiMetric {
  /** msi 图标名 */
  icon: string;
  /** 加粗数字**之前**的文字 */
  pre: string;
  /** 要加粗的那一截（数字 / 时间） */
  strong?: string;
  /** 加粗数字**之后**的文字 */
  post?: string;
  /** `warn` = 琥珀色（索道那行的「今日索道余票」） */
  tone?: 'warn';
}

export interface Poi {
  id: string;
  name: string;
  subtitle: string;
  /** `/static/images/poi-N.jpg`（设计稿那 4 张图，缩到 240×240 收进包里） */
  image: string;
  /** 图左上角那枚角标 */
  badge: string;
  badgeTone: 'ink' | 'warn';
  /** 标题右侧那枚胶囊 */
  status: string;
  statusTone: 'ok' | 'warn';
  metrics: PoiMetric[];
  /** 属于哪个筛选分类（`all` 不参与） */
  category: string;
}

/** 顶部分类胶囊 —— 设计稿是 5 个，「全部景点」+ 4 个分类各对应下面的一张卡 */
export interface PoiCategory {
  id: string;
  label: string;
}

export const POI_CATEGORIES: PoiCategory[] = [
  { id: 'all', label: '全部景点' },
  { id: 'core', label: '核心栈道' },
  { id: 'water', label: '清凉亲水' },
  { id: 'cable', label: '索道缆车' },
  { id: 'night', label: '夜游演艺' },
];

/** 设计稿的 4 张点位卡，逐字照抄（文案、数字、图标都是稿子里的） */
export const POIS: Poi[] = [
  {
    id: 'boardwalk',
    name: '云巅高空栈道',
    subtitle: '全长2.8km · 绝壁云海亲水环线',
    image: '/static/images/poi-1.jpg',
    badge: '5A核心',
    badgeTone: 'ink',
    status: '客流 42% · 舒适',
    statusTone: 'ok',
    category: 'core',
    metrics: [
      { icon: 'hourglass_top', pre: '索道排队约 ', strong: '8', post: ' 分钟' },
      { icon: 'sensor_door', pre: '北门01-08号翼闸 (0.3s极速过闸)' },
    ],
  },
  {
    id: 'canyon',
    name: '青翠峡谷·飞瀑叠翠',
    subtitle: '负氧离子清心区 · 溪流奇石浅滩',
    image: '/static/images/poi-2.jpg',
    badge: '清凉亲水',
    badgeTone: 'ink',
    status: '客流 28% · 畅通',
    statusTone: 'ok',
    category: 'water',
    metrics: [
      { icon: 'directions_walk', pre: '核心观瀑点步行约 ', strong: '15', post: ' 分钟' },
      { icon: 'meeting_room', pre: '西峡谷闸机群直接刷码入园' },
    ],
  },
  {
    id: 'cableway',
    name: '云顶天池·全景双程索道',
    subtitle: '海拔1420m · 360°云海观景台',
    image: '/static/images/poi-3.jpg',
    badge: '索道联运',
    badgeTone: 'warn',
    status: '限流管控中',
    statusTone: 'warn',
    category: 'cable',
    metrics: [
      { icon: 'confirmation_number', pre: '今日索道余票 ', strong: '45', post: ' 张', tone: 'warn' },
      { icon: 'airline_stops', pre: '就近索道下站闸机联动核验' },
    ],
  },
  {
    id: 'night',
    name: '枫林夜游·森林光影秀',
    subtitle: '非遗水灯 · 沉浸式全息夜光步道',
    image: '/static/images/poi-4.jpg',
    badge: '夜游限定',
    badgeTone: 'ink',
    status: '18:30开放',
    statusTone: 'ok',
    category: 'night',
    metrics: [
      { icon: 'schedule', pre: '入园时间 ', strong: '18:30 - 21:30' },
      { icon: 'nightlight', pre: '南门夜游专道闸机检验通关' },
    ],
  },
];

/** 自绘标题栏那一行的高度（与设计稿的 `h-12` 一致）——筛选条的 sticky 偏移要减它 */
const HEADER_BAR_HEIGHT = 48;

export function useMapPage() {
  /** 状态栏高度用**真实 px**（设备物理量，不随屏宽缩放）：二级页不走外壳，得自己让位 */
  const statusBarHeight = ref(0);
  /** 胶囊左侧到屏幕右边的距离，作为标题栏右内边距 */
  const capsuleInset = ref(0);

  type WindowMetrics = { statusBarHeight?: number; windowWidth: number };
  const win: WindowMetrics =
    (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();
  statusBarHeight.value = win.statusBarHeight ?? 0;

  // #ifdef MP-WEIXIN
  const rect = uni.getMenuButtonBoundingClientRect();
  if (rect && rect.width > 0) capsuleInset.value = win.windowWidth - rect.left + 8;
  // #endif

  /**
   * 标题栏整条的高度（状态栏 + 48px 标题行）。
   *
   * ⚠️ 标题栏是**固定**的（`position: fixed`，见 `page-bindings` 的 style），
   * 所以页面正文要自己用一个等高占位块让位（外壳的 `PageHeader` 也是这么做的）。
   * 两个用途：占位块的高度、以及下面筛选条吸顶的偏移 —— 必须同源，不然吸顶时会错位。
   */
  const headerHeight = computed(() => statusBarHeight.value + HEADER_BAR_HEIGHT);

  /**
   * 筛选条吸顶时的 `top`。
   *
   * 设计稿写的是 `top-[calc(3rem+env(safe-area-inset-top,0px))]` —— 那个类在本工程里被**有意丢弃**
   * （见 `gen-utilities.mjs` 的 INTENTIONAL_DROP：`env(safe-area-inset-top)` 在小程序 WXSS 里没有），
   * 所以偏移量在这里按真实状态栏高度算：标题栏多高，就吸在它下面。
   */
  const chipsTop = computed(() => `${headerHeight.value}px`);

  const category = ref('all');
  const onPickCategory = (id: string) => {
    category.value = id;
  };

  const shownPois = computed(() =>
    category.value === 'all' ? POIS : POIS.filter((p) => p.category === category.value),
  );

  /** 胶囊样式：选中 = 实心竹青，未选中 = 白底描边（逐字取自设计稿那段内联 JS 的两个 className） */
  const CHIP_BASE = 'px-3_5 py-1_5 rounded-pill text-13px font-medium shrink-0 transition-all';
  const CHIP_ON = `${CHIP_BASE} bg-bamboo-teal text-white shadow-xs`;
  const CHIP_OFF = `${CHIP_BASE} bg-paper-pure text-ink-subtle border border-silk-border`;
  const chipClass = (id: string) => (id === category.value ? CHIP_ON : CHIP_OFF);

  /** 「查看导览」——本工程没有地图服务（没有地图底图、也没有点位编号），如实说一句 */
  function onGuide(poi: Poi) {
    uni.showToast({ title: `「${poi.name}」导览地图待接入`, icon: 'none', duration: 2000 });
  }

  /** 「手绘标点」同理：真做需要地图底图 + 点位坐标 */
  function onPin() {
    uni.showToast({ title: '手绘标点待接入', icon: 'none', duration: 2000 });
  }

  const goBack = () => uni.navigateBack();

  return {
    statusBarHeight,
    capsuleInset,
    headerHeight,
    chipsTop,
    goBack,
    categories: POI_CATEGORIES,
    category,
    onPickCategory,
    chipClass,
    shownPois,
    onGuide,
    onPin,
  };
}
