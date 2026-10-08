import { createDecipheriv, createSign, createVerify, randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { BadGatewayException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WXPAY_BASE = 'https://api.mch.weixin.qq.com';

/** 微信支付 V3 客户端（设计文档 §6） */
export interface JsapiPayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface NotifyHeaders {
  timestamp: string;
  nonce: string;
  signature: string;
  serial: string;
}

/** 回调报文中的加密资源 */
interface EncryptedResource {
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
}

@Injectable()
export class WxPayService implements OnModuleInit {
  private readonly logger = new Logger(WxPayService.name);
  private privateKey: string | null = null;
  /** 平台证书公钥缓存：serial → PEM */
  private platformCerts = new Map<string, string>();
  private platformCertFetchedAt = 0;

  constructor(private readonly config: ConfigService) {}

  /**
   * 启动自检
   *
   * 微信支付的配置项多且散（商户号/证书/序列号/APIv3 密钥/回调地址），
   * 漏配一项往往到第一笔真实支付才暴露。这里在启动时集中校验并明确报出缺失项。
   */
  onModuleInit() {
    if (this.mock) {
      this.logger.warn(
        '微信支付处于【模拟模式】(WXPAY_MOCK=true)：不会产生真实交易，' +
          '上线前请置为 false 并配置商户证书与 APIv3 密钥',
      );
      return;
    }

    const problems: string[] = [];

    for (const key of ['mchid', 'appid', 'serialNo', 'apiV3Key']) {
      if (!this.config.get<string>(`wxpay.${key}`)) {
        problems.push(`${key} 未配置`);
      }
    }

    // 证书序列号应为 40 位十六进制
    const serialNo = this.config.get<string>('wxpay.serialNo') ?? '';
    if (serialNo && !/^[0-9A-Fa-f]{40}$/.test(serialNo)) {
      problems.push(`serialNo 格式可疑（应为 40 位十六进制，当前 ${serialNo.length} 位）`);
    }

    // APIv3 密钥必须是 32 位，否则回调报文无法解密
    const apiV3Key = this.config.get<string>('wxpay.apiV3Key') ?? '';
    if (apiV3Key && apiV3Key.length !== 32) {
      problems.push(`apiV3Key 长度应为 32（当前 ${apiV3Key.length}）`);
    }

    // 商户私钥文件需存在且可读
    const keyPath = this.config.get<string>('wxpay.privateKeyPath') ?? '';
    if (!keyPath) {
      problems.push('privateKeyPath 未配置');
    } else if (!existsSync(keyPath)) {
      problems.push(`privateKeyPath 文件不存在：${keyPath}`);
    } else {
      try {
        const pem = readFileSync(keyPath, 'utf8');
        if (!pem.includes('PRIVATE KEY')) {
          problems.push(`privateKeyPath 内容不是 PEM 私钥：${keyPath}`);
        }
      } catch (err) {
        problems.push(`privateKeyPath 读取失败：${(err as Error).message}`);
      }
    }

    // 回调地址必须为公网 HTTPS（微信主动回调，localhost 无法联调）
    for (const [key, label] of [
      ['notifyUrl', '支付回调'],
      ['refundNotifyUrl', '退款回调'],
    ] as const) {
      const url = this.config.get<string>(`wxpay.${key}`) ?? '';
      if (!url.startsWith('https://')) {
        problems.push(`${key}（${label}）必须是 https 地址，当前：${url || '(空)'}`);
      } else if (url.includes('your-domain')) {
        problems.push(`${key}（${label}）仍是占位域名，需替换为实际域名：${url}`);
      }
    }

    if (problems.length > 0) {
      this.logger.error(
        `微信支付配置不完整（WXPAY_MOCK=false，真实支付将失败）：\n  - ${problems.join('\n  - ')}`,
      );
    } else {
      this.logger.log('微信支付配置自检通过（真实模式）');
    }
  }

  /** 是否本地模拟模式（无商户证书时） */
  get mock(): boolean {
    return this.config.get<boolean>('wxpay.mock') ?? true;
  }

  get appid(): string {
    return this.config.get<string>('wxpay.appid') ?? '';
  }

  get mchid(): string {
    return this.config.get<string>('wxpay.mchid') ?? '';
  }

  // ==================== JSAPI 下单 ====================

  /**
   * JSAPI 下单，返回小程序 wx.requestPayment 所需参数
   *
   * @param openid 用户 openid（小程序支付必需）
   */
  async createJsapiPay(params: {
    orderNo: string;
    amount: number;
    description: string;
    openid: string;
    expireMinutes: number;
  }): Promise<{ prepayId: string; payParams: JsapiPayParams }> {
    if (this.mock) {
      return this.mockJsapiPay(params.orderNo);
    }

    this.assertConfigured();

    const body = {
      appid: this.appid,
      mchid: this.mchid,
      description: params.description,
      out_trade_no: params.orderNo,
      time_expire: this.toRfc3339(new Date(Date.now() + params.expireMinutes * 60_000)),
      notify_url: this.config.get<string>('wxpay.notifyUrl'),
      amount: { total: params.amount, currency: 'CNY' },
      payer: { openid: params.openid },
    };

    const res = await this.request<{ prepay_id: string }>(
      'POST',
      '/v3/pay/transactions/jsapi',
      body,
    );

    return { prepayId: res.prepay_id, payParams: this.buildPayParams(res.prepay_id) };
  }

  /** 生成小程序端支付参数（paySign 用商户私钥 RSA 签名） */
  private buildPayParams(prepayId: string): JsapiPayParams {
    const timeStamp = `${Math.floor(Date.now() / 1000)}`;
    const nonceStr = randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    const message = `${this.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = this.rsaSign(message);

    return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
  }

  // ==================== 查单（回调丢失补偿） ====================

  async queryOrder(orderNo: string): Promise<{
    tradeState: string;
    transactionId?: string;
    amount?: number;
    raw: Record<string, unknown>;
  }> {
    if (this.mock) {
      // 模拟模式：由测试通过 /api/mini/pay/mock-notify 驱动，查单永远返回未支付
      return { tradeState: 'NOTPAY', raw: { mock: true } };
    }

    const path = `/v3/pay/transactions/out-trade-no/${orderNo}?mchid=${this.mchid}`;
    const raw = await this.request<Record<string, unknown>>('GET', path);
    return {
      tradeState: String(raw.trade_state ?? ''),
      transactionId: raw.transaction_id as string | undefined,
      amount: (raw.amount as { total?: number } | undefined)?.total,
      raw,
    };
  }

  // ==================== 退款 ====================

  async createRefund(params: {
    refundNo: string;
    orderNo: string;
    refundAmount: number;
    totalAmount: number;
    reason: string;
  }): Promise<{ refundId?: string; status: string }> {
    if (this.mock) {
      return { refundId: `mock_refund_${params.refundNo}`, status: 'SUCCESS' };
    }

    this.assertConfigured();

    const res = await this.request<{ refund_id?: string; status: string }>(
      'POST',
      '/v3/refund/domestic/refunds',
      {
        out_trade_no: params.orderNo,
        out_refund_no: params.refundNo,
        reason: params.reason,
        notify_url: this.config.get<string>('wxpay.refundNotifyUrl'),
        amount: {
          refund: params.refundAmount,
          total: params.totalAmount,
          currency: 'CNY',
        },
      },
    );
    return { refundId: res.refund_id, status: res.status };
  }

  // ==================== 回调验签与解密 ====================

  /**
   * 校验回调签名
   *
   * 签名串：timestamp\nnonce\nbody\n，用微信平台证书公钥验签。
   * 平台证书首次使用时自动下载并缓存。
   */
  async verifyNotify(headers: NotifyHeaders, rawBody: string): Promise<void> {
    if (this.mock) return; // 模拟模式不做验签义务

    if (!headers.signature || !headers.timestamp || !headers.nonce) {
      throw new BadGatewayException('微信回调缺少签名头');
    }

    const cert = await this.getPlatformCert(headers.serial);
    const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;
    const ok = createVerify('RSA-SHA256').update(message).verify(cert, headers.signature, 'base64');
    if (!ok) {
      this.logger.error(`微信回调验签失败 serial=${headers.serial}`);
      throw new BadGatewayException('微信回调验签失败');
    }
  }

  /** 解密回调报文中的 resource（AES-256-GCM，密钥为 APIv3 密钥） */
  decryptResource<T extends Record<string, unknown>>(resource: EncryptedResource): T {
    return JSON.parse(this.decryptToString(resource)) as T;
  }

  /** 解密为原始文本（平台证书密文解出的是 PEM 文本，不是 JSON） */
  private decryptToString(resource: EncryptedResource): string {
    const key = this.config.get<string>('wxpay.apiV3Key') ?? '';
    if (key.length !== 32) {
      throw new BadGatewayException('未配置 WXPAY_API_V3_KEY（需 32 位）');
    }

    const data = Buffer.from(resource.ciphertext, 'base64');
    const authTag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(0, data.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key),
      Buffer.from(resource.nonce),
    );
    decipher.setAuthTag(authTag);
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data));
    }
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // ==================== 内部工具 ====================

  /** 带 V3 签名的请求 */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const auth = this.buildAuthorization(method, path, bodyStr);

    const res = await fetch(`${WXPAY_BASE}${path}`, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'attraction-booking/1.0',
      },
      body: bodyStr || undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`微信支付请求失败 ${method} ${path} → ${res.status} ${text}`);
      throw new BadGatewayException(`微信支付接口失败：${res.status}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** WECHATPAY2-SHA256-RSA2048 授权头 */
  private buildAuthorization(method: string, path: string, body: string): string {
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const nonce = randomBytes(16).toString('hex');
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = this.rsaSign(message);

    return (
      `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchid}",` +
      `nonce_str="${nonce}",timestamp="${timestamp}",` +
      `serial_no="${this.config.get<string>('wxpay.serialNo')}",signature="${signature}"`
    );
  }

  private rsaSign(message: string): string {
    const key = this.loadPrivateKey();
    return createSign('RSA-SHA256').update(message).sign(key, 'base64');
  }

  private loadPrivateKey(): string {
    if (this.privateKey) return this.privateKey;

    const path = this.config.get<string>('wxpay.privateKeyPath') ?? '';
    if (!path) {
      throw new BadGatewayException('未配置 WXPAY_PRIVATE_KEY_PATH（商户 API 私钥）');
    }
    try {
      this.privateKey = readFileSync(path, 'utf8');
      return this.privateKey;
    } catch (err) {
      throw new BadGatewayException(`商户私钥读取失败：${path}`);
    }
  }

  /** 平台证书（下载后按 APIv3 密钥解密，缓存 12 小时） */
  private async getPlatformCert(serial: string): Promise<string> {
    const fresh = Date.now() - this.platformCertFetchedAt < 12 * 3600 * 1000;
    if (fresh && this.platformCerts.has(serial)) {
      return this.platformCerts.get(serial)!;
    }

    const res = await this.request<{
      data: {
        serial_no: string;
        encrypt_certificate: EncryptedResource;
      }[];
    }>('GET', '/v3/certificates');

    this.platformCerts.clear();
    for (const item of res.data) {
      // encrypt_certificate 解密后即证书 PEM 文本
      const pem = this.decryptToString(item.encrypt_certificate);
      this.platformCerts.set(item.serial_no, pem);
    }
    this.platformCertFetchedAt = Date.now();

    const hit = this.platformCerts.get(serial);
    if (!hit) throw new BadGatewayException(`未找到微信平台证书：${serial}`);
    return hit;
  }

  private assertConfigured() {
    const missing = ['mchid', 'appid', 'serialNo', 'privateKeyPath', 'apiV3Key'].filter(
      (k) => !this.config.get<string>(`wxpay.${k}`),
    );
    if (missing.length > 0) {
      throw new BadGatewayException(`微信支付配置缺失：${missing.join(', ')}`);
    }
  }

  private toRfc3339(d: Date): string {
    // 微信要求带时区的 RFC3339，如 2026-10-08T18:00:00+08:00
    const pad = (n: number) => `${n}`.padStart(2, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
    );
  }

  /** 模拟模式的支付参数（前端无法真正拉起支付，仅用于打通服务端链路） */
  private mockJsapiPay(orderNo: string): { prepayId: string; payParams: JsapiPayParams } {
    const prepayId = `mock_prepay_${orderNo}`;
    return {
      prepayId,
      payParams: {
        timeStamp: `${Math.floor(Date.now() / 1000)}`,
        nonceStr: randomBytes(8).toString('hex'),
        package: `prepay_id=${prepayId}`,
        signType: 'RSA',
        paySign: 'mock-signature',
      },
    };
  }
}
