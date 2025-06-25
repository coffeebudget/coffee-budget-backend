import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGocardlessAccountId1717000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add gocardlessAccountId to bank_account table
    await queryRunner.addColumn(
      'bank_account',
      new TableColumn({
        name: 'gocardlessAccountId',
        type: 'varchar',
        isNullable: true,
      }),
    );

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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('bank_account', 'gocardlessAccountId');
    await queryRunner.dropColumn('credit_card', 'gocardlessAccountId');
  }
}
