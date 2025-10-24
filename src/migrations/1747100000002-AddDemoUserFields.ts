import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDemoUserFields1747100000002 implements MigrationInterface {
  name = 'AddDemoUserFields1747100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "isDemoUser" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "demoExpiryDate" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "demoActivatedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "demoActivatedAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "demoExpiryDate"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isDemoUser"`);
  }
} 