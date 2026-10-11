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
      "import BannerCarousel from '@/components/BannerCarousel.vue';",
      "import AreaRecommendCard from '@/components/AreaRecommendCard.vue';",
      "import { useHomePage } from './behavior';",
    ],
    setup: `const {
  announcement, slides, recommended, stockStatus,
  onPickSlide, onPickArea, onQuickBooking, onQuickPass, onNotice, load,
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
      // banner：**整个换成轮播组件**（`#homeBanner` 是本轮补的 id，见 README）。
      // 设计稿是按**单景区**画的 —— 一张封面 + 写死「枫林谷森林公园」+ 写死的「在园率 38%」；
      // 多景区下这一块改成自动轮播的景点图，每屏的景点名/在园率/指示点都是那一屏自己的数据。
      // 因此下面原先那三条绑定（景点名 / 封面图 / 在园率）全部并进组件里，不再单独绑。
      '#homeBanner': { replace: '<BannerCarousel :slides="slides" @pick="onPickSlide" />' },
      // 两张快捷卡（U-002）：一键进入预约页 / 出示入园码。
      // 设计稿这两张卡没有 id，按各自独有的 class 定位
      'relative rounded-2xl bg-gradient-to-br from-surface-container-low to-surface-container border border-primary/25 p-3.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,104,95,0.08)] cursor-pointer active:scale-[0.98] transition-all group overflow-hidden':
        { attrs: { '@tap': 'onQuickBooking' } },
      'relative rounded-2xl bg-surface-container-lowest border border-outline-variant/60 p-3.5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.04)] cursor-pointer active:scale-[0.98] transition-all group overflow-hidden hover:border-primary/40':
        { attrs: { '@tap': 'onQuickPass' } },
      // 「推荐景点」的卡片列表（本轮从「门票选购」改过来的：这一节以前卖**当前景点**的票，
      // 于是用户在「景点选择」页点一下别的景点，首页整块跟着变 —— 见 behavior 的注解）。
      //
      // 设计稿这里画的是三张票卡，**三张卡的 class 逐字完全相同**（卡一与卡三连角标类都一样），
      // 只能按文档顺序定位：第 1 张整块 replace 成 v-for 列表，另两张 remove。
      // ⚠️ :nth 会放弃「恰好命中 1 个」的保护（只要求 >= N），且序号是全页命中顺序。
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(1)':
        {
          replace:
            '<AreaRecommendCard v-for="(a, i) in recommended" :key="a.id" :area="a" :index="i" :status="stockStatus(a)" @pick="onPickArea" />',
        },
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(2)':
        { remove: true },
      'p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3 hover:border-primary/40 transition-all :nth(3)':
        { remove: true },
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
  qrToken, qrHint, countdownLabel, refreshAfterLabel, qrSpinning, refreshQr, watermarks, onExport, onOrders,
  passModes, passMode, onPickPassMode,
  periodLabel, areaName, holderLabel, statusLabel,
  credentials, activeId, onPickCredential, credFadeLeft, onCredScroll,
  credCardClass, credWeekClass, credTicketClass, credPillClass, credDotClass, credHoverClass,
  refundPending, refundHintText, refundButtonLabel, credentialNo, load,
} = useCredentialPage();
// 首次可见时才拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
      // ⚠️ 外面这层 `w-full h-full` 是**必需的**，不是排版偏好：
      // 设计稿里 `<svg class="w-full h-full">` 是 218×218 白卡片的直接 flex 子项，`100%` 能直接
      // 对着 218px 解析；换成组件后多了一层宿主 `<dynamic-qr>`，卡片又是 `items-center` 不拉伸，
      // 宿主没有尺寸 → 组件根节点的 `height:100%` 无从计算 → 塌成 0 → 一个码点都画不出来。
      // 二维码区：正常出码；**退款审核中换成一整块说明** ——
      // 原先只是在空框里显示一行小字「退款中」，太小太弱，用户看不出来发生了什么。
      // 这一块：会呼吸的沙漏 + 标题 + 子行（子行说的是「接下来会怎样」）。
      '#dynamic-qr-svg': {
        replace:
          '<view v-if="!refundPending" class="w-full h-full"><DynamicQr :token="qrToken" :hint="qrHint" /></view>' +
          '<view v-else class="w-full h-full flex flex-col items-center justify-center gap-2">' +
          '<view class="relative w-16 h-16 rounded-full bg-amber-gold_15 flex items-center justify-center">' +
          '<view class="msi icon-hourglass_top text-28px text-amber-gold animate-pulse" />' +
          '<text class="absolute -top-1 -right-2 w-2_5 h-2_5 rounded-full bg-amber-gold animate-ping" />' +
          '</view>' +
          '<text class="font-headline-md text-17px font-bold text-tertiary-container">退款审核中</text>' +
          '<text class="font-caption-sm text-12px text-ink-light-gray">凭证已停用</text>' +
          // 「接下来会怎样」那句只放在**框下面**那一行（`v-else` 的那条绑定）——两处都写会在同一屏重复
          '</view>',
      },
      // 二维码那个白框：退款中把描边与光环换成琥珀色（框本身就在提示「这里现在不是码」）
      'relative w-[218px] h-[218px] bg-white rounded-2xl border-2 border-primary/30 p-2.5 shadow-sm flex items-center justify-center ring-4 ring-mist-cyan-50':
        { class: { 'is-blocked': 'refundPending' } },
      // 凭证选择条：写成**页面模板里的普通标记**（不走组件），与购票页那条日期条同一个做法。
      //
      // 它一度是个组件（`CredentialPicker.vue`）。改动过程留下一段值得记的教训：
      // 用户报「切走再切回就不见了」，我连着改了三轮结构（组件节点上的 v-if → 组件根节点的
      // v-if → 去掉条件 → 改成页面模板里的标记），**每轮复测都说还是不见**；
      // 最后**关掉工程重新导入**之后就好了。也就是说前几轮很可能根本没被开发者工具读进去 ——
      // `uni build` 会先清空整个产物目录，工具正开着该目录时它会看到半份产物，
      // 之后增量编译也不一定重建（README「改完代码后页面报 module is not defined」那节记过）。
      // **以后遇到「代码明明改了、工具里没变化」，先关掉工程重新导入一次再怀疑代码。**
      //
      // 现在的形态保留（比组件少一层边界、也少一次 createSelectorQuery 测量），
      // 外面那层 `v-if="props.active"` 也保留：每次切回凭证页这一块都重新创建，
      // 不带上一次的滚动位置/布局状态回来（对 `scroll-view` 跨显隐保状态那个老毛病是廉价保险）。
      '#credentialPicker': {
        replace:
          '<view v-if="props.active" class="relative -mx-margin mb-2">' +
          // 两端渐隐：左侧滚过才出现；右侧常显（从页面底色渐变到透明，装得下时看不出来）
          '<view class="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent z-10 transition-opacity duration-200" :style="{ opacity: credFadeLeft ? 0.9 : 0 }" />' +
          '<view class="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent z-10 transition-opacity duration-200" style="opacity: 0.9" />' +
          '<scroll-view class="w-full pg-cred-scroll" scroll-x="true" :show-scrollbar="false" style="scroll-behavior: smooth" @scroll="onCredScroll">' +
          '<view class="flex items-center gap-2_5 min-h-44px">' +
          // 一张可入园凭证都没有时给一句话（而不是一条空白的渐变带）——
          // 顺带它也是一条**判据**：看不到卡片、却看到这句话 = 客户端手里确实没有凭证数据；
          // 两样都看不到 = 这一整块根本没渲染出来。两种故障的修法完全不同。
          '<view v-if="!credentials.length" class="text-12px text-ink-light-gray px-1">暂无可入园的凭证</view>' +
          '<view v-for="c in credentials" :key="c.id" :class="credCardClass(c)" :hover-class="credHoverClass(c)" @tap="onPickCredential(c.id)">' +
          '<view class="flex items-center justify-between w-full">' +
          '<text class="font-data-metric-md text-15px font-bold leading-none">{{ c.dateLabel }}</text>' +
          '<text :class="credWeekClass(c)">{{ c.weekLabel }}</text>' +
          '</view>' +
          '<text :class="credTicketClass(c)">{{ c.ticketName || \'门票\' }}</text>' +
          '<text :class="credPillClass(c)">' +
          '<text v-if="c.refundPending" :class="credDotClass(c)" />' +
          '<text>{{ c.refundPending ? \'退款中\' : `余 ${c.remaining} 人` }}</text>' +
          '</text>' +
          // 选中卡底部的小三角，指向下面那张凭证卡
          '<view v-if="c.id === activeId" class="absolute -bottom-2 left-1_2 -translate-x-1_2 w-0 h-0 border-x-4 border-x-transparent border-t-6px border-t-primary_30" />' +
          '</view>' +
          '</view>' +
          '</scroll-view>' +
          '</view>',
      },
      '#credentialNoRow': { class: { 'is-hidden': '!credentialNo' } },
      '#credentialNoText': { text: 'credentialNo' },
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
      // 退款审核中时这一行换成说明：那时**没有码在走**，还显示「剩余 30s」就是骗人
      'font-caption-sm text-[12px] text-ink-light-gray :nth(2)': {
        replace:
          '<text v-if="!refundPending" class="font-caption-sm text-12px text-ink-light-gray">动态码每 {{ refreshAfterLabel }} 秒刷新 · 剩余 ' +
          '<text class="text-primary font-bold">{{ countdownLabel }}</text></text>' +
          '<text v-else class="font-caption-sm text-12px text-tertiary-container font-medium">审核通过后退款到账；未通过则凭证自动恢复</text>',
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
      // 「申请退改」：文案跟着状态走（退款审核中 → 「退款中」），同时置灰
      'flex-1 h-11 rounded-full border border-silk-border bg-paper-surface hover:bg-surface-container-low text-ink-charcoal-text font-body-sm text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-2xs':
        {
          attrs: { '@tap': 'onOrders' },
          class: { 'is-dimmed': 'refundPending' },
          inner:
            '<view class="msi icon-currency_exchange text-16px text-ink-light-gray" /><text>{{ refundButtonLabel }}</text>',
        },
      '#export-pass-btn': { attrs: { '@tap': 'onExport' } },
      // 设计稿没给 id：容器 class 唯一，用它定位（组件根节点带这组 grid 类）
      'grid grid-cols-3 gap-2.5 text-center': {
        replace: '<PassPicker :options="passModes" :value="passMode" @change="onPickPassMode" />',
      },
    },
    // 点刷新时让 refresh 图标转一圈（设计稿的 active:rotate-180 只在按住时转 180°）
    // `is-dimmed`：退款审核中时把「退款中」那颗按钮压暗（点了会提示原因，见 behavior）
    style: `.pg-page .is-spinning { animation: pg-spin 600ms linear; }
/* 凭证选择条（原组件里的那三条，随版式一起挪进页面）：内边距与吸附属于**滚动容器**，
   放内容上会被吸附滚掉、第一张卡贴屏幕边；min-height 是防止真机 hide/show 后塌成 0 */
.pg-page .pg-cred-scroll {
  min-height: 140rpx;
  padding: 15.38rpx 30.77rpx;
  scroll-padding-left: 30.77rpx;
  scroll-padding-right: 30.77rpx;
  scroll-snap-type: x proximity;
}
.pg-page .is-dimmed { opacity: 0.55; }
.pg-page .is-hidden { display: none; }
/* 退款审核中：二维码那个白框整体换成琥珀（与框里那块说明同一个语义） */
.pg-page .is-blocked {
  border-color: rgba(217, 119, 6, 0.45) !important;
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.1) !important;
  background-color: #fffdf7 !important;
}`,
  },

  booking: {
    imports: [
      "import { onLoad } from '@dcloudio/uni-app';",
      "import DateCards from '@/components/DateCards.vue';",
      "import SlotGrid from '@/components/SlotGrid.vue';",
      "import VisitorPicker from '@/components/VisitorPicker.vue';",
      "import BookingBar from '@/components/BookingBar.vue';",
      "import TicketPicker from '@/components/TicketPicker.vue';",
      "import { useBookingPage } from './behavior';",
    ],
    setup: `const {
  statusBarHeight, capsuleInset, goBack,
  dateFade, onDateScroll, loading, error,
  dates, date, onPickDate,
  slots, slot, onPickSlot,
  visitors, pickedIds, selectionLabel, onToggleVisitor, onAddVisitor,
  pageTitle, areaCover, ticketName, ticketAudience, ticketPrice, unitLabel,
  ticketTypeId, ticketOptions, onPickTicketType,
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
    </view>
    <!-- 加载失败要把话说出来：这一页的版式是设计稿的固定几节，出错时它们只会显示「—」，
         看着像页面坏了。最常见的一句是「该景区暂无可在线预约的票种」（该景点只配了按张卖的票种）。
         样式与「景点选择」页的错误条同一套。 -->
    <view v-if="error" class="px-4 mt-space-sm">
      <text class="block rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</text>
    </view>`,
    bindings: {
      // 头卡那张缩略图：设计稿是一张**写死的位图**（`banner-booking.jpg`），后台上传景点封面
      // 完全改不动它。现在绑成**当前景点自己的封面**（`scenic_area.cover_url`，后台景区抽屉里传），
      // 没传就回落到设计稿那张图（`image` 绑定的既有语义）。
      // ⚠️ 这一条走的是**设计稿里的真 `<img>` 节点**，与首页 banner 那条（背景图容器）不同 ——
      // 生成器原本只给 background-image 插进去的 `<image>` 支持 `image` 绑定，本轮补齐到 `<img>`。
      'w-full h-full object-cover': { image: 'areaCover' },
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
      // 横向滚动必须用 <scroll-view>：小程序里普通 view 的 overflow-x 不能可靠滚动。
      // 设计稿那层滚动容器上还有 `px-4 py-2 snap-x` —— 它们**必须留在滚动容器上**
      // （页面本级的 `pg-date-scroll`，见下面 style），别挪进 DateCards：
      //   · `px-4` 挂在滚动内容上时会被 scroll-snap 吸附滚掉 ⇒ 第一张卡贴屏幕边
      //   · `overflow-x-auto` 挂在内容上会造出第二层滚动容器 ⇒ 真正滚的是它，
      //     外面这个 `<scroll-view>` 的 `@scroll` 永不触发，左右渐隐遮罩就永远不动
      '#calendarScroll': {
        tag: 'scroll-view',
        ownClass: 'w-full pg-date-scroll',
        attrs: { 'scroll-x': 'true', 'show-scrollbar': 'false', '@scroll': 'onDateScroll' },
        inner: '<DateCards :dates="dates" :value="date" @change="onPickDate" />',
      },
      // 设计稿用 opacity-0 / opacity-90 表示渐隐开关；两个遮罩都要能开也能关
      '#dateScrollLeftFade': { class: { 'is-on': 'dateFade.left', 'is-off': '!dateFade.left' } },
      '#dateScrollRightFade': { class: { 'is-on': 'dateFade.right', 'is-off': '!dateFade.right' } },
      '#slotGrid': { replace: '<SlotGrid :slots="slots" :value="slot" @change="onPickSlot" />' },
      // 「选择票种」（**设计稿没有这一节**：它把票种写死成顶卡上的「成人全票 ¥120」，
      // 是按单景区单票种画的）。后台一个景点可以配多个票种，而从「景点选择」页进来的用户
      // 原先没有任何换票种的入口 —— 默认永远是列表里的第一个（成人票）。
      // 版式沿用同一页「入园时段」那一节的选中样式，见 components/TicketPicker.vue。
      '#ticketPicker': {
        replace: '<TicketPicker :tickets="ticketOptions" :value="ticketTypeId" @change="onPickTicketType" />',
      },

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
    /**
     * 日期横向条（`pg-date-scroll` 加在 `<scroll-view>` 上）。
     *
     * 三条都是刻意的，改之前先读：
     *  1. `padding` 放在**滚动容器**上 —— 放内容上会被吸附滚掉（第一张卡贴屏幕边）
     *  2. `scroll-padding-*` 让**吸附点**从这道内边距之后开始算。滚动端口是 padding box、
     *     不含 padding，没有它的话哪怕内边距留在容器上，吸附时也会把卡片吸到贴边
     *  3. `scroll-snap-type: x proximity` 而不是设计稿的 `mandatory`：
     *     proximity 只在「快要对齐」时才吸，静止时不会强行把第一张卡吸到贴边 ——
     *     设计稿那种 mandatory 在浏览器里也一样会吃掉内边距，只是它把内边距放在容器上、
     *     又没测过贴边的情况。手感不变（滑动到头仍会对齐）。
     */
    style: `.pg-page .is-on { opacity: 0.9; }
.pg-page .is-off { opacity: 0; }
.pg-page .pg-date-scroll {
  padding: 15.38rpx 30.77rpx;
  scroll-padding-left: 30.77rpx;
  scroll-padding-right: 30.77rpx;
  scroll-snap-type: x proximity;
}`,
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
      // 分类条：只列分类本身（`categories`）。数量是「筛选」弹层里才要的信息 ——
      // 弹层里一行一个分类、带个数字很好读；放到横滑卡片的第二行就显得啰嗦
      '#categoryTabs': {
        replace: '<CategoryTabs :items="categories" :value="category" @change="onPickCategory" />',
      },
      // 承载横幅：设计稿把呼吸点和文案写在同一个 span 里，没法只换文案 → 整块换组件
      'bg-surface-container-low rounded-xl p-3 flex items-start gap-2.5 shadow-sm': {
        replace: '<PresenceBanner :label="presenceLabel" />',
      },
      // 套票推荐通栏：后端没有套票/联票这个概念，留着等于卖一个不存在的东西
      'px-margin mt-space-sm mb-space-sm': { remove: true },
      // 四张写死的景点卡 → 一个组件按真实数据渲染。
      // 空态是**本轮补的**：分类条现在会显示「N 个景点」，0 个的分类点进去、或者搜索词
      // 谁都不匹配时，原来列表是一片空白（卡片位都没有），看着像没加载出来。
      'px-margin flex flex-col gap-3.5 mb-space-md': {
        inner:
          '<view v-if="!loading && filteredAreas.length === 0" class="rounded-2xl bg-paper-surface border border-silk-border shadow-sm p-space-md flex flex-col items-center gap-1_5">' +
          '<view class="msi icon-explore text-28px text-ink-light-gray" />' +
          '<text class="font-body-md text-14px font-medium text-ink-charcoal-text">没有匹配的景点</text>' +
          '<text class="font-caption-sm text-12px text-ink-light-gray">{{ keyword ? \'换个关键词试试，或点「全部景点」\' : \'这个分类下还没有开放中的景点\' }}</text>' +
          '</view>' +
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
      "import RecentOrderCard from '@/components/RecentOrderCard.vue';",
      "import ProfileVisitors from '@/components/ProfileVisitors.vue';",
      "import AppToast from '@/components/AppToast.vue';",
      "import { useProfilePage } from './behavior';",
    ],
    setup: `const {
  passTabs, passTab, onPickPassTab, recentOrder, onRecentPrimary, onRecentSecondary,
  appVersionLabel, visitors, stats, loading, error,
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
      // 「最近一单」卡片：**跟着上面选中的那一格走**（本轮改的）。
      // 以前这张卡是写死的 mock 行程 —— 四格点哪个都一样，因为四格都只是跳到订单列表。
      // 现在点某一格 → 这张卡切到那一态最近的一单；「全部预约单」才是进列表的入口。
      // id 是本轮补的（卡片那几个类没有更特异的，见 README 的「设计稿里补过的 id」）。
      '#recentPassCard': {
        replace:
          '<RecentOrderCard :view="recentOrder" @primary="onRecentPrimary" @secondary="onRecentSecondary" />',
      },
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

  /**
   * 订单支付页 —— **购票页点「立即预约」之后**才进来的二级页（下单 → 支付 → 凭证）。
   *
   * 与 booking 一样是 `standalone`：设计稿自带固定页头与固定底部操作栏，
   * 生成器只取 `<main>` 的子节点（页头拿不到），所以标题栏由下面的 `before` 片段自绘，
   * 并据此去掉给固定页头让位的 `pt-14`。
   *
   * 设计稿里那三处「后端没有对应能力」的地方（另两个支付渠道、意外险/补贴两行、
   * 闸机门名）怎么处理，**口径都写在 `pages/pay/behavior.ts` 的注解里**，
   * 这里只落实现。要点：版式尽量不动，但**不抄一个系统做不到的承诺**。
   */
  pay: {
    imports: [
      "import { usePayPage } from './behavior';",
      "import PayMethods from '@/components/PayMethods.vue';",
    ],
    // 二级页（购票页 / 订单详情进来的），收不到外壳的 `props.active` ——
    // 首次加载挂在小程序页生命周期上，由 behavior 自己 `onLoad` 里读 query 里的订单号触发。
    // 只解模板真正用到的（其余状态经由 `canPay`/`payButtonLabel` 这类计算属性间接体现）
    setup: `const {
  statusBarHeight, goBack,
  loading, error, order,
  timerLabel, totalLabel, amountHint, visitorsTitle, visitors,
  areaName, ticketName, dateLabel, slotLabel, ticketSummary, unitLabel, feeItemLabel,
  onPickPay, toggleAgree, agreeIconClass, canPay,
  drawerOpen, toggleDrawer, payButtonLabel, policyTitle, refundNote, onDoc, noop,
  onPay,
} = usePayPage();`,
    // 设计稿的页头是**固定**的（fixed top-0 + pt-safe），但它拿不到 —— 生成器只取 <main>。
    // 这里照设计稿的版式自绘一条：状态栏占位 + 56px 横条（返回键 + 绝对居中的标题）。
    // 标题走 `absolute left-1/2 -translate-x-1/2`（设计稿原样），**不做胶囊避让** ——
    // 补右内边距会把居中基准一起推走，这是景点选择页踩过的坑（见 AreaTopBar.vue）。
    before: `<view :style="{ height: statusBarHeight + 'px' }" />
    <view class="relative h-14 px-gutter flex items-center">
      <view
        class="w-11 h-11 -ml-space-xs flex items-center justify-center text-on-surface"
        hover-class="pg-hover"
        @tap="goBack"
      >
        <view class="msi icon-arrow_back_ios_new text-24px" />
      </view>
      <text class="absolute left-1_2 -translate-x-1_2 font-headline-md text-headline-md text-on-surface tracking-tight">订单支付</text>
    </view>
    <view v-if="loading && !order" class="px-margin pt-space-md text-center font-caption-sm text-caption-sm text-ink-light-gray">
      <text>正在加载订单…</text>
    </view>
    <view v-else-if="error" class="px-margin mt-space-sm">
      <text class="block rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</text>
    </view>`,
    bindings: {
      // —— 1. 支付倒计时横幅 ——
      // 时间是**订单自己的 payDeadline**（下单 + sys_config 的支付超时），不是本地另起的 15 分钟
      '#payment-timer': { text: 'timerLabel' },

      // —— 2. 应付总额卡 ——
      //
      // 金额整行用 `inner` 重写，而不是只绑那个数字 —— **¥ 与数字必须同一套字**。
      // 设计稿给的是 `<span class="font-headline-lg …">¥</span><span class="font-display-kpi-screen …">240.00</span>`：
      // 前者是标题宋体、后者是 Space Grotesk（¥ 细衬线 + 数字粗几何）。
      // 全站统一成两套字体后 `display-kpi-screen` 已并到正文族，这里只要把 ¥ 也换成正文族。
      // ⚠️ 不能写成 `font-body-lg text-headline-lg` —— `.text-headline-lg` 在我们这套转换里
      // **自带 font-family: $font-serif**，而 `utilities.scss` 里 `.font-*` 排在 `.text-*` 之前，
      // 结果是衬线反过来压掉 `font-body-lg`。所以字号用**不带族**的 `text-22px`（= headline-lg 的号）。
      'flex items-baseline justify-center mt-1 text-primary': {
        inner:
          '<text class="font-body-lg text-22px font-bold mr-0_5">¥</text>' +
          '<text class="font-display-kpi-screen text-display-kpi-screen font-extrabold tracking-tight">{{ totalLabel }}</text>',
      },
      // 「含 2 位游客门票及景区人身意外险」→ 改成真实的人数与**不虚构保险**（后端没有这个险）
      'inline-flex items-center justify-center mt-1.5 px-space-sm py-0.5 rounded-full bg-surface-container-low font-caption-sm text-caption-sm text-on-surface-variant':
        {
          inner:
            '<view class="msi icon-verified_user text-14px mr-1 text-primary" /><text>{{ amountHint }}</text>',
        },

      // —— 3. 预约景点与场次信息卡 ——
      // 上方角标改放**票种名**（设计稿写死「主景区联票」，后端没有套票这个概念）
      'font-label-badge text-label-badge text-surface-tint bg-bamboo-light-100 px-1.5 py-0.5 rounded':
        { text: 'ticketName' },
      // 标题改放**真实景区名**（设计稿写死「枫林谷国家森林公园 · 云巅栈道」）
      'font-headline-md text-headline-md text-ink-charcoal-text font-bold mt-1 leading-snug': { text: 'areaName' },
      // 日期行与票种行：设计稿各自写死（「2026年10月09日 周一」「成人全票 × 2张」），
      // 两行的容器 class 完全一样，只能按文档顺序取第 1、2 个。
      // ⚠️ 内层那个 `text-primary font-semibold` 是**子集匹配**会撞上协议里的三个链接的
      // （它们多一个 hover:underline，但包含关系成立），所以整行用 inner 重写而不是去绑那个 span。
      'flex items-center text-ink-dark-gray font-body-sm text-body-sm :nth(1)': {
        inner:
          '<view class="msi icon-calendar_month text-primary text-18px mr-2 shrink-0" />' +
          '<text class="font-medium">{{ dateLabel }}</text>' +
          '<text class="mx-1 text-outline">|</text>' +
          '<text class="text-primary font-semibold">{{ slotLabel }}</text>',
      },
      'flex items-center text-ink-dark-gray font-body-sm text-body-sm :nth(2)': {
        inner:
          '<view class="msi icon-confirmation_number text-primary text-18px mr-2 shrink-0" />' +
          '<text>{{ ticketSummary }}</text>' +
          '<text class="text-ink-light-gray ml-1_5">{{ unitLabel }}</text>',
      },
      // 闸机说明：修掉设计稿的「凭动态动态凭证」重复字，并去掉写死的门名
      //（小程序端没有闸机列表接口，编一个门名等于告诉游客走一个可能不存在的门）
      'font-caption-sm text-caption-sm text-deep-teal-800 leading-relaxed': {
        inner:
          '<text class="font-semibold">通行保障：</text>' +
          '<text>凭动态凭证或二代身份证在景区闸机感应开闸通行，闸机直连入园。</text>',
      },

      // —— 4. 实名出行人卡 ——
      // 标题带人数。这一行**没有能唯一定位的类**：它的 4 个类与抽屉里「金额明细」那个 h4
      // **完全相同**（只是书写次序不同），子集匹配命中 5 个、全等匹配命中 2 个。
      // 与个人中心页脚那行同样的处理：在设计稿里补 `id="visitors-title"`，而不是去改产物。
      '#visitors-title': { text: 'visitorsTitle' },
      // 两张写死的游客卡（张*林 / 李*婷）→ v-for 真实持票人
      'space-y-space-sm': {
        inner: `<view
        v-for="(v, i) in visitors"
        :key="v.id"
        class="bg-surface-container-low p-space-sm rounded-lg flex items-center justify-between"
      >
        <view class="flex items-start space-x-2">
          <view
            class="w-6 h-6 rounded-full flex items-center justify-center font-label-badge text-11px font-bold mt-0_5"
            :class="i === 0 ? 'bg-primary text-on-primary' : 'bg-outline-variant text-on-surface'"
          >
            <text>{{ i + 1 }}</text>
          </view>
          <view>
            <view class="flex items-center space-x-1_5">
              <text class="font-body-md text-body-md font-bold text-ink-charcoal-text">{{ v.name }}</text>
              <text
                class="font-caption-sm text-11px px-1_5 py-0_2 rounded"
                :class="i === 0 ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-surface-container-high text-on-surface-variant'"
              >{{ i === 0 ? '主出行人' : '同行人' }}</text>
            </view>
            <view class="font-caption-sm text-caption-sm text-ink-light-gray mt-0_5 font-mono"><text>身份证: {{ v.idCard }}</text></view>
            <view class="font-caption-sm text-caption-sm text-ink-light-gray font-mono"><text>手机号: {{ v.phone }}</text></view>
          </view>
        </view>
        <view class="msi icon-id_card text-outline-variant text-20px" />
      </view>`,
      },

      // —— 5. 费用明细 ——
      // 只列**真实构成**：门票 × 人数 = 实付。设计稿的「景区游览意外险 赠送 ¥0.00」与
      // 「绿色文旅惠民补贴 立减 -¥0.00」后端都没有字段 —— 尤其保险不是营销文案，
      // 系统既不签发也不承保，抄了就是对游客的一句空承诺。
      // 这个容器 class 与抽屉里那份**完全一样**，按文档顺序取第 1（费用明细卡）、第 2（抽屉）。
      'space-y-2 font-body-sm text-body-sm text-ink-dark-gray :nth(1)': {
        inner:
          '<view class="flex justify-between items-center">' +
          '<text>{{ feeItemLabel }}</text>' +
          '<text class="font-data-metric-md text-ink-charcoal-text font-semibold">¥{{ totalLabel }}</text>' +
          '</view>' +
          '<view class="pt-2 mt-2 flex justify-between items-center font-body-md text-body-md font-bold text-ink-charcoal-text">' +
          '<text>实付金额</text>' +
          // `text-headline-md` 换成 `text-18px`：前者**连字体族一起输出**（Noto Serif），
          // 会把 `font-data-metric-lg` 的正文族顶掉，同一张卡里两行金额字体不一致。
          '<text class="font-data-metric-lg text-18px text-primary">¥{{ totalLabel }}</text>' +
          '</view>',
      },
      'space-y-2 font-body-sm text-body-sm text-ink-dark-gray :nth(2)': {
        inner:
          '<view class="flex justify-between">' +
          '<text>{{ feeItemLabel }}</text>' +
          '<text>¥{{ totalLabel }}</text>' +
          '</view>',
      },

      // —— 6. 支付方式 ——
      // 后端只有微信 JSAPI 支付，亲属卡与数字人民币**没有对应渠道**。
      // 两行的版式原样保留（设计稿就是这么画的），但点了如实提示「暂未开通」——
      // 删掉它们会让这一块只剩一行，保留又必须有反馈，所以两个都留、只把话说清楚。
      //
      // —— 6. 支付方式：整块换成组件 ——
      //
      // 设计稿画了**三行**（微信支付 / 微信亲属卡·零钱通 / 数字人民币），每行是「彩色圆底 +
      // Material 图标」。这轮按用户要求改成：
      //   · **删掉「亲属卡 / 零钱通」那一行**（后端只有微信 JSAPI，没有那个渠道）
      //   · 图标换成**真品牌图**（`static/images/pay-wechat.png` / `pay-ecny.png`）
      //   · 整体更素：图标不套圆圈、副标题一行、右侧只留一枚勾选圈
      // 数字人民币仍然不可选（点了提示「暂未开通」），理由与实现见 `PayMethods.vue` 的注解。
      //
      // 组件根节点自己带 `flex flex-col gap-2`（原来那层 `space-y-2.5` 的等价物）——
      // 自定义组件会多一层节点，容器类不落在根上，两行之间的间距就没了。
      'space-y-2.5': {
        // 选中态**写死微信支付**：能真正走通的只有它（数字人民币点了会提示未开通），
        // 所以这里不需要把「选了哪种」做成响应式状态
        replace: '<PayMethods value="wechat" @pick="onPickPay" />',
      },

      // —— 7. 退改与入园须知 ——
      // 整段重写：协议名里的**品牌主体**要跟着后台「平台信息」走（设计稿写死「枫林谷」），
      // 而那句退改说明与后端实际规则**不一致** —— 设计稿说「未核销游玩日前可全额极速退款」，
      // 真实规则（`pay.service.refundFee`）是「游玩日前 1 天方免手续费、当天收 feeRate 比例、
      // 过预约日不退」，且退款要**后台审核**而不是「极速到账」。
      'font-caption-sm text-caption-sm text-ink-dark-gray leading-relaxed': {
        inner: `<text>我已阅读并同意</text><text class="text-primary font-semibold" @tap="onDoc">《{{ policyTitle }}》</text><text>、</text><text class="text-primary font-semibold" @tap="onDoc">《游客须知》</text><text>及</text><text class="text-primary font-semibold" @tap="onDoc">《门禁实名制隐私协议》</text>
        <view class="text-ink-light-gray mt-0_5"><text>• {{ refundNote }}</text></view>`,
      },
      '#agree-checkbox': { attrs: { '@tap': 'toggleAgree' } },
      // 勾选框的图标：设计稿靠 JS 换文字（check_box ↔ check_box_outline_blank）。
      // 这里用 replace 而不是 text 绑定 —— 图标节点是 `<view class="msi icon-xxx" />`，
      // 生成器对图标只认 remove/replace（图标名就在 class 里，绑定 attrs/text 都会被跳过）。
      '#agree-icon': { replace: '<view :class="agreeIconClass" />' },

      // —— 8. 底部固定操作栏 ——
      'flex flex-col cursor-pointer': { attrs: { '@tap': 'toggleDrawer' } },
      // 底栏金额同理：¥ 原本是 `font-headline-md`（衬线）、数字是 `font-data-metric-lg`（正文族）→ 拉齐
      'flex items-baseline text-primary font-bold': {
        inner:
          '<text class="font-body-md text-18px font-semibold mr-0_5">¥</text>' +
          '<text class="font-data-metric-lg text-data-metric-lg font-extrabold tracking-tight">{{ totalLabel }}</text>',
      },
      '#arrow-icon': {
        replace: '<view class="msi icon-expand_less text-16px text-ink-light-gray ml-0_5 transform transition-transform" :class="{ \'is-flip\': drawerOpen }" />',
      },
      '#submit-pay-btn': {
        attrs: { '@tap': 'onPay' },
        class: { 'opacity-60': '!canPay' },
        inner: '<view class="msi icon-lock text-18px" /><text>{{ payButtonLabel }}</text>',
      },
      // 「待支付 ¥240」那一块：点开金额明细抽屉（设计稿就是这么画的）——
      // 上面 `flex flex-col cursor-pointer` 那个父节点已经挂了 @tap，
      // **子节点的「待支付」行不能再挂一次**：小程序的事件会冒泡，两处都挂就是「开一次又关一次」，
      // 表现是抽屉点了没反应。
      // 取消订单也**不放在这里** —— 设计稿的底栏没有这个入口，订单详情页已经有了；
      // 超时未付还会由服务端自动取消并释放名额（横幅那句「名额保留中」说的就是这个）。

      // —— 9. 金额明细抽屉 ——
      // 设计稿靠 JS 切 hidden / opacity-0。小程序里 class 切换要过绑定，
      // 而 `hidden` 是 display:none，得保证 `is-open` 的特异性压得过它（用 .pg-page 垫一层，
      // 与景点选择页的 is-hidden 同一套）。
      '#details-drawer': {
        attrs: { '@tap': 'toggleDrawer' },
        class: { 'is-open': 'drawerOpen' },
      },
      // 抽屉本体要吞掉冒泡，否则点面板也会被上面那层遮罩关掉
      'absolute bottom-16 inset-x-0 bg-paper-surface rounded-t-2xl p-space-md shadow-2xl': {
        attrs: { '@tap.stop': 'noop' },
      },
      // 面板右上角那个 ×（设计稿的 `onclick=toggleDetailsPopup()` 被生成器丢掉了）
      'text-ink-light-gray hover:text-ink-charcoal-text': { attrs: { '@tap': 'toggleDrawer' } },
    },
    // 金额曾经用过一个 `pg-figure` 的 scoped 覆盖把 ¥ 与数字拉回正文族 ——
    // 全站统一成两套字体之后它没必要了（`display-kpi-screen` 在 token 表里就是正文族），
    // 已删；倒是这个「覆盖类一删掉就少一处特例」本身是那次统一做对了的证据。
    style: `.pg-page .is-open { display: block; opacity: 1; }
.pg-page .is-flip { transform: rotate(180deg); }`,
  },
};
