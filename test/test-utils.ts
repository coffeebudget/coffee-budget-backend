import { User } from 'src/users/user.entity';

// test/test-utils.ts
export const createCategoryMock = (overrides = {}) => ({
  id: 1,
  name: 'Test Category',
  transactions: [],
  user: { id: 1 } as User,
  recurringTransactions: [],
  keywords: [],
  excludeFromExpenseAnalytics: false,
  analyticsExclusionReason: null,
  ...overrides,
});
