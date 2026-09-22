/**
 * Money utilities.
 *
 * All monetary values are stored as integers in the smallest currency unit
 * (kobo for NGN). This avoids floating point errors in any financial math.
 * Amounts are converted to/from the user-facing decimal form only at the
 * boundaries (forms, display, API input parsing).
 */

export const CURRENCY = "NGN";
export const CURRENCY_SYMBOL = "₦";

export const koboPerNaira = 100;

/** Convert a user-supplied Naira amount (may be fractional) to kobo. */
export function toKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) {
    throw new Error("Invalid money amount");
  }
  return Math.round(naira * koboPerNaira);
}

/** Convert stored kobo to a Naira decimal number. */
export function toNaira(kobo: number): number {
  return kobo / koboPerNaira;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₦2,450.00" from a kobo amount. */
export function formatMoney(kobo: number): string {
  return nairaFormatter.format(toNaira(kobo));
}

/** Signed representation for transactions: "+₦10.00". */
export function formatSignedMoney(kobo: number): string {
  const sign = kobo > 0 ? "+" : kobo < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(kobo))}`;
}

export function compactMoney(kobo: number): string {
  return nairaFormatter.format(toNaira(kobo));
}