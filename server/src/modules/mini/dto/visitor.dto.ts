import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { IsIdCard } from '../../../common/utils/idcard.util';

/**
 * 手机号：**空字符串表示「清空」**，其它必须是 11 位大陆号。
 * 允许空串是为了支持「编辑时把手机号删掉」——只传 undefined 的话没法表达清空。
 */
const PHONE_PATTERN = /^$|^1[3-9]\d{9}$/;

export class CreateVisitorDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @Length(2, 32)
  name: string;

  @ApiProperty({ example: '110101199003078515', description: '真实身份证号，校验位必须通过' })
  @IsIdCard()
  idCard: string;

  @ApiPropertyOptional({ example: '13800000000' })
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional({ description: '设为默认出行人（会把该用户其它出行人的默认标记清掉）' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateVisitorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 32)
  name?: string;

  @ApiPropertyOptional({ description: '改证件号会重新做校验位验真与唯一性检查' })
  @IsOptional()
  @IsIdCard()
  idCard?: string;

  @ApiPropertyOptional({ description: '传空字符串表示清空手机号' })
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
