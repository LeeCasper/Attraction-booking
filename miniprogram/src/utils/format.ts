/**
 * 展示格式化。
 *
 * ⚠️ **后端所有金额都是「分」**（整数），页面上要显示「元」时必须过这里，
 * 别再在各处写 `/100` —— 浮点拼字符串很容易出现 `120.00000000000001` 这类东西。
 */

/** 分 → 元字符串。整数元不带小数（`12000 → '120'`），有角分才补齐并去掉尾零（`12550 → '125.5'`） */
export function fen2yuan(fen: number | null | undefined): string {
  const n = Number(fen ?? 0);
  if (!Number.isFinite(n)) return '0';
  const yuan = n / 100;
  // toFixed(2) 之后去掉尾零与小数点，避免 120.00 / 125.50 这种展示
  return yuan.toFixed(2).replace(/\.?0+$/, '');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** `yyyy-MM-dd` → `周一` */
export const weekdayOf = (dateStr: string): string => WEEKDAYS[parseDate(dateStr).getDay()];

/** `yyyy-MM-dd` → `10-09` */
export const shortDate = (dateStr: string): string => dateStr.slice(5);

/** `HH:mm:ss` → `HH:mm` */
export const hhmm = (time: string): string => (time ?? '').slice(0, 5);

/** 今天（本地时区） */
export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 今天往后第 n 天 */
export function dayOffsetStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 距某个 `yyyy-MM-dd HH:mm` 还有多久，给「距检票入园还有 N 小时」用 */
export function hoursUntil(dateStr: string, timeStr: string): number {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const target = parseDate(dateStr);
  target.setHours(h ?? 0, m ?? 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - Date.now()) / 3600000));
}
