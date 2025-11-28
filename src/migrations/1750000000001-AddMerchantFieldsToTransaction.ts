import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMerchantFieldsToTransaction1750000000001 implements MigrationInterface {
  name = 'AddMerchantFieldsToTransaction1750000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    const columnsToAdd = [
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
    ];

    // Only add columns that don't exist
    for (const column of columnsToAdd) {
      const hasColumn = table?.columns.some((c) => c.name === column.name);
      if (!hasColumn) {
        await queryRunner.addColumn('transaction', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const columnsToRemove = [
      'merchantName',
      'merchantCategoryCode',
      'debtorName',
      'creditorName',
    ];

    // Only drop columns that exist
    for (const columnName of columnsToRemove) {
      const hasColumn = table?.columns.some((c) => c.name === columnName);
      if (hasColumn) {
        await queryRunner.dropColumn('transaction', columnName);
      }
    }
  }
}
