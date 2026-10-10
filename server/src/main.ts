import 'reflect-metadata';
import { networkInterfaces } from 'node:os';
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

  // 小程序端（真机 / 微信开发者工具）打不到 localhost，必须用**局域网 IP**，
  // 而那个 IP 换网络就会变、写死在 miniprogram 里必然过期（已因此出过一次
  // 「首页什么都没有、控制台只有 request:fail timeout」的假故障）。
  // 所以把它打出来：换网络时照着改 `miniprogram/.env.local` 的 `VITE_API_BASE` 即可。
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
  if (lan.length) {
    console.log(`[server] 小程序端请用局域网地址：${lan.map((ip) => `http://${ip}:${port}/api/mini`).join('  或  ')}`);
  }
}

bootstrap();
