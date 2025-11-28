#!/bin/bash
# Quick check for Railway database duplicate amounts issue

echo "Quick Railway Database Check"
echo "============================="
echo ""
echo "Checking if Railway CLI is installed..."
if command -v railway &> /dev/null; then
    echo "✓ Railway CLI found"
    echo ""
    echo "Running quick diagnostic query..."
    railway run psql -c "
        SELECT 
            COUNT(*) as total_duplicates,
            COUNT(*) FILTER (WHERE newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '') as missing_new_amount,
            COUNT(*) FILTER (WHERE existingTransactionData->>'amount' IS NULL OR existingTransactionData->>'amount' = '') as missing_existing_amount
        FROM pending_duplicates
        WHERE resolved = false;
    "
else
    echo "✗ Railway CLI not installed"
    echo ""
    echo "Install with: npm install -g @railway/cli"
    echo "Then run: railway login && railway link"
fi
