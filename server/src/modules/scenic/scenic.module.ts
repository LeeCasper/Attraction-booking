import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenicArea, Announcement } from '../../database/entities/scenic.entity';
import { AuthModule } from '../auth/auth.module';
import { ScenicController } from './scenic.controller';
import { ScenicService } from './scenic.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScenicArea, Announcement]), AuthModule],
  controllers: [ScenicController],
  providers: [ScenicService],
})
export class ScenicModule {}
