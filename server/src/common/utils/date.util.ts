/**
 * 业务日期（**日历日**）工具。
 *
 * ## 为什么必须有这个文件
 *
 * 服务端原先到处写 `new Date().toISOString().slice(0, 10)` 当「今天」用 ——
 * 而 **`toISOString()` 返回的永远是 UTC**。本系统的业务时区是东八区
 * （MySQL 容器 `--default-time-zone=+08:00`、TypeORM `timezone: '+08:00'`、
 * 宿主机也是 Asia/Shanghai），于是**每天 00:00–08:00 之间 app 与 DB 对「今天」差一天**：
 *
 * - 持**当天**有效票的游客被判 `WRONG_DATE 未到预约日期`（实测复现过）
 * - 反向，**前一天**的票在早上 8 点前仍被当成有效票放行
 * - 闸机下发的离线白名单带的是昨天的预约集合
 * - `@Cron('30 0 * * *')` 的日结重算拿 `Date.now() - 86400000` 得到的是**前天**（每天都在错）
 *
 * ## 两条硬规矩
 *
 * 1. **「日历日」与「瞬时时刻」要分开**。要落到 `DATE` 列、要和 SQL 的
 *    `CURDATE()` / `DATE(...)` 对齐、要做「当天能不能入园」判断的 —— 用这里的函数。
 *    而 `createdAt` / `payDeadline` / 心跳时刻 / 微信 RFC3339 这类**绝对时间点**，
 *    继续用 `new Date()` / `toISOString()` —— 那是正确的，别改。
 * 2. **不依赖进程时区**。时区来自 `BUSINESS_TZ`（默认 `Asia/Shanghai`）并显式交给
 *    `Intl.DateTimeFormat`，所以把服务部署到 UTC 主机上结果也一样。
 *
 * 实现上刻意**不引依赖**（本项目没有 dayjs / moment / date-fns）：
 * `Intl.DateTimeFormat('en-CA')` 的输出恰好就是 `YYYY-MM-DD`。
 */

/** 默认业务时区。cron 装饰器只能用这个常量 —— 见 `BUSINESS_TZ_FOR_DECORATOR` 的说明 */
export const DEFAULT_BUSINESS_TZ = 'Asia/Shanghai';

/**
 * 业务时区。
 *
 * **每次调用都读 `process.env`**，不做模块级缓存 —— `ConfigModule.forRoot()` 加载 `.env`
 * 发生在**模块初始化时**，而模块级常量在 `import` 期就求值了，那时 `.env` 还没读进来。
 * 缓存住就会永远拿到默认值，`.env` 里改了 `BUSINESS_TZ` 也不生效。
 */
export function businessTz(): string {
  return process.env.BUSINESS_TZ || DEFAULT_BUSINESS_TZ;
}

/**
 * 给 `@Cron(..., { timeZone })` 用的值。
 *
 * ⚠️ 装饰器在**类定义时**（也就是 import 期）求值，早于 `.env` 被加载，所以这里只能给默认值。
 * 也就是说：**改 `BUSINESS_TZ` 只影响业务日期计算，不会改 cron 的触发时刻**。
 * 真要改 cron 时区，得把它设成真正的进程环境变量（或同步改这里的常量）。
 */
export const BUSINESS_TZ_FOR_DECORATOR = DEFAULT_BUSINESS_TZ;

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // en-CA 的 short date 就是 YYYY-MM-DD，省得自己拼字符串
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** 把某个时刻按**业务时区**格式化成 `yyyy-MM-dd` */
export function businessDate(at: Date = new Date()): string {
  return dateFormatter(businessTz()).format(at);
}

/** 业务时区下的「今天」 */
export function businessToday(): string {
  return businessDate();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 把 `yyyy-MM-dd` 解析成 UTC 基准的毫秒数（只当作日历坐标用，不代表真实时刻） */
function dayOrdinal(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * 日历日加减。
 *
 * **纯日期串运算**：用 UTC 基准 + `getUTC*`，完全不碰本地时间，
 * 所以不受进程时区与夏令时影响。跨月/跨年/闰年都按真实日历走。
 */
export function addDaysStr(dateStr: string, days: number): string {
  const t = new Date(dayOrdinal(dateStr) + days * 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 两个日历日相差几天（`to - from`，可为负） */
export function diffDays(fromStr: string, toStr: string): number {
  return Math.round((dayOrdinal(toStr) - dayOrdinal(fromStr)) / 86_400_000);
}

/**
 * 业务日**次日 00:00** 的时刻，即「今天结束」。
 *
 * 偏移量从 Intl 现取（`GMT+08:00`），不硬编码 `+08:00` —— 换业务时区、
 * 或者用到有夏令时的时区，都仍然正确。
 *
 * 用途：限购计数 `limit:user:*` / `limit:card:*` 的 TTL 是「到次日零点」。
 */
export function businessDayEnd(at: Date = new Date()): Date {
  const tz = businessTz();
  const tomorrow = addDaysStr(businessDate(at), 1);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const offset = raw.replace('GMT', '') || '+00:00';
  return new Date(`${tomorrow}T00:00:00${offset}`);
}
