import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ScenicService } from './scenic.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class CreateAreaDto {
  @IsString() @MinLength(2) @MaxLength(128) name: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() @MaxLength(64) openTime?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) maxCapacity?: number;
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
  @ApiOperation({ summary: '创建景区' })
  async createArea(@Body() dto: CreateAreaDto, @Req() req: Express.Request) {
    const r = await this.scenicService.createArea(dto);
    await this.authService.writeLog(this.adminId(req), 'scenic:create', 'scenic_area', Number(r.id), dto);
    return { id: Number(r.id) };
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
