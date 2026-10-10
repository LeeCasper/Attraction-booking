/**
 * 视图行为绑定表
 *
 * 设计稿里那些 id 不是随手起的 —— 它们是原稿预留的交互钩子。
 * gen-pages.mjs 按这些键找到**唯一**一个元素，把这里声明的组件/属性/文本绑定注进去。
 * 这样**版式仍由设计稿生成**（保真度不打折），动态部分落在手写的组件与 behavior.ts 里。
 *
 * 产物是 `src/views/<name>/index.vue`（**视图**，不是页面）：
 * 微信的 tabBar 切换必然重建页面视图层、必然闪，所以本项目改成「一个页面 + 四个视图 v-show」，
 * 切页只是 CSS 显隐、没有页面转场。顶栏与底栏由外壳 `src/pages/main/index.vue` 只渲染一次。
 * 视图根节点保留设计稿 `<main>` 的 `pt-16`（给固定顶栏让位），但去掉 `min-h-screen` 与底部留白
 * —— 那两项现在归外壳的滚动容器与底栏自己管，见 gen-pages.mjs 的 VIEW_DROP。
 *
 * 键（选择器）有三种写法，都必须命中**恰好 1 个**元素，否则 gen-pages 报错并跳过该页：
 *   '#slotGrid'                 按 id
 *   'rounded-2xl bg-paper-surface …'  子集匹配：列出的 class token 全含即命中
 *   '= font-caption-sm …'       全等匹配：class 列表一模一样。用于类很少、
 *                               且被别的元素包含的情况（见购票页「已选 N 人」）
 *
 * 之所以需要后两种：**设计稿并非每个交互区都留了 id**。凭证页的「支持通行方式」、
 * 购票页的出行游客登记与底部待付条，一个 id 都没有，只能按 class 定位。
 *
 * 支持的注入：
 *   replace   : 整个元素替换成一段模板（通常是个组件）
 *   inner     : 保留元素自身与属性，只把**子节点**换成一段模板
 *   text      : 把元素的文本内容换成 {{ 表达式 }}
 *   attrs     : 追加属性（事件绑定等）
 *   class     : 按条件追加类（值是一个表达式字符串）
 *   tag       : 改写标签（如 div → scroll-view）
 *   ownClass  : 整段替换元素自身的 class（设计稿的类要留给组件根节点时用）
 *   wrapInner : 把原始类挪进一层内部包裹层（小程序 scroll-view 的布局类必须放在内层）
 *   image     : 换掉元素里那张背景图 `<image>` 的 src（生成器硬编码插进去的，普通绑定够不着它）
 *
 * ⚠️ replace 用在 grid/flex 容器上时，组件根节点必须**自己带容器的 class**：
 *    自定义组件会多一层节点，v-for 项放在组件里就不再是容器的直接子元素，栅格会塌。
 */

export const PAGE_BINDINGS = {
  home: {
    imports: [
      "import { watch } from 'vue';",
      "import TicketCard from '@/components/TicketCard.vue';",
      "import { useHomePage } from './behavior';",
    ],
    setup: `const {
  announcement, presenceLabel, tickets, areaName, areaCover,
  onPickTicket, onSwitchArea, onQuickBooking, onQuickPass, onNotice, load,
} = useHomePage();
// 首页是启动时的默认 tab，immediate 让它一挂载就拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
      // 公告文字（U-001）。后端没有公告时不显示整条 —— 留个空壳比不显示更像坏了
      'flex items-center justify-between px-3 py-2 rounded-xl bg-[#fffcf5] border border-amber-gold/25 text-tertiary shadow-[0_2px_8px_rgba(217,119,6,0.06)]': {
        class: { 'is-hidden': '!announcement' },
      },
      'font-body-sm text-[12px] truncate text-ink-charcoal-text font-medium': { text: 'announcement' },
      // 公告条右侧的「须知」：后端没有独立的须知接口，如实提示而不是假装能跳
      'font-caption-sm text-[11px] font-semibold text-tertiary-container hover:text-amber-gold transition-colors flex-shrink-0 flex items-center gap-0.5':
        { attrs: { '@tap': 'onNotice' } },
      // banner 上的景点名：绑成**当前景点**，点它进「选择景点」页。
      // 设计稿是按单景区画的、标题写死「枫林谷森林公园」，多景区下必须跟着当前景点走
      'font-headline-xl text-[24px] font-bold text-white tracking-wider drop-shadow-md': {
        text: 'areaName',
        attrs: { '@tap': 'onSwitchArea' },
      },
      // banner 封面图：那张 <image> 是生成器硬编码插进去的，用 `image` 绑定换 src
      'w-full h-full bg-cover bg-center': { image: 'areaCover' },
      // 在园率：来自 /areas/:id/presence，口径与后台看板一致
      'text-[11px] font-label-badge text-bamboo-light-100': { text: 'presenceLabel' },
      // 两张快捷卡（U-002）：一键进入预约页 / 出示入园码。
      // 设计稿这两张卡没有 id，按各自独有的 class 定位
      'relative rounded-2xl bg-gradient-to-br from-surface-container-low to-surface-container border border-primary/25 p-3.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,104,95,0.08)] cursor-pointer active:scale-[0.98] transition-all group overflow-hidden':
        { attrs: { '@tap': 'onQuickBooking' } },
      'relative rounded-2xl bg-surface-container-lowest border border-outline-variant/60 p-3.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.04)] cursor-pointer active:scale-[0.98] transition-all group overflow-hidden hover:border-primary/40':
        { attrs: { '@tap': 'onQuickPass' } },
      // 三张票卡（U-012）。**三张卡的 class 逐字完全相同**，唯一不同的角标也不可靠
      // （卡一与卡三的 primary 角标类一模一样），所以只能按文档顺序取。
      // ⚠️ :nth 会放弃「恰好命中 1 个」的保护（只要求 >= N），且序号是全页命中顺序。
      // 整卡 replace 成组件，而不是逐个绑文本：同一段版式绑三遍，改一次得改三处。
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(1)':
        { replace: '<TicketCard v-if="tickets[0]" :ticket="tickets[0]" @pick="onPickTicket" />' },
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(2)':
        { replace: '<TicketCard v-if="tickets[1]" :ticket="tickets[1]" @pick="onPickTicket" />' },
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(3)':
        { replace: '<TicketCard v-if="tickets[2]" :ticket="tickets[2]" @pick="onPickTicket" />' },
    },
    style: `.pg-page .is-hidden { display: none; }`,
  },

  credential: {
    imports: [
      "import { watch } from 'vue';",
      "import DynamicQr from '@/components/DynamicQr.vue';",
      "import PassPicker from '@/components/PassPicker.vue';",
      "import { useCredentialPage } from './behavior';",
    ],
    setup: `const {
  qrToken, countdownLabel, refreshAfterLabel, qrSpinning, refreshQr, watermarks, onExport, onOrders,
  passModes, passMode, onPickPassMode,
  periodLabel, areaName, holderLabel, statusLabel, load,
} = useCredentialPage();
// 首次可见时才拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
      // ⚠️ 外面这层 `w-full h-full` 是**必需的**，不是排版偏好：
      // 设计稿里 `<svg class="w-full h-full">` 是 218×218 白卡片的直接 flex 子项，`100%` 能直接
      // 对着 218px 解析；换成组件后多了一层宿主 `<dynamic-qr>`，卡片又是 `items-center` 不拉伸，
      // 宿主没有尺寸 → 组件根节点的 `height:100%` 无从计算 → 塌成 0 → 一个码点都画不出来。
      '#dynamic-qr-svg': {
        replace: '<view class="w-full h-full"><DynamicQr :token="qrToken" /></view>',
      },
      // 去掉二维码正中的景区 logo。两个理由：
      // 1. 它盖住约 16% 的码点，为此纠错等级不得不提到 H —— 137 字符的 token 下矩阵 65×65、
      //    单模块约 0.45mm，贴着「能扫」的边。去掉后纠错回到 M，矩阵降到 49×49、单模块约 0.58mm。
      // 2. 它和 `<canvas>` 原生层抢层级（开发者工具里被盖成半透明）—— 虽然现在改成了 `<image>`，
      //    但少一个叠层总归少一类问题。
      'absolute z-20 w-9 h-9 bg-white rounded-lg shadow-sm p-1 flex items-center justify-center': {
        remove: true,
      },
      // 「动态码每 N 秒刷新 · 剩余 Ms」整句**由数据驱动**。
      // 设计稿把 N 写死成 60，而服务端给的 `refreshAfter` 是 50（有效期 60 秒、提前 10 秒换码），
      // 两个数本来就对不上 —— 用户一眼就看出来了。这里两个数都从 `refreshAfter` 推。
      // 整句 replace 而不是分别绑两个 text：内层那个带样式的数字节点是设计稿的子节点，
      // 只绑父节点会把子节点一起冲掉，绑子节点又改不了写死的「60」。
      // ⚠️ 必须带 `:nth(2)`：上面「门票通行凭证 · 全园闸机通用」那行的类名是这三者的超集，
      // 匹配器用的是「包含」而非「相等」，不加序号会命中 2 个。
      'font-caption-sm text-[12px] text-ink-light-gray :nth(2)': {
        replace:
          '<text class="font-caption-sm text-12px text-ink-light-gray">动态码每 {{ refreshAfterLabel }} 秒刷新 · 剩余 ' +
          '<text class="text-primary font-bold">{{ countdownLabel }}</text></text>',
      },
      // 「入园时段」与「持票人」的值两行**类名完全相同**，只能靠文档顺序定位（第 1、2 个）
      'text-ink-charcoal-text font-bold mt-0.5 block :nth(1)': { text: 'periodLabel' },
      'text-ink-charcoal-text font-bold mt-0.5 block :nth(2)': { text: 'holderLabel' },
      // 「待使用」状态胶囊：这个类全页唯一
      'px-2.5 py-1 rounded-full text-[11px] font-bold': { text: 'statusLabel' },
      // 凭证页的景点名（设计稿写死「枫林谷国家森林公园」）。
      // 凭证跨景点，所以这里显示的是**这张订单所属**的景点，不是「当前景点」
      'font-headline-md text-[17px] text-ink-charcoal-text font-bold tracking-wide': { text: 'areaName' },
      '#refresh-qr-btn': {
        attrs: { '@tap': 'refreshQr' },
        class: { 'is-spinning': 'qrSpinning' },
      },
      '#watermark-line-1': { text: 'watermarks[0]' },
      '#watermark-line-2': { text: 'watermarks[1]' },
      '#watermark-line-3': { text: 'watermarks[2]' },
      // 「申请退改」：设计稿画了，但以前**连 @tap 都没有**（完全死的按钮）。
      // 后端没有改签，所以只接退款 —— 跳到该单的订单详情，退款动作在那边（要填原因、看审核状态）
      'flex-1 h-11 rounded-full border border-silk-border bg-paper-surface hover:bg-surface-container-low text-ink-charcoal-text font-body-sm text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-2xs':
        { attrs: { '@tap': 'onOrders' } },
      '#export-pass-btn': { attrs: { '@tap': 'onExport' } },
      // 设计稿没给 id：容器 class 唯一，用它定位（组件根节点带这组 grid 类）
      'grid grid-cols-3 gap-2.5 text-center': {
        replace: '<PassPicker :options="passModes" :value="passMode" @change="onPickPassMode" />',
      },
    },
    // 点刷新时让 refresh 图标转一圈（设计稿的 active:rotate-180 只在按住时转 180°）
    style: `.pg-page .is-spinning { animation: pg-spin 600ms linear; }`,
  },

  booking: {
    imports: [
      "import { onLoad } from '@dcloudio/uni-app';",
      "import DateCards from '@/components/DateCards.vue';",
      "import SlotGrid from '@/components/SlotGrid.vue';",
      "import VisitorPicker from '@/components/VisitorPicker.vue';",
      "import BookingBar from '@/components/BookingBar.vue';",
      "import { useBookingPage } from './behavior';",
    ],
    setup: `const {
  statusBarHeight, capsuleInset, goBack,
  dateFade, onDateScroll, loading, error,
  dates, date, onPickDate,
  slots, slot, onPickSlot,
  visitors, pickedIds, selectionLabel, onToggleVisitor, onAddVisitor,
  pageTitle, ticketName, ticketAudience, ticketPrice, unitLabel,
  totalAmount, headcount, canSubmit, onSubmit, load,
} = useBookingPage();
// 二级页（选完景点才进来），收不到外壳的 props.active —— 用页面生命周期触发首次加载。
// 每次进入都是新页面实例，所以 behavior 里那些「加载过没」的守卫自然重置，数据一定是最新的。
// 用箭头包一层：onLoad 会传 query 对象进来，直接写 onLoad(load) 类型对不上（load 收的是 force:boolean）
onLoad(() => { void load(); });`,
    // 设计稿没画标题栏（它原本靠外壳的顶栏）—— 作为二级页得自己供一条，与 visitor/orders 页同款
    before: `<view :style="{ height: statusBarHeight + 'px' }" />
    <view class="flex items-center gap-2 px-4 py-3" :style="{ paddingRight: capsuleInset + 'px' }">
      <view class="msi icon-arrow_back text-20px text-ink-charcoal-text p-1" hover-class="pg-hover" @tap="goBack" />
      <text class="font-headline-md text-17px font-bold text-ink-charcoal-text">预约购票</text>
    </view>`,
    bindings: {
      // 头卡标题：设计稿写死「枫林谷国家森林公园 · 景区门票」（按单景区画的），
      // 多景区下必须跟着**当前景点**走，否则切到嵖岈山还写着枫林谷
      'font-headline-md text-[16px] text-ink-charcoal-text font-bold truncate': { text: 'pageTitle' },
      // —— 顶部「票种头卡」的价格行 ——
      // 原先这四处是生成产物里写死的（恒为「成人全票 / 含林海栈道及主景区观光 / ¥120」），
      // 于是会「首页选了优待票，头卡还写着成人全票」。现在跟真实选中的票种联动。
      //
      // 为什么用 inner 注整行、而不是分别绑四个 text：
      // 副标题的 class (`text-[11px] text-ink-light-gray`) 在 booking.html 里**有 4 个同 class 元素**
      // （另外 3 个是时段的「余 N 张」），单独定位它会「匹配到 4 个，要求恰好 1 个」。
      // 整行容器 `mt-3 pt-3 border-t …` 全页唯一，锚在它上面最稳。
      // ⚠️ inner 的内容**不过 mapClasses**，所以这里的 class 必须自己写消毒后的名。
      'mt-3 pt-3 border-t border-silk-border/60 flex items-center justify-between': {
        inner:
          '<view class="flex items-center gap-2">' +
          '<text class="font-body-md text-14px text-ink-charcoal-text font-semibold">{{ ticketName }}</text>' +
          '<text class="text-11px text-ink-light-gray">{{ ticketAudience }}</text>' +
          '</view>' +
          '<view class="flex items-baseline">' +
          '<text class="text-caption-sm font-semibold text-cinnabar-red">¥</text>' +
          '<text class="font-data-metric-lg text-data-metric-lg font-bold text-cinnabar-red ml-0_5">{{ ticketPrice }}</text>' +
          '<text class="font-caption-sm text-11px text-ink-light-gray ml-1">{{ unitLabel }}</text>' +
          '</view>',
      },
      // 横向滚动必须用 <scroll-view>：小程序里普通 view 的 overflow-x 不能可靠滚动。
      // 设计稿的 flex 滚动类挪给 DateCards 组件根节点，scroll-view 只留 w-full。
      '#calendarScroll': {
        tag: 'scroll-view',
        ownClass: 'w-full',
        attrs: { 'scroll-x': 'true', 'show-scrollbar': 'false', '@scroll': 'onDateScroll' },
        inner: '<DateCards :dates="dates" :value="date" @change="onPickDate" />',
      },
      // 设计稿用 opacity-0 / opacity-90 表示渐隐开关；两个遮罩都要能开也能关
      '#dateScrollLeftFade': { class: { 'is-on': 'dateFade.left', 'is-off': '!dateFade.left' } },
      '#dateScrollRightFade': { class: { 'is-on': 'dateFade.right', 'is-off': '!dateFade.right' } },
      '#slotGrid': { replace: '<SlotGrid :slots="slots" :value="slot" @change="onPickSlot" />' },

      // 下面三处设计稿**没有 id**，按 class 定位
      // 「已选 N 人 / 限购 M 人」：它全部 4 个类都被「新增出行人」按钮包含，只能全等匹配
      '= font-caption-sm text-caption-sm text-primary font-medium': { text: 'selectionLabel' },
      'rounded-2xl bg-paper-surface p-space-md border border-silk-border shadow-sm flex flex-col gap-3': {
        replace:
          '<VisitorPicker :visitors="visitors" :picked="pickedIds" :loading="loading" @toggle="onToggleVisitor" />',
      },
      'border border-dashed border-primary/60': { attrs: { '@tap': 'onAddVisitor' } },
      'fixed bottom-16 left-0 right-0 z-40': {
        replace:
          '<BookingBar :amount="totalAmount" :count="headcount" :can-submit="canSubmit" @submit="onSubmit" />',
      },
    },
    // 状态类要给到比工具类更高的特异性，否则压不过元素自带的 opacity-0
    style: `.pg-page .is-on { opacity: 0.9; }
.pg-page .is-off { opacity: 0; }`,
  },

  /**
   * 景点选择页「景点选择与预约」—— **外壳的第 2 格**（底栏「预约购票」那一项）。
   *
   * 它是外壳**视图**（产出到 `src/views/area/`），收 `props.active`，首次可见时才拉数据；
   * 购票页才是「选完景点才进」的二级页（见下面 `booking` 节）。
   *
   * ⚠️ 标题栏**不在这个视图里**，由外壳渲染 `components/AreaTopBar.vue`：
   *   1. 这一格的设计稿自带标题栏（「景点选择与预约」），所以要 `v-if` 掉外壳的品牌顶栏，
   *      否则两条 56px 的横条叠在一起；
   *   2. 更关键的是**微信的 `scroll-view` 会形成自己的包含块，里面的 `position: fixed`
   *      不相对视口固定**，标题栏写在这里会跟着内容滚走（踩过）。所以它必须挂在外壳里、
   *      scroll-view 外面 —— 与 `PageHeader` 同一个位置。
   * `before` 只留加载/错误提示（这两块要贴着内容走）。注意 `before`/`inner`/`replace`
   * 一样**不过 mapClasses**，类名要自己写消毒后的形式。
   */
  area: {
    imports: [
      "import { watch } from 'vue';",
      "import AreaCard from '@/components/AreaCard.vue';",
      "import CategoryTabs from '@/components/CategoryTabs.vue';",
      "import PresenceBanner from '@/components/PresenceBanner.vue';",
      "import { useAreaPage } from './behavior';",
    ],
    setup: `const {
  loading, error,
  keyword, categories, category, filterVisible, filterOptions,
  filteredAreas, presenceLabel, contactLine, stockStatus, isActive,
  onPickCategory, openFilter, closeFilter, onPickArea, onBook, filterItemClass, load,
} = useAreaPage();
// 外壳视图：首次可见时才拉数据（四个视图同时挂载，不这么做启动时会并发四个请求）
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    // 标题栏**不在视图里** —— 由外壳渲染 `components/AreaTopBar.vue`。
    // 这一格挂在 scroll-view 里，而微信的 scroll-view 会形成自己的包含块，
    // 里面的 `position: fixed` 不再相对视口固定、标题栏会跟着内容滚走。
    // 视图侧只留加载/错误提示（这两块必须贴着内容走）。
    before: `<view
      v-if="loading && filteredAreas.length === 0"
      class="px-margin pt-space-md mb-space-md text-center text-caption-sm font-caption-sm text-ink-light-gray"
    >
      <text>正在加载景点…</text>
    </view>
    <view v-else-if="error" class="px-margin mt-space-sm">
      <text class="block rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</text>
    </view>`,
    bindings: {
      // 搜索框：接上真实过滤（后端没有搜索接口，本地按名称/简介过滤）
      'w-full bg-transparent text-ink-charcoal-text font-body-sm text-body-sm placeholder:text-ink-light-gray focus:outline-none':
        { attrs: { 'v-model': 'keyword', 'placeholder-style': 'color: #6b7280' } },
      // 「筛选」：打开分类弹层，与分类 tab 同一份选项 —— 设计稿画了它，就不能点了没反应
      'flex items-center gap-1 text-primary active:opacity-75 transition-opacity pl-1':
        { attrs: { '@tap': 'openFilter' } },
      // 分类胶囊条：改成数据驱动的组件，点击真筛
      '#categoryTabs': {
        replace: '<CategoryTabs :items="categories" :value="category" @change="onPickCategory" />',
      },
      // 承载横幅：设计稿把呼吸点和文案写在同一个 span 里，没法只换文案 → 整块换组件
      'bg-surface-container-low rounded-xl p-3 flex items-start gap-2.5 shadow-sm': {
        replace: '<PresenceBanner :label="presenceLabel" />',
      },
      // 套票推荐通栏：后端没有套票/联票这个概念，留着等于卖一个不存在的东西
      'px-margin mt-space-sm mb-space-sm': { remove: true },
      // 四张写死的景点卡 → 一个组件按真实数据渲染
      'px-margin flex flex-col gap-3.5 mb-space-md': {
        inner:
          '<AreaCard v-for="(a, i) in filteredAreas" :key="a.id" :area="a" :index="i" :status="stockStatus(a)" :active="isActive(a)" @pick="onPickArea" @book="onBook" />',
      },
      // 页脚联系行：设计稿是「客服热线：400-880-9966 / 服务时间：08:00-21:00」两段写死的文案。
      // 电话改读平台信息（没配就整行不显示），服务时间后端没有字段、去掉。
      'mt-1 pt-2 flex items-center justify-between text-caption-sm font-caption-sm text-outline': {
        class: { 'is-hidden': '!contactLine' },
        inner: '<text>{{ contactLine }}</text>',
      },
    },
    // 弹层：设计稿里没有它，是让「筛选」按钮有真实行为而加的。
    // 样式沿用 pages/visitor 的 sheet 范式（圆角与安全区走内联样式，避免新造工具类）。
    after: `<view
      v-if="filterVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background-color: rgba(0, 0, 0, 0.5)"
      @tap="closeFilter"
    >
      <view
        class="w-full bg-paper-surface flex flex-col px-4"
        style="border-radius: 24px 24px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))"
        @tap.stop
      >
        <view class="flex justify-center pt-3">
          <view style="width: 36px; height: 4px; border-radius: 2px; background-color: #d8ded9" />
        </view>
        <text class="font-headline-md text-17px font-bold text-ink-charcoal-text pt-3">按分类筛选</text>
        <view
          v-for="opt in filterOptions"
          :key="opt.id"
          class="flex items-center justify-between py-3"
          style="border-bottom: 1px solid #e6ebe8"
          hover-class="pg-hover"
          @tap="onPickCategory(opt.id)"
        >
          <text :class="filterItemClass(opt.id === category)">{{ opt.label }}</text>
          <view class="flex items-center gap-2">
            <text class="font-caption-sm text-12px text-ink-light-gray">{{ opt.count }}</text>
            <view v-if="opt.id === category" class="msi icon-check text-16px text-primary" />
          </view>
        </view>
      </view>
    </view>`,
    style: `.pg-page .is-hidden { display: none; }`,
  },

  profile: {
    imports: [
      "import { watch } from 'vue';",
      "import PassFilter from '@/components/PassFilter.vue';",
      "import ProfileVisitors from '@/components/ProfileVisitors.vue';",
      "import AppToast from '@/components/AppToast.vue';",
      "import { useProfilePage } from './behavior';",
    ],
    setup: `const {
  passTabs, passTab, onPickPassTab, areaName, appVersionLabel, visitors, stats, loading, error,
  toastVisible, toastText, onRefreshOfflineToken, onManageVisitors, onAllOrders, load,
} = useProfilePage();
// 首次可见时才拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
      // 设计稿没给 id：四态筛选按钮组的容器 class 唯一
      'grid grid-cols-4 gap-2 text-center py-1 relative z-10': {
        replace: '<PassFilter :items="passTabs" :value="passTab" @change="onPickPassTab" />',
      },
      // 常用出行人：设计稿画的是两张写死的卡（本人 / 同行），换成组件按真实数据渲染
      'grid grid-cols-2 gap-2.5': {
        replace: '<ProfileVisitors :visitors="visitors" />',
      },
      // 行程卡上的景点名：设计稿写死「枫林谷森林公园」，多景区下应跟随当前景点
      'font-headline-md text-sm font-bold text-ink-charcoal-text': { text: 'areaName' },
      // 页脚版本行：设计稿写死「枫林谷智慧文旅 V1.2.0」，改为平台名称 + 版本号。
      // 这一行**没有任何 class**（`<span class="">`），class 定位不了 ——
      // 所以在 design/reference/profile.html 里给它补了 `id="app-version"`，
      // 改设计稿而不是直接改产物，下次 `npm run gen` 才会复现。
      '#app-version': { text: 'appVersionLabel' },
      // 「管理」按钮：它的类名与后面的「刷新」按钮**完全一样**，只能按文档顺序取第 1 个
      //（「刷新」有 id，走下面那条，两者互不干扰）
      'flex items-center gap-0.5 text-primary text-caption-sm font-semibold hover:opacity-80 :nth(1)': {
        attrs: { '@tap': 'onManageVisitors' },
      },
      // 「全部预约单」：设计稿画了这个入口，但以前**连 @tap 都没有** —— 点了没反应
      'flex items-center gap-0.5 text-ink-light-gray text-caption-sm hover:text-primary transition-colors': {
        attrs: { '@tap': 'onAllOrders' },
      },
      '#refreshOfflineTokenBtn': { attrs: { '@tap': 'onRefreshOfflineToken' } },
      // 设计稿自带一段手写 JS 切 opacity-0 → opacity-100 显示 2s，这里换成组件
      '#toastNotification': { replace: '<AppToast :visible="toastVisible" :text="toastText" />' },
    },
  },
};
