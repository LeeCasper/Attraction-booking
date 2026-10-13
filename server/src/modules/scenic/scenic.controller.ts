import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
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
  /**
   * 封面图。存的是**上传接口返回的相对路径**（`/uploads/xxx.jpg`），不是完整 URL ——
   * 同一张图在后台（`http://xxx:3000/api`）和小程序（局域网 IP）下的前缀不同，
   * 存相对路径、由各自的客户端拼自己的服务端前缀。
   */
  // ⚠️ 显式允许 `null`：**清空**要传 null 而不是「不传」——
  // `repo.update(id, body)` 会忽略 undefined 的字段，不传等于保持原值（「清除」按钮会变成没反应）。
  @IsOptional() @IsString() @MaxLength(255) coverUrl?: string | null;
  /**
   * 购票页头卡缩略图（建议方图）；不传 = 回落到封面。
   * 首页轮播图**不在这里** —— 它是独立的一组（`banner` 表，后台「首页轮播图」页面维护）。
   */
  @IsOptional() @IsString() @MaxLength(255) thumbnailUrl?: string | null;
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

class CreateBannerDto {
  /** 图片（相对路径）；必填 —— 一张没有图的轮播没有意义 */
  @IsString() @MinLength(1) @MaxLength(255) imageUrl: string;
  /** 标题：**没有跳转景点时**显示在图上（有跳转时显示的是景点名） */
  @IsOptional() @IsString() @MaxLength(64) title?: string;
  @IsOptional() @IsString() @MaxLength(64) subtitle?: string;
  /** 跳转景点；不传/null = 不跳转，只展示图（那屏不可点） */
  @IsOptional() @IsInt() @Min(1) scenicAreaId?: number | null;
  /** 排序：小的在前 */
  @IsOptional() @IsInt() @Min(0) @Max(9999) sort?: number;
  /** 1 启用 / 2 停用 */
  @IsOptional() @IsIn([1, 2]) status?: number;
}

/**
 * 公告 DTO。
 *
 * ⚠️ 全局 `ValidationPipe({ whitelist: true })` 会**剥掉没声明装饰器的字段** ——
 * 下面每个字段都必须显式写出来，少写一个就是「PUT 回 200 但那个字段没存进去」（本项目栽过）。
 *
 * ⚠️ 清空型字段（`scenicAreaId` 改成全平台、`imageUrl` / `startAt` / `endAt` 清空）**要传 `null`**：
 * `repo.update` 忽略 `undefined`，省略等于保持原值。`@IsOptional()` 对 `null` 是放行的。
 */
class CreateAnnouncementDto {
  /** 归属景点；`null` = 全平台投放（任何景点的小程序都能看到） */
  @IsOptional() @IsInt() scenicAreaId?: number | null;
  /** 1 提示公告（首页顶部一行，多条轮播）/ 2 弹窗公告（进首页弹一次） */
  @IsIn([1, 2]) type: number;
  @IsString() @MinLength(2) @MaxLength(128) title: string;
  @IsOptional() @IsString() content?: string | null;
  /** 弹窗配图（相对路径）；仅弹窗公告用 */
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string | null;
  /** 0 不跳转 / 1 购票页 / 2 订单列表 / 3 电子凭证 / 4 景区地图 */
  @IsOptional() @IsInt() @IsIn([0, 1, 2, 3, 4]) linkType?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sort?: number;
  /**
   * 生效区间。`@IsDateString()`（= IsISO8601）收 `YYYY-MM-DD HH:mm:ss`（后台日期选择器的 value-format）
   * 与 ISO 两种写法；NULL/省略 = 不限。⚠️ 服务端**原样入库**，不要 `new Date()` 再存 ——
   * 那会按服务器时区平移一次（绝对时间点就该让 DB 按自己的时区解释）。
   */
  @IsOptional() @IsDateString() startAt?: string | null;
  @IsOptional() @IsDateString() endAt?: string | null;
}

/** 修改：**全部字段可选**（上下架只传 status、清字段只传那个 null） */
class UpdateAnnouncementDto {
  @IsOptional() @IsInt() scenicAreaId?: number | null;
  @IsOptional() @IsIn([1, 2]) type?: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(128) title?: string;
  @IsOptional() @IsString() content?: string | null;
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string | null;
  @IsOptional() @IsInt() @IsIn([0, 1, 2, 3, 4]) linkType?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sort?: number;
  @IsOptional() @IsDateString() startAt?: string | null;
  @IsOptional() @IsDateString() endAt?: string | null;
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

  // ---------------------------------------------------------------- 首页轮播图
  //
  // 与景点**解耦**：后台单独维护一组（增删/排序/启停），每张可选跳转到某个景点。
  // 之所以不放在景区表单里：轮播是一组图、还有顺序与启停，而景区是实体 ——
  // 而且「哪个景点上首页」是运营每周都会调的事，不该去改景区档案。

  @Get('banners')
  @Permissions('scenic:read')
  @ApiOperation({ summary: '首页轮播图列表（含停用）' })
  listBanners() {
    return this.scenicService.listBanners();
  }

  @Post('banners')
  @Permissions('scenic:create')
  @ApiOperation({ summary: '新增轮播图' })
  async createBanner(@Body() dto: CreateBannerDto, @Req() req: Express.Request) {
    const r = await this.scenicService.createBanner(dto);
    await this.authService.writeLog(this.adminId(req), 'banner:create', 'banner', r.id, dto);
    return r;
  }

  @Put('banners/:id')
  @Permissions('scenic:update')
  @ApiOperation({ summary: '修改/启停轮播图' })
  async updateBanner(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateBannerDto, @Req() req: Express.Request) {
    const r = await this.scenicService.updateBanner(id, dto);
    await this.authService.writeLog(this.adminId(req), 'banner:update', 'banner', id, dto);
    return r;
  }

  @Delete('banners/:id')
  @Permissions('scenic:delete')
  @ApiOperation({ summary: '删除轮播图' })
  async removeBanner(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    const r = await this.scenicService.removeBanner(id);
    await this.authService.writeLog(this.adminId(req), 'banner:delete', 'banner', id, null);
    return r;
  }

  // ---------------------------------------------------------------- 公告
  // 扁平路由（不再按景区分）：公告可以**不挂景点**（全平台投放），塞在 `areas/:id/...` 下表达不了。
  // `scope` 三态：all（默认）/ platform（只看全平台）/ scenic（要配 scenicAreaId）。

  @Get('announcements')
  @Permissions('scenic:read')
  @ApiOperation({ summary: '公告列表（扁平，可按范围/类型/状态筛）' })
  listAnnouncements(
    @Query('scope') scope?: string,
    @Query('scenicAreaId', new ParseIntPipe({ optional: true })) scenicAreaId?: number,
    @Query('type', new ParseIntPipe({ optional: true })) type?: number,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
  ) {
    return this.scenicService.listAnnouncements({ scope, scenicAreaId, type, status });
  }

  @Post('announcements')
  @Permissions('scenic:create')
  @ApiOperation({ summary: '发布公告' })
  async createAnnouncement(@Body() dto: CreateAnnouncementDto, @Req() req: Express.Request) {
    const r = await this.scenicService.createAnnouncement(dto);
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
