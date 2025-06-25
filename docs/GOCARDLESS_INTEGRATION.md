# GoCardless Bank Account Data Integration

This document explains how to use the GoCardless Bank Account Data API integration in the Coffee Budget Backend.

## Overview

The GoCardless integration allows users to connect their bank accounts and automatically import transactions, eliminating the need for manual CSV uploads. This integration follows the [GoCardless Bank Account Data quickstart guide](https://developer.gocardless.com/bank-account-data/quick-start-guide).

## Setup

### 1. Get GoCardless Credentials

1. Sign up for a GoCardless Bank Account Data account at https://bankaccountdata.gocardless.com/
2. Navigate to User Secrets section
3. Create your `secret_id` and `secret_key`

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# GoCardless Bank Account Data API Configuration
GOCARDLESS_SECRET_ID=your_gocardless_secret_id
GOCARDLESS_SECRET_KEY=your_gocardless_secret_key
```

## API Endpoints

### Authentication
- `POST /gocardless/token` - Create access token (manual, usually handled automatically)

### Bank Discovery
- `GET /gocardless/institutions?country=IT` - Get banks for a specific country
- `GET /gocardless/institutions/italian-banks` - Get all Italian banks
- `GET /gocardless/institutions/fineco` - Find Fineco bank specifically

### Bank Connection Flow
- `POST /gocardless/flow/start` - Start the complete bank connection flow
- `POST /gocardless/agreements` - Create end user agreement (optional)
- `POST /gocardless/requisitions` - Create requisition and get authorization link
- `GET /gocardless/requisitions/:id` - Get requisition status and linked accounts

### Account Data
- `GET /gocardless/accounts/:id/details` - Get account details
- `GET /gocardless/accounts/:id/balances` - Get account balances
- `GET /gocardless/accounts/:id/transactions` - Get account transactions

## Usage Flow

### 1. Start Bank Connection

```bash
POST /gocardless/flow/start
{
  "institutionId": "FINECO_FEBIITM1XXX",
  "redirectUrl": "https://your-frontend.com/callback",
  "reference": "user-123-connection"
}
```

Response:
```json
{
  "requisition": {
    "id": "requisition-id",
    "link": "https://ob.gocardless.com/psd2/start/...",
    "status": "CR",
    ...
  },
  "authUrl": "https://ob.gocardless.com/psd2/start/..."
}
```

### 2. User Authorization

1. Redirect user to the `authUrl`
2. User completes bank authentication
3. User is redirected back to your `redirectUrl`

### 3. Get Connected Accounts

```bash
GET /gocardless/requisitions/{requisition-id}
```

Response:
```json
{
  "id": "requisition-id",
  "status": "LN",
  "accounts": ["account-id-1", "account-id-2"],
  ...
}
```

### 4. Fetch Transactions

```bash
GET /gocardless/accounts/{account-id}/transactions
```

Response:
```json
{
  "transactions": {
    "booked": [
      {
        "transactionId": "2020103000624289-1",
        "transactionAmount": {
          "currency": "EUR",
          "amount": "45.00"
        },
        "bookingDate": "2020-10-30",
        "valueDate": "2020-10-30",
        "remittanceInformationUnstructured": "Coffee purchase"
      }
    ],
    "pending": []
  }
}
```

## Integration with Existing Transaction System

### Automatic Transaction Import

To integrate GoCardless transactions with your existing transaction system, you can:

1. **Create a new parser**: Similar to the Fineco parser, create a GoCardless transaction parser
2. **Map transaction data**: Convert GoCardless transaction format to your internal format
3. **Handle categorization**: Use the existing categorization logic or implement automatic categorization
4. **Avoid duplicates**: Check for existing transactions before importing

### Example Integration

```typescript
// In TransactionsService
async importFromGoCardless(accountId: string, userId: number) {
  // Get transactions from GoCardless
  const gocardlessData = await this.gocardlessService.getAccountTransactions(accountId);
  
  // Convert to internal format
  const transactions = gocardlessData.transactions.booked.map(tx => ({
    amount: parseFloat(tx.transactionAmount.amount),
    description: tx.remittanceInformationUnstructured,
    executionDate: new Date(tx.bookingDate),
    // ... other fields
  }));
  
  // Import using existing logic
  return this.importTransactions(transactions, { userId });
}
```

## Supported Banks

The integration supports all banks available through GoCardless Bank Account Data API. For Italy, this includes:

- Fineco Bank
- UniCredit
- Intesa Sanpaolo
- And many more...

Use the `/gocardless/institutions/italian-banks` endpoint to get the complete list.

## Error Handling

The service includes comprehensive error handling:

- **Authentication errors**: Automatic token refresh
- **API errors**: Detailed error messages from GoCardless
- **Network errors**: Proper HTTP status codes and error responses

## Security Considerations

- **Credentials**: Store GoCardless credentials securely in environment variables
- **Access tokens**: Tokens are automatically managed and refreshed
- **User data**: All bank data access requires user authentication
- **HTTPS**: Always use HTTPS in production for redirect URLs

## Limitations

- **Access duration**: Bank access is typically limited to 90 days
- **Historical data**: Usually limited to 90-540 days depending on the bank
- **Rate limits**: GoCardless API has rate limits (check their documentation)
- **Bank availability**: Not all banks support all features

## Testing

For testing, you can use the sandbox institution:
- Institution ID: `SANDBOXFINANCE_SFIN0000`
- This provides mock data for testing the integration

## Next Steps

1. Set up your GoCardless credentials
2. Test the integration with the sandbox
3. Implement automatic transaction import
4. Add categorization logic
5. Set up periodic sync for connected accounts 