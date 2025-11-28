import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBillingDateToTransaction1641234567890
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const hasColumn = table?.columns.some((c) => c.name === 'billingDate');

    if (!hasColumn) {
      await queryRunner.addColumn(
        'transaction',
        new TableColumn({
          name: 'billingDate',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const hasColumn = table?.columns.some((c) => c.name === 'billingDate');

    if (hasColumn) {
      await queryRunner.dropColumn('transaction', 'billingDate');
    }
  }
}
