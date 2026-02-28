/**
 * Multi-Currency Support — P76
 *
 * USD/CAD/EUR/GBP currency selector with symbol display and conversion.
 * Default: USD. Conversion rates are approximate and should be updated periodically.
 */

// ============================================================================
// TYPES
// ============================================================================

export type CurrencyCode = "USD" | "CAD" | "EUR" | "GBP";

export interface Currency {
    code: CurrencyCode;
    symbol: string;
    name: string;
    locale: string;
    rateToUSD: number; // 1 unit of this currency = X USD
}

// ============================================================================
// CURRENCIES
// ============================================================================

export const CURRENCIES: Record<CurrencyCode, Currency> = {
    USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", rateToUSD: 1.0 },
    CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA", rateToUSD: 0.74 },
    EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", rateToUSD: 1.08 },
    GBP: { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", rateToUSD: 1.27 },
};

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a USD amount in the target currency.
 */
export function formatInCurrency(amountUSD: number, currencyCode: CurrencyCode = "USD"): string {
    const currency = CURRENCIES[currencyCode];
    const converted = convertFromUSD(amountUSD, currencyCode);

    return new Intl.NumberFormat(currency.locale, {
        style: "currency",
        currency: currency.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(converted);
}

/**
 * Convert a USD amount to target currency.
 */
export function convertFromUSD(amountUSD: number, targetCurrency: CurrencyCode): number {
    if (targetCurrency === "USD") return amountUSD;
    const rate = CURRENCIES[targetCurrency].rateToUSD;
    return amountUSD / rate;
}

/**
 * Convert an amount from one currency to another.
 */
export function convertCurrency(
    amount: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
): number {
    if (fromCurrency === toCurrency) return amount;
    // Convert to USD first, then to target
    const amountUSD = amount * CURRENCIES[fromCurrency].rateToUSD;
    return amountUSD / CURRENCIES[toCurrency].rateToUSD;
}

/**
 * Get the currency symbol for display.
 */
export function getCurrencySymbol(currencyCode: CurrencyCode): string {
    return CURRENCIES[currencyCode]?.symbol || "$";
}

/**
 * Get all available currencies as options for a select dropdown.
 */
export function getCurrencyOptions(): Array<{ value: CurrencyCode; label: string }> {
    return Object.values(CURRENCIES).map((c) => ({
        value: c.code,
        label: `${c.symbol} ${c.code} — ${c.name}`,
    }));
}

// ============================================================================
// EXCEL numFmt — single source of truth for Excel cell formatting
// ============================================================================

const EXCEL_NUM_FMT: Record<CurrencyCode, string> = {
    USD: '"$"#,##0',
    CAD: '"C$"#,##0',
    EUR: '"€"#,##0',
    GBP: '"£"#,##0',
};

/**
 * Excel numFmt string for currency cells. No decimals — these are estimates, not invoices.
 */
export function excelCurrencyFmt(currency?: string): string {
    if (currency && currency in EXCEL_NUM_FMT) return EXCEL_NUM_FMT[currency as CurrencyCode];
    return EXCEL_NUM_FMT.USD;
}

/**
 * Format a number as currency text (for Excel text cells, headers, etc.).
 */
export function excelCurrencyText(value: number, currency?: string): string {
    const code = (currency && currency in CURRENCIES ? currency : "USD") as CurrencyCode;
    const c = CURRENCIES[code];
    return new Intl.NumberFormat(c.locale, {
        style: "currency",
        currency: c.code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}
