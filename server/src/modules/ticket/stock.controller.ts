import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { StockService } from './stock.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class GenerateStockDto {
  @IsInt() ticketTypeId: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate: string;
  @IsInt() @Min(0) @Max(1000000) total: number;
}

class AdjustStockDto {
  @IsInt() changeValue: number;
  @IsOptional() @IsString() remark?: string;
}

@ApiTags('后台-库存')
@Controller('admin/stocks')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('stock:read')
  @ApiOperation({ summary: '库存查询(含已售/锁定/剩余)' })
  list(
    @Query('ticketTypeId', ParseIntPipe) ticketTypeId: number,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.stockService.list(ticketTypeId, start, end);
  }

  @Post('generate')
  @Permissions('stock:update')
  @ApiOperation({ summary: '批量生成分时库存(不覆盖已有)' })
  async generate(@Body() dto: GenerateStockDto, @Req() req: Express.Request) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const r = await this.stockService.generate(dto.ticketTypeId, dto.startDate, dto.endDate, dto.total, adminId);
    await this.authService.writeLog(adminId, 'stock:generate', 'ticket_type', dto.ticketTypeId, { ...dto, created: r.created });
    return r;
  }

  @Put(':id/adjust')
  @Permissions('stock:update')
  @ApiOperation({ summary: '手动调整库存(记录操作日志, 不得低于已售+锁定)' })
  async adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: AdjustStockDto, @Req() req: Express.Request) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const r = await this.stockService.adjust(id, dto.changeValue, dto.remark ?? '', adminId);
    await this.authService.writeLog(adminId, 'stock:adjust', 'ticket_stock', id, dto);
    return r;
  }
}
