import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixDoubleEncodedPendingDuplicates1732804800000
  implements MigrationInterface
{
  name = 'FixDoubleEncodedPendingDuplicates1732804800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix double-encoded JSON in existingTransactionData
    // PostgreSQL can parse the double-encoded JSON string and store it as proper JSON
    await queryRunner.query(`
      UPDATE pending_duplicates
      SET "existingTransactionData" = 
        CASE 
          WHEN jsonb_typeof("existingTransactionData") = 'string' 
          THEN ("existingTransactionData"#>>'{}')::jsonb
          ELSE "existingTransactionData"
        END
      WHERE "existingTransactionData" IS NOT NULL
        AND jsonb_typeof("existingTransactionData") = 'string';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No need to revert - the fix improves data quality
    // Original double-encoded format was a bug
  }
}
