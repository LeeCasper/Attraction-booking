/**
 * 平台信息（`sys_config.platform`）的默认值。
 *
 * 两处消费，必须同一份：
 *   - `mini.controller.ts` 的 `GET /api/mini/platform/settings`（配置行缺失或字段缺失时兜底）
 *   - `scripts/seed.ts` 写入 `platform` 那一行
 *
 * 默认值与设计稿一致 —— 也就是**管理员不改的话，界面和以前一模一样**；
 * 改了才跟着变。这样上线这个特性本身不会带来任何视觉回归。
 *
 * **纯数据、零 import**（seed.ts 会 import 它，理由见 scenic-defaults.ts）。
 */
export const DEFAULT_PLATFORM_SETTINGS: Record<string, unknown> = {
  /** 顶栏中文名 */
  name: '枫林谷景区',
  /** 顶栏英文名 */
  nameEn: 'Fenglingu',
  /** 顶栏副标题 */
  subtitle: '国家生态自然公园 · 智慧文旅',
  /**
   * 自定义 Logo 地址。留空 = 用设计稿画的那个渐变方块 + 图标
   * （`PageHeader.vue` 里是纯 CSS，没有图片资源可换）
   */
  logoUrl: '',
  /** 客服电话（个人中心展示） */
  contactPhone: '',
  /** ICP 备案号 */
  icp: '',
  /** 版权/主办信息 */
  copyright: '',
  /**
   * 产品名，个人中心页脚渲染成「{name}{productName} {version}」。
   * 单独一项而不是写死「智慧文旅」：平台名里本来就可能带这几个字
   * （实测把 name 改成「苏州智慧文旅」会渲染成「苏州智慧文旅智慧文旅」）。
   */
  productName: '智慧文旅',
  /** 版本号，**自带 V 前缀**（模板不再补 V，否则填 `V2.0.0` 会渲染成 `VV2.0.0`） */
  version: 'V1.2.0',
};
