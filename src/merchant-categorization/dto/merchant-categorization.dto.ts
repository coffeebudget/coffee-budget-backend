import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CategorizationSource {
  AI = 'ai',
  CACHE = 'cache',
  MERCHANT_DB = 'merchant_db',
  KEYWORD = 'keyword',
  MANUAL = 'manual',
  NONE = 'none',
}

export enum CategorizationMethod {
  MERCHANT_AI = 'merchant_ai',
  AI_CATEGORIZATION = 'ai_categorization',
  AI_FALLBACK = 'ai_fallback',
  KEYWORD_MATCH = 'keyword_match',
  USER_SELECTED = 'user_selected',
  NO_MATCH = 'no_match',
}

export class CategorizationResult {
  @ApiProperty()
  categoryId: number;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  confidence: number;

  @ApiProperty({ enum: CategorizationSource })
  source: CategorizationSource;

  @ApiProperty({ enum: CategorizationMethod })
  method: CategorizationMethod;

  @ApiProperty()
  timestamp: Date;
}

export class EnhancedTransactionData {
  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  description: string;

  @ApiProperty({ required: false })
  merchantName?: string;

  @ApiProperty({ required: false })
  merchantCategoryCode?: string;

  @ApiProperty()
  merchantType: 'debtor' | 'creditor' | 'unknown';

  @ApiProperty()
  enhancedDescription: string;
}

export class CategorizationOptions {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  enableMerchantAI?: boolean = true;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  enableAIFallback?: boolean = true;

  @ApiProperty({ required: false, default: 70 })
  @IsOptional()
  @IsNumber()
  merchantConfidenceThreshold?: number = 70;

  @ApiProperty({ required: false, default: 60 })
  @IsOptional()
  @IsNumber()
  aiFallbackThreshold?: number = 60;
}

export class MerchantCategorizationRequest {
  @ApiProperty()
  @IsString()
  merchantName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  merchantCategoryCode?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategorizationOptions)
  options?: CategorizationOptions;
}

export class MerchantCategorizationResponse {
  @ApiProperty()
  @ValidateNested()
  @Type(() => CategorizationResult)
  result: CategorizationResult;

  @ApiProperty()
  @IsString()
  merchantName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  merchantCategoryCode?: string;

  @ApiProperty()
  @IsNumber()
  processingTimeMs: number;

  @ApiProperty()
  @IsString()
  cacheStatus: 'hit' | 'miss' | 'bypass';
}
