import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ description: 'Auth0 User ID', required: false })
  @IsString()
  @IsOptional()
  auth0Id?: string;

  @ApiProperty({ description: 'Email of the user', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;
} 