# Coffee Budget Backend

A NestJS backend for a personal finance management application.

> **📚 Development Documentation**: Development docs, feature plans, and architecture documentation are maintained in the [main repository](https://github.com/coffeebudget/coffeebudget-main). This README focuses on setup and usage of the backend service.

## Project Structure

This is a multi-repository project with the following structure:

```
coffee-budget-backend/          # This repository (Backend API)
├── src/                       # Source code
├── docs/                      # Documentation
├── coffee-budget.code-workspace # VS Code workspace configuration
└── ...

coffee-budget-frontend/        # Frontend repository (separate folder)
├── src/                       # React/Next.js frontend
└── ...
```

To work with both frontend and backend:
1. Open the `coffee-budget.code-workspace` file in VS Code
2. This will load both the backend and frontend as separate workspace folders

## Features

- Transaction management with GoCardless integration
- Category management with keyword-based auto-categorization
- Recurring transactions
- Bank account and credit card tracking
- CSV import functionality with bank-specific parsers
- Duplicate detection
- Dashboard with financial insights
- PayPal transaction enrichment

## Tech Stack

- NestJS
- TypeORM
- PostgreSQL
- JWT Authentication

## Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/coffee-budget-backend.git
   cd coffee-budget-backend
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env.development` file based on `.env.example`

4. Start the development server
   ```bash
   npm run start:dev
   ```

## API Documentation

API documentation is available at `/api` when the server is running.

## New Bulk Operations Endpoints

The backend now supports the following bulk operations:

### Bulk Categorize Transactions by Transaction IDs

Endpoint: `POST /transactions/bulk-categorize`

Request payload:
```json
{
  "transaction_ids": [1, 2, 3, 4],
  "category_id": 5
}
```

Response:
```json
{
  "count": 4,
  "message": "4 transactions categorized successfully"
}
```

### Bulk Tag Transactions by Transaction IDs

Endpoint: `POST /tags/bulk-tag`

Request payload:
```json
{
  "transaction_ids": [1, 2, 3, 4],
  "tag_ids": [5, 6]
}
```

Response:
```json
{
  "count": 4,
  "message": "4 transactions tagged successfully"
}
```

For both endpoints, authentication is required via JWT bearer token.

## License

[MIT](LICENSE)
