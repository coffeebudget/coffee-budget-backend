import { IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkTagDto {
  @ApiProperty({
    description: 'Array of transaction IDs to tag',
    example: [1, 2, 3, 4],
  })
  @IsArray()
  @IsNotEmpty()
  transaction_ids: number[];

  @ApiProperty({
    description: 'Array of tag IDs to apply to transactions',
    example: [1, 2],
  })
  @IsArray()
  @IsNotEmpty()
  tag_ids: number[];
}
