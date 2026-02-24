import { ValueTransformer } from 'typeorm';
import { encrypt, decrypt, encryptJson, decryptJson } from './encryption.util';

export const encryptedTransformer: ValueTransformer = {
  to: (value: string | null | undefined): string | null => encrypt(value),
  from: (value: string | null | undefined): string | null => decrypt(value),
};

export const encryptedJsonTransformer: ValueTransformer = {
  to: (value: any | null | undefined): string | null => encryptJson(value),
  from: (value: string | null | undefined): any | null => decryptJson(value),
};
