import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDemoUserFields1747100000002 implements MigrationInterface {
  name = 'AddDemoUserFields1747100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');

    const hasIsDemoUser = table?.columns.some((c) => c.name === 'isDemoUser');
    if (!hasIsDemoUser) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD "isDemoUser" boolean NOT NULL DEFAULT false`,
      );
    }

    const hasDemoExpiryDate = table?.columns.some(
      (c) => c.name === 'demoExpiryDate',
    );
    if (!hasDemoExpiryDate) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD "demoExpiryDate" TIMESTAMP`,
      );
    }

    const hasDemoActivatedAt = table?.columns.some(
      (c) => c.name === 'demoActivatedAt',
    );
    if (!hasDemoActivatedAt) {
      await queryRunner.query(
        `ALTER TABLE "user" ADD "demoActivatedAt" TIMESTAMP`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');

    const hasDemoActivatedAt = table?.columns.some(
      (c) => c.name === 'demoActivatedAt',
    );
    if (hasDemoActivatedAt) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN "demoActivatedAt"`,
      );
    }

    const hasDemoExpiryDate = table?.columns.some(
      (c) => c.name === 'demoExpiryDate',
    );
    if (hasDemoExpiryDate) {
      await queryRunner.query(
        `ALTER TABLE "user" DROP COLUMN "demoExpiryDate"`,
      );
    }

    const hasIsDemoUser = table?.columns.some((c) => c.name === 'isDemoUser');
    if (hasIsDemoUser) {
      await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isDemoUser"`);
    }
  }
}
