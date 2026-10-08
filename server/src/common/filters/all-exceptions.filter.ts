import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

/** 统一异常响应：HTTP 语义状态码 + 业务 code/msg */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const msg =
        typeof body === 'string'
          ? body
          : Array.isArray((body as Record<string, unknown>).message)
            ? ((body as Record<string, unknown>).message as string[]).join('; ')
            : String((body as Record<string, unknown>).message ?? exception.message);
      res.status(exception.getStatus()).json({
        code: exception.getStatus() * 100,
        msg,
        data: null,
      });
      return;
    }
    this.logger.error('未处理异常', exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 50000,
      msg: '服务内部错误',
      data: null,
    });
  }
}
