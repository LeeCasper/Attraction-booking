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

/**
 * 凭证号用的字母表：**去掉容易看错的 I / L / O / U 与 0 / 1**。
 *
 * 这串是要人念、人抄的（客服电话里报号、闸机口对着屏幕核对），所以宁可少 6 个字符。
 * 32 个字符 × 8 位 ≈ 1.1e12 种组合，配合 `uk_credential_no` 唯一索引足够。
 */
const CREDENTIAL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 凭证号（**展示用**）：`V` + 预约日 + `-` + 8 位随机字符，如 `V20261011-K7F3QM2X`。
 *
 * 为什么**不能**用「预约 id」拼出来（第一版就是这么写的）：顺序 id 拼的号，
 * 别人拿自己的号 ±1 就能念出隔壁的号 —— 而客服与闸机口都是**按号核对**的，
 * 猜得出来就能冒用。所以这里用随机，且落库（`reservation.credential_no`，带唯一索引），
 * 这样它既可人工反查、又不会因为算法或密钥轮换而变。
 *
 * ⚠️ 机器契约仍然只有**动态 token**：闸机不认这个号，通行判定一律走 token / 证件。
 */
export function generateCredentialNo(date: string): string {
  const ymd = String(date).replace(/-/g, '');
  let body = '';
  for (let i = 0; i < 8; i++) {
    body += CREDENTIAL_ALPHABET[randomInt(0, CREDENTIAL_ALPHABET.length)];
  }
  return `V${ymd}-${body}`;
}
