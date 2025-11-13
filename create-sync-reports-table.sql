-- Create sync_reports table
CREATE TABLE sync_reports (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  status VARCHAR NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  "syncStartedAt" TIMESTAMP NOT NULL,
  "syncCompletedAt" TIMESTAMP NOT NULL,
  "totalAccounts" INTEGER NOT NULL,
  "successfulAccounts" INTEGER NOT NULL,
  "failedAccounts" INTEGER NOT NULL,
  "totalNewTransactions" INTEGER NOT NULL,
  "totalDuplicates" INTEGER NOT NULL,
  "totalPendingDuplicates" INTEGER NOT NULL,
  "syncType" VARCHAR NOT NULL DEFAULT 'automatic',
  "accountResults" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_sync_reports_userId" FOREIGN KEY ("userId")
    REFERENCES "user"(id) ON DELETE CASCADE
);

-- Create index on userId for faster queries
CREATE INDEX "IDX_sync_reports_userId" ON sync_reports("userId");

-- Create index on syncStartedAt for sorting
CREATE INDEX "IDX_sync_reports_syncStartedAt" ON sync_reports("syncStartedAt");
