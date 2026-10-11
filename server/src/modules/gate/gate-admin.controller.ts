import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { GateService } from './gate.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CommandDto {
  @IsIn(['open', 'hold_open', 'close', 'reboot']) type: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

class CreateGateDto {
  @IsInt() scenicAreaId: number;

  /** 闸机身份，全局唯一，走 `X-Gate-No` 头；多景区请用前缀区分 */
  @IsString() @MinLength(2) @MaxLength(32) gateNo: string;

  @IsOptional() @IsString() @MaxLength(64) name?: string;

  @IsOptional() @IsString() @MaxLength(128) location?: string;

  @IsOptional() @IsString() @MaxLength(64) ip?: string;

  @IsOptional() @IsIn([1, 2, 3]) direction?: number;

  /** 留空则服务端生成一个；**只在这次的返回里给一次** */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) secretKey?: string;

  /**
   * 通行规则（A-044）：只放行这些时段 / 这些票种（id 必须属于本景区）。
   * **空数组 = 不限**，与不传同义。
   */
  @IsOptional() @IsArray() @IsInt({ each: true }) allowedSlotIds?: number[];

  @IsOptional() @IsArray() @IsInt({ each: true }) allowedTicketTypeIds?: number[];
}

class UpdateGateDto {
  /** 换绑景区 —— 景区被删/换绑之后闸机会核不了单，这是唯一的救济手段 */
  @IsOptional() @IsInt() scenicAreaId?: number;

  @IsOptional() @IsString() @MaxLength(64) name?: string;

  @IsOptional() @IsString() @MaxLength(128) location?: string;

  @IsOptional() @IsString() @MaxLength(64) ip?: string;

  @IsOptional() @IsIn([1, 2, 3]) direction?: number;

  /** 1 启用 / 3 禁用。2 离线、4 故障是心跳巡检的运行时状态，不接受直接写 */
  @IsOptional() @IsIn([1, 3]) status?: number;

  /** 留空则不改动密钥 */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) secretKey?: string;

  /**
   * 通行规则（A-044）：只放行这些时段 / 这些票种（id 必须属于本景区）。
   * **空数组 = 不限**，与不传同义。
   */
  @IsOptional() @IsArray() @IsInt({ each: true }) allowedSlotIds?: number[];

  @IsOptional() @IsArray() @IsInt({ each: true }) allowedTicketTypeIds?: number[];
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

  @Post('gates')
  @Permissions('gate:create')
  @ApiOperation({ summary: '新增闸机（返回一次生成的密钥，之后不再下发）' })
  async create(
    @Body() dto: CreateGateDto,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const result = await this.gateService.createDevice(dto);
    // 密钥**不能**进操作日志（append-only，谁都查得到）
    await this.authService.writeLog(adminId, 'gate:create', 'gate_device', result.id, {
      gateNo: result.gateNo,
      scenicAreaId: dto.scenicAreaId,
      direction: dto.direction ?? 1,
    });
    return result;
  }

  @Put('gates/:id')
  @Permissions('gate:update')
  @ApiOperation({ summary: '编辑闸机（名称/位置/IP/方向/所属景区/启用禁用/密钥）' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGateDto,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const result = await this.gateService.updateDevice(id, dto);
    const { secretKey: _omit, ...logged } = dto;
    await this.authService.writeLog(adminId, 'gate:update', 'gate_device', id, logged);
    return result;
  }

  @Delete('gates/:id')
  @Permissions('gate:delete')
  @ApiOperation({ summary: '删除闸机（只允许删还没跑过的，有记录会 409）' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    await this.gateService.removeDevice(id);
    await this.authService.writeLog(adminId, 'gate:delete', 'gate_device', id, null);
    return null;
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
