import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddXXXCurrency1747100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add XXX to the currency enum
    await queryRunner.query(
      `ALTER TYPE "bank_account_currency_enum" ADD VALUE 'XXX'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require more complex operations to remove the enum value
    console.log('Removing enum values is not supported in PostgreSQL');
  }
}
