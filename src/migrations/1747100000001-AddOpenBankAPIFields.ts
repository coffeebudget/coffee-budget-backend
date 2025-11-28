import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddOpenBankAPIFields1747100000001 implements MigrationInterface {
  name = 'AddOpenBankAPIFields1747100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Check if column exists before adding
    const hasColumn = table?.columns.some((c) => c.name === 'transactionIdOpenBankAPI');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE "transaction"
        ADD COLUMN "transactionIdOpenBankAPI" VARCHAR NULL
      `);
    }

    // Check if index exists before creating
    const hasIndex = table?.indices.some((idx) => idx.name === 'IDX_TRANSACTION_OPENBANK_API_UNIQUE');
    if (!hasIndex) {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Check if index exists before dropping
    const hasIndex = table?.indices.some((idx) => idx.name === 'IDX_TRANSACTION_OPENBANK_API_UNIQUE');
    if (hasIndex) {
      await queryRunner.dropIndex('transaction', 'IDX_TRANSACTION_OPENBANK_API_UNIQUE');
    }

    // Check if column exists before dropping
    const hasColumn = table?.columns.some((c) => c.name === 'transactionIdOpenBankAPI');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE "transaction"
        DROP COLUMN "transactionIdOpenBankAPI"
      `);
    }
  }
} 