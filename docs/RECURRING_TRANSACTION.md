# Recurring Transactions Module

## Overview

This module has been simplified to be used solely for analytics purposes. It allows the creation, management, and analysis of recurring transaction patterns without actually generating transactions or modifying existing transactions.

## Features

- Create, update, and delete recurring transaction definitions
- Detect recurring patterns in existing transactions
- Support for analytics including cashflow forecasting
- No automatic transaction generation

## Usage

### Creating Recurring Transactions

Recurring transactions can be created for analytical purposes, such as forecasting future expenses and income:

```typescript
// Create a recurring transaction
const recurringTransaction = await recurringTransactionsService.create({
  name: 'Monthly Rent',
  amount: 1000,
  type: 'expense',
  frequencyType: 'monthly',
  frequencyEveryN: 1,
  startDate: new Date(),
  categoryId: 1,
  bankAccountId: 1
}, user);
```

### Detecting Patterns

The module can analyze existing transactions to detect recurring patterns:

```typescript
// Detect recurring patterns in transactions
const patterns = await recurringTransactionsService.detectAllPatterns(userId);
```

### Forecasting

The recurring transactions are used by the dashboard service for forecasting:

```typescript
// Get cash flow forecast based on recurring transactions
const forecast = await dashboardService.getCashFlowForecast(userId, 12, 'recurring');
```

## Technical Details

- `RecurringTransaction` entity stores the definition of recurring transactions
- `RecurringTransactionGeneratorService` calculates next occurrence dates
- `RecurringPatternDetectorService` analyzes transaction history for patterns
- No automatic cron job to generate transactions

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /recurring-transactions | Get all recurring transactions |
| POST | /recurring-transactions | Create a new recurring transaction |
| GET | /recurring-transactions/detect-patterns | Detect recurring patterns in transactions |
| GET | /recurring-transactions/:id | Get a specific recurring transaction |
| PATCH | /recurring-transactions/:id | Update a recurring transaction |
| DELETE | /recurring-transactions/:id | Delete a recurring transaction | 