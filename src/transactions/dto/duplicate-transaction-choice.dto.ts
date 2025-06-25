import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DuplicateTransactionChoice {
  MAINTAIN_BOTH = 'maintain both',
  KEEP_EXISTING = 'keep existing',
  USE_NEW = 'use new',
}

export class DuplicateTransactionChoiceDto {
  @ApiProperty({
    enum: DuplicateTransactionChoice,
    description: 'User choice for handling duplicate transaction',
  })
  @IsEnum(DuplicateTransactionChoice)
  choice: DuplicateTransactionChoice;
}
