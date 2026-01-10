export interface SimilarityScore {
  categoryMatch: number; // 0-100
  merchantMatch: number; // 0-100
  descriptionMatch: number; // 0-100
  amountSimilarity: number; // 0-100
  total: number; // Weighted sum (0-100)
}

export interface SimilarityWeights {
  category: number; // 0.35 (35%)
  merchant: number; // 0.30 (30%)
  description: number; // 0.25 (25%)
  amount: number; // 0.10 (10%)
}

export const DEFAULT_SIMILARITY_WEIGHTS: SimilarityWeights = {
  category: 0.35,
  merchant: 0.3,
  description: 0.25,
  amount: 0.1,
};
