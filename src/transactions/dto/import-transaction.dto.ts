export class ImportTransactionDto {
  csvData?: string; // Può essere opzionale, se stai inviando contenuto XLS, TXT, ecc.
  dateFormat?: string;
  fileName?: string;

  columnMappings?: {
    description: string;
    amount: string;
    executionDate: string;
    type: string;
    categoryName: string;
    tagNames: string;
  };

  bankAccountId?: number;
  creditCardId?: number;

  // 🆕 Nuovo campo opzionale per auto-detect dei formati bancari
  bankFormat?: 'webank' | 'fineco' | 'bnl_txt' | 'bnl_xls';
}
