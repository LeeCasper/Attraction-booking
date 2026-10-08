/**
 * 业务格式化工具
 *
 * 服务端金额一律以「分」存储（int），前端展示/输入以「元」为单位。
 */

/** 分 → 展示字符串，如 6000 → ¥60.00 */
export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '-';
  }

  return `¥${(cents / 100).toFixed(2)}`;
}

/** 元 → 分，如 60 → 6000（四舍五入，避免浮点误差） */
export function yuanToCents(yuan: number | string | null | undefined): number {
  const value = Number(yuan ?? 0);

  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * 100);
}

/** 分 → 元（表单回填用，保留两位小数） */
export function centsToYuan(cents: number | null | undefined): number {
  return Number(((cents ?? 0) / 100).toFixed(2));
}

/** 日期 → yyyy-MM-dd */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return '';
  }

  const d = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');

  return `${d.getFullYear()}-${month}-${day}`;
}

/** 时间字符串截短为 HH:mm（服务端返回 HH:mm:ss） */
export function formatHm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}
