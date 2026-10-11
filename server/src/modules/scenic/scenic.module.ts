import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenicArea, Announcement, Banner } from '../../database/entities/scenic.entity';
import { AuthModule } from '../auth/auth.module';
import { TicketModule } from '../ticket/ticket.module';
import { ScenicController } from './scenic.controller';
import { ScenicService } from './scenic.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScenicArea, Announcement, Banner]),
    AuthModule,
    // 新建景区「一键生成默认时段/票种/库存」：生成逻辑在票务域，这里只要结果
    TicketModule,
  ],
  controllers: [ScenicController],
  providers: [ScenicService],
})
export class ScenicModule {}
