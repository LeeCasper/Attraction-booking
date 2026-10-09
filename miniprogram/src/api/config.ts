/**
 * 后端地址。
 *
 * ⚠️ **真机预览时 `localhost` 指向手机自己**，打不到你电脑上的服务，
 * 所以小程序端必须用开发机的**局域网 IP**（下面的 192.168.110.162 是写这份代码时的实测值，
 * 换网络环境或 IP 变了就改这里）。H5 预览走 localhost 即可 ——
 * 后端开了 `app.enableCors()`，不需要配 vite proxy。
 *
 * 另外：开发者工具里要勾上「不校验合法域名」（产物 `project.config.json` 里已是 `urlCheck: false`）。
 * 正式上线则必须在小程序后台把后端域名配进 request 合法域名，且必须 HTTPS。
 */
// 注意两点：
// 1. 写成「先赋值再导出」而不是两个 `export const` —— 条件编译是**构建期**做的，
//    `vue-tsc` 会同时看到两支，重复声明直接报 TS2451。
// 2. 路径要带 `/mini` 段：后端全局前缀是 `/api`，小程序端接口都在 `/api/mini/*` 下。
//    （曾经漏掉这段，表现为启动登录报 `Cannot POST /api/auth/login`。）
let baseUrl = 'http://192.168.110.162:3000/api/mini';
// #ifdef H5
baseUrl = 'http://localhost:3000/api/mini';
// #endif

export const BASE_URL = baseUrl;

/** 请求超时（毫秒） */
export const REQUEST_TIMEOUT = 15000;
