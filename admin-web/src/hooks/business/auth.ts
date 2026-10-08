import { useAuthStore } from '@/store/modules/auth';

export function useAuth() {
  const authStore = useAuthStore();

  /**
   * 按钮级权限校验
   *
   * 后端超管角色的权限为 `['*']`（见 server 的 role_permission 种子数据），
   * 这里统一做通配放行 —— 否则超管在所有业务页面上都会被判为「无权限」而看不到按钮。
   * 与后端 `AdminAuthGuard` 中 `perms.includes('*')` 的判定保持一致。
   */
  function hasAuth(codes: string | string[]) {
    if (!authStore.isLogin) {
      return false;
    }

    const { buttons } = authStore.userInfo;

    if (buttons.includes('*')) {
      return true;
    }

    if (typeof codes === 'string') {
      return buttons.includes(codes);
    }

    return codes.some(code => buttons.includes(code));
  }

  return {
    hasAuth
  };
}
