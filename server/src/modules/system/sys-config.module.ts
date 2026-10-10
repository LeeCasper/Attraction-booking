import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysConfig } from '../../database/entities/system.entity';
import { SysConfigService } from './sys-config.service';

/**
 * `@Global()`：`SysConfigService` 的消费方跨了 order / pay / mini / stats(jobs) / scenic 五个模块，
 * 逐个 import 只会往各自的 module 里加噪音。这与 RedisModule / SecurityModule 的既有做法一致。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SysConfig])],
  providers: [SysConfigService],
  exports: [SysConfigService],
})
export class SysConfigModule {}
