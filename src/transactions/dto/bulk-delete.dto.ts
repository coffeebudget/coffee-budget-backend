import { IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteDto {
  @ApiProperty({
    description: 'Array of transaction IDs to delete',
    example: [1, 2, 3, 4],
  })
  @IsArray()
  @IsNotEmpty()
  transaction_ids: number[];
}
