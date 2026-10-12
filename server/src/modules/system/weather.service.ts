import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_WEATHER_CONFIG } from '../../common/constants/config-defaults';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.constants';
import { SysConfigService } from './sys-config.service';
import { parseAmap, parseQweather, type WeatherNow } from './weather.parse';

/** 两家上游的默认域名（`WEATHER_API_BASE` 可整体覆盖，见 .env.example） */
const BASES: Record<string, string> = {
  qweather: 'https://devapi.qweather.com',
  amap: 'https://restapi.amap.com',
};

/** 上游失败后的**负缓存**时长：不为天气反复等超时，但也不至于一分钟内一直打不通 */
const MISS_TTL_SECONDS = 60;

/**
 * `fetch` 的失败原因链 → 一句能照着查的话。
 *
 * `fetch` 只抛 `TypeError: fetch failed`，真原因在 `cause` 里（可能还嵌套一层：
 * `cause.cause` 是 `AggregateError`，每个成员带 `code`）。Node 的报错在诊断这件事上
 * 相当不友好，而这条日志是运维判断「是网络不通、DNS 挂了、超时，还是证书不对」的唯一线索。
 */
function describeFetchError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth++) {
    const e = cur as { name?: string; message?: string; code?: string; errors?: unknown[] };
    const bit = [e.name, e.code, e.message].filter(Boolean).join(' / ');
    if (bit) parts.push(bit);
    if (Array.isArray(e.errors) && e.errors.length) {
      parts.push(
        e.errors
          .map((sub) => {
            const s = sub as { code?: string; message?: string };
            return s.code ?? s.message ?? String(sub);
          })
          .join(', '),
      );
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.join(' ← ') || String(err);
}

/**
 * 天气实况（首页 banner 那一行）。
 *
 * 三条硬口径，改这个文件前先读：
 *
 * ① **它是可选依赖，失败一律返回 `null`，绝不抛异常** —— 调用方是
 *    `GET /api/mini/platform/settings`，也就是小程序首屏要读的接口。这里一抛，
 *    整个平台信息接口 500，首页顶栏/页脚/凭证水印全跟着塌，而它们跟天气毫无关系。
 *
 * ② **失败要写 60 秒负缓存** —— 上游挂掉时，首页每次冷启动都会等一次 1.5 秒超时，
 *    而超时是串在 `platform/settings` 上的。负缓存让「打不通」这件事最多每 60 秒重试一次。
 *
 * ③ **key 不入库**：`provider` 与地点在后台「参数配置 → weather」里改（运营的事），
 *    而 `QWEATHER_KEY` / `AMAP_KEY` 只在服务器 `.env` 里（与微信支付凭据同一套理由：
 *    进库 = 明文落库 + 进备份 + 任何有 `config:read` 的角色都能读到）。
 *    两份 key 都留着，所以**在后台切换数据源不用登服务器改配置**。
 */
@Injectable()
export class WeatherService implements OnModuleInit {
  private readonly logger = new Logger(WeatherService.name);

  /** 配置类问题（没配 key / 地点为空 / provider 不认识）每个进程只喊一次，不按请求刷屏 */
  private readonly warned = new Set<string>();

  constructor(
    private readonly sysConfig: SysConfigService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  /**
   * 启动时**预热一次**（照 `WxpayService` / `MiniAuthService` 的启动自检那一套）。
   *
   * 为什么需要：本机实测过「进程启动后第一次出网」的冷启动代价可以把 2.5 秒超时用满
   * （DNS + TLS + 代理），而那一次失败会被写进 60 秒负缓存 —— 于是**首页那 60 秒都没有天气**，
   * 明明上游是好的。预热把这笔钱挪到启动时（没有人在等），首位访客拿到的就是缓存值。
   *
   * 失败只 warn、不拦启动：天气是可选依赖（见类注释 ①），拉不到就不显示那一行。
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.current();
    } catch {
      /* current() 自己把异常都吞了，这里只是兜底，绝不让它影响启动 */
    }
  }

  /** 当前天气；`null` = 关闭 / 没配全 / 拉不到（**三种情况客户端一视同仁：不显示那一行**） */
  async current(): Promise<WeatherNow | null> {
    // ⚠️ 配置必须在方法体里读（CLAUDE.md 约束 12）：提成模块级常量会把值冻在进程启动那一刻
    const cfg = await this.sysConfig.get('weather', DEFAULT_WEATHER_CONFIG);
    const provider = String(cfg.provider ?? 'off').trim();

    // 关闭是正常状态，不记日志
    if (provider === 'off' || provider === '') return null;

    if (!BASES[provider]) {
      this.warnOnce(`unknown-provider:${provider}`, `天气数据源不认识：${provider}（只支持 qweather / amap / off）`);
      return null;
    }
    const key = this.keyOf(provider);
    if (!key) {
      this.warnOnce(`no-key:${provider}`, `天气数据源选了 ${provider}，但 ${provider === 'amap' ? 'AMAP_KEY' : 'QWEATHER_KEY'} 没配（在服务器 .env 里）`);
      return null;
    }
    const location = String(cfg.location ?? '').trim();
    if (!location) {
      this.warnOnce(`no-location:${provider}`, `天气数据源选了 ${provider}，但没填地点（后台「参数管理 → weather」）`);
      return null;
    }

    const cacheKey = `weather:now:${provider}:${location}`;
    const missKey = `weather:miss:${provider}:${location}`;

    const cached = await this.readCache(cacheKey);
    if (cached) return cached;
    // 上游刚失败过：直接不显示，不再排队等一次超时（见类注释 ②）
    if (await this.hasMiss(missKey)) return null;

    const ttlMinutes = Number(cfg.cacheMinutes);
    const ttlSeconds = Math.min(60, Math.max(5, Number.isFinite(ttlMinutes) ? ttlMinutes : 10)) * 60;

    try {
      const body = await this.fetchUpstream(provider, location, key);
      const now = provider === 'amap' ? parseAmap(body) : parseQweather(body);
      if (!now) {
        // 上游答了但答的不是天气（key 无效 / 额度用尽 / 地点不合法都在这里）——
        // 把上游原文带上，否则现场只能看到一句「没显示」
        this.logger.warn(`天气拉取失败（${provider} ${location}）：${JSON.stringify(body).slice(0, 300)}`);
        await this.markMiss(missKey);
        return null;
      }
      await this.writeCache(cacheKey, now, ttlSeconds);
      return now;
    } catch (err) {
      // ⚠️ `fetch` 失败时 `err.message` 永远只有一句 "fetch failed"，**真正的原因在 `err.cause`**
      //    （`ENOTFOUND` / `ECONNREFUSED` / `UND_ERR_CONNECT_TIMEOUT` / 证书错误…）。
      //    不把它带出来，现场只能看到「没显示天气」+ 一句无从下手的 fetch failed。
      this.logger.warn(`天气拉取异常（${provider} ${location}）：${describeFetchError(err)}`);
      await this.markMiss(missKey);
      return null;
    }
  }

  private keyOf(provider: string): string {
    return (
      (provider === 'amap'
        ? this.config.get<string>('weather.amapKey')
        : this.config.get<string>('weather.qweatherKey')) ?? ''
    ).trim();
  }

  /** 拼上游 URL；`WEATHER_API_BASE` 可整体覆盖域名（和风新版账号给的是专属域名） */
  private upstreamUrl(provider: string, location: string, key: string): string {
    const base = (this.config.get<string>('weather.apiBase') || BASES[provider]!).replace(/\/+$/, '');
    const q = encodeURIComponent(location);
    return provider === 'amap'
      ? `${base}/v3/weather/weatherInfo?city=${q}&key=${encodeURIComponent(key)}&extensions=base`
      : `${base}/v7/weather/now?location=${q}&key=${encodeURIComponent(key)}`;
  }

  private async fetchUpstream(provider: string, location: string, key: string): Promise<unknown> {
    const timeout = Number(this.config.get<string>('weather.timeoutMs')) || 2500;
    const res = await fetch(this.upstreamUrl(provider, location, key), {
      headers: { 'User-Agent': 'attraction-booking/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  // —— 缓存：三类操作各自吞掉异常 ——
  // Redis 挂了不该让「看天气」这件事把平台信息接口一起拖垮（约束：降级不抛）。
  // 注意 Redis 里存的是 **JSON 字符串**：现有的值都是计数器/集合，这是第一处存对象的。

  private async readCache(cacheKey: string): Promise<WeatherNow | null> {
    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WeatherNow;
      return parsed && typeof parsed.text === 'string' && typeof parsed.temp === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeCache(cacheKey: string, value: WeatherNow, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* 缓存写失败不影响这次返回 */
    }
  }

  private async hasMiss(missKey: string): Promise<boolean> {
    try {
      return (await this.redis.exists(missKey)) === 1;
    } catch {
      return false;
    }
  }

  private async markMiss(missKey: string): Promise<void> {
    try {
      await this.redis.set(missKey, '1', 'EX', MISS_TTL_SECONDS);
    } catch {
      /* 同上 */
    }
  }

  private warnOnce(tag: string, message: string): void {
    if (this.warned.has(tag)) return;
    this.warned.add(tag);
    // 配置改完**不用重启**（每次调用都重读 sys_config），但这条提示每个进程只说一次 —— 不按请求刷屏
    this.logger.warn(message);
  }
}
