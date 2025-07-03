import { Injectable } from '@nestjs/common';
import { BaseParser } from './base-parser';
import { Transaction } from '../transaction.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import {
  TransactionDto,
  TransactionsResponseDto,
} from '../../gocardless/dto/gocardless.dto';

@Injectable()
export class GocardlessParser extends BaseParser {
  /**
   * Parse GoCardless transaction data into internal transaction format
   */
  async parseTransactions(
    gocardlessData: TransactionsResponseDto,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      userId: number;
    },
  ): Promise<Partial<Transaction>[]> {
    const transactions: Partial<Transaction>[] = [];

    // Process booked transactions
    for (const tx of gocardlessData.transactions.booked) {
      const parsedTransaction = this.parseTransaction(tx, options);
      if (parsedTransaction) {
        transactions.push(parsedTransaction);
      }
    }

    // Process pending transactions (optional - you might want to handle these differently)
    for (const tx of gocardlessData.transactions.pending) {
      const parsedTransaction = this.parseTransaction(tx, options, true);
      if (parsedTransaction) {
        transactions.push(parsedTransaction);
      }
    }

    return transactions;
  }

  private parseTransaction(
    tx: TransactionDto,
    options: {
      bankAccountId?: number;
      creditCardId?: number;
      userId: number;
    },
    isPending: boolean = false,
  ): Partial<Transaction> | null {
    try {
      const amount = parseFloat(tx.transactionAmount.amount);

      // Skip transactions with zero amount
      if (amount === 0) {
        return null;
      }

      const transaction: Partial<Transaction> & { tagNames?: string[] } = {
        amount: Math.abs(amount),
        description: this.buildEnhancedDescription(tx),
        executionDate: new Date(tx.bookingDate || tx.valueDate),
        type: amount > 0 ? 'income' : 'expense',
        source: 'gocardless',
        status: isPending ? 'pending' : 'executed',
        tagNames: this.extractTags(tx), // Custom property for tag processing
        transactionIdOpenBankAPI: tx.transactionId, // GoCardless unique transaction ID
      };

      // Set bank account or credit card
      if (options.bankAccountId) {
        transaction.bankAccount = { id: options.bankAccountId } as BankAccount;
      } else if (options.creditCardId) {
        transaction.creditCard = { id: options.creditCardId } as CreditCard;
      }

      // Add pending status to description if applicable
      if (isPending) {
        transaction.description = `[PENDING] ${transaction.description}`;
      }

      // Let the main categorization system handle category suggestions
      // instead of using hardcoded rules here

      return transaction;
    } catch (error) {
      console.error('Error parsing GoCardless transaction:', error, tx);
      return null;
    }
  }

  private cleanDescription(description: string): string {
    if (!description) return 'Bank Transaction';

    // Clean and normalize the description
    let cleaned = description.trim().replace(/\s+/g, ' ');

    // Special handling for PayPal transactions - only for actual PayPal payment formats
    // Only process descriptions that match PayPal transaction patterns (with *)
    if (cleaned.match(/paypal.*?\*/i)) {
      // Try to extract merchant information from PayPal descriptions
      // Common patterns: "PAYPAL *MERCHANTNAME", "PAYPAL INST XFER *MERCHANT"
      const paypalMerchantMatch = cleaned.match(/paypal.*?\*([^*\s]+)/i);
      if (paypalMerchantMatch) {
        const merchantName = paypalMerchantMatch[1].trim();
        if (merchantName && merchantName.length > 3) {
          // Use only the merchant name, not "PayPal - Merchant"
          cleaned = merchantName;
        }
      }
      // If no valid merchant found, keep the original description
      // Don't remove PayPal references from non-transaction mentions
    }

    return cleaned.substring(0, 255); // Limit length
  }

  private buildEnhancedDescription(tx: TransactionDto): string {
    const descriptions: string[] = [];
    const amount = parseFloat(tx.transactionAmount.amount);

    // Get merchant name (creditor for expenses, debtor for income)
    let merchantName = '';
    if (amount < 0 && tx.creditorName) {
      // For expenses, use creditor name (who we paid to)
      merchantName = tx.creditorName.trim();
    } else if (amount > 0 && tx.debtorName) {
      // For income, use debtor name (who paid us)
      merchantName = tx.debtorName.trim();
    }

    // Collect other description sources
    const otherDescriptions: string[] = [];

    if (tx.remittanceInformationUnstructured) {
      otherDescriptions.push(tx.remittanceInformationUnstructured);
    }

    if (tx.remittanceInformationStructured) {
      otherDescriptions.push(tx.remittanceInformationStructured);
    }

    if (tx.additionalInformation) {
      otherDescriptions.push(tx.additionalInformation);
    }

    if (
      tx.remittanceInformationUnstructuredArray &&
      tx.remittanceInformationUnstructuredArray.length > 0
    ) {
      otherDescriptions.push(...tx.remittanceInformationUnstructuredArray);
    }

    // Check if other descriptions are meaningful (not generic bank codes or short text)
    const meaningfulOtherInfo = otherDescriptions.some(
      (desc) =>
        desc &&
        desc.trim().length > 10 &&
        !desc.match(/^[A-Z0-9\s\-_]{1,15}$/i) && // Not just short codes
        !desc.toLowerCase().includes('bank transaction') &&
        !desc.toLowerCase().includes('instant transfer'),
    );

    // Build final description with merchant name prominently placed
    if (merchantName) {
      // Always start with merchant name
      descriptions.push(merchantName);

      // Add other meaningful information if available
      if (meaningfulOtherInfo) {
        descriptions.push(
          ...otherDescriptions.filter((desc) => desc && desc.trim()),
        );
      }
    } else {
      // No merchant name available, use other descriptions
      descriptions.push(
        ...otherDescriptions.filter((desc) => desc && desc.trim()),
      );
    }

    // Combine all descriptions
    let finalDescription = descriptions
      .filter((desc) => desc && desc.trim())
      .join(' | ')
      .trim();

    // Add merchant category code if available and not already mentioned
    if (
      tx.merchantCategoryCode &&
      !finalDescription.toLowerCase().includes('merchant') &&
      !finalDescription.toLowerCase().includes('mcc')
    ) {
      finalDescription += ` (MCC: ${tx.merchantCategoryCode})`;
    }

    // Fallback descriptions if we still don't have good info
    if (!finalDescription || finalDescription.length < 5) {
      if (tx.endToEndId) {
        finalDescription = `Transaction: ${tx.endToEndId}`;
      } else if (tx.bankTransactionCode) {
        finalDescription = `Bank Transaction: ${tx.bankTransactionCode}`;
      } else {
        finalDescription = 'Bank Transaction';
      }
    }

    return this.cleanDescription(finalDescription);
  }

  private extractTags(tx: TransactionDto): string[] {
    const tags: string[] = [];

    // Add tag based on transaction type
    if (tx.bankTransactionCode) {
      tags.push(`bank_code_${tx.bankTransactionCode.toLowerCase()}`);
    }

    // Add tag for payment method
    if (tx.debtorName) {
      tags.push('external_transfer');
    } else {
      tags.push('bank_transaction');
    }

    // Add currency tag if not EUR
    if (tx.transactionAmount.currency !== 'EUR') {
      tags.push(`currency_${tx.transactionAmount.currency.toLowerCase()}`);
    }

    // Add GoCardless source tag
    tags.push('gocardless_import');

    return tags;
  }

  // Required by BaseParser interface but not used for GoCardless
  async parseFile(): Promise<Partial<Transaction>[]> {
    throw new Error(
      'GoCardless parser does not support file parsing. Use parseTransactions() instead.',
    );
  }
}
