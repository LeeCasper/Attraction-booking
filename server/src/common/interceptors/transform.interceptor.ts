import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

/** 统一响应体 { code, msg, data }；带 @SkipTransform() 的接口原样返回 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => ({ code: 0, msg: 'ok', data: data ?? null })));
  }
}
