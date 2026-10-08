import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orders } from '../database/entities/order.entity';
import { ScenicArea } from '../database/entities/scenic.entity';
import { Alarm } from '../database/entities/verify.entity';
import { OrderModule } from '../modules/order/order.module';
import { PayModule } from '../modules/pay/pay.module';
import { GateModule } from '../modules/gate/gate.module';
import { VerifyModule } from '../modules/verify/verify.module';
import { StatsModule } from '../modules/stats/stats.module';
import { OrderJob } from './order.job';
import { GateJob } from './gate.job';
import { StatsJob } from './stats.job';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Orders, ScenicArea, Alarm]),
    OrderModule,
    PayModule,
    GateModule,
    VerifyModule,
    StatsModule,
  ],
  providers: [OrderJob, GateJob, StatsJob],
})
export class JobsModule {}
