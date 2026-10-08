declare namespace Api {
  /**
   * namespace Auth
   *
   * backend api module: "auth"（对应服务端 /api/admin/auth/*）
   */
  namespace Auth {
    /** POST /admin/auth/login 响应 */
    interface LoginToken {
      /** JWT */
      token: string;
      expiresIn?: string;
      /**
       * 服务端当前不签发 refreshToken（JWT 有效期 8h，过期后重新登录），
       * 模板的刷新流程需要该字段，保留可选声明以兼容。
       */
      refreshToken?: string;
      /** 权限标识，超管为 ['*'] */
      permissions?: string[];
    }

    /** GET /admin/auth/profile 响应 */
    interface Profile {
      id: number;
      username: string;
      realName: string | null;
      roles: { id: number; name: string; code: string }[];
      permissions: string[];
    }

    /**
     * 前端统一使用的用户信息
     * - roles：后端角色 code（super/admin/checker/finance/ops/leader），驱动静态路由 meta.roles 校验
     * - buttons：后端权限标识，驱动按钮级 v-permission 校验
     */
    interface UserInfo {
      userId: string;
      userName: string;
      roles: string[];
      buttons: string[];
    }
  }
}
