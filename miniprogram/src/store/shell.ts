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
