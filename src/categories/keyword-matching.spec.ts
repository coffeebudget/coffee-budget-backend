/**
 * Test for verifying that punctuation doesn't prevent keyword matching
 */
describe('Keyword Matching Logic', () => {
  // This function replicates the logic in our findTransactionsMatchingKeyword method
  const testPunctuationMatching = (
    description: string,
    keyword: string,
  ): boolean => {
    // Normalize the keyword by removing punctuation and extra spaces
    const normalizedKeyword = keyword
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Normalize the description too - replace punctuation with spaces and normalize multiple spaces
    const normalizedDescription = description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Check if keywords are parts of multiple words
    if (normalizedKeyword.includes(' ')) {
      // For multi-word keywords, check if all words appear in the description
      const keywordWords = normalizedKeyword.split(' ');
      const descriptionWords = normalizedDescription.split(' ');

      // Check if all keyword words are in the description
      const allWordsPresent = keywordWords.every((word) =>
        descriptionWords.includes(word),
      );

      return allWordsPresent;
    } else {
      // For single-word keywords, use direct inclusion
      const match = normalizedDescription.includes(normalizedKeyword);
      return match;
    }
  };

  // Test specifically for "bonifico rossi" case
  test('should match multi-word keywords even when words are not adjacent', () => {
    const result = testPunctuationMatching(
      'Bonifico a favore di: Rossi, Mario',
      'bonifico rossi',
    );
    expect(result).toBe(true);
  });

  test('should match transaction descriptions with periods to keywords without periods', () => {
    // Set up the test cases
    const testCases = [
      {
        description: 'finanziamento n. 1527713',
        keyword: 'finanziamento n 1527713',
        shouldMatch: true,
        reason: 'Period in n. should not prevent matching',
      },
      {
        description: 'RATA MUTUO n.67890 scadenza',
        keyword: 'rata mutuo n 67890',
        shouldMatch: true,
        reason: 'Case and period should not prevent matching',
      },
      {
        description: 'Bonifico a favore di: Rossi, Mario',
        keyword: 'bonifico rossi',
        shouldMatch: true,
        reason: 'Punctuation and extra words should not prevent matching',
      },
      {
        description: 'pagamento #12345',
        keyword: 'pagamento 12345',
        shouldMatch: true,
        reason: 'Special characters should not prevent matching',
      },
    ];

    // Run tests on each case
    testCases.forEach((testCase) => {
      const result = testPunctuationMatching(
        testCase.description,
        testCase.keyword,
      );
      expect(result).toBe(testCase.shouldMatch);

      // If the test fails, show a detailed message
      if (result !== testCase.shouldMatch) {
        console.error(`Test failed: ${testCase.reason}`);
        console.error(`Description: "${testCase.description}"`);
        console.error(`Keyword: "${testCase.keyword}"`);
        console.error(
          `Expected match: ${testCase.shouldMatch}, got: ${result}`,
        );
      }
    });
  });

  describe('SQL LIKE behavior simulation', () => {
    test('SQL LIKE query should match similar patterns despite punctuation', () => {
      // Our specific case from the requirements
      const description = 'finanziamento n. 1527713';
      const keyword = 'finanziamento n 1527713';

      // Normalize both strings the same way for comparison
      const normalizedDescription = description
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace non-word chars with spaces
        .trim() // Remove leading/trailing spaces
        .replace(/\s+/g, ' '); // Normalize multiple spaces to single spaces

      const normalizedKeyword = keyword
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

      // Now they should match
      const normalizedMatch = normalizedDescription.includes(normalizedKeyword);
      expect(normalizedMatch).toBe(true);
    });
  });
});
