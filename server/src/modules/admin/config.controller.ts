import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsObject, IsString, IsDefined } from 'class-validator';
import { Repository } from 'typeorm';
import { SysConfig } from '../../database/entities/system.entity';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class UpdateConfigDto {
  @IsDefined() @IsObject() configValue: Record<string, unknown>;
}

@ApiTags('后台-参数配置')
@Controller('admin/configs')
export class ConfigController {
  constructor(
    @InjectRepository(SysConfig) private readonly repo: Repository<SysConfig>,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('config:read')
  @ApiOperation({ summary: '参数配置列表' })
  async list() {
    return this.repo.find({ order: { configKey: 'ASC' } });
  }

  @Put(':key')
  @Permissions('config:update')
  @ApiOperation({ summary: '更新参数配置(预约规则/预警阈值等)' })
  async update(@Param('key') key: string, @Body() dto: UpdateConfigDto, @Req() req: Express.Request) {
    const existing = await this.repo.findOne({ where: { configKey: key } });
    if (existing) {
      existing.configValue = dto.configValue;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ configKey: key, configValue: dto.configValue }));
    }
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    await this.authService.writeLog(adminId, 'config:update', 'sys_config', null, { key, value: dto.configValue });
    return null;
  }
}
