import { ref, watch } from 'vue';
import { areaApi, bannerApi, mediaUrl, type AreaOverview, type MiniBanner } from '@/api';
import { errorText } from '@/api/request';
import { currentAreaId, setCurrentArea, switchTab } from '@/store/shell';
import { CAPACITY_BANNER_LABEL, areaCoverOf, areaStockStatus, capacityTone } from '@/utils/area';

/**
 * 首页（景区预约首页）。
 *
 * 它此前是**纯静态且完全不可交互**的：生成产物里 `@tap` 与 `id` 都是 0 个，
 * 设计稿 `home.html` 除 tailwind 配置外也没有任何 id —— 没有交互钩子。
 * 所以首页的点击行为全是**按 class 定位**注进去的（见 `page-bindings.mjs` 的 `home` 节）。
 *
 * ⚠️ 首页**不认「当前景点」**（本轮改的，这是一条产品口径）：
 *   以前这一页是「当前景点」的首页 —— banner 是它的封面、下面三张票卡是它的票，
 *   于是在「景点选择」页点一下别的景点，回到首页会发现**整页都变了**，
 *   而用户只是想选中某个景点、并没有要求首页跟着换（踩过）。
 *   现在首页是**平台级**的：banner 轮播全部景点、下面推荐景点，
 *   当前景点只在「购票页买哪个景点的票」这一件事上有意义。
 *   唯一还跟着当前景点走的只有公告（它不是全局公告，所以文案里带上景点名，见下）。
 *
 * 接的是这几样：
 *   - 轮播         `GET /banners`（后台「内容管理 → 首页轮播图」单独维护的一组，
 *                  **与景点解耦**：绑了景点的那屏显示景点名与在园率、点了进购票页；
 *                  没绑的显示这张图自己的标题、且不可点。一张都没配时**回落到按景点生成**，
 *                  免得新部署的首页顶上一条空白）
 *   - 推荐景点      `GET /areas/overview`（一次取回每个景点的封面/分类/起价/今日余票/在园）
 *   - 公告         `GET /areas/:id` 的 announcements（U-001）
 *   - 两张快捷卡    切 tab（U-002：一键进入预约页）
 *
 * **仍不接**（设计稿首页没有展示位，或后端没有数据源）：开园状态与天气、便民服务四宫格、
 * 景区简介与开放时间。见 README 的「仍是静态」清单。
 */

/** 轮播位最多几个景点（再多就不是「轮播」而是「翻页」了；全部景点在「景点选择」页里） */
export const HOME_SLIDE_SLOTS = 5;
/** 「推荐景点」放几张卡 */
export const HOME_RECOMMEND_SLOTS = 3;

/** banner 轮播的一屏 */
export interface BannerSlide {
  /** 唯一 key（轮播图 `b-<id>` / 按景点兜底时 `a-<id>`） */
  key: string;
  /** 主标题：绑了景点 = 景点名；没绑 = 轮播图标题 */
  name: string;
  /** 副标题：没填且绑了景点时用设计稿那句 */
  subtitle: string;
  /** 完整地址（后台上传的是相对路径，这里已拼好前缀） */
  cover: string;
  /** 状态胶囊左半：「开园中 · 舒适畅通」。**没绑景点的屏不显示**（它说的就是在园状态） */
  statusLabel: string;
  /** 状态胶囊右半：「在园率 38%」。同上 */
  presenceLabel: string;
  /** 点了去哪：绑了景点 = 该景点 id；没绑 = null（**不可点**，它只是一张公告图） */
  areaId: number | null;
}

/** 绑了景点的那屏，副标题没填时的兜底（设计稿原文，后端没有对应字段） */
const BANNER_SUBTITLE_FALLBACK = '国家生态自然公园 · 5A级风景名胜区';

export function useHomePage() {
  const loading = ref(false);
  const error = ref('');
  /** 公告行：「【景点名】标题：正文」 */
  const announcement = ref('');
  /** banner 轮播的每一屏 */
  const slides = ref<BannerSlide[]>([]);
  /** 「推荐景点」卡片（`AreaOverview`，`AreaRecommendCard` 自己算余票与起价） */
  const recommended = ref<AreaOverview[]>([]);

  /** 全部开放景点。公告要按 id 找「当前景点」，所以整份留着 */
  const allAreas = ref<AreaOverview[]>([]);

  /** 已经从接口取过数了。首页与「哪个景点」无关，所以一个布尔量就够 */
  let loaded = false;
  /**
   * 公告是**哪个景点**的。
   *
   * 首页现在展示全部景点（轮播 + 推荐），而公告接口是**按景点**给的 ——
   * 拿第一个景点的公告当「平台公告」是编的，所以这里显示的是**当前景点**的公告，
   * 并在文案里带上景点名（`【嵖岈山】…`），否则用户不知道这条通知说的是哪儿。
   * 换景点只重取公告，不必整页重取。
   */
  let annFor: number | undefined;

  async function loadAnnouncement(force = false) {
    const target = allAreas.value.find((a) => a.id === currentAreaId.value) ?? allAreas.value[0];
    if (!target) return;
    if (!force && annFor === target.id) return;
    annFor = target.id;
    // 公告失败不该拖垮整页（首页最不能缺的是「有哪些景点、能不能买票」）
    const detail = await areaApi.detail(target.id).catch(() => null);
    const first = detail?.announcements?.[0];
    announcement.value = first
      ? `【${target.name}】${first.title}${first.content ? `：${first.content}` : ''}`
      : '';
  }

  /** 绑了景点的那屏：景点名 + 在园状态（数据都来自 `/areas/overview`，不额外打接口） */
  function areaSlide(slide: BannerSlide, area: AreaOverview) {
    slide.name = area.name;
    slide.subtitle = slide.subtitle || BANNER_SUBTITLE_FALLBACK;
    slide.statusLabel = `开园中 · ${CAPACITY_BANNER_LABEL[capacityTone(area.presence.capacityRate)]}`;
    slide.presenceLabel = `在园率 ${Math.round(area.presence.capacityRate * 100)}%`;
    slide.areaId = area.id;
  }

  /**
   * banner 的一屏 → 轮播的一屏。
   *
   * 三种情况：① 绑了景点且景点还在开放列表里 → 显示景点名/在园率、点了进购票页；
   * ② 绑了景点但那个景点**已经不开放**（下架/删除）→ 退化成「只展示图」，
   *    绝不能显示一个不存在的景点名、更不能点了跳到一个 404 的购票页；
   * ③ 没绑景点 → 显示这张图自己的标题/副标题，且不可点。
   */
  function bannerSlide(b: MiniBanner, areas: AreaOverview[]): BannerSlide {
    const slide: BannerSlide = {
      key: `b-${b.id}`,
      name: b.title ?? '',
      subtitle: b.subtitle ?? '',
      cover: mediaUrl(b.imageUrl),
      statusLabel: '',
      presenceLabel: '',
      areaId: null,
    };
    const area = b.scenicAreaId ? areas.find((a) => a.id === b.scenicAreaId) : undefined;
    if (area) areaSlide(slide, area);
    return slide;
  }

  /**
   * 一组轮播图 → 轮播的每一屏；**一张都没配时回落到「按景点生成」**。
   *
   * 兜底不是可选项：新部署的库里没有轮播图，没有兜底首页顶上就是一条空白；
   * 而「首页轮播 = 各景点封面」本来就是这套设计稿的原始形态（后台配了就按后台的来）。
   */
  function buildSlides(banners: MiniBanner[], areas: AreaOverview[]): BannerSlide[] {
    if (banners.length) return banners.map((b) => bannerSlide(b, areas));
    return areas.slice(0, HOME_SLIDE_SLOTS).map((a, i) => {
      const slide: BannerSlide = {
        key: `a-${a.id}`,
        name: a.name,
        subtitle: BANNER_SUBTITLE_FALLBACK,
        cover: areaCoverOf(a, i),
        statusLabel: '',
        presenceLabel: '',
        areaId: null,
      };
      areaSlide(slide, a);
      return slide;
    });
  }

  /** 首次可见时加载；`force` 用于重试 */
  async function load(force = false) {
    if (!force && loaded) return;
    loading.value = true;
    error.value = '';
    try {
      // 一个请求就够：`/areas/overview` 每张卡要的封面/分类/起价/今日余票/在园全在里面
      // （以前是 `list` + 逐景点 `presence` + `tickets` 三个请求，且只服务一个景点）
      // 轮播图与景点一览并发；轮播图失败不该让整页报错（它是锦上添花，兜底还有按景点生成的）
      const [banners, res] = await Promise.all([
        bannerApi.list().catch(() => [] as MiniBanner[]),
        areaApi.overview(),
      ]);
      const areas = res.areas;
      if (!areas.length) throw new Error('没有开放中的景点');

      allAreas.value = areas;
      slides.value = buildSlides(banners, areas);
      // 「推荐」= 后端的默认顺序（`status = 1` 按 id 升序，即登记先后）。
      // 后端没有「推荐位/热度」这类字段，所以不假装有排序规则 —— 就是前 N 个。
      recommended.value = areas.slice(0, HOME_RECOMMEND_SLOTS);

      loaded = true;
      await loadAnnouncement(true);
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 切景点 → **只重取公告**。
   *
   * 以前这里要清空票卡/在园率并整页重取 —— 因为那时整页都是「当前景点」的。
   * 现在首页与景点无关，只有那条按景点给的公告要跟着换。
   */
  watch(currentAreaId, () => {
    if (!loaded) return;
    void loadAnnouncement();
  });

  /**
   * 进某个景点的购票页。
   *
   * 轮播屏与推荐卡都走这里。**先选中景点再压栈**：购票页是二级页，读的就是 `currentAreaId`。
   * 没有可售票种的景点（后端只有按张卖的票种）直接拦住并说明 —— 进去了也只会看到
   * 「暂无可在线预约的票种」，不如在入口处讲清楚。
   */
  function pickArea(id: number) {
    const area = allAreas.value.find((a) => a.id === id);
    if (!area) return;
    if (areaStockStatus(area) === 'none') {
      uni.showToast({ title: `${area.name}暂无可在线预约的票种`, icon: 'none', duration: 2500 });
      return;
    }
    setCurrentArea(area.id);
    uni.navigateTo({ url: '/pages/booking/index' });
  }

  /** 点轮播的某一屏（那一屏写着是哪个景点） */
  const onPickSlide = (id: number) => pickArea(id);
  /** 点「推荐景点」里的一张卡 */
  const onPickArea = (area: AreaOverview) => pickArea(area.id);

  /**
   * 快捷卡「在线预约」（U-002）→ **切到「景点选择」那一格**，选好景点再由那边进购票页。
   *
   * 这是一个产品口径：本平台管多个景点，用户点「在线预约」的意图首先是「我要去哪个景点」，
   * 而不是「我要买票」。与上面两条的区别：轮播/推荐卡是**指着某个景点**点的，
   * 所以直接进那个景点的购票页；这张卡没有指向任何景点，就先去选。
   *
   * ⚠️ 是 `switchTab('area')` 而**不是** `navigateTo` —— 景点选择是底栏的第 2 格（外壳视图），
   * 不是二级页。这里踩过一次：改成外壳视图之后忘了改这两处调用，运行时
   * `navigateTo:fail page "pages/area/index" is not found`。
   */
  const onQuickBooking = () => switchTab('area');
  /** 快捷卡：出示入园码 */
  const onQuickPass = () => switchTab('credential');

  /** 公告条右侧的「须知」——后端没有单独的须知页，先如实说明 */
  const onNotice = () => uni.showToast({ title: '入园须知待接入', icon: 'none' });

  return {
    loading,
    error,
    announcement,
    slides,
    recommended,
    stockStatus: areaStockStatus,
    onPickSlide,
    onPickArea,
    onQuickBooking,
    onQuickPass,
    onNotice,
    load,
  };
}
