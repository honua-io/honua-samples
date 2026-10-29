// Parcel numbers (TMK, Tax Map Key) and how search input is classified.
//
// Only nine validated digits ever reach a where clause (design R4): the
// separators people type (spaces, "-", ":" and ".") are stripped, and anything
// else is refused before a request is built. Another county with a different
// parcel-number length changes TMK_PATTERN and formatTmk, nothing else.

export const TMK_PATTERN = /^[0-9]{9}$/u;
export const INVALID_TMK_MESSAGE = "Not a valid TMK (9 digits, e.g. 215010777)";

/** Nine digits, or null when the input is not a TMK. */
export function normalizeTmk(input: string): string | null {
  const digits = input.replace(/[\s\-:.]/gu, "");
  return TMK_PATTERN.test(digits) ? digits : null;
}

/** 215010777 → "2-1-5-010:777" (zone-section-plat-plat:parcel). */
export function formatTmk(digits: string): string {
  return `${digits[0]}-${digits[1]}-${digits[2]}-${digits.slice(3, 6)}:${digits.slice(6, 9)}`;
}

/** The where clause for one parcel. Accepts only validated digits. */
export function tmkWhere(digits: string): string {
  if (!TMK_PATTERN.test(digits)) throw new Error(INVALID_TMK_MESSAGE);
  return `tmk_txt='${digits}'`;
}

export type SearchInput =
  | { kind: "tmk"; digits: string }
  | { kind: "address"; text: string }
  | { kind: "invalid" };

// Characters a street address uses. Quotes, semicolons, "=" and the like are
// not here, so text such as "abc'; or 1=1" is a bad TMK, not an address.
const ADDRESS_PATTERN = /^[\p{L}\p{M}0-9\s.,#/&ʻ'-]+$/u;

/**
 * Digits and TMK separators only → a TMK (valid or not). Text with a word of
 * two or more letters, in address characters → an address. Anything else is
 * an invalid TMK, and no request is sent.
 */
export function classifySearch(raw: string): SearchInput {
  const text = raw.trim();
  if (/^[0-9\s\-:.]+$/u.test(text)) {
    const digits = normalizeTmk(text);
    return digits ? { kind: "tmk", digits } : { kind: "invalid" };
  }
  if (/\p{L}{2,}/u.test(text) && ADDRESS_PATTERN.test(text) && !/'.*'/u.test(text)) return { kind: "address", text };
  return { kind: "invalid" };
}
