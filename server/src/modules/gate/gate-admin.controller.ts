import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GateService } from './gate.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CommandDto {
  @IsIn(['open', 'hold_open', 'close', 'reboot']) type: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

class HandleAlarmDto {
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

@ApiTags('后台-闸机与通行')
@Controller('admin')
export class GateAdminController {
  constructor(
    private readonly gateService: GateService,
    private readonly authService: AuthService,
  ) {}

  // ---------- 闸机设备 ----------

  @Get('gates')
  @Permissions('gate:read')
  @ApiOperation({ summary: '闸机列表（含在线状态与最后心跳）' })
  listGates(@Query('areaId', new ParseIntPipe({ optional: true })) areaId?: number) {
    return this.gateService.listDevices(areaId);
  }

  @Post('gates/:id/command')
  @Permissions('gate:control')
  @ApiOperation({ summary: '远程控制：开闸 / 常开 / 常闭 / 重启' })
  async command(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommandDto,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const result = await this.gateService.sendCommand(id, dto.type, adminId);
    await this.authService.writeLog(adminId, `gate:${dto.type}`, 'gate_device', id, {
      commandNo: result.commandNo,
      remark: dto.remark,
    });
    return result;
  }

  @Get('gates/:id/logs')
  @Permissions('gate:read')
  @ApiOperation({ summary: '闸机通信日志' })
  logs(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: number) {
    return this.gateService.listGateLogs(id, Number(limit ?? 50));
  }

  // ---------- 通行记录 ----------

  @Get('passages')
  @Permissions('gate:read')
  @ApiOperation({ summary: '通行记录（入园/出园/拒绝/异常）' })
  listPassages(
    @Query() page: PaginationDto,
    @Query('areaId', new ParseIntPipe({ optional: true })) areaId?: number,
    @Query('gateId', new ParseIntPipe({ optional: true })) gateId?: number,
    @Query('direction', new ParseIntPipe({ optional: true })) direction?: number,
    @Query('result', new ParseIntPipe({ optional: true })) result?: number,
    @Query('date') date?: string,
  ) {
    return this.gateService.listPassages({
      page: page.page,
      pageSize: page.pageSize,
      areaId,
      gateId,
      direction,
      result,
      date,
    });
  }

  // ---------- 告警 ----------

  @Get('alarms')
  @Permissions('gate:read')
  @ApiOperation({ summary: '告警列表（离线/尾随/强闯/重复核销/承压）' })
  listAlarms(
    @Query() page: PaginationDto,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
    @Query('level', new ParseIntPipe({ optional: true })) level?: number,
  ) {
    return this.gateService.listAlarms({
      page: page.page,
      pageSize: page.pageSize,
      status,
      level,
    });
  }

  @Post('alarms/:id/handle')
  @Permissions('gate:control')
  @ApiOperation({ summary: '处理告警' })
  async handleAlarm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleAlarmDto,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    await this.gateService.handleAlarm(id, adminId, dto.remark ?? '已处理');
    await this.authService.writeLog(adminId, 'alarm:handle', 'alarm', id, { remark: dto.remark });
    return null;
  }
}
