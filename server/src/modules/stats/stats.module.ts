import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { VerifyModule } from '../verify/verify.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VerifyModule, AuthModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
