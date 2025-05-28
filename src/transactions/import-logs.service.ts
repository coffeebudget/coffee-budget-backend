import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportLog, ImportStatus } from './entities/import-log.entity';
import { CreateImportLogDto } from './dto/create-import-log.dto';
import { UpdateImportLogDto } from './dto/update-import-log.dto';
import { User } from '../users/user.entity';

@Injectable()
export class ImportLogsService {
  private readonly logger = new Logger(ImportLogsService.name);

  constructor(
    @InjectRepository(ImportLog)
    private importLogRepository: Repository<ImportLog>,
  ) {}

  async create(createImportLogDto: CreateImportLogDto): Promise<ImportLog> {
    const importLog = this.importLogRepository.create({
      user: { id: createImportLogDto.userId } as User,
      status: createImportLogDto.status || ImportStatus.PENDING,
      source: createImportLogDto.source,
      format: createImportLogDto.format,
      fileName: createImportLogDto.fileName,
      totalRecords: createImportLogDto.totalRecords || 0,
      processedRecords: createImportLogDto.processedRecords || 0,
      successfulRecords: createImportLogDto.successfulRecords || 0,
      failedRecords: createImportLogDto.failedRecords || 0,
      summary: createImportLogDto.summary,
      logs: createImportLogDto.logs,
      metadata: createImportLogDto.metadata,
      startTime: createImportLogDto.startTime || new Date(),
      endTime: createImportLogDto.endTime,
    });

    return this.importLogRepository.save(importLog);
  }

  async update(id: number, updateImportLogDto: UpdateImportLogDto): Promise<ImportLog | null> {
    await this.importLogRepository.update(id, updateImportLogDto);
    return this.importLogRepository.findOne({ where: { id } });
  }

  async findAll(userId: number): Promise<ImportLog[]> {
    return this.importLogRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, userId: number): Promise<ImportLog | null> {
    return this.importLogRepository.findOne({
      where: { id, user: { id: userId } },
    });
  }

  async appendToLog(id: number, logEntry: string): Promise<void> {
    const importLog = await this.importLogRepository.findOne({ where: { id } });
    if (!importLog) {
      this.logger.warn(`Attempted to append log to non-existent import log with ID ${id}`);
      return;
    }
    
    const timestamp = new Date().toISOString();
    const formattedLogEntry = `[${timestamp}] ${logEntry}\n`;
    
    importLog.logs = importLog.logs 
      ? importLog.logs + formattedLogEntry 
      : formattedLogEntry;
    
    await this.importLogRepository.save(importLog);
  }

  async updateStatus(id: number, status: ImportStatus, summary?: string): Promise<void> {
    const importLog = await this.importLogRepository.findOne({ where: { id } });
    if (!importLog) {
      this.logger.warn(`Attempted to update status of non-existent import log with ID ${id}`);
      return;
    }

    importLog.status = status;
    
    if (summary) {
      importLog.summary = summary;
    }

    if (status === ImportStatus.COMPLETED || status === ImportStatus.FAILED || status === ImportStatus.PARTIALLY_COMPLETED) {
      importLog.endTime = new Date();
    }

    await this.importLogRepository.save(importLog);
  }

  async incrementCounters(
    id: number, 
    { processed = 0, successful = 0, failed = 0 }: { processed?: number; successful?: number; failed?: number }
  ): Promise<void> {
    const importLog = await this.importLogRepository.findOne({ where: { id } });
    if (!importLog) {
      this.logger.warn(`Attempted to increment counters of non-existent import log with ID ${id}`);
      return;
    }

    importLog.processedRecords += processed;
    importLog.successfulRecords += successful;
    importLog.failedRecords += failed;

    await this.importLogRepository.save(importLog);
  }
} 