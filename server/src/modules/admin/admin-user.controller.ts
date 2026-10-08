import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsPhoneNumber, MaxLength, MinLength } from 'class-validator';
import { AdminUserService } from './admin-user.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CreateAdminDto {
  @IsString() @MinLength(2) @MaxLength(32) username: string;
  @IsString() @MinLength(6) @MaxLength(64) password: string;
  @IsOptional() @IsString() @MaxLength(32) realName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() roleIds?: number[];
}

class UpdateAdminDto {
  @IsOptional() @IsString() @MaxLength(32) realName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn([1, 2]) status?: number;
  @IsOptional() @IsArray() roleIds?: number[];
}

class ResetPasswordDto {
  @IsString() @MinLength(6) @MaxLength(64) newPassword: string;
}

@ApiTags('后台-管理员')
@Controller('admin/admin-users')
export class AdminUserController {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('admin:read')
  @ApiOperation({ summary: '管理员列表' })
  list(@Query() page: PaginationDto, @Query('keyword') keyword?: string) {
    return this.adminUserService.list(page.page, page.pageSize, keyword);
  }

  @Post()
  @Permissions('admin:create')
  @ApiOperation({ summary: '创建管理员' })
  async create(@Body() dto: CreateAdminDto, @Req() req: Express.Request) {
    const r = await this.adminUserService.create(dto);
    await this.authService.writeLog(this.adminId(req), 'admin:create', 'admin_user', r.id, { username: dto.username, roleIds: dto.roleIds });
    return r;
  }

  @Put(':id')
  @Permissions('admin:update')
  @ApiOperation({ summary: '修改管理员(含角色分配/禁用)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminDto, @Req() req: Express.Request) {
    await this.adminUserService.update(id, dto);
    await this.authService.writeLog(this.adminId(req), 'admin:update', 'admin_user', id, dto);
    return null;
  }

  @Put(':id/password')
  @Permissions('admin:reset_password')
  @ApiOperation({ summary: '重置管理员密码' })
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @Req() req: Express.Request) {
    await this.adminUserService.resetPassword(id, dto.newPassword);
    await this.authService.writeLog(this.adminId(req), 'admin:reset_password', 'admin_user', id, null);
    return null;
  }

  @Delete(':id')
  @Permissions('admin:delete')
  @ApiOperation({ summary: '删除管理员' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    await this.adminUserService.remove(id);
    await this.authService.writeLog(this.adminId(req), 'admin:delete', 'admin_user', id, null);
    return null;
  }

  private adminId(req: Express.Request): number {
    return (req as Express.Request & { admin: { id: number } }).admin.id;
  }
}
