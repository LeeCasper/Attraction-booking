/**
 * 后端地址。
 *
 * ⚠️ **真机预览/开发者工具里 `localhost` 指向手机或工具自己**，打不到你电脑上的服务，
 * 所以小程序端必须用开发机的**局域网 IP**。这个 IP **换网络就会变**（换 Wi-Fi、连手机热点、
 * 换接口都会变），写死在这里必然会过期 —— 已经因此出过一次「首页什么都没有、
 * 控制台只有 `request:fail timeout`」的假故障：不是页面坏了，是一条请求都没发出去。
 *
 * 所以：
 *   1. 想临时换地址 —— 在 `miniprogram/.env.local` 里写 `VITE_API_BASE=http://<你的IP>:3000/api/mini`
 *      （`.env.local` 已被 `.gitignore` 的 `*.local` 排除，不会误提交）
 *   2. 下面的常量只是**兜底默认值**，换机器/换网络时改它也行
 *   3. 不知道自己的 IP？看服务端启动日志 —— `npm run dev` 会打印可用的局域网地址
 *
 * H5 预览走 localhost 即可（后端开了 `app.enableCors()`，不需要配 vite proxy）。
 * 开发者工具里要勾上「不校验合法域名」（产物 `project.config.json` 里已是 `urlCheck: false`）；
 * 正式上线必须在小程序后台把后端域名配进 request 合法域名，且必须 HTTPS。
 */
// 注意两点：
// 1. 写成「先赋值再导出」而不是两个 `export const` —— 条件编译是**构建期**做的，
//    `vue-tsc` 会同时看到两支，重复声明直接报 TS2451。
// 2. 路径要带 `/mini` 段：后端全局前缀是 `/api`，小程序端接口都在 `/api/mini/*` 下。
//    （曾经漏掉这段，表现为启动登录报 `Cannot POST /api/auth/login`。）

/**
 * 读构建期注入的 `VITE_API_BASE`。
 *
 * 这里没用 `import.meta.env` 的官方类型 —— 工程的 `tsconfig` 只引了 `@dcloudio/types`、
 * 没引 `vite/client`，直接用会报类型错。加一层 cast 拿到同一个值，且不动 TS 配置。
 */
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

let baseUrl = ENV.VITE_API_BASE || 'http://172.20.10.13:3000/api/mini';
// #ifdef H5
baseUrl = ENV.VITE_API_BASE || 'http://localhost:3000/api/mini';
// #endif

export const BASE_URL = baseUrl;

/** 请求超时（毫秒） */
export const REQUEST_TIMEOUT = 15000;

/**
 * 把服务端返回的**相对资源路径**拼成小程序能加载的完整地址。
 *
 * 后台上传的封面存成 `/uploads/xxx.jpg`（相对路径）—— 存完整 URL 是不行的：
 * 同一张图在后台（`http://<host>:3000/api`）和小程序（局域网 IP）下的前缀不同。
 * `<image src>` 认不了 `/uploads/...` 这种相对路径，会当成小程序内的本地路径去找、然后静默空着。
 *
 * `BASE_URL` 形如 `http://<host>:3000/api/mini`，上去一层就是 `/api`，
 * `/api` + `/uploads/x.jpg` 就是上传接口那个只读路由。
 */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path; // 已经是完整地址（比如换了图床）就原样用
  const origin = BASE_URL.replace(/\/api\/.*$/, '');
  const apiPrefix = BASE_URL.replace(/^https?:\/\/[^/]+/, '').replace(/\/[^/]+$/, '');
  return `${origin}${apiPrefix}${path}`;
}
