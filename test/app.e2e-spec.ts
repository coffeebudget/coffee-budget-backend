import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

describe('Transaction Update Validation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject PATCH requests with id field in body', () => {
    const transactionId = 1;
    const updateDataWithId = {
      id: 1, // This should be rejected by validation
      description: 'Updated transaction',
      amount: 100,
      categoryId: 2,
    };

    return request(app.getHttpServer())
      .patch(`/transactions/${transactionId}`)
      .send(updateDataWithId)
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain('property id should not exist');
      });
  });

  it('should accept PATCH requests without id field in body', () => {
    const transactionId = 1;
    const updateData = {
      description: 'Updated transaction',
      amount: 100,
      categoryId: 2,
    };

    // This test will fail if the transaction doesn't exist, but that's expected
    // The important part is that it doesn't fail due to validation
    return request(app.getHttpServer())
      .patch(`/transactions/${transactionId}`)
      .send(updateData)
      .expect((res) => {
        // Should not fail due to validation (400 with validation error)
        expect(res.status).not.toBe(400);
        // Could be 401 (unauthorized) or 404 (not found), but not validation error
        if (res.status === 400) {
          expect(res.body.message).not.toContain(
            'property id should not exist',
          );
        }
      });
  });
});
