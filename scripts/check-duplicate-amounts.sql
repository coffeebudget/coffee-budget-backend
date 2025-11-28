-- Check pending_duplicates with missing amounts in JSON
SELECT 
    id,
    source,
    existingTransactionData->>'amount' as existing_amount,
    newTransactionData->>'amount' as new_amount,
    existingTransactionData->>'description' as existing_desc,
    newTransactionData->>'description' as new_desc,
    created_at
FROM pending_duplicates
WHERE 
    (existingTransactionData->>'amount' IS NULL OR existingTransactionData->>'amount' = '')
    OR (newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '')
ORDER BY created_at DESC
LIMIT 20;

-- Count total pending duplicates with missing amounts
SELECT COUNT(*) as total_missing_amounts
FROM pending_duplicates
WHERE 
    (existingTransactionData->>'amount' IS NULL OR existingTransactionData->>'amount' = '')
    OR (newTransactionData->>'amount' IS NULL OR newTransactionData->>'amount' = '');
