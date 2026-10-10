import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { SysConfigModule } from './modules/system/sys-config.module';
import { ScenicModule } from './modules/scenic/scenic.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { RedisModule } from './modules/redis/redis.module';
import { SecurityModule } from './modules/security/security.module';
import { OrderModule } from './modules/order/order.module';
import { PayModule } from './modules/pay/pay.module';
import { MiniModule } from './modules/mini/mini.module';
import { VerifyModule } from './modules/verify/verify.module';
import { GateModule } from './modules/gate/gate.module';
import { StatsModule } from './modules/stats/stats.module';
import { JobsModule } from './jobs/jobs.module';
import { AdminAuthGuard } from './common/guards/admin-auth.guard';

const guards: Provider[] = [
  { provide: APP_GUARD, useClass: AdminAuthGuard },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.user'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.database'),
        autoLoadEntities: true,
        synchronize: false,
        timezone: '+08:00',
        charset: 'utf8mb4',
        // BIGINT 主键以 number 返回（默认会转成字符串，导致前端类型不一致）；
        // 业务 id 远小于 2^53，安全
        extra: {
          supportBigNumbers: true,
          bigNumberStrings: false,
          connectionLimit: config.get<number>('db.poolSize') ?? 20,
        },
      }),
    }),
    RedisModule,
    SecurityModule,
    // 参数配置读取（退改规则/预警阈值/支付超时/平台信息）
    SysConfigModule,
    AuthModule,
    AdminModule,
    ScenicModule,
    TicketModule,
    OrderModule,
    PayModule,
    MiniModule,
    VerifyModule,
    GateModule,
    StatsModule,
    JobsModule,
  ],
  providers: guards,
})
export class AppModule {}
