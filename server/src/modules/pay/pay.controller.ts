import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { PayService } from './pay.service';
import { NotifyHeaders } from './wxpay.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * 微信支付回调（设计文档 §3.5）
 *
 * 挂在 /pay 下（不带 /api 前缀），返回微信约定的 {"code":"SUCCESS"}，
 * 因此使用 @SkipTransform 跳过统一响应体封装。
 */
@ApiExcludeController()
@Controller('pay/wx')
export class PayController {
  constructor(private readonly payService: PayService) {}

  @Post('notify')
  @HttpCode(200)
  @SkipTransform()
  async notify(@Req() req: RawBodyRequest, @Headers() headers: Record<string, string>) {
    await this.payService.handlePaidNotify(this.pickHeaders(headers), this.raw(req));
    return { code: 'SUCCESS', message: '成功' };
  }

  @Post('refund/notify')
  @HttpCode(200)
  @SkipTransform()
  async refundNotify(@Req() req: RawBodyRequest, @Headers() headers: Record<string, string>) {
    await this.payService.handleRefundNotify(this.pickHeaders(headers), this.raw(req));
    return { code: 'SUCCESS', message: '成功' };
  }

  private raw(req: RawBodyRequest): string {
    return req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
  }

  private pickHeaders(headers: Record<string, string>): NotifyHeaders {
    return {
      timestamp: headers['wechatpay-timestamp'] ?? '',
      nonce: headers['wechatpay-nonce'] ?? '',
      signature: headers['wechatpay-signature'] ?? '',
      serial: headers['wechatpay-serial'] ?? '',
    };
  }
}
