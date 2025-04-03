import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DuplicateTransactionChoice {
  MERGE = 'merge',
  IGNORE = 'ignore',
  REPLACE = 'replace',
  MAINTAIN_BOTH = 'maintain both'
}

export class DuplicateTransactionChoiceDto {
  @ApiProperty({
    enum: DuplicateTransactionChoice,
    description: 'User choice for handling duplicate transaction'
  })
  @IsEnum(DuplicateTransactionChoice)
  choice: DuplicateTransactionChoice;
} 