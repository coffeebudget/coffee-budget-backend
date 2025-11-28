import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddXXXCurrency1747100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if XXX value already exists in the enum
    const result = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'bank_account_currency_enum'
        AND e.enumlabel = 'XXX'
      ) as exists
    `);

    if (!result[0].exists) {
      // Add XXX to the currency enum only if it doesn't exist
      await queryRunner.query(
        `ALTER TYPE "bank_account_currency_enum" ADD VALUE 'XXX'`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require more complex operations to remove the enum value
    console.log('Removing enum values is not supported in PostgreSQL');
  }
}
