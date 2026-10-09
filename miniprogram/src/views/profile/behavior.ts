import { onUnmounted, ref } from 'vue';

/**
 * 个人中心的行为。
 *
 * 本页设计稿里**真正可交互的只有两处**（其余都是跳转入口），所以这里只做这两件：
 *   1. 「我的预约与凭证」标题右侧那排四态筛选按钮
 *   2. 「门禁智联凭证状态 → 断网离线凭证防伪」那行的「刷新」→ 顶部轻提示 2 秒
 *
 * 第 2 条设计稿本来就是这么设计的：profile.html 底部自带一段原生 JS，
 * 点刷新把 toast 的 `opacity-0` 换成 `opacity-100` 显示 2s。这里改成响应式状态，
 * 顺带把 `setTimeout` 在卸载时清掉（原生那段没有清，切页会残留定时器）。
 *
 * 注意：设计稿个人中心里**没有**「展开/收起」控件，别去找。
 */
export interface PassTab {
  id: string;
  /** msi 图标名 */
  icon: string;
  label: string;
  /** 右上角数量角标，0 或缺省则不渲染 */
  badge?: number;
}

/** 设计稿的四态（待入园为默认选中项，带角标 2） */
const PASS_TABS: PassTab[] = [
  { id: 'pending-pay', icon: 'payment', label: '待支付' },
  { id: 'pending-use', icon: 'qr_code_2', label: '待入园', badge: 2 },
  { id: 'used', icon: 'task_alt', label: '已核销' },
  { id: 'refund', icon: 'currency_exchange', label: '退改·售后' },
];

/** 设计稿原文（`#toastNotification` 的文案） */
const TOAST_TEXT = '离线加密凭证已更新至本地缓存';
const TOAST_MS = 2000;

export function useProfilePage() {
  const passTabs = ref(PASS_TABS);
  const passTab = ref(PASS_TABS[1].id);
  const onPickPassTab = (id: string) => (passTab.value = id);

  const toastVisible = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** 一期是本地模拟；接接口后应改为重新拉取离线凭证包再提示 */
  function onRefreshOfflineToken() {
    toastVisible.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toastVisible.value = false;
    }, TOAST_MS);
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    timer = null;
  });

  return { passTabs, passTab, onPickPassTab, toastVisible, toastText: TOAST_TEXT, onRefreshOfflineToken };
}
