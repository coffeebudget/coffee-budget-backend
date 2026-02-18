import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRawGoCardlessDataToTransaction1770500000001
  implements MigrationInterface
{
  name = 'AddRawGoCardlessDataToTransaction1770500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const hasColumn = table?.columns.some(
      (c) => c.name === 'rawGoCardlessData',
    );

    if (!hasColumn) {
      await queryRunner.addColumn(
        'transaction',
        new TableColumn({
          name: 'rawGoCardlessData',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const hasColumn = table?.columns.some(
      (c) => c.name === 'rawGoCardlessData',
    );

    if (hasColumn) {
      await queryRunner.dropColumn('transaction', 'rawGoCardlessData');
    }
  }
}
