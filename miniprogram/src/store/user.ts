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
const LOGIN_CODE_KEY = 'mini_login_code';

/**
 * 联调用的固定 code。
 *
 * 服务端 `WX_MOCK=true` 时 openid 是**由 code 派生的**（`mock_openid_${code}`），
 * 所以「传什么 code 就是哪个用户」。固定成这一个值，开发者工具里反复重编译也一直是同一个账号，
 * 订单/常用出行人/凭证都能留住。
 */
const DEV_LOGIN_CODE = 'dev-local';

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
 * mock 登录的 openid 由 code 派生（`mock_openid_${code}`），**换 code 就是换用户**。
 * 而微信每次 `uni.login()` 都返回**新的**随机 code —— 早先这里直接用它的返回值，
 * 结果每次开启小程序/重编译都是一个全新账号：数据库里几分钟冒出一堆用户，
 * 每个都没有订单，**凭证页于是永远显示「不可入园」，二维码也就没有内容可编**。
 *
 * 所以顺序是：
 * 1. 优先用**落盘过的** code（首次落 `dev-local`）—— dev/mock 下每次都落在同一个账号上；
 * 2. 它登录失败（真实微信模式下 code 一次性、落了盘下次必然失效）→ 回退到 `uni.login()` 的新 code，
 *    并落盘。真实模式下微信对同一用户始终返回同一 openid，本来就不需要靠 code 维持身份。
 */
function loginCode(): Promise<string> {
  const saved = uni.getStorageSync(LOGIN_CODE_KEY);
  if (saved) return Promise.resolve(saved);

  const code = DEV_LOGIN_CODE;
  uni.setStorageSync(LOGIN_CODE_KEY, code);
  return Promise.resolve(code);
}

/** 落盘的 code 用不了了（真实模式），换成微信新发的那个并落盘 */
function freshLoginCode(): Promise<string> {
  return new Promise((resolve) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        const code = res.code || DEV_LOGIN_CODE;
        uni.setStorageSync(LOGIN_CODE_KEY, code);
        resolve(code);
      },
      fail: () => resolve(DEV_LOGIN_CODE),
    });
  });
}

let pending: Promise<void> | null = null;

/** 拿 code 去换 JWT。刻意只发这一个请求，不走请求层（见文件头的循环依赖说明） */
function requestLogin(code: string): Promise<{
  code: number;
  msg: string;
  data?: { token: string; userId: number; openid: string };
}> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${BASE_URL}/auth/login`,
      method: 'POST',
      data: { code },
      timeout: REQUEST_TIMEOUT,
      header: { 'Content-Type': 'application/json' },
      success: (res) => resolve(res.data as never),
      fail: (err) => reject(new Error(err.errMsg || '登录请求失败')),
    });
  });
}

/**
 * 确保已登录；**并发调用只会真正登录一次**（启动时四个视图可能同时要数据）。
 * `force = true` 用于 401 之后强制重登。
 */
export function ensureLogin(force = false): Promise<void> {
  if (!force && token.value) return Promise.resolve();
  if (pending) return pending;

  pending = (async () => {
    try {
      let body = await requestLogin(await loginCode());
      if (body?.code !== 0 || !body.data?.token) {
        // 落盘的 code 不管用了（真实微信模式下 code 是一次性的）→ 换微信新发的那个再试一次
        body = await requestLogin(await freshLoginCode());
      }
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
