# Phase 3.1: SyncHistory API Implementation Plan

## Overview

Implement REST API endpoints for the SyncHistory feature to enable frontend UI to display sync reports, statistics, and detailed sync information.

## API Endpoints

### 1. GET /sync-history
**Purpose**: Get paginated sync history for authenticated user

**Authentication**: Required (JWT)

**Query Parameters**:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `status` (string, optional) - Filter by status: 'success' | 'partial' | 'failed'

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": 1,
      "status": "success",
      "syncStartedAt": "2025-11-11T09:00:00Z",
      "syncCompletedAt": "2025-11-11T09:15:00Z",
      "totalAccounts": 3,
      "successfulAccounts": 3,
      "failedAccounts": 0,
      "totalNewTransactions": 45,
      "totalDuplicates": 15,
      "totalPendingDuplicates": 3,
      "syncType": "automatic",
      "errorMessage": null
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

**Service Method**: `syncHistoryService.getUserSyncHistory(userId, options)`

---

### 2. GET /sync-history/statistics
**Purpose**: Get sync statistics for authenticated user

**Authentication**: Required (JWT)

**Query Parameters**:
- `days` (number, default: 30) - Number of days to analyze

**Response** (200 OK):
```json
{
  "totalSyncs": 30,
  "successfulSyncs": 28,
  "failedSyncs": 1,
  "successRate": 93.33,
  "totalNewTransactions": 450,
  "totalDuplicates": 120,
  "averageTransactionsPerSync": 15
}
```

**Service Method**: `syncHistoryService.getSyncStatistics(userId, days)`

---

### 3. GET /sync-history/:id
**Purpose**: Get specific sync report with detailed information

**Authentication**: Required (JWT)

**URL Parameters**:
- `id` (number) - Sync report ID

**Response** (200 OK):
```json
{
  "id": 1,
  "status": "success",
  "syncStartedAt": "2025-11-11T09:00:00Z",
  "syncCompletedAt": "2025-11-11T09:15:00Z",
  "totalAccounts": 3,
  "successfulAccounts": 3,
  "failedAccounts": 0,
  "totalNewTransactions": 45,
  "totalDuplicates": 15,
  "totalPendingDuplicates": 3,
  "syncType": "automatic",
  "accountResults": [
    {
      "accountId": "acc123",
      "accountName": "Fineco",
      "accountType": "bank_account",
      "success": true,
      "newTransactions": 15,
      "duplicates": 5,
      "pendingDuplicates": 1
    }
  ],
  "importLogs": [
    {
      "id": 1,
      "status": "completed",
      "totalRecords": 15,
      "successfulRecords": 15,
      "failedRecords": 0
    }
  ],
  "errorMessage": null
}
```

**Error Response** (404 Not Found):
```json
{
  "statusCode": 404,
  "message": "Sync report not found",
  "error": "Not Found"
}
```

**Error Response** (403 Forbidden):
```json
{
  "statusCode": 403,
  "message": "Access denied",
  "error": "Forbidden"
}
```

**Service Method**: New method needed: `syncHistoryService.getSyncReportById(id, userId)`

---

## Implementation Steps

### Step 1: Create DTOs
- `PaginationQueryDto` - Query params for pagination
- `SyncStatisticsQueryDto` - Query params for statistics
- `SyncReportResponseDto` - Response format for sync reports (optional, can use entity)

### Step 2: TDD - Controller Tests
Write comprehensive tests for all endpoints:
- GET /sync-history (success, pagination, filtering)
- GET /sync-history/statistics (success, custom days)
- GET /sync-history/:id (success, not found, access denied)

### Step 3: Implement Controller
- Add @UseGuards(JwtAuthGuard) for authentication
- Extract userId from @User() decorator
- Call service methods
- Handle errors appropriately

### Step 4: Add Service Method
- Implement `getSyncReportById()` in SyncHistoryService
- Add user isolation check
- Include relations (importLogs)

### Step 5: Swagger Documentation
- Add @ApiTags('sync-history')
- Add @ApiOperation for each endpoint
- Add @ApiResponse decorators
- Add @ApiQuery for query parameters

### Step 6: Testing
- Run all tests (ensure 100% pass rate)
- Test with Postman/curl (manual validation)
- Verify Swagger docs at /api/docs

## Security Considerations

- ✅ JWT authentication required for all endpoints
- ✅ User isolation: Users can only see their own sync reports
- ✅ Access control: Verify ownership on GET /:id
- ✅ Input validation: Validate query parameters and URL params
- ✅ Rate limiting: Already configured at app level

## Error Handling

- 401 Unauthorized: Missing or invalid JWT
- 403 Forbidden: User doesn't own the requested sync report
- 404 Not Found: Sync report doesn't exist
- 400 Bad Request: Invalid query parameters

## Next Phase

After Phase 3.1 (Backend API) is complete, Phase 3.2 will implement the Frontend UI:
- Sync History page listing all syncs
- Sync Statistics dashboard
- Sync Detail page with drill-down
- Real-time status indicators
