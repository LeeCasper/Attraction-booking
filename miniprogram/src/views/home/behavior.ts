import { computed, ref, watch } from 'vue';
import { areaApi, mediaUrl, ticketApi, type MiniTicket } from '@/api';
import { errorText } from '@/api/request';
import { currentAreaId, selectTicket, switchTab } from '@/store/shell';
import { dayOffsetStr, fen2yuan } from '@/utils/format';

/**
 * 首页（景区预约首页）—— 四个视图里最后一个接上后端的。
 *
 * 它此前是**纯静态且完全不可交互**的：生成产物里 `@tap` 与 `id` 都是 0 个，
 * 设计稿 `home.html` 除 tailwind 配置外也没有任何 id —— 没有交互钩子。
 * 所以首页的点击行为全是**按 class 定位**注进去的（见 `page-bindings.mjs` 的 `home` 节），
 * 三张票卡则因为 class 三张完全相同，只能靠 `:nth(N)` 按文档顺序定位。
 *
 * 接的是这几样（对应 PRD 的 U-001 / U-002 / U-012）：
 *   - 公告        `GET /areas/:id` 的 announcements（U-001）
 *   - 在园率      `GET /areas/:id/presence`（口径与后台看板一致，以闸机通行回执为准）
 *   - 三张票卡    `GET /tickets`（U-012：点某张 → 切购票页并选中该票种）
 *   - 两张快捷卡  切 tab（U-002：一键进入预约页）
 *
 * **仍不接**（设计稿首页没有展示位，或后端没有数据源）：开园状态与天气、便民服务四宫格、
 * 景区简介与开放时间。见 README 的「仍是静态」清单。
 */

/** 首页票卡卡位数 —— 设计稿固定画了 3 个，多于 3 个的票种本轮没有容器可放 */
export const HOME_TICKET_SLOTS = 3;

export interface HomeTicketCard {
  id: number;
  name: string;
  /** 副标题。设计稿写的是营销文案，接口给的是 `audience`，所以接上后文案会变 */
  audience: string;
  /** 已格式化好的元（不带 ¥ 符号，符号在设计稿里是单独一个节点） */
  priceLabel: string;
  unitLabel: string;
  /**
   * `false` = 该票种按张卖，而后端只有「单价 × 人数」一种计价，
   * 进了购票流程会把金额算错 —— 所以只展示、不让进（见 `api/index.ts` 的 `saleUnit`）。
   */
  sellable: boolean;
  /** 角标。**由真实字段推出来**，不是设计稿那三个营销角标（后端没有对应字段） */
  badges: { text: string; tone: 'primary' | 'muted' }[];
  /** 底部小字：由 `refundRule` 推出来的退改口径 */
  footnote: string;
}

/**
 * 退改口径文案。设计稿那行小字（「今日可约 · 出票即用」之类）后端没有对应字段，
 * 但 `refundRule`（`{beforeDay, feeRate, expiredNoRefund}`）是真实存在的 —— 由它推文案，
 * 比照抄设计稿的营销话术可靠（那是承诺，这是数据）。
 */
function refundNote(rule: Record<string, unknown> | null | undefined): string {
  const beforeDay = Number(rule?.beforeDay);
  if (!Number.isFinite(beforeDay)) return '退改规则见入园须知';
  const feeRate = Number(rule?.feeRate);
  const fee = Number.isFinite(feeRate) && feeRate > 0 ? ` · 手续费 ${Math.round(feeRate * 100)}%` : ' · 免手续费';
  return `提前 ${beforeDay} 天可退${fee}`;
}

export function useHomePage() {
  const loading = ref(false);
  const error = ref('');
  /** 公告行：「标题：正文」 */
  const announcement = ref('');
  /** 「在园率 38%」整串。拿不到数据时为空，用设计稿原文兜底 */
  const presenceLabel = ref('');
  /** 票卡数据，长度最多 HOME_TICKET_SLOTS，不足时对应卡位不渲染 */
  const tickets = ref<HomeTicketCard[]>([]);

  /** 当前景点的展示信息（banner 标题与封面图） */
  const areaName = ref('');
  const areaCover = ref('');

  /**
   * 「按哪个选择加载过了」。`undefined` = 从没加载过。
   *
   * ⚠️ 原来是布尔 `loaded` —— 它只认「加载过」，**不认识景点**，
   * 于是切景点之后首页完全不重取（票卡、公告、在园率全是上一个景点的）。
   * 现在记住的是「当时的 currentAreaId」，切了就对不上、会重取。
   */
  let loadedForArea: number | null | undefined;

  async function load(force = false) {
    if (!force && loadedForArea !== undefined && loadedForArea === currentAreaId.value) return;
    loading.value = true;
    error.value = '';
    try {
      const areas = await areaApi.list();
      // 用户选过就用选的，没选过回落到第一个（与改动前的行为一致）
      const picked = currentAreaId.value ? areas.find((a) => a.id === currentAreaId.value) : undefined;
      const area = picked ?? areas[0];
      if (!area) throw new Error('没有开放中的景点');

      const today = dayOffsetStr(0);
      // 三个请求互不依赖，并发即可。详情与在园情况失败不该拖垮票卡，
      // 所以分开 catch —— 首页最不能缺的是「能不能买票」
      const [detail, list, presence] = await Promise.all([
        areaApi.detail(area.id).catch(() => null),
        ticketApi.list(area.id, today),
        areaApi.presence(area.id).catch(() => null),
      ]);

      areaName.value = area.name;
      // 封面用景点自己的；没有就留空，让设计稿那张兜底图继续显示
      // 后台上传的封面是相对路径，拼完整地址（没配就用设计稿那张兜底图，见视图里的写法）
      areaCover.value = mediaUrl(area.coverUrl);

      const first = detail?.announcements?.[0];
      announcement.value = first ? `${first.title}：${first.content ?? ''}`.replace(/：$/, '') : '';

      if (presence) {
        const pct = Math.round((presence.capacityRate ?? 0) * 100);
        presenceLabel.value = `在园率 ${pct}%`;
      }

      tickets.value = list.slice(0, HOME_TICKET_SLOTS).map((t: MiniTicket) => {
        const sellable = t.saleUnit === 'person';
        const badges: HomeTicketCard['badges'] = [];
        if (t.needRealname === 1) badges.push({ text: '实名制预约', tone: 'primary' });
        if (!sellable) badges.push({ text: '暂不支持在线预约', tone: 'muted' });
        return {
          id: t.id,
          name: t.name,
          audience: t.audience ?? '',
          priceLabel: fen2yuan(t.price),
          unitLabel: t.saleUnit === 'ticket' ? '/张' : '/人',
          sellable,
          badges,
          footnote: refundNote(t.refundRule),
        };
      });

      loadedForArea = currentAreaId.value;
    } catch (err) {
      error.value = errorText(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 切景点 → 作废并重取。
   *
   * 为什么需要这个 watch：选择景点是个**二级页**，push 上去的时候本视图的 `active`
   * 并没有变化，所以外壳那个 `watch(props.active)` 不会触发 —— 不主动监听就会「选完返回，
   * 首页还是上一个景点的数据」。只在「已经加载过」时才重取，避免没访问过首页就白发请求。
   */
  watch(currentAreaId, () => {
    if (loadedForArea === undefined) return;
    loadedForArea = undefined;
    announcement.value = '';
    presenceLabel.value = '';
    tickets.value = [];
    void load();
  });

  /**
   * 点某张票卡的「立即预约」（U-012）。
   *
   * 按张卖的票种直接拦住并说明原因 —— 让它进购票流程会按人数算钱（¥388 × 人数），
   * 那是**算错金额**，比「点了没反应」严重得多。
   */
  function onPickTicket(card: HomeTicketCard) {
    if (!card.sellable) {
      uni.showToast({ title: `${card.name}暂不支持在线预约`, icon: 'none', duration: 2500 });
      return;
    }
    selectTicket(card.id);
    // 首页的票卡已经属于**当前景点**，所以这里不再走「先选景点」，直接进购票页
    uni.navigateTo({ url: '/pages/booking/index' });
  }

  /**
   * 快捷卡「在线预约」（U-002）→ **切到「景点选择」那一格**，选好景点再由那边进购票页。
   *
   * 这是一个产品口径：本平台管多个景点，用户点「在线预约」的意图首先是「我要去哪个景点」，
   * 而不是「我要买当前这个景点的票」。以前直接 `switchTab('booking')`，
   * 结果是**用户根本不知道系统里还有别的景点**。
   *
   * ⚠️ 是 `switchTab('area')` 而**不是** `navigateTo` —— 景点选择是底栏的第 2 格（外壳视图），
   * 不是二级页。这里踩过一次：改成外壳视图之后忘了改这两处调用，运行时
   * `navigateTo:fail page "pages/area/index" is not found`。
   *
   * 注意与 `onPickTicket` 的区别：点某张**票卡**是「我就要这一张」，直接进购票页；
   * 点「在线预约」是「我要预约」，先去选景点。
   */
  const onQuickBooking = () => switchTab('area');
  /** 快捷卡：出示入园码 */
  const onQuickPass = () => switchTab('credential');

  /**
   * 切景点：banner 上的景点名也可点。
   *
   * 设计稿没画这个入口（它是按单景区画的）。「在线预约」现在也通向那一格，
   * 所以这里是一条**快捷路径**（知道自己在哪个景点、只是想换一个）。
   */
  const onSwitchArea = () => switchTab('area');

  /** 公告条右侧的「须知」——后端没有单独的须知页，先如实说明 */
  const onNotice = () => uni.showToast({ title: '入园须知待接入', icon: 'none' });

  const hasTickets = computed(() => tickets.value.length > 0);

  return {
    loading,
    error,
    announcement,
    presenceLabel,
    tickets,
    hasTickets,
    areaName,
    areaCover,
    onSwitchArea,
    onPickTicket,
    onQuickBooking,
    onQuickPass,
    onNotice,
    load,
  };
}
