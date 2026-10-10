import { Controller, Get, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { StatsService } from './stats.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class DailyQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) start: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) end: string;
}

const optionalArea = new ParseIntPipe({ optional: true });

@ApiTags('后台-数据看板')
@Controller('admin')
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly authService: AuthService,
  ) {}

  @Get('dashboard/realtime')
  @Permissions('stats:read')
  @ApiOperation({ summary: '实时看板（在园/预约/核销/承载率/闸机在线率/告警/渠道）；不传 areaId = 全部景区' })
  realtime(@Query('areaId', optionalArea) areaId?: number) {
    return this.statsService.realtime(areaId);
  }

  @Get('dashboard/hourly')
  @Permissions('stats:read')
  @ApiOperation({ summary: '分时趋势（入园/出园/核销）；不传 areaId = 全部景区' })
  hourly(@Query('areaId', optionalArea) areaId?: number, @Query('date') date?: string) {
    return this.statsService.hourlyTrend(areaId, date);
  }

  @Get('stats/daily')
  @Permissions('stats:read')
  @ApiOperation({ summary: '日统计（经营分析）；不传 areaId = 全部景区（按日期求和）' })
  daily(@Query() query: DailyQueryDto, @Query('areaId', optionalArea) areaId?: number) {
    return this.statsService.daily(areaId, query.start, query.end);
  }

  @Post('stats/rebuild')
  @Permissions('config:update')
  @ApiOperation({ summary: '重算某日统计（幂等）' })
  async rebuild(
    @Query('date') date: string,
    @Query('areaId', optionalArea) areaId: number | undefined,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const result = await this.statsService.rebuildDaily(areaId, date);
    await this.authService.writeLog(adminId, 'stats:rebuild', 'daily_stats', null, result);
    return result;
  }
}
