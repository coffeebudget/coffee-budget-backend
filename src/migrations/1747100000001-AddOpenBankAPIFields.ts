import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddOpenBankAPIFields1747100000001 implements MigrationInterface {
  name = 'AddOpenBankAPIFields1747100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add transactionIdOpenBankAPI column
    await queryRunner.query(`
      ALTER TABLE "transaction" 
      ADD COLUMN "transactionIdOpenBankAPI" VARCHAR NULL
    `);

    // Create unique index for user + transactionIdOpenBankAPI + source
    await queryRunner.createIndex(
      'transaction',
      new TableIndex({
        name: 'IDX_TRANSACTION_OPENBANK_API_UNIQUE',
        columnNames: ['user', 'transactionIdOpenBankAPI', 'source'],
        isUnique: true,
        where: '"transactionIdOpenBankAPI" IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique index
    await queryRunner.dropIndex('transaction', 'IDX_TRANSACTION_OPENBANK_API_UNIQUE');

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE "transaction" 
      DROP COLUMN "transactionIdOpenBankAPI"
    `);
  }
} 