import { Test, TestingModule } from '@nestjs/testing';
import { ExpensePlanEventHandler } from './expense-plan.event-handler';
import { SuggestionGeneratorService } from '../services/suggestion-generator.service';
import { ExpensePlanDeletedEvent } from '../../shared/events/expense-plan.events';

describe('ExpensePlanEventHandler', () => {
  let handler: ExpensePlanEventHandler;
  let suggestionGenerator: jest.Mocked<SuggestionGeneratorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensePlanEventHandler,
        {
          provide: SuggestionGeneratorService,
          useValue: {
            resetSuggestionForDeletedExpensePlan: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<ExpensePlanEventHandler>(ExpensePlanEventHandler);
    suggestionGenerator = module.get(SuggestionGeneratorService);
  });

  describe('handleExpensePlanDeleted', () => {
    it('should call resetSuggestionForDeletedExpensePlan with correct parameters', async () => {
      // Arrange
      const event = new ExpensePlanDeletedEvent(123, 456);
      suggestionGenerator.resetSuggestionForDeletedExpensePlan.mockResolvedValue(
        true,
      );

      // Act
      await handler.handleExpensePlanDeleted(event);

      // Assert
      expect(
        suggestionGenerator.resetSuggestionForDeletedExpensePlan,
      ).toHaveBeenCalledWith(456, 123);
    });

    it('should not throw when resetSuggestionForDeletedExpensePlan returns false', async () => {
      // Arrange
      const event = new ExpensePlanDeletedEvent(999, 456);
      suggestionGenerator.resetSuggestionForDeletedExpensePlan.mockResolvedValue(
        false,
      );

      // Act & Assert - should not throw
      await expect(
        handler.handleExpensePlanDeleted(event),
      ).resolves.not.toThrow();
    });

    it('should not throw when service throws an error', async () => {
      // Arrange
      const event = new ExpensePlanDeletedEvent(123, 456);
      suggestionGenerator.resetSuggestionForDeletedExpensePlan.mockRejectedValue(
        new Error('Database error'),
      );

      // Act & Assert - should not throw (to avoid breaking deletion flow)
      await expect(
        handler.handleExpensePlanDeleted(event),
      ).resolves.not.toThrow();
    });
  });
});
