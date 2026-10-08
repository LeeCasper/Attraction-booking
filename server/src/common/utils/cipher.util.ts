import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * 敏感字段加密（AES-256-GCM）：
 * 密文格式 base64( iv(12) + authTag(16) + data )，密钥取 AES_KEY 前 32 字节。
 * 核验/限购比对只使用 sha256 哈希，不还原明文。
 */
export class CipherUtil {
  private readonly key: Buffer;

  constructor(aesKey: string, private readonly hashSalt: string) {
    this.key = Buffer.from(aesKey).subarray(0, 32);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }

  decrypt(cipherText: string): string {
    const raw = Buffer.from(cipherText, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** 身份证/手机号哈希（限购、黑名单、核验比对用） */
  hash(value: string): string {
    return createHash('sha256').update(`${this.hashSalt}:${value.trim()}`).digest('hex');
  }
}

export const maskIdCard = (id: string): string =>
  id.length >= 10 ? `${id.slice(0, 3)}${'*'.repeat(id.length - 7)}${id.slice(-4)}` : id;

export const maskPhone = (phone: string): string =>
  phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
