import { Controller, Get, Injectable, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from '../../database/entities/system.entity';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class LogService {
  constructor(@InjectRepository(OperationLog) private readonly repo: Repository<OperationLog>) {}

  async list(page: number, pageSize: number, adminId?: number, action?: string, start?: string, end?: string) {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('1=1')
      .orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (adminId) qb.andWhere('l.admin_id = :adminId', { adminId });
    if (action) qb.andWhere('l.action LIKE :action', { action: `${action}%` });
    if (start && end) {
      qb.andWhere('l.created_at BETWEEN :start AND :end', { start, end });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}

@Controller('admin/logs')
@ApiTags('后台-日志')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get('operations')
  @Permissions('log:read')
  @ApiOperation({ summary: '操作日志查询(append-only)' })
  list(
    @Query() page: PaginationDto,
    @Query('adminId', new ParseIntPipe({ optional: true })) adminId?: number,
    @Query('action') action?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.logService.list(page.page, page.pageSize, adminId, action, start, end);
  }
}
