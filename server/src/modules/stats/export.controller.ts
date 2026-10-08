import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { ExportService } from './export.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

class ExportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end: string;
}

const optionalArea = new ParseIntPipe({ optional: true });

type ExportType = 'orders' | 'verifications' | 'passages' | 'refunds' | 'daily';

const EXPORT_LABEL: Record<ExportType, string> = {
  orders: '订单明细',
  verifications: '核销记录',
  passages: '通行记录',
  refunds: '退款单',
  daily: '经营日报',
};

/**
 * 报表导出（PRD A-063）
 *
 * 返回 CSV 文件流（UTF-8 BOM，Excel 可直接打开）。
 * 用 @SkipTransform 跳过统一响应体封装，否则文件流会被包成 JSON。
 */
@ApiTags('后台-报表导出')
@Controller('admin/export')
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly authService: AuthService,
  ) {}

  @Get(':type')
  @Permissions('stats:read')
  @SkipTransform()
  @ApiOperation({ summary: '导出报表：orders / verifications / passages / refunds / daily' })
  async export(
    @Param('type') type: ExportType,
    @Query() query: ExportQueryDto,
    @Query('areaId', optionalArea) areaId: number | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!EXPORT_LABEL[type]) {
      throw new BadRequestException(`不支持的导出类型：${type}`);
    }

    const id = areaId ?? 1;
    const file =
      type === 'orders'
        ? await this.exportService.orders(id, query.start, query.end)
        : type === 'verifications'
          ? await this.exportService.verifications(id, query.start, query.end)
          : type === 'passages'
            ? await this.exportService.passages(id, query.start, query.end)
            : type === 'refunds'
              ? await this.exportService.refunds(id, query.start, query.end)
              : await this.exportService.daily(id, query.start, query.end);

    // 导出属敏感操作，记入操作日志（谁在什么时候导了什么）
    const admin = (req as Request & { admin?: { id: number } }).admin;
    if (admin) {
      await this.authService.writeLog(admin.id, 'export:report', 'export', null, {
        type,
        label: EXPORT_LABEL[type],
        areaId: id,
        start: query.start,
        end: query.end,
      });
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });

    return new StreamableFile(file.content);
  }
}
