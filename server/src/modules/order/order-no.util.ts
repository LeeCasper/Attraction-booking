import { randomInt } from 'crypto';

/**
 * 业务单号：yyyyMMddHHmmss + 6 位随机（22 位以内，便于人工报读与对账）
 *
 * 与微信支付 out_trade_no / out_refund_no 共用同一套编号规则。
 */
export function generateOrderNo(prefix = ''): string {
  const now = new Date();
  const pad = (n: number, len = 2) => `${n}`.padStart(len, '0');
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}${ts}${pad(randomInt(0, 1000000), 6)}`;
}

/** 退款单号 */
export function generateRefundNo(): string {
  return generateOrderNo('R');
}
