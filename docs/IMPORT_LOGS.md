# Import Logs Documentation

## Overview

The Import Logs feature provides a way to track and monitor transaction import operations in the Coffee Budget application. Each time a user imports transactions (via CSV or bank-specific formats), a detailed log is created with information about the import process, including:

- Import status
- Start and end time
- Count of processed/successful/failed records
- Detailed logs of each step
- Error messages when applicable

## Data Model

### Import Status Enum

Possible statuses for an import operation:

```
PENDING - Import is scheduled but not yet started
PROCESSING - Import is currently in progress
COMPLETED - Import finished successfully with all records processed
PARTIALLY_COMPLETED - Import finished but some records failed
FAILED - Import failed completely
```

### Import Log Entity

The `ImportLog` entity stores the following information:

| Field | Type | Description |
|-------|------|-------------|
| id | number | Unique identifier |
| user | User | Reference to the user who performed the import |
| status | ImportStatus | Current status of the import |
| source | string | Source of the import (e.g., 'csv', 'api') |
| format | string | Format of the import (e.g., 'generic', 'webank', 'fineco') |
| fileName | string | Original filename (if applicable) |
| totalRecords | number | Total number of records in the import |
| processedRecords | number | Number of records processed |
| successfulRecords | number | Number of records successfully imported |
| failedRecords | number | Number of records that failed to import |
| summary | string | Brief summary of the import results |
| logs | string | Detailed logs of the import process |
| metadata | object | Additional metadata about the import |
| startTime | Date | When the import started |
| endTime | Date | When the import finished |
| createdAt | Date | When the import log was created |
| updatedAt | Date | When the import log was last updated |

## API Endpoints

### Import Transactions

```
POST /transactions/import
```

**Request Body**:
```json
{
  "csvData": "base64-encoded-or-raw-csv-data",
  "columnMappings": {
    "description": "Description",
    "amount": "Amount",
    "executionDate": "Date",
    "type": "Type",
    "categoryName": "Category",
    "tagNames": "Tags"
  },
  "bankFormat": "webank", // Optional, if using a specific bank format
  "dateFormat": "yyyy-MM-dd", // Optional, defaults to this format
  "bankAccountId": 123, // Optional
  "creditCardId": 456, // Optional
  "fileName": "transactions-jan-2023.csv" // Optional
}
```

**Response**:
```json
{
  "importLogId": 42,
  "transactionsCount": 85,
  "status": "COMPLETED",
  "message": "Import process completed with 85 transactions"
}
```

### Get All Import Logs

```
GET /import-logs
```

**Response**:
```json
[
  {
    "id": 42,
    "status": "COMPLETED",
    "source": "csv",
    "format": "generic",
    "fileName": "transactions-jan-2023.csv",
    "totalRecords": 90,
    "processedRecords": 90,
    "successfulRecords": 85,
    "failedRecords": 5,
    "summary": "Import completed. Successfully imported 85 of 90 transactions.",
    "startTime": "2023-06-01T10:15:30Z",
    "endTime": "2023-06-01T10:15:45Z",
    "createdAt": "2023-06-01T10:15:30Z",
    "updatedAt": "2023-06-01T10:15:45Z"
  },
  // ...more logs
]
```

### Get Import Log Details

```
GET /import-logs/{id}
```

**Response**:
```json
{
  "id": 42,
  "status": "COMPLETED",
  "source": "csv",
  "format": "generic",
  "fileName": "transactions-jan-2023.csv",
  "totalRecords": 90,
  "processedRecords": 90,
  "successfulRecords": 85,
  "failedRecords": 5,
  "summary": "Import completed. Successfully imported 85 of 90 transactions.",
  "logs": "[2023-06-01T10:15:30.123Z] Started import process for user 1 with format: generic\n[2023-06-01T10:15:31.456Z] Successfully parsed 90 records from CSV\n[2023-06-01T10:15:32.789Z] First record sample: {...}\n...",
  "metadata": {
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "clientIp": "192.168.1.1"
  },
  "startTime": "2023-06-01T10:15:30Z",
  "endTime": "2023-06-01T10:15:45Z",
  "createdAt": "2023-06-01T10:15:30Z",
  "updatedAt": "2023-06-01T10:15:45Z"
}
```

## Usage in Code

### Creating an Import Log

```typescript
const importLog = await this.importLogsService.create({
  userId,
  status: ImportStatus.PROCESSING,
  source: 'csv',
  format: 'generic',
  fileName: 'transactions.csv',
  startTime: new Date()
});
```

### Updating Import Status

```typescript
await this.importLogsService.updateStatus(
  importLog.id, 
  ImportStatus.COMPLETED,
  'Import completed successfully'
);
```

### Appending to Log

```typescript
await this.importLogsService.appendToLog(
  importLog.id, 
  'Processing record 5/100: Successfully imported transaction'
);
```

### Incrementing Counters

```typescript
await this.importLogsService.incrementCounters(importLog.id, { 
  processed: 1, 
  successful: 1 
});
```

## Best Practices

1. Always create an import log before starting the import process
2. Use try/catch blocks to properly handle errors and update the import status
3. Regularly update the log with relevant information during the import process
4. Include detailed error messages when transactions fail to import
5. Summarize the results at the end of the import process
6. Close the import log by updating its status and setting the end time 