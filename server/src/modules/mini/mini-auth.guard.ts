import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/** 小程序登录态 */
export interface MiniUser {
  id: number;
  openid: string;
}

/**
 * 小程序端鉴权：校验 JWT 且要求 typ === 'mini'
 *
 * 与管理端 token 互相隔离：管理端 token 无 typ 字段，小程序 token 无 username。
 */
@Injectable()
export class MiniAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: MiniUser }>();
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('未登录');

    let payload: { sub: number; openid: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.miniSecret'),
      });
    } catch {
      throw new UnauthorizedException('登录已失效');
    }

    if (payload.typ !== 'mini') {
      throw new UnauthorizedException('无效的小程序登录态');
    }

    req.user = { id: payload.sub, openid: payload.openid };
    return true;
  }
}

/** 取当前小程序用户 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): MiniUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: MiniUser }>();
  return req.user;
});
