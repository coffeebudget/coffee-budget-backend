import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGocardlessAccountId1717000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists in bank_account before adding
    const bankAccountTable = await queryRunner.getTable('bank_account');
    const hasBankAccountColumn = bankAccountTable?.columns.find(
      (col) => col.name === 'gocardlessAccountId',
    );

    if (!hasBankAccountColumn) {
      await queryRunner.addColumn(
        'bank_account',
        new TableColumn({
          name: 'gocardlessAccountId',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    // Check if column exists in credit_card before adding
    const creditCardTable = await queryRunner.getTable('credit_card');
    const hasCreditCardColumn = creditCardTable?.columns.find(
      (col) => col.name === 'gocardlessAccountId',
    );

    if (!hasCreditCardColumn) {
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
