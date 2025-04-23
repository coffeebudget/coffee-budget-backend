import { IsArray, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCategorizeDto {
  @ApiProperty({
    description: 'Array of transaction IDs to categorize',
    example: [1, 2, 3, 4]
  })
  @IsArray()
  @IsNotEmpty()
  transaction_ids: number[];

  @ApiProperty({
    description: 'Category ID to assign to transactions',
    example: 1
  })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
} 