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
 *
 * ⚠️ replace 用在 grid/flex 容器上时，组件根节点必须**自己带容器的 class**：
 *    自定义组件会多一层节点，v-for 项放在组件里就不再是容器的直接子元素，栅格会塌。
 */

export const PAGE_BINDINGS = {
  credential: {
    imports: [
      "import { watch } from 'vue';",
      "import DynamicQr from '@/components/DynamicQr.vue';",
      "import PassPicker from '@/components/PassPicker.vue';",
      "import { useCredentialPage } from './behavior';",
    ],
    setup: `const {
  qrSeed, countdownLabel, qrSpinning, refreshQr, watermarks, onExport,
  passModes, passMode, onPickPassMode,
  periodLabel, holderLabel, statusLabel, load,
} = useCredentialPage();
// 首次可见时才拉数据
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
      '#dynamic-qr-svg': { replace: '<DynamicQr :seed="qrSeed" />' },
      '#countdown-text': { text: 'countdownLabel' },
      // 「入园时段」与「持票人」的值两行**类名完全相同**，只能靠文档顺序定位（第 1、2 个）
      'text-ink-charcoal-text font-bold mt-0.5 block :nth(1)': { text: 'periodLabel' },
      'text-ink-charcoal-text font-bold mt-0.5 block :nth(2)': { text: 'holderLabel' },
      // 「待使用」状态胶囊：这个类全页唯一
      'px-2.5 py-1 rounded-full text-[11px] font-bold': { text: 'statusLabel' },
      '#refresh-qr-btn': {
        attrs: { '@tap': 'refreshQr' },
        class: { 'is-spinning': 'qrSpinning' },
      },
      '#watermark-line-1': { text: 'watermarks[0]' },
      '#watermark-line-2': { text: 'watermarks[1]' },
      '#watermark-line-3': { text: 'watermarks[2]' },
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
      "import { watch } from 'vue';",
      "import DateCards from '@/components/DateCards.vue';",
      "import SlotGrid from '@/components/SlotGrid.vue';",
      "import VisitorPicker from '@/components/VisitorPicker.vue';",
      "import BookingBar from '@/components/BookingBar.vue';",
      "import { useBookingPage } from './behavior';",
    ],
    setup: `const {
  dateFade, onDateScroll, loading, error,
  dates, date, onPickDate,
  slots, slot, onPickSlot,
  visitors, pickedIds, selectionLabel, onToggleVisitor, onAddVisitor,
  totalAmount, headcount, canSubmit, onSubmit, load,
} = useBookingPage();
// 首次可见时才拉数据 —— 四个视图在单页外壳里同时挂载，不这么做启动时会并发四个请求
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });`,
    bindings: {
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

  profile: {
    imports: [
      "import { watch } from 'vue';",
      "import PassFilter from '@/components/PassFilter.vue';",
      "import ProfileVisitors from '@/components/ProfileVisitors.vue';",
      "import AppToast from '@/components/AppToast.vue';",
      "import { useProfilePage } from './behavior';",
    ],
    setup: `const {
  passTabs, passTab, onPickPassTab, visitors, stats, loading, error,
  toastVisible, toastText, onRefreshOfflineToken, onManageVisitors, load,
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
      // 「管理」按钮：它的类名与后面的「刷新」按钮**完全一样**，只能按文档顺序取第 1 个
      //（「刷新」有 id，走下面那条，两者互不干扰）
      'flex items-center gap-0.5 text-primary text-caption-sm font-semibold hover:opacity-80 :nth(1)': {
        attrs: { '@tap': 'onManageVisitors' },
      },
      '#refreshOfflineTokenBtn': { attrs: { '@tap': 'onRefreshOfflineToken' } },
      // 设计稿自带一段手写 JS 切 opacity-0 → opacity-100 显示 2s，这里换成组件
      '#toastNotification': { replace: '<AppToast :visible="toastVisible" :text="toastText" />' },
    },
  },
};
