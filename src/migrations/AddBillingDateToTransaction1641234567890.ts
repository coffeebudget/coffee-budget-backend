import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBillingDateToTransaction1641234567890
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'transaction',
      new TableColumn({
        name: 'billingDate',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transaction', 'billingDate');
  }
}
