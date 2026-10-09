/**
 * 页面行为绑定表
 *
 * 设计稿里那些 id 不是随手起的 —— 它们是原稿预留的交互钩子：
 *   credential: countdown-text / dynamic-qr-svg / refresh-qr-btn / export-pass-btn / watermark-line-1..3
 *   booking:    calendarScroll / dateScrollLeftFade / dateScrollRightFade / slotGrid
 *   profile:    passes / visitors / refreshOfflineTokenBtn / toastNotification
 *
 * gen-pages.mjs 按 id 找到对应元素，把这里声明的组件/属性/文本绑定注进去。
 * 这样**版式仍由设计稿生成**（保真度不打折），动态部分落在手写的 behavior.ts 与组件里。
 *
 * 支持的注入：
 *   replace : 整个元素替换成一段模板（通常是个组件）
 *   text    : 把元素的文本内容换成 {{ 表达式 }}
 *   attrs   : 追加属性（事件绑定等）
 *   class   : 按条件追加类（值是一个表达式字符串）
 */

export const PAGE_BINDINGS = {
  credential: {
    imports: [
      "import DynamicQr from '@/components/DynamicQr.vue';",
      "import { useCredentialPage } from './behavior';",
    ],
    setup: `const { qrSeed, countdownLabel, qrSpinning, refreshQr, watermarks, onExport } = useCredentialPage();`,
    bindings: {
      'dynamic-qr-svg': { replace: '<DynamicQr :seed="qrSeed" />' },
      'countdown-text': { text: 'countdownLabel' },
      'refresh-qr-btn': {
        attrs: { '@tap': 'refreshQr' },
        class: { 'is-spinning': 'qrSpinning' },
      },
      'watermark-line-1': { text: 'watermarks[0]' },
      'watermark-line-2': { text: 'watermarks[1]' },
      'watermark-line-3': { text: 'watermarks[2]' },
      'export-pass-btn': { attrs: { '@tap': 'onExport' } },
    },
    // 点刷新时让 refresh 图标转一圈（设计稿的 active:rotate-180 只在按住时转 180°）
    style: `.pg-page .is-spinning { animation: pg-spin 600ms linear; }`,
  },

  booking: {
    imports: ["import { useBookingPage } from './behavior';"],
    setup: `const { dateFade, onDateScroll } = useBookingPage();`,
    bindings: {
      // 横向滚动必须用 <scroll-view>：小程序里普通 view 的 overflow-x 不能可靠滚动。
      // wrapInner 是必需的：scroll-view 会把子元素包进内部容器，
      // 不把 flex 那组类挪进去的话，横向排布会塌成纵向堆叠。
      calendarScroll: {
        tag: 'scroll-view',
        wrapInner: true,
        attrs: { 'scroll-x': 'true', 'show-scrollbar': 'false', '@scroll': 'onDateScroll' },
      },
      // 设计稿用 opacity-0 / opacity-90 表示渐隐开关；两个遮罩都要能开也能关
      dateScrollLeftFade: { class: { 'is-on': 'dateFade.left', 'is-off': '!dateFade.left' } },
      dateScrollRightFade: { class: { 'is-on': 'dateFade.right', 'is-off': '!dateFade.right' } },
    },
    // 状态类要给到比工具类更高的特异性，否则压不过元素自带的 opacity-0
    style: `.pg-page .is-on { opacity: 0.9; }
.pg-page .is-off { opacity: 0; }`,
  },
};
