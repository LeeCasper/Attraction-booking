import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { ReconciliationService } from './reconciliation.service';
import { BackupService } from './backup.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

const optionalArea = new ParseIntPipe({ optional: true });
const optionalStatus = new ParseIntPipe({ optional: true });

/** 对账日期参数（独立 DTO 以便用 class-validator 校验） */
class ReconcileQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
}

@ApiTags('后台-对账与备份')
@Controller('admin')
export class OpsController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly backup: BackupService,
    private readonly authService: AuthService,
  ) {}

  // ---------- 对账 ----------

  @Post('reconciliations/run')
  @Permissions('reconcile:run')
  @ApiOperation({ summary: '执行指定日期对账（订单↔支付↔退款三方核对，幂等）' })
  async runReconciliation(
    @Query() query: ReconcileQueryDto,
    @Query('areaId', optionalArea) areaId: number | undefined,
    @Req() req: Request,
  ) {
    const adminId = (req as Request & { admin: { id: number } }).admin.id;
    const result = await this.reconciliation.run(areaId ?? 1, query.date);
    await this.authService.writeLog(adminId, 'reconcile:run', 'reconciliation', null, {
      date: query.date,
      diffCount: result.diffCount,
    });
    return result;
  }

  @Get('reconciliations')
  @Permissions('order:read')
  @ApiOperation({ summary: '对账记录列表' })
  listReconciliation(@Query() page: PaginationDto, @Query('status', optionalStatus) status?: number) {
    return this.reconciliation.list(page.page, page.pageSize, status);
  }

  @Get('reconciliations/:date')
  @Permissions('order:read')
  @ApiOperation({ summary: '对账详情（含差异明细）' })
  reconciliationDetail(@Param('date') date: string) {
    return this.reconciliation.detail(date);
  }

  // ---------- 备份 ----------

  @Post('backups/run')
  @Permissions('config:update')
  @ApiOperation({ summary: '手动触发数据库备份（mysqldump + gzip）' })
  async runBackup(@Req() req: Request) {
    const adminId = (req as Request & { admin: { id: number } }).admin.id;
    const result = await this.backup.run('manual', adminId);
    await this.authService.writeLog(adminId, 'backup:run', 'data_backup', null, result);
    return result;
  }

  @Get('backups')
  @Permissions('config:read')
  @ApiOperation({ summary: '备份记录列表' })
  listBackups(@Query() page: PaginationDto) {
    return this.backup.list(page.page, page.pageSize);
  }

  @Get('backups/:id/download')
  @Permissions('config:read')
  @SkipTransform()
  @ApiOperation({ summary: '下载备份文件' })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.backup.fileOf(id);
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });
    return new StreamableFile(createReadStream(file.path));
  }
}
