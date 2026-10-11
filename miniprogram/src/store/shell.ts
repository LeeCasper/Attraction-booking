import { ref } from 'vue';

/**
 * 单页外壳的当前 tab。
 *
 * 为什么放在模块里而不是外壳组件的局部 `ref`：视图里也需要切页 ——
 * 最典型的是「下单支付成功后自动跳到凭证页」。而外壳只给视图传一个 `active` prop
 * （视图模板是生成器产出的，加不了新 prop），所以只能靠一个共享的模块级状态。
 */
/**
 * 4 个 tab 的 key。
 *
 * ⚠️ 第二个是 **`area`（景点选择）而不是 `booking`**：「预约购票」那一格的内容是
 * **先选景点**。购票页（游览日期/入园时段/票种）是**选完景点之后**才进入的二级页
 * （`src/pages/booking/index.vue`），不是 tab —— 否则用户可以在没选景点的情况下
 * 直接落到某个景点的购票页，那是错的顺序。
 */
export type TabKey = 'home' | 'area' | 'credential' | 'profile';

export const activeTab = ref<TabKey>('home');

export function switchTab(key: TabKey) {
  activeTab.value = key;
}

/**
 * 当前景点。
 *
 * 与 `currentOrderId` 一样**落盘** —— 「我常去的景点」是用户偏好，杀掉小程序再进来不该忘。
 * 它的用途只剩一件：**购票页买哪个景点的票**（首页已经改成平台级的了，
 * 轮播与推荐景点都不看它，见 `views/home/behavior.ts` 的注解）。
 *
 * `null` = 用户还没选过，各视图回落到「景点列表的第一个」，与改动前的行为一致。
 */
const AREA_KEY = 'mini_current_area_id';
const storedArea = uni.getStorageSync(AREA_KEY);
export const currentAreaId = ref<number | null>(storedArea ? Number(storedArea) : null);

/**
 * 「外壳页又被显示了一次」的计数。
 *
 * 外壳（`pages/main/index.vue`）是**唯一**的页面，四个视图都挂在它里面 ——
 * 于是「进二级页改了点东西、再返回」对视图来说是**完全静默**的：`props.active` 一直是 true，
 * 各视图那个「首次可见才拉数据」的守卫不会重取，页面上留着的是改动前的数据。
 *
 * 用户报的就是这个：在个人中心点「查看详情」→ 在订单详情里取消订单 → 返回，
 * 「待支付」那一格还挂着**已经取消掉**的那一单（该单其实已经归到「退改·售后」了）。
 * 凭证页同理：从「申请退改」进去提交退款、返回，二维码还照样能出示。
 *
 * 二级页自己不受影响 —— 它们是真实页面，`onShow` 就够（见 `pages/orders/index.vue`）。
 * 视图拿不到 `onShow`（它不是页面），所以由外壳记一笔、视图各自 `watch` 这个计数。
 *
 * 只递增、不重置：视图比的是「跟我上次拉数据时是不是同一个值」。
 */
export const shellShowTick = ref(0);

/** 外壳重新可见（从二级页返回 / 从后台切回）。由 `pages/main/index.vue` 的 `onShow` 调用 */
export function markShellShown() {
  shellShowTick.value += 1;
}

/**
 * 切景点。
 *
 * ⚠️ 这里只改一个跨视图共享的值。各视图自己的缓存（首页的公告、购票页的日期条/余票）
 * **不在这里清** —— 那些状态在 `useHomePage()` / `useBookingPage()` 的闭包里，
 * store 够不着。各 behavior 自己 `watch(currentAreaId)` 作废 + 重取（见它们里面的注释）。
 *
 * 出行人（`visitors` / `pickedIds`）是**人级**的、跨景点通用，**不清**。
 */
export function setCurrentArea(id: number) {
  currentAreaId.value = id;
  uni.setStorageSync(AREA_KEY, id);
}
