import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKeywordStatsTable1745434452 implements MigrationInterface {
  name = 'CreateKeywordStatsTable1745434452';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "keyword_stats" (
        "id" SERIAL NOT NULL,
        "keyword" character varying NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        "successCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lastUsed" TIMESTAMP,
        "categoryId" integer,
        "userId" integer,
        CONSTRAINT "PK_keyword_stats" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "keyword_stats" 
      ADD CONSTRAINT "FK_keyword_stats_category" 
      FOREIGN KEY ("categoryId") REFERENCES "category"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "keyword_stats" 
      ADD CONSTRAINT "FK_keyword_stats_user" 
      FOREIGN KEY ("userId") REFERENCES "user"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Add index on keyword and userId for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_keyword_stats_keyword_user" 
      ON "keyword_stats" ("keyword", "userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_keyword_stats_keyword_user"`);
    await queryRunner.query(
      `ALTER TABLE "keyword_stats" DROP CONSTRAINT "FK_keyword_stats_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "keyword_stats" DROP CONSTRAINT "FK_keyword_stats_category"`,
    );
    await queryRunner.query(`DROP TABLE "keyword_stats"`);
  }
}
