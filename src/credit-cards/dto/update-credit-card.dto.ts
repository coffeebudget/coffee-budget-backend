import { PartialType } from '@nestjs/swagger';
import { CreateCreditCardDto } from './create-credit-card.dto';
import { IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCreditCardDto extends PartialType(CreateCreditCardDto) {
  @ApiProperty({
    description: 'ID of the associated bank account',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  bankAccountId?: number;
}
