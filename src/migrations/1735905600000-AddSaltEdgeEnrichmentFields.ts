import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSaltEdgeEnrichmentFields1735905600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('transaction', [
      new TableColumn({
        name: 'saltEdgeCategory',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'saltEdgeMerchantId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'saltEdgeMerchantName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'categorizationConfidence',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('transaction', [
      'saltEdgeCategory',
      'saltEdgeMerchantId',
      'saltEdgeMerchantName',
      'categorizationConfidence',
    ]);
  }
}
