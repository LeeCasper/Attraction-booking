import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { GateDevice } from '../../database/entities/gate.entity';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';

/** 通过验签的闸机上下文 */
export interface GateContext {
  id: number;
  gateNo: string;
  scenicAreaId: number;
  direction: number;
  secretKey: string;
}

/**
 * 闸机请求签名校验（设计文档 §5.4）
 *
 * 签名串：HMAC-SHA256(secretKey, method + path + timestamp + nonce + body)
 * 请求头：X-Gate-No / X-Timestamp / X-Nonce / X-Signature
 *
 * 防重放：时间戳容差 ±60s（可配）；nonce 在 Redis 中 SETNX 去重，窗口 120s。
 * 一期闸机为模拟器，但协议按真实闸机设计，接入真机时无需改动。
 */
@Injectable()
export class GateAuthGuard implements CanActivate {
  private readonly logger = new Logger(GateAuthGuard.name);

  /** 签名时间容差（秒） */
  private static readonly TOLERANCE = Number(process.env.GATE_SIGN_TOLERANCE_SECONDS ?? 60);

  constructor(
    @InjectRepository(GateDevice) private readonly gateRepo: Repository<GateDevice>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { gate?: GateContext; rawBody?: Buffer }>();

    const gateNo = String(req.headers['x-gate-no'] ?? '');
    const timestamp = String(req.headers['x-timestamp'] ?? '');
    const nonce = String(req.headers['x-nonce'] ?? '');
    const signature = String(req.headers['x-signature'] ?? '');

    if (!gateNo || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException('缺少闸机签名头');
    }

    // 时间容差
    const drift = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(drift) || drift > GateAuthGuard.TOLERANCE * 1000) {
      throw new UnauthorizedException('请求时间戳超出允许范围');
    }

    const gate = await this.gateRepo.findOne({ where: { gateNo } });
    if (!gate) throw new UnauthorizedException('闸机未注册');
    if (gate.status === 3) throw new UnauthorizedException('闸机已禁用');

    // 重放防护：nonce 一次性
    const nonceKey = `gate:nonce:${gateNo}:${nonce}`;
    const fresh = await this.redis.set(nonceKey, '1', 'EX', 120, 'NX');
    if (!fresh) {
      this.logger.warn(`检测到重放请求 gate=${gateNo} nonce=${nonce}`);
      throw new UnauthorizedException('请求重复（重放保护）');
    }

    // 验签
    const body = req.rawBody?.toString('utf8') ?? '';
    const message = `${req.method}${req.path}${timestamp}${nonce}${body}`;
    const expected = createHmac('sha256', gate.secretKey).update(message).digest('hex');
    const actual = signature.toLowerCase();

    const ok =
      expected.length === actual.length &&
      timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));

    if (!ok) {
      this.logger.error(`闸机签名校验失败 gate=${gateNo} path=${req.path}`);
      throw new UnauthorizedException('签名校验失败');
    }

    req.gate = {
      id: Number(gate.id),
      gateNo: gate.gateNo,
      scenicAreaId: Number(gate.scenicAreaId),
      direction: gate.direction,
      secretKey: gate.secretKey,
    };
    return true;
  }
}

/** 取当前闸机上下文 */
export const CurrentGate = createParamDecorator((_data: unknown, ctx: ExecutionContext): GateContext => {
  const req = ctx.switchToHttp().getRequest<Request & { gate: GateContext }>();
  return req.gate;
});
