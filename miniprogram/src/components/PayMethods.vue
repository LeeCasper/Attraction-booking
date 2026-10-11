<script setup lang="ts">
/**
 * 订单支付页的「支付方式」—— 设计稿那一组三行，这里改成**两行**并用**真实品牌图标**。
 *
 * 与设计稿的三处偏离（都是用户这轮点名的）：
 *   ① **删掉「微信亲属卡 / 零钱通」那一行**。后端 `wxpay` 模块只有微信 JSAPI 支付，
 *      亲属卡/零钱通没有渠道可调 —— 留着它就是摆一个点不动的东西，删掉更干净。
 *   ② 图标换成**真图**（`static/images/pay-wechat.png` / `pay-ecny.png`）：
 *      设计稿是三个彩色圆底 + Material 图标（青/米/红），一眼假；真 logo 一眼认得出，
 *      视觉上也更素（少三块色块）。
 *   ③ 两行都**更简**：图标不再套圆圈底色，副标题压到一行短句，右侧只留一枚勾选圈。
 *
 * 数字人民币这一行**仍然不可选**（后端没有 e-CNY 渠道）—— 点了如实说一句，
 * 不假装能选、也不把它删掉：它和微信支付并排出现，本身就是「以后会支持」的信号。
 * 真要做，需要先有 e-CNY 的商户受理与对账，那是另一件事（见 README 已知偏差）。
 *
 * ⚠️ 组件根节点自己带容器的类（`space-y-2.5` 那一层）—— 自定义组件会多一层节点，
 * 容器类不落在根上，两行之间的间距就没了（同 DateCards / SlotGrid 的注解）。
 */
interface PayMethod {
  id: 'wechat' | 'ecny';
  /** 静态图（`static/images/` 下的本地资源） */
  icon: string;
  name: string;
  desc: string;
  /** 右侧文字角标（微信支付那枚「推荐」） */
  badge?: string;
}

const props = defineProps<{ value: string }>();
const emit = defineEmits<{ pick: [id: PayMethod['id']] }>();

/** 只有微信 JSAPI 是真能走的渠道；数字人民币点了如实提示 */
const METHODS: PayMethod[] = [
  {
    id: 'wechat',
    icon: '/static/images/pay-wechat.png',
    name: '微信支付',
    desc: '亿万用户的安全优选',
    badge: '推荐',
  },
  {
    id: 'ecny',
    icon: '/static/images/pay-ecny.png',
    name: '数字人民币（e-CNY）',
    desc: '国家法定数字货币',
  },
];

// —— class 常量（条件类走标识符：`check:classes` 会把模板三目里的引号串当类名扫）——
const LIST = 'flex flex-col gap-2';
const ROW_BASE = 'flex items-center gap-3 p-2_5 rounded-lg transition-colors';
/** 选中：淡青底 + 一圈细青边（比设计稿的实心色块轻，也不靠颜色区分「能点/不能点」） */
const ROW_ON = 'bg-bamboo-light-100_40 border border-primary_20';
// 未选：只留灰底、不加边框 —— 选中那行多一条 1px 边（两行各自静态，不会来回跳）
// ⚠️ 不要写 `border border-transparent`：`border-transparent` 不在 classmap 里（设计稿没用过），
// 而只写 `border` 会取 CSS 默认的 `currentColor` ⇒ 一条黑边
const ROW_OFF = 'bg-surface-container-low';
const ICON_BOX = 'w-7 h-7 shrink-0 flex items-center justify-center';
const NAME = 'font-body-md text-14px font-bold text-ink-charcoal-text';
const BADGE = 'font-caption-sm text-10px text-white bg-emerald-pass px-1 rounded-sm shrink-0';
const DESC = 'font-caption-sm text-12px text-ink-light-gray mt-0_5';
const CHECK_ON = 'msi icon-check_circle text-20px text-primary shrink-0';
const CHECK_OFF = 'msi icon-radio_button_unchecked text-20px text-outline-variant shrink-0';

const isOn = (m: PayMethod) => m.id === props.value;
const rowClass = (m: PayMethod) => `${ROW_BASE} ${isOn(m) ? ROW_ON : ROW_OFF}`;
/**
 * 勾选圈。写成 `(m) => ...` 而不是模板里的三目 ——
 * `check:classes` 会把 `:class` 表达式里**带引号的串**当类名扫，模板里写
 * `m.id === 'wechat' ? ... : ...` 会把 `'wechat'` 报成「没有出处的 class」（踩过）。
 */
const checkClass = (m: PayMethod) => (isOn(m) ? CHECK_ON : CHECK_OFF);
</script>

<template>
  <view :class="LIST">
    <view
      v-for="m in METHODS"
      :key="m.id"
      :class="rowClass(m)"
      hover-class="pg-hover"
      @tap="emit('pick', m.id)"
    >
      <!-- 真品牌图标（1:1 的 logo，不套圆圈底色 —— 套上去反而像个假图标） -->
      <view :class="ICON_BOX">
        <image class="w-full h-full" :src="m.icon" mode="aspectFit" />
      </view>
      <view class="flex flex-col flex-1 min-w-0">
        <view class="flex items-center gap-1_5">
          <text :class="NAME">{{ m.name }}</text>
          <text v-if="m.badge" :class="BADGE">{{ m.badge }}</text>
        </view>
        <text :class="DESC">{{ m.desc }}</text>
      </view>
      <!-- 两行都画勾选圈：数字人民币那枚点了会提示「暂未开通」，不做成灰掉的样子 -->
      <view :class="checkClass(m)" />
    </view>
  </view>
</template>
