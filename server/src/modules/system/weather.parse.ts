/**
 * 天气实况的**归一化解析**（纯函数，零依赖、不碰 DI）。
 *
 * 单独成文件的理由有两个：
 *   ① 上游给的是中文描述（「晴」「雷阵雨」「雨夹雪」），而小程序要按类别选图标 ——
 *      这个映射必须有一份、且要能被**离线断言**（`npm run smoke:config` 直接 import 本文件，
 *      照它 import `buildCapacityLevels` 的先例），不必依赖公网与真实 key；
 *   ② 上游返回体的形状差异（和风 `code/now`、高德 `status/lives`）全在这里收口，
 *      `weather.service.ts` 只管取数与缓存。
 *
 * ⚠️ 归一化后的 `category` 是**给客户端选图标用的**，服务端不认识 Material 图标名、
 *    也不该认识 —— 换一套图标库不该动后端。
 */

/** 天气类别（8 个，多一个都不加：客户端对 unknown 的处理是「只显示文字、不画图标」） */
export type WeatherCategory =
  | 'sunny'
  | 'cloudy'
  | 'overcast'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'fog'
  | 'unknown';

export interface WeatherNow {
  /** 上游原文（中文，如「晴」「小雨」）—— 不自己拼文案，上游怎么说就怎么显示 */
  text: string;
  /** 整数摄氏度 */
  temp: number;
  category: WeatherCategory;
}

/**
 * 中文描述 → 类别。**首个命中即返回**，所以顺序有讲究：
 *   - `雷阵雨伴有冰雹` 要落在 thunder 而不是 rain → 雷 排在 雨 前
 *   - `雨夹雪` 要落在 snow 而不是 rain → 雪 排在 雨 前
 *   - `阴转多云` / `晴转多云` 这类「转」的说法落在前一个词上（云 排在 晴 前）
 * 认不出就 `unknown`（客户端只显示文字）—— **宁缺毋错**，别把沙尘暴画成太阳。
 */
const CATEGORY_RULES: [RegExp, WeatherCategory][] = [
  [/雷/, 'thunder'],
  [/雪/, 'snow'],
  [/雨/, 'rain'],
  [/雾|霾|沙|尘/, 'fog'],
  [/阴/, 'overcast'],
  [/云/, 'cloudy'],
  [/晴/, 'sunny'],
];

export function categoryOf(text: string): WeatherCategory {
  const t = (text ?? '').trim();
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(t)) return category;
  }
  return 'unknown';
}

/** 上游温度是字符串（两家都是），转成整数；空串/非数/离谱值都算解析失败 */
function toTemp(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // 地球上的气温：-90 ~ 60℃。超出就当上游改了口径，别把脏值渲染给游客
  if (n < -90 || n > 60) return null;
  return Math.round(n);
}

function build(text: unknown, temp: unknown): WeatherNow | null {
  const t = typeof text === 'string' ? text.trim() : '';
  const n = toTemp(temp);
  if (!t || n === null) return null;
  return { text: t, temp: n, category: categoryOf(t) };
}

/**
 * 和风天气 `/v7/weather/now`：
 * `{ "code": "200", "now": { "temp": "21", "text": "晴", "icon": "100", … } }`
 * `code` 不是 `'200'` 就说明上游拒绝（key 无效 / 额度用尽 / 地点不合法）——一律当失败。
 */
export function parseQweather(json: unknown): WeatherNow | null {
  const body = json as { code?: unknown; now?: { text?: unknown; temp?: unknown } } | null;
  if (!body || typeof body !== 'object') return null;
  if (String(body.code ?? '') !== '200') return null;
  return build(body.now?.text, body.now?.temp);
}

/**
 * 高德开放平台 `/v3/weather/weatherInfo?extensions=base`：
 * `{ "status": "1", "lives": [ { "weather": "晴", "temperature": "21", … } ] }`
 * `status` 不是 `'1'` 即失败（高德把错误码放在 `infocode` 里，`info` 是人话）。
 */
export function parseAmap(json: unknown): WeatherNow | null {
  const body = json as { status?: unknown; lives?: { weather?: unknown; temperature?: unknown }[] } | null;
  if (!body || typeof body !== 'object') return null;
  if (String(body.status ?? '') !== '1') return null;
  const live = Array.isArray(body.lives) ? body.lives[0] : undefined;
  if (!live) return null;
  return build(live.weather, live.temperature);
}
