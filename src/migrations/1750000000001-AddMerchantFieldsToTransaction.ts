import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMerchantFieldsToTransaction1750000000001 implements MigrationInterface {
  name = 'AddMerchantFieldsToTransaction1750000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add merchant fields to transaction table
    await queryRunner.addColumns('transaction', [
      new TableColumn({
        name: 'merchantName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'merchantCategoryCode',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'debtorName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'creditorName',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove merchant fields from transaction table
    await queryRunner.dropColumns('transaction', [
      'merchantName',
      'merchantCategoryCode',
      'debtorName',
      'creditorName',
    ]);
  }
}
