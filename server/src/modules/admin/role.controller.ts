import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RoleService } from './role.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(32) name: string;
  @IsString() @MinLength(2) @MaxLength(32) code: string;
  @IsOptional() @IsString() @MaxLength(128) remark?: string;
  @IsOptional() @IsArray() permissions?: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MaxLength(32) name?: string;
  @IsOptional() @IsString() @MaxLength(128) remark?: string;
  @IsOptional() @IsIn([1, 2]) status?: number;
}

class AssignPermissionsDto {
  @IsArray() @IsString({ each: true }) permissions: string[];
}

@ApiTags('后台-角色权限')
@Controller('admin/roles')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('role:read')
  @ApiOperation({ summary: '角色列表(含权限)' })
  list() {
    return this.roleService.list();
  }

  @Post()
  @Permissions('role:create')
  @ApiOperation({ summary: '创建角色' })
  async create(@Body() dto: CreateRoleDto, @Req() req: Express.Request) {
    const r = await this.roleService.create(dto);
    await this.authService.writeLog(this.adminId(req), 'role:create', 'role', r.id, dto);
    return r;
  }

  @Put(':id')
  @Permissions('role:update')
  @ApiOperation({ summary: '修改角色' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto, @Req() req: Express.Request) {
    const r = await this.roleService.update(id, dto);
    await this.authService.writeLog(this.adminId(req), 'role:update', 'role', id, dto);
    return r;
  }

  @Put(':id/permissions')
  @Permissions('role:assign')
  @ApiOperation({ summary: '分配角色权限' })
  async assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPermissionsDto, @Req() req: Express.Request) {
    const r = await this.roleService.assignPermissions(id, dto.permissions);
    await this.authService.writeLog(this.adminId(req), 'role:assign', 'role', id, dto);
    return r;
  }

  @Delete(':id')
  @Permissions('role:delete')
  @ApiOperation({ summary: '删除角色' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    const r = await this.roleService.remove(id);
    await this.authService.writeLog(this.adminId(req), 'role:delete', 'role', id, null);
    return r;
  }

  private adminId(req: Express.Request): number {
    return (req as Express.Request & { admin: { id: number } }).admin.id;
  }
}
