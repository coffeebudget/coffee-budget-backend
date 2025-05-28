import { ImportStatus } from '../entities/import-log.entity';

export class CreateImportLogDto {
  userId: number;
  status?: ImportStatus;
  source?: string;
  format?: string;
  fileName?: string;
  totalRecords?: number;
  processedRecords?: number;
  successfulRecords?: number;
  failedRecords?: number;
  summary?: string;
  logs?: string;
  metadata?: Record<string, any>;
  startTime?: Date;
  endTime?: Date;
} 