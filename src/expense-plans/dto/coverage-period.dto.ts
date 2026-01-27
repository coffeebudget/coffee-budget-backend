import { ApiProperty } from '@nestjs/swagger';

/**
 * Available coverage period types for filtering expense plan obligations.
 */
export type CoveragePeriodType =
  | 'this_month'
  | 'next_month'
  | 'next_3_months'
  | 'next_30_days'
  | 'next_60_days'
  | 'next_90_days';

/**
 * Valid period type values for validation
 */
export const VALID_COVERAGE_PERIODS: CoveragePeriodType[] = [
  'this_month',
  'next_month',
  'next_3_months',
  'next_30_days',
  'next_60_days',
  'next_90_days',
];

/**
 * Represents a date range with a human-readable label.
 */
export class PeriodRange {
  @ApiProperty({
    description: 'Period start date',
    example: '2026-01-01',
  })
  start: string;

  @ApiProperty({
    description: 'Period end date',
    example: '2026-01-31',
  })
  end: string;

  @ApiProperty({
    description: 'Human-readable label for the period',
    example: 'January 2026',
  })
  label: string;
}

/**
 * Helper function to calculate period range from period type.
 */
export function getPeriodRange(periodType: CoveragePeriodType): PeriodRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start: Date;
  let end: Date;
  let label: string;

  switch (periodType) {
    case 'this_month': {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      label = formatMonthLabel(start);
      break;
    }
    case 'next_month': {
      start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      label = formatMonthLabel(start);
      break;
    }
    case 'next_3_months': {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 3, 0);
      const endMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
      label = `${formatMonthLabel(start)} - ${formatMonthLabel(endMonth)}`;
      break;
    }
    case 'next_30_days': {
      start = new Date(today);
      end = new Date(today);
      end.setDate(end.getDate() + 30);
      label = 'Next 30 days';
      break;
    }
    case 'next_60_days': {
      start = new Date(today);
      end = new Date(today);
      end.setDate(end.getDate() + 60);
      label = 'Next 60 days';
      break;
    }
    case 'next_90_days': {
      start = new Date(today);
      end = new Date(today);
      end.setDate(end.getDate() + 90);
      label = 'Next 90 days';
      break;
    }
    default: {
      // Default to next 30 days
      start = new Date(today);
      end = new Date(today);
      end.setDate(end.getDate() + 30);
      label = 'Next 30 days';
    }
  }

  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
    label,
  };
}

/**
 * Format date as ISO date string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format month label (e.g., "January 2026")
 */
function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
