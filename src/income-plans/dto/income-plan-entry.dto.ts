import { IsNumber, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

// ═══════════════════════════════════════════════════════════════════════════
// CREATE DTO
// ═══════════════════════════════════════════════════════════════════════════

export class CreateIncomePlanEntryDto {
  @IsInt()
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(0)
  actualAmount: number;

  @IsOptional()
  @IsInt()
  transactionId?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE DTO
// ═══════════════════════════════════════════════════════════════════════════

export class UpdateIncomePlanEntryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualAmount?: number;

  @IsOptional()
  @IsInt()
  transactionId?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINK TRANSACTION DTO
// ═══════════════════════════════════════════════════════════════════════════

export class LinkTransactionToIncomePlanDto {
  @IsInt()
  transactionId: number;

  @IsInt()
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsString()
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE DTOs
// ═══════════════════════════════════════════════════════════════════════════

export type IncomePlanEntryStatus =
  | 'pending'
  | 'partial'
  | 'received'
  | 'exceeded';

export class IncomePlanEntryResponseDto {
  id: number;
  incomePlanId: number;
  year: number;
  month: number;
  actualAmount: number;
  expectedAmount: number;
  transactionId: number | null;
  note: string | null;
  isAutomatic: boolean;
  createdAt: Date;

  // Computed fields
  status: IncomePlanEntryStatus;
  difference: number;
  percentageReceived: number;
}

export class IncomePlanTrackingSummaryDto {
  incomePlanId: number;
  incomePlanName: string;
  incomePlanIcon: string | null;
  reliability: string;

  year: number;
  month: number;

  expectedAmount: number;
  actualAmount: number;
  status: IncomePlanEntryStatus;
  difference: number;
  percentageReceived: number;

  hasEntry: boolean;
  entryId: number | null;
  transactionId: number | null;
}

export class MonthlyTrackingSummaryDto {
  year: number;
  month: number;

  // Totals
  totalExpected: number;
  totalReceived: number;
  totalDifference: number;
  overallPercentage: number;

  // Counts by status
  pendingCount: number;
  partialCount: number;
  receivedCount: number;
  exceededCount: number;

  // Per-plan breakdown
  plans: IncomePlanTrackingSummaryDto[];
}

export class AnnualTrackingSummaryDto {
  year: number;

  // Annual totals
  totalExpected: number;
  totalReceived: number;
  totalDifference: number;
  overallPercentage: number;

  // Monthly breakdown
  months: MonthlyTrackingSummaryDto[];
}
