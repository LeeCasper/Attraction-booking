import { request } from '../request';

/**
 * 登录
 *
 * @param userName 用户名
 * @param password 密码
 */
export function fetchLogin(userName: string, password: string) {
  return request<Api.Auth.LoginToken>({
    url: '/admin/auth/login',
    method: 'post',
    data: {
      username: userName,
      password
    }
  });
}

/**
 * 获取当前管理员信息
 *
 * 后端返回 profile（含 roles/permissions），在此转换成前端统一使用的 UserInfo
 */
export async function fetchGetUserInfo() {
  const { data, error } = await request<Api.Auth.Profile>({ url: '/admin/auth/profile' });

  if (error) {
    return { data: null, error };
  }

  const info: Api.Auth.UserInfo = {
    userId: String(data.id),
    userName: data.realName || data.username,
    roles: data.roles.map(role => role.code),
    buttons: data.permissions
  };

  return { data: info, error: null };
}

/**
 * 修改密码
 *
 * @param password 原密码
 * @param newPassword 新密码
 */
export function fetchUpdatePassword(password: string, newPassword: string) {
  return request<null>({
    url: '/admin/auth/password',
    method: 'put',
    data: { password, newPassword }
  });
}

/**
 * 刷新 token
 *
 * 服务端当前未提供 refreshToken 机制（.env 中 EXPIRE_TOKEN_CODES 已置空，不会触发），
 * 保留此函数以兼容模板的请求重试流程。
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: '/admin/auth/refreshToken',
    method: 'post',
    data: { refreshToken }
  });
}

/**
 * 触发一个后端错误，用于验证错误处理流程（模板演示页使用）
 *
 * @param code 错误码
 * @param msg 错误信息
 */
export function fetchCustomBackendError(code: string, msg: string) {
  return request({ url: '/admin/auth/error', params: { code, msg } });
}
