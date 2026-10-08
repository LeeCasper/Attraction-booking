import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsService } from './stats.service';
import { AnalysisService } from './analysis.service';
import { ExportService } from './export.service';
import { ReconciliationService } from './reconciliation.service';
import { BackupService } from './backup.service';
import { StatsController } from './stats.controller';
import { AnalysisController } from './analysis.controller';
import { ExportController } from './export.controller';
import { OpsController } from './ops.controller';
import { DataBackup, Reconciliation } from '../../database/entities/m4.entity';
import { Alarm } from '../../database/entities/verify.entity';
import { VerifyModule } from '../verify/verify.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reconciliation, DataBackup, Alarm]),
    VerifyModule, // PresenceService
    AuthModule, // 操作日志
  ],
  controllers: [StatsController, AnalysisController, ExportController, OpsController],
  providers: [StatsService, AnalysisService, ExportService, ReconciliationService, BackupService],
  exports: [StatsService, AnalysisService, ReconciliationService, BackupService],
})
export class StatsModule {}
