import { ref } from 'vue';

/**
 * 「当前订单」——下单并支付成功后记下来，凭证页据此取动态凭证。
 *
 * 既放内存（`ref`，凭证页要能**立刻**响应到「刚下的那一单」）
 * 也落盘（杀掉小程序再进来时还能看到上次那张凭证）。
 */
const CURRENT_KEY = 'mini_current_order_id';

const stored = uni.getStorageSync(CURRENT_KEY);

export const currentOrderId = ref<number | null>(stored ? Number(stored) : null);

export function setCurrentOrderId(orderId: number) {
  currentOrderId.value = orderId;
  uni.setStorageSync(CURRENT_KEY, orderId);
}
