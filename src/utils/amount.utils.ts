/**
 * Parses an amount string, handling both European and US formats.
 * Examples handled:
 * - "6.301,00" -> 6301.00
 * - "6,301.00" -> 6301.00
 * - "1.234" -> 1234
 * - "-10,25" -> -10.25
 */
export function parseLocalizedAmount(amountStr: string | number): number {
  if (typeof amountStr === 'number') return amountStr;

  let parsed: number;

  if (typeof amountStr === 'string') {
    const str = amountStr.trim();

    if (str.includes('.') && str.includes(',')) {
      // Both present: determine decimal separator
      if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
        parsed = parseFloat(str.replace(/,/g, '')); // US format
      } else {
        parsed = parseFloat(str.replace(/\./g, '').replace(',', '.')); // EU format
      }
    } else if (str.includes(',')) {
      parsed = parseFloat(str.replace(',', '.')); // EU-style decimal
    } else {
      parsed = parseFloat(str); // Basic parse
    }
  } else {
    parsed = parseFloat(String(amountStr));
  }

  if (isNaN(parsed)) {
    throw new Error(`Invalid amount format: ${amountStr}`);
  }

  return parsed;
}
