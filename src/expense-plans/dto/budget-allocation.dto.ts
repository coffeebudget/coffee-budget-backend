import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────
// REQUEST DTOs
// ─────────────────────────────────────────────────────────────

export class AllocationItemDto {
  @ApiProperty({ description: 'Expense plan ID' })
  @IsNumber()
  planId: number;

  @ApiProperty({ description: 'Amount to allocate this month' })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class SaveAllocationsDto {
  @ApiProperty({
    description: 'Array of allocation items',
    type: [AllocationItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations: AllocationItemDto[];
}

export class SetIncomeOverrideDto {
  @ApiPropertyOptional({
    description: 'Manual income override amount (null to clear)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @ApiPropertyOptional({ description: 'Notes for this month' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// RESPONSE DTOs
// ─────────────────────────────────────────────────────────────

export class PlanAllocationDto {
  @ApiProperty()
  planId: number;

  @ApiProperty()
  planName: string;

  @ApiProperty()
  icon: string | null;

  @ApiProperty()
  purpose: 'sinking_fund' | 'spending_budget';

  @ApiProperty()
  suggestedAmount: number;

  @ApiProperty()
  allocatedAmount: number;

  @ApiProperty({ description: 'For spending budgets: amount spent this month' })
  spentThisMonth: number;

  @ApiPropertyOptional({ description: 'Payment account ID if assigned' })
  paymentAccountId: number | null;

  @ApiPropertyOptional({ description: 'Payment account name if assigned' })
  paymentAccountName: string | null;
}

export class IncomeBreakdownDto {
  @ApiProperty({ description: 'Auto-detected income from transactions' })
  autoDetectedIncome: number;

  @ApiProperty({ description: 'Manual income override if set' })
  manualIncomeOverride: number | null;

  @ApiProperty({ description: 'Effective income to use' })
  effectiveIncome: number;

  @ApiProperty({
    description: 'Income transactions detected this month',
    type: 'array',
  })
  incomeTransactions: {
    id: number;
    description: string;
    amount: number;
    date: string;
  }[];
}

export class AllocationStateDto {
  @ApiProperty({ description: 'Month in format YYYY-MM', example: '2026-01' })
  month: string;

  @ApiProperty({ description: 'Income breakdown for this month' })
  income: IncomeBreakdownDto;

  @ApiProperty({ description: 'Total amount allocated to plans' })
  totalAllocated: number;

  @ApiProperty({ description: 'Remaining unallocated (effectiveIncome - totalAllocated)' })
  unallocated: number;

  @ApiProperty({ description: 'Whether allocation is complete (unallocated = 0)' })
  isComplete: boolean;

  @ApiProperty({
    description: 'Allocation status color',
    enum: ['green', 'yellow', 'red'],
  })
  statusColor: 'green' | 'yellow' | 'red';

  @ApiProperty({
    description: 'All expense plans with their allocations',
    type: [PlanAllocationDto],
  })
  plans: PlanAllocationDto[];

  @ApiPropertyOptional({ description: 'Notes for this month' })
  notes: string | null;
}

export class AutoAllocateResultDto {
  @ApiProperty({ description: 'Number of plans auto-allocated' })
  plansAllocated: number;

  @ApiProperty({ description: 'Total amount allocated' })
  totalAllocated: number;

  @ApiProperty({ description: 'Remaining unallocated' })
  remaining: number;

  @ApiProperty({
    description: 'Allocations made',
    type: [AllocationItemDto],
  })
  allocations: AllocationItemDto[];
}

export class SaveAllocationsResultDto {
  @ApiProperty({ description: 'Whether save was successful' })
  success: boolean;

  @ApiProperty({ description: 'Updated allocation state' })
  state: AllocationStateDto;

  @ApiProperty({ description: 'Number of plans updated' })
  plansUpdated: number;
}
