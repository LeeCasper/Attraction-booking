import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orders } from '../database/entities/order.entity';
import { OrderModule } from '../modules/order/order.module';
import { PayModule } from '../modules/pay/pay.module';
import { OrderJob } from './order.job';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([Orders]), OrderModule, PayModule],
  providers: [OrderJob],
})
export class JobsModule {}
