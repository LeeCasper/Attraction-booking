import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class RangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end: string;
}

class TrafficDto extends RangeDto {
  @IsOptional() @IsIn(['hour', 'day', 'month']) granularity?: 'hour' | 'day' | 'month';
}

const optionalArea = new ParseIntPipe({ optional: true });

@ApiTags('后台-运营分析')
@Controller('admin/analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('overview')
  @Permissions('stats:read')
  @ApiOperation({ summary: '运营概览（转化指标 + 财务 + 票种 + 渠道，一次拉取）' })
  async overview(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    // ⚠️ 不传 `areaId` = **全部景区**，不要写成 `areaId` ——
    // 那会把「全部」静默变成「1 号景区」，多景区下数字看着对、其实只是一家的
    const [conversion, finance, ticketTypes, channels] = await Promise.all([
      this.analysis.conversion(areaId, range.start, range.end),
      this.analysis.finance(areaId, range.start, range.end),
      this.analysis.byTicketType(areaId, range.start, range.end),
      this.analysis.byChannel(areaId, range.start, range.end),
    ]);
    return { range: { start: range.start, end: range.end }, conversion, finance, ticketTypes, channels };
  }

  @Get('trend')
  @Permissions('stats:read')
  @ApiOperation({ summary: '预约与经营趋势（按日，含核销率与退款）' })
  trend(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.trend(areaId, range.start, range.end);
  }

  @Get('conversion')
  @Permissions('stats:read')
  @ApiOperation({ summary: '转化指标：核销率 / 爽约率 / 退单率' })
  conversion(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.conversion(areaId, range.start, range.end);
  }

  @Get('traffic')
  @Permissions('stats:read')
  @ApiOperation({ summary: '客流分析（分时 / 日 / 月）' })
  traffic(@Query() query: TrafficDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.traffic(areaId, query.start, query.end, query.granularity ?? 'day');
  }

  @Get('ticket-types')
  @Permissions('stats:read')
  @ApiOperation({ summary: '票种分析：销量、收入、占比' })
  ticketTypes(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.byTicketType(areaId, range.start, range.end);
  }

  @Get('channels')
  @Permissions('stats:read')
  @ApiOperation({ summary: '渠道分析：订单量、核销、金额' })
  channels(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.byChannel(areaId, range.start, range.end);
  }

  @Get('finance')
  @Permissions('stats:read')
  @ApiOperation({ summary: '财务分析：收入 / 退款 / 实收' })
  finance(@Query() range: RangeDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.analysis.finance(areaId, range.start, range.end);
  }
}
