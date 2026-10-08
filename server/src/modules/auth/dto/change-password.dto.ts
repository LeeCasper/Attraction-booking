import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LoginDto } from './login.dto';

export class ChangePasswordDto extends LoginDto {
  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword: string;
}
