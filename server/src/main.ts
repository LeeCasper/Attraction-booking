import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody：微信支付回调需按原文验签，不能使用被解析后的 JSON
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // 支付回调按设计文档 §3.5 挂在 /pay 下，不带 /api 前缀
  app.setGlobalPrefix('api', { exclude: ['pay/wx/notify', 'pay/wx/refund/notify'] });
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const docConfig = new DocumentBuilder()
    .setTitle('景区预约管理及门禁联动系统 API')
    .setDescription('一期 M1：认证/RBAC/景区/票种/时段/价格日历/库存')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, docConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] listening on http://localhost:${port} (docs at /docs)`);
}

bootstrap();
