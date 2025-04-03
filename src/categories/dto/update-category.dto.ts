import { IsString, IsOptional, IsArray } from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ description: 'Name of the category', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Keywords of the category', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}