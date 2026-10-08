import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class VisitorDto {
  @IsString() @MinLength(2) @MaxLength(32) name: string;

  /** 身份证号（服务端加密存储，仅用于哈希比对） */
  @IsString() @Matches(/^\d{17}[\dXx]$/, { message: '身份证号格式不正确' }) idCard: string;

  @IsOptional() @IsString() @Matches(/^1\d{10}$/, { message: '手机号格式不正确' }) phone?: string;
}

export class CreateOrderDto {
  @IsInt() ticketTypeId: number;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式需为 yyyy-MM-dd' }) date: string;

  @IsInt() timeSlotId: number;

  @IsArray()
  @ArrayMinSize(1, { message: '请至少添加一位游客' })
  @ArrayMaxSize(10, { message: '单笔最多 10 位游客' })
  @ValidateNested({ each: true })
  @Type(() => VisitorDto)
  visitors: VisitorDto[];
}
