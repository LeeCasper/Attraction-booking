import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ScenicService } from './scenic.service';
import { ScenicDefaultsService } from '../ticket/scenic-defaults.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AREA_CATEGORIES, DEFAULT_SLOT_STOCK, DEFAULT_STOCK_DAYS } from '../../common/constants/scenic-defaults';

class CreateAreaDto {
  @IsString() @MinLength(2) @MaxLength(128) name: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() @MaxLength(64) openTime?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) maxCapacity?: number;
  /** 景点分类，决定小程序「景点选择」页归到哪个 tab；不传 = 未分类（只在「全部景点」出现） */
  @IsOptional() @IsIn(AREA_CATEGORIES as unknown as string[]) @IsString() category?: string;
  /** 1 开放 / 2 关闭（ValidationPipe 开启 whitelist，未声明字段会被剥离） */
  @IsOptional() @IsIn([1, 2]) status?: number;
}

/**
 * 新建景区用。**必须单独一个类**，不能把这些字段加进 `CreateAreaDto`：
 * `PUT areas/:id` 复用 `CreateAreaDto`，加进去等于让「编辑景区」也能触发生成。
 */
class CreateAreaWithDefaultsDto extends CreateAreaDto {
  /** 一键生成默认时段/票种，并为其生成未来若干天的分时库存 */
  @IsOptional() @IsBoolean() generateDefaults?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(30) defaultStockDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) defaultSlotStock?: number;
}

/** 给已存在的（裸）景区补默认配置 */
class GenerateAreaDefaultsDto {
  @IsOptional() @IsInt() @Min(1) @Max(30) defaultStockDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) defaultSlotStock?: number;
}

class CreateAnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(128) title: string;
  @IsOptional() @IsString() content?: string;
}

class UpdateAnnouncementDto extends CreateAnnouncementDto {
  @IsOptional() @IsIn([1, 2]) status?: number;
}

@ApiTags('后台-景区管理')
@Controller('admin/scenic')
export class ScenicController {
  constructor(
    private readonly scenicService: ScenicService,
    private readonly defaultsService: ScenicDefaultsService,
    private readonly authService: AuthService,
  ) {}

  @Get('areas')
  @Permissions('scenic:read')
  @ApiOperation({ summary: '景区列表' })
  listAreas() {
    return this.scenicService.listAreas();
  }

  @Post('areas')
  @Permissions('scenic:create')
  @ApiOperation({ summary: '创建景区（可选一键生成默认时段/票种/库存）' })
  async createArea(@Body() dto: CreateAreaWithDefaultsDto, @Req() req: Express.Request) {
    const r = await this.scenicService.createArea(dto);
    const id = Number(r.id);

    // 景区先建出来（独立一步，不参与下面的事务）；默认配置失败也不回滚景区
    let defaults: Awaited<ReturnType<ScenicDefaultsService['generateFor']>> | undefined;
    if (dto.generateDefaults) {
      defaults = await this.defaultsService.generateFor(id, {
        days: dto.defaultStockDays ?? DEFAULT_STOCK_DAYS,
        slotStock: dto.defaultSlotStock ?? DEFAULT_SLOT_STOCK,
        operatorId: this.adminId(req),
      });
    }

    await this.authService.writeLog(this.adminId(req), 'scenic:create', 'scenic_area', id, { ...dto, defaults });
    return { id, defaults };
  }

  @Post('areas/:id/defaults')
  @Permissions('scenic:update')
  @ApiOperation({ summary: '为已有景区补默认时段/票种/库存（幂等，可重复调用）' })
  async generateDefaults(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateAreaDefaultsDto,
    @Req() req: Express.Request,
  ) {
    await this.scenicService.getArea(id);
    const r = await this.defaultsService.generateFor(id, {
      days: dto.defaultStockDays ?? DEFAULT_STOCK_DAYS,
      slotStock: dto.defaultSlotStock ?? DEFAULT_SLOT_STOCK,
      operatorId: this.adminId(req),
    });
    await this.authService.writeLog(this.adminId(req), 'scenic:defaults', 'scenic_area', id, r);
    return r;
  }

  @Put('areas/:id')
  @Permissions('scenic:update')
  @ApiOperation({ summary: '修改景区(含最大承载量-预警基准)' })
  async updateArea(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAreaDto, @Req() req: Express.Request) {
    const r = await this.scenicService.updateArea(id, dto);
    await this.authService.writeLog(this.adminId(req), 'scenic:update', 'scenic_area', id, dto);
    return r;
  }

  @Delete('areas/:id')
  @Permissions('scenic:delete')
  @ApiOperation({ summary: '删除景区' })
  async removeArea(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    const r = await this.scenicService.removeArea(id);
    await this.authService.writeLog(this.adminId(req), 'scenic:delete', 'scenic_area', id, null);
    return r;
  }

  @Get('areas/:id/announcements')
  @Permissions('scenic:read')
  @ApiOperation({ summary: '公告列表' })
  listAnnouncements(@Param('id', ParseIntPipe) areaId: number, @Query('status') status?: number) {
    return this.scenicService.listAnnouncements(areaId, status);
  }

  @Post('areas/:id/announcements')
  @Permissions('scenic:create')
  @ApiOperation({ summary: '发布公告' })
  async createAnnouncement(@Param('id', ParseIntPipe) areaId: number, @Body() dto: CreateAnnouncementDto, @Req() req: Express.Request) {
    const r = await this.scenicService.createAnnouncement(areaId, dto);
    await this.authService.writeLog(this.adminId(req), 'announcement:create', 'announcement', r.id, dto);
    return r;
  }

  @Put('announcements/:id')
  @Permissions('scenic:update')
  @ApiOperation({ summary: '修改/上下架公告' })
  async updateAnnouncement(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAnnouncementDto, @Req() req: Express.Request) {
    const r = await this.scenicService.updateAnnouncement(id, dto);
    await this.authService.writeLog(this.adminId(req), 'announcement:update', 'announcement', id, dto);
    return r;
  }

  @Delete('announcements/:id')
  @Permissions('scenic:delete')
  @ApiOperation({ summary: '删除公告' })
  async removeAnnouncement(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    const r = await this.scenicService.removeAnnouncement(id);
    await this.authService.writeLog(this.adminId(req), 'announcement:delete', 'announcement', id, null);
    return r;
  }

  private adminId(req: Express.Request): number {
    return (req as Express.Request & { admin: { id: number } }).admin.id;
  }
}
