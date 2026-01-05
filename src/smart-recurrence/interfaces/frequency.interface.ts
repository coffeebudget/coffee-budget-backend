export enum FrequencyType {
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMIANNUAL = 'semiannual',
  ANNUAL = 'annual',
}

export interface FrequencyPattern {
  type: FrequencyType;
  intervalDays: number;
  confidence: number; // 0-100
  nextExpectedDate: Date;
  occurrenceCount: number;
}
