import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';

/** 凭证载荷 */
export interface CredentialPayload {
  /** 预约 id */
  rid: number;
  /** 用户 id */
  uid: number;
  /** 过期时间戳（秒） */
  exp: number;
  /** 随机数（防重放/防碰撞） */
  nonce: string;
  /** 密钥版本，支持轮换 */
  v: number;
}

export interface CredentialCheck {
  valid: boolean;
  payload?: CredentialPayload;
  /** 失效原因码 */
  reason?: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'UNKNOWN_VERSION';
}

/** 凭证有效期（秒）：设计文档 §5.1 要求每分钟刷新、防截屏 */
const TTL_SECONDS = 60;

/**
 * 动态凭证（设计文档 §5.1）
 *
 * token = base64url(payload).base64url(HMAC-SHA256(payload, CRED_SECRET_v{n}))
 * - 60 秒有效，小程序每 50 秒刷新，截屏图自然失效
 * - 密钥带版本号，轮换时旧版本在有效期内仍可验签
 * - 同 token 在有效期内可多次出示；「一人一票只能核销一次」由 verification 唯一索引保证
 */
@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  /** 签发凭证（同一分钟内复用，避免小程序频繁刷新造成抖动） */
  async issue(reservationId: number, userId: number): Promise<{ token: string; expiresIn: number }> {
    const payload: CredentialPayload = {
      rid: reservationId,
      uid: userId,
      exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      nonce: randomBytes(8).toString('hex'),
      v: this.currentVersion,
    };

    const body = this.encode(payload);
    const token = `${body}.${this.sign(body, payload.v)}`;
    return { token, expiresIn: TTL_SECONDS };
  }

  /** 校验凭证签名与有效期 */
  verify(token: string): CredentialCheck {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 2) return { valid: false, reason: 'MALFORMED' };

    const [body, signature] = parts;
    let payload: CredentialPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return { valid: false, reason: 'MALFORMED' };
    }

    const secret = this.secretOf(payload.v);
    if (!secret) return { valid: false, reason: 'UNKNOWN_VERSION' };

    const expected = createHmac('sha256', secret).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { valid: false, reason: 'BAD_SIGNATURE' };
    }

    if (payload.exp * 1000 < Date.now()) {
      return { valid: false, reason: 'EXPIRED', payload };
    }

    return { valid: true, payload };
  }

  /**
   * 仅校验签名并解析载荷（忽略有效期）
   *
   * 用于离线记录同步：闸机断网时本地核验的记录，上传时凭证早已过期，
   * 但签名仍可证明该凭证确实是服务端签发的。
   */
  parse(token: string): CredentialPayload | null {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    let payload: CredentialPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    const secret = this.secretOf(payload.v);
    if (!secret) return null;

    const expected = createHmac('sha256', secret).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    return payload;
  }

  /** 凭证指纹（用于日志/通行记录留痕，不落原 token） */
  fingerprint(token: string): string {
    return createHmac('sha256', 'fingerprint').update(token).digest('hex').slice(0, 16);
  }

  /** 当前密钥版本 */
  get currentVersion(): number {
    return this.config.get<number>('cred.version') ?? 1;
  }

  /** 已下发到闸机的规则版本号（心跳响应携带，变化时闸机重新拉取） */
  async getRuleVersion(): Promise<number> {
    const v = await this.redis.get('gate:rule:version');
    return v ? Number(v) : 1;
  }

  /** 规则变更时递增版本号，触发闸机重新拉取名单 */
  async bumpRuleVersion(): Promise<number> {
    return this.redis.incr('gate:rule:version');
  }

  private encode(payload: CredentialPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private sign(body: string, version: number): string {
    const secret = this.secretOf(version);
    if (!secret) throw new Error(`凭证密钥版本不存在：${version}`);
    return createHmac('sha256', secret).update(body).digest('base64url');
  }

  /** 按版本取密钥（支持轮换期两版并存） */
  private secretOf(version: number): string | null {
    const current = this.config.get<number>('cred.version') ?? 1;
    if (version === current) return this.config.get<string>('cred.secret') ?? 'dev-cred-secret';

    const prevSecret = this.config.get<string>('cred.prevSecret');
    const prevVersion = this.config.get<number>('cred.prevVersion');
    if (prevSecret && prevVersion === version) return prevSecret;

    return null;
  }
}
