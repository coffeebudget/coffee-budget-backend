import { PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateExpensePlanDto } from './create-expense-plan.dto';
import { ExpensePlanStatus } from '../entities/expense-plan.entity';

export class UpdateExpensePlanDto extends PartialType(CreateExpensePlanDto) {
  @ApiPropertyOptional({
    description: 'Status of the expense plan',
    enum: ['active', 'paused', 'completed'],
  })
  @IsOptional()
  @IsEnum(['active', 'paused', 'completed'])
  status?: ExpensePlanStatus;
}
