import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBillingDayToCreditCard1641234567890
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'credit_card',
      new TableColumn({
        name: 'billingDay',
        type: 'int',
        isNullable: false,
        default: 1,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('credit_card', 'billingDay');
  }
}
