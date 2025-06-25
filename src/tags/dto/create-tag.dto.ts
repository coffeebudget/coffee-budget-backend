import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: 'Name of the tag' })
  @IsString()
  @IsNotEmpty()
  name: string; // Ensure this property exists
}
