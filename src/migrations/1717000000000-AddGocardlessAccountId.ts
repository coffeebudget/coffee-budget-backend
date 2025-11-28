import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGocardlessAccountId1717000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if gocardlessAccountId column exists in bank_account table
    const bankAccountTable = await queryRunner.getTable('bank_account');
    const hasBankAccountColumn = bankAccountTable?.columns.some(
      (column) => column.name === 'gocardlessAccountId',
    );

    if (!hasBankAccountColumn) {
      // Add gocardlessAccountId to bank_account table
      await queryRunner.addColumn(
        'bank_account',
        new TableColumn({
          name: 'gocardlessAccountId',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    // Check if gocardlessAccountId column exists in credit_card table
    const creditCardTable = await queryRunner.getTable('credit_card');
    const hasCreditCardColumn = creditCardTable?.columns.some(
      (column) => column.name === 'gocardlessAccountId',
    );

    if (!hasCreditCardColumn) {
      // Add gocardlessAccountId to credit_card table
      await queryRunner.addColumn(
        'credit_card',
        new TableColumn({
          name: 'gocardlessAccountId',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('bank_account', 'gocardlessAccountId');
    await queryRunner.dropColumn('credit_card', 'gocardlessAccountId');
  }
}
