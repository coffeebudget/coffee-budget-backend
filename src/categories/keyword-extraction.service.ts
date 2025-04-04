import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from './entities/category.entity';

@Injectable()
export class KeywordExtractionService {
  // Common words to exclude from keyword extraction
  private stopWords = new Set([
    'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
    'by', 'from', 'payment', 'purchase', 'transaction', 'card', 'debit', 'credit'
  ]);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  /**
   * Extract potential keywords from a transaction description
   */
  extractKeywords(description: string): string[] {
    if (!description) return [];
    
    // Normalize and split the description
    const words = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace non-alphanumeric with spaces
      .split(/\s+/)              // Split by whitespace
      .filter(word => 
        word.length > 2 &&       // Only words longer than 2 chars
        !this.stopWords.has(word) && // Not in stopwords
        !(/^\d+$/.test(word))    // Not just numbers
      );
    
    return [...new Set(words)];  // Remove duplicates
  }

  /**
   * Suggest keywords for a category based on existing transactions
   */
  async suggestKeywordsForCategory(categoryId: number, userId: number): Promise<string[]> {
    // Get transactions for this category
    const transactions = await this.transactionRepository.find({
      where: {
        category: { id: categoryId },
        user: { id: userId }
      }
    });

    if (transactions.length === 0) {
      return [];
    }

    // Extract keywords from all transactions
    const allKeywords = transactions
      .flatMap(tx => this.extractKeywords(tx.description))
      .reduce((counts, keyword) => {
        counts[keyword] = (counts[keyword] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

    // Sort by frequency and return top keywords
    return Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword]) => keyword);
  }

  /**
   * Find common keywords in uncategorized transactions
   */
  async findCommonKeywordsInUncategorized(userId: number): Promise<Record<string, number>> {
    const uncategorizedTransactions = await this.transactionRepository.find({
      where: {
        user: { id: userId },
        category: { id: IsNull() }
      }
    });

    // Extract and count keywords
    const keywordCounts: Record<string, number> = {};
    
    uncategorizedTransactions.forEach(tx => {
      const keywords = this.extractKeywords(tx.description);
      keywords.forEach(keyword => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    });

    // Return sorted by frequency
    return Object.fromEntries(
      Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
    );
  }
} 