import { ref } from 'vue';
import { BASE_URL, REQUEST_TIMEOUT } from '@/api/config';

/**
 * 小程序登录态。
 *
 * 刻意**不 import 请求层**：请求层要在 401 时反过来调 `ensureLogin()`，
 * 两边互相 import 会形成循环依赖（运行时能不能跑通取决于模块求值顺序，很容易炸得很隐晦）。
 * 所以这里只用 `uni.request` 直接发那一个登录请求 —— 它也不需要请求层的拦截逻辑。
 */
const TOKEN_KEY = 'mini_token';
const PROFILE_KEY = 'mini_profile';

export interface MiniProfile {
  userId: number;
  openid: string;
}

const token = ref<string>(uni.getStorageSync(TOKEN_KEY) || '');
const profile = ref<MiniProfile | null>(uni.getStorageSync(PROFILE_KEY) || null);

export const getToken = () => token.value;
export const getProfile = () => profile.value;
export const isLoggedIn = () => !!token.value;

function save(nextToken: string, nextProfile: MiniProfile) {
  token.value = nextToken;
  profile.value = nextProfile;
  uni.setStorageSync(TOKEN_KEY, nextToken);
  uni.setStorageSync(PROFILE_KEY, nextProfile);
}

export function clearSession() {
  token.value = '';
  profile.value = null;
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(PROFILE_KEY);
}

/**
 * 拿一个登录用的 code。
 *
 * H5 没有微信登录，而 `WX_MOCK=true` 下服务端接受任意 code —— 但**必须每次都传同一个**：
 * mock 登录的 openid 是由 code 派生的（`mock_openid_${code}`），
 * 每次换一个 code 就等于每次都是新用户，常用出行人会被清空。
 */
function loginCode(): Promise<string> {
  return new Promise((resolve) => {
    uni.login({
      provider: 'weixin',
      success: (res) => resolve(res.code || 'dev-h5-local'),
      fail: () => resolve('dev-h5-local'),
    });
  });
}

let pending: Promise<void> | null = null;

/**
 * 确保已登录；**并发调用只会真正登录一次**（启动时四个视图可能同时要数据）。
 * `force = true` 用于 401 之后强制重登。
 */
export function ensureLogin(force = false): Promise<void> {
  if (!force && token.value) return Promise.resolve();
  if (pending) return pending;

  pending = (async () => {
    try {
      const code = await loginCode();
      const body = await new Promise<{ code: number; msg: string; data?: { token: string; userId: number; openid: string } }>(
        (resolve, reject) => {
          uni.request({
            url: `${BASE_URL}/auth/login`,
            method: 'POST',
            data: { code },
            timeout: REQUEST_TIMEOUT,
            header: { 'Content-Type': 'application/json' },
            success: (res) => resolve(res.data as never),
            fail: (err) => reject(new Error(err.errMsg || '登录请求失败')),
          });
        },
      );

      if (body?.code !== 0 || !body.data?.token) {
        throw new Error(body?.msg || '登录失败');
      }
      save(body.data.token, { userId: body.data.userId, openid: body.data.openid });
    } finally {
      pending = null;
    }
  })();

  return pending;
}
