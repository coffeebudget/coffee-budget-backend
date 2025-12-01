import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixDoubleEncodedPendingDuplicates1732804800000
  implements MigrationInterface
{
  name = 'FixDoubleEncodedPendingDuplicates1732804800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix double-encoded JSON in existingTransactionData
    // Cast json to jsonb first, then check if it's a string type
    await queryRunner.query(`
      UPDATE pending_duplicates
      SET "existingTransactionData" =
        CASE
          WHEN jsonb_typeof("existingTransactionData"::jsonb) = 'string'
          THEN ("existingTransactionData"#>>'{}')::json
          ELSE "existingTransactionData"
        END
      WHERE "existingTransactionData" IS NOT NULL
        AND jsonb_typeof("existingTransactionData"::jsonb) = 'string';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No need to revert - the fix improves data quality
    // Original double-encoded format was a bug
  }
}
