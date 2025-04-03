import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreasedRecurringTransactionNameLength1716123456789 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recurring_transaction" 
            ALTER COLUMN "name" TYPE character varying(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "recurring_transaction" 
            ALTER COLUMN "name" TYPE character varying(100)
        `);
    }
} 