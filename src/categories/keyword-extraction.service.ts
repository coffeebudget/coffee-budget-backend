import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from './entities/category.entity';
import * as natural from 'natural';

@Injectable()
export class KeywordExtractionService {
  private readonly logger = new Logger(KeywordExtractionService.name);
  private readonly tokenizer = new natural.WordTokenizer();
  private readonly stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'on', 'at', 'to', 'by', 
    'from', 'in', 'of', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'under', 'over', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's',
    't', 'can', 'will', 'just', 'don', 'should', 'now', 'id', 'var', 'function',
    'js', 'rev', 'net', 'org', 'com', 'edu', 'payment', 'purchase', 'transaction'
  ]);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  /**
   * Extract keywords from a text, including multi-word phrases
   */
  extractKeywords(text: string): string[] {
    if (!text) return [];
    
    const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    // Extract single words
    const tokens = this.tokenizer.tokenize(normalizedText) || [];
    const singleWords = tokens
      .filter(token => token.length > 2 && !this.stopWords.has(token.toLowerCase()))
      .map(token => token.toLowerCase());
    
    // Extract multi-word phrases (2-3 words)
    const phrases: string[] = [];
    
    // Extract 2-word phrases
    for (let i = 0; i < tokens.length - 1; i++) {
      if (!this.stopWords.has(tokens[i].toLowerCase()) && !this.stopWords.has(tokens[i+1].toLowerCase())) {
        phrases.push(`${tokens[i].toLowerCase()} ${tokens[i+1].toLowerCase()}`);
      }
    }
    
    // Extract 3-word phrases
    for (let i = 0; i < tokens.length - 2; i++) {
      if (!this.stopWords.has(tokens[i].toLowerCase()) && 
          !this.stopWords.has(tokens[i+2].toLowerCase())) {
        phrases.push(`${tokens[i].toLowerCase()} ${tokens[i+1].toLowerCase()} ${tokens[i+2].toLowerCase()}`);
      }
    }
    
    // Combine single words and phrases
    return [...new Set([...singleWords, ...phrases])];
  }

  /**
   * Find common keywords in uncategorized transactions
   */
  async findCommonKeywordsInUncategorized(userId: number): Promise<Record<string, number>> {
    const uncategorizedTransactions = await this.transactionsRepository.find({
      where: {
        user: { id: userId },
        category: IsNull(),
      },
      take: 100, // Limit to prevent performance issues
    });

    const keywordFrequency: Record<string, number> = {};

    for (const transaction of uncategorizedTransactions) {
      if (transaction.description) {
        const keywords = this.extractKeywords(transaction.description);
        
        for (const keyword of keywords) {
          keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
        }
      }
    }

    // Filter out keywords that appear only once
    return Object.fromEntries(
      Object.entries(keywordFrequency)
        .filter(([_, count]) => count > 1)
        .sort(([_, countA], [__, countB]) => countB - countA)
    );
  }

  /**
   * Suggest keywords for a category based on its transactions
   */
  async suggestKeywordsForCategory(categoryId: number, userId: number): Promise<string[]> {
    // Get transactions for this category
    const transactions = await this.transactionsRepository.find({
      where: {
        category: { id: categoryId },
        user: { id: userId },
      },
      take: 50, // Limit to prevent performance issues
    });

    if (transactions.length === 0) {
      return [];
    }

    // Extract keywords from all transactions
    const keywordFrequency: Record<string, number> = {};
    
    for (const transaction of transactions) {
      if (transaction.description) {
        const keywords = this.extractKeywords(transaction.description);
        
        for (const keyword of keywords) {
          keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
        }
      }
    }

    // Calculate the percentage of transactions that contain each keyword
    const keywordPercentages = Object.entries(keywordFrequency).map(([keyword, count]) => {
      return {
        keyword,
        percentage: (count / transactions.length) * 100
      };
    });

    // Sort by percentage and return keywords that appear in at least 30% of transactions
    return keywordPercentages
      .filter(item => item.percentage >= 30)
      .sort((a, b) => b.percentage - a.percentage)
      .map(item => item.keyword);
  }
} 