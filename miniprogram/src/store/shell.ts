import { ref } from 'vue';

/**
 * 单页外壳的当前 tab。
 *
 * 为什么放在模块里而不是外壳组件的局部 `ref`：视图里也需要切页 ——
 * 最典型的是「下单支付成功后自动跳到凭证页」。而外壳只给视图传一个 `active` prop
 * （视图模板是生成器产出的，加不了新 prop），所以只能靠一个共享的模块级状态。
 */
export type TabKey = 'home' | 'booking' | 'credential' | 'profile';

export const activeTab = ref<TabKey>('home');

export function switchTab(key: TabKey) {
  activeTab.value = key;
}
