import { ImportStatus } from '../entities/import-log.entity';

export class UpdateImportLogDto {
  status?: ImportStatus;
  totalRecords?: number;
  processedRecords?: number;
  successfulRecords?: number;
  failedRecords?: number;
  summary?: string;
  logs?: string;
  metadata?: Record<string, any>;
  endTime?: Date;
}
