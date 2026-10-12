import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysConfig } from '../../database/entities/system.entity';
import { SysConfigService } from './sys-config.service';
import { WeatherService } from './weather.service';

/**
 * `@Global()`：`SysConfigService` 的消费方跨了 order / pay / mini / stats(jobs) / scenic 五个模块，
 * 逐个 import 只会往各自的 module 里加噪音。这与 RedisModule / SecurityModule 的既有做法一致。
 *
 * `WeatherService` 也放这里：它本质上是个「读 `sys_config` + 只在服务端用」的系统级能力
 * （唯一的消费者是 `GET /api/mini/platform/settings`，以后后台那块支付/天气自检也会用），
 * 挂 `@Global()` 免得为了它给 mini 模块加 import。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SysConfig])],
  providers: [SysConfigService, WeatherService],
  exports: [SysConfigService, WeatherService],
})
export class SysConfigModule {}
