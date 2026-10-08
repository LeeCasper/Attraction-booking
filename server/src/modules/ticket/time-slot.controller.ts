import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeSlot } from '../../database/entities/ticket.entity';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class CreateSlotDto {
  @IsInt() scenicAreaId: number;
  @IsString() @MaxLength(32) name: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start_time 需为 HH:mm' })
  startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end_time 需为 HH:mm' })
  endTime: string;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

class UpdateSlotDto {
  @IsOptional() @IsString() @MaxLength(32) name?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsIn([1, 2]) status?: number;
}

@ApiTags('后台-票种与时段')
@Controller('admin/time-slots')
export class TimeSlotController {
  constructor(
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('ticket:read')
  @ApiOperation({ summary: '时段列表' })
  list(@Query('areaId', ParseIntPipe) areaId: number) {
    return this.slotRepo.find({ where: { scenicAreaId: areaId }, order: { sortOrder: 'ASC' } });
  }

  @Post()
  @Permissions('ticket:create')
  @ApiOperation({ summary: '创建时段(分时预约基础)' })
  async create(@Body() dto: CreateSlotDto, @Req() req: Express.Request) {
    if (dto.startTime >= dto.endTime) throw new BadRequestException('开始时间需早于结束时间');
    const slot = await this.slotRepo.save(this.slotRepo.create(dto));
    await this.authService.writeLog(this.adminId(req), 'slot:create', 'time_slot', Number(slot.id), dto);
    return { id: Number(slot.id) };
  }

  @Put(':id')
  @Permissions('ticket:update')
  @ApiOperation({ summary: '修改时段' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSlotDto, @Req() req: Express.Request) {
    await this.slotRepo.update(id, dto);
    await this.authService.writeLog(this.adminId(req), 'slot:update', 'time_slot', id, dto);
    return null;
  }

  @Delete(':id')
  @Permissions('ticket:delete')
  @ApiOperation({ summary: '删除时段(需先清理关联库存)' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    await this.slotRepo.delete(id);
    await this.authService.writeLog(this.adminId(req), 'slot:delete', 'time_slot', id, null);
    return null;
  }

  private adminId(req: Express.Request): number {
    return (req as Express.Request & { admin: { id: number } }).admin.id;
  }
}
