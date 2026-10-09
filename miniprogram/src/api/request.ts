import { BASE_URL, REQUEST_TIMEOUT } from './config';
import { clearSession, ensureLogin, getToken } from '@/store/user';

/**
 * 请求层：`uni.request` 的薄封装。
 *
 * 后端统一响应体是 `{ code, msg, data }`（成功恒为 `code: 0`），
 * 错误时 `code = HTTP 状态码 × 100`（400 → 40000、401 → 40100、404 → 40400…），
 * 见 `server/src/common/filters/all-exceptions.filter.ts`。
 */
export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 登录态失效的业务码（HTTP 401 × 100） */
const CODE_UNAUTHORIZED = 40100;

interface RequestOptions {
  /** 免登录接口（登录本身、景区与票务查询） */
  anonymous?: boolean;
  /** 内部用：标记已经因 401 重试过一次，避免死循环 */
  retried?: boolean;
}

function send(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown) {
  return new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    const token = getToken();
    uni.request({
      url: `${BASE_URL}${path}`,
      method,
      data: data as never,
      timeout: REQUEST_TIMEOUT,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: resolve,
      fail: (err) => reject(new ApiError(-1, err.errMsg || '网络请求失败')),
    });
  });
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  if (!opts.anonymous) await ensureLogin();

  const res = await send(method, path, data);
  const body = res.data as { code?: number; msg?: string; data?: T } | undefined;

  if (body?.code === 0) return body.data as T;

  // 登录态失效：清掉本地 token，重新登录一次再重试（只重试一次）
  if (body?.code === CODE_UNAUTHORIZED && !opts.anonymous && !opts.retried) {
    clearSession();
    try {
      await ensureLogin(true);
      return await request<T>(method, path, data, { ...opts, retried: true });
    } catch {
      /* 重登失败就按下面统一抛错，交给调用方展示 */
    }
  }

  throw new ApiError(body?.code ?? -1, body?.msg || `请求失败（HTTP ${res.statusCode}）`);
}

export const get = <T>(path: string, data?: unknown, opts?: RequestOptions) =>
  request<T>('GET', path, data, opts);
export const post = <T>(path: string, data?: unknown, opts?: RequestOptions) =>
  request<T>('POST', path, data, opts);
export const put = <T>(path: string, data?: unknown, opts?: RequestOptions) =>
  request<T>('PUT', path, data, opts);
export const del = <T>(path: string, data?: unknown, opts?: RequestOptions) =>
  request<T>('DELETE', path, data, opts);

/** 统一把异常转成可展示的文案（页面里 onError 用） */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : '请求失败';
}
