import { ref, watch } from 'vue';
import { areaApi, type AreaOverview } from '@/api';
import { errorText } from '@/api/request';
import { currentAreaId, setCurrentArea, switchTab } from '@/store/shell';
import { CAPACITY_BANNER_LABEL, areaBannerOf, areaStockStatus, capacityTone } from '@/utils/area';

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
 *   - 轮播 + 推荐  `GET /areas/overview`（一次取回每个景点的封面/分类/起价/今日余票/在园）
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
  id: number;
  name: string;
  /** 完整地址（后台上传的是相对路径，`areaCoverOf` 会拼前缀） */
  cover: string;
  /** 状态胶囊左半：「开园中 · 舒适畅通」 */
  statusLabel: string;
  /** 状态胶囊右半：「在园率 38%」 */
  presenceLabel: string;
}

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

  /** 首次可见时加载；`force` 用于重试 */
  async function load(force = false) {
    if (!force && loaded) return;
    loading.value = true;
    error.value = '';
    try {
      // 一个请求就够：`/areas/overview` 每张卡要的封面/分类/起价/今日余票/在园全在里面
      // （以前是 `list` + 逐景点 `presence` + `tickets` 三个请求，且只服务一个景点）
      const res = await areaApi.overview();
      const areas = res.areas;
      if (!areas.length) throw new Error('没有开放中的景点');

      allAreas.value = areas;
      slides.value = areas.slice(0, HOME_SLIDE_SLOTS).map((a, i) => ({
        id: a.id,
        name: a.name,
        // 轮播位优先用「轮播图」，没配回落到封面
        cover: areaBannerOf(a, i),
        statusLabel: `开园中 · ${CAPACITY_BANNER_LABEL[capacityTone(a.presence.capacityRate)]}`,
        presenceLabel: `在园率 ${Math.round(a.presence.capacityRate * 100)}%`,
      }));
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
