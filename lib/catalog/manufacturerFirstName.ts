/**
 * Manufacturer-first product naming, for every list a human picks a product from.
 *
 * Jireh Billings, 2026-08-24, looking at the Product dropdown in the LA Sparks HQ
 * scoping workbook: "Can we get the products organized alphabetically and named
 * with manufacturers name first? There is a lot of OES equipment that is all over
 * the place."
 *
 * He is right, and the reason is in the catalog itself. The two halves of it are
 * named by different conventions:
 *
 *   OES scoring equipment is named by what it is   — '42" Shot Clock System (Outdoor)'
 *   LED lines are named by model, vendor trailing  — 'C4 Corona FM (Yaham)'
 *
 * Sorted by those raw names, the 44 OES items land between rows 2 and 164 of a
 * 181-row list — interleaved with LED product — and the two LED vendors alternate
 * model by model ('C4 Corona FM (LG USA)', 'C4 Corona FM (Yaham)', …). Leading with
 * the manufacturer makes one plain alphabetical sort group the list by vendor,
 * which is the order a human actually reads it in.
 *
 * The name this produces is also the VLOOKUP key inside the generated workbook, so
 * two products must never share one — a collision would make Excel return the first
 * product's pitch, cost and geometry for both. `labelProducts` is the entry point
 * that guarantees uniqueness; `manufacturerFirstName` alone does not.
 */

/** Manufacturers are written with a slash as often as a space: "LG/Yaham". */
const BRAND_SEPARATOR = /[\s/]+/;

function words(value: string): string[] {
    return value.trim().split(BRAND_SEPARATOR).filter(Boolean);
}

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.localeCompare(b, "en", { sensitivity: "base" }) === 0;
}

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Drop the vendor out of a trailing parenthetical, because it is about to lead the
 * name instead: 'C4 Corona FM (Yaham)' → 'C4 Corona FM'.
 *
 * A parenthetical that only STARTS with the vendor keeps the rest of itself —
 * '2.5mm Indoor (Nationstar MIP)' → '2.5mm Indoor (MIP)'. MIP is the packaging
 * technology, not a repetition of the brand, and dropping it would lose a spec.
 */
function liftVendorOutOfSuffix(name: string, manufacturer: string): string {
    const vendor = escapeForRegExp(manufacturer.trim());
    const wholeSuffix = new RegExp(`\\s*\\(${vendor}\\)\\s*$`, "i");
    if (wholeSuffix.test(name)) return name.replace(wholeSuffix, "").trim();

    const leadingInSuffix = new RegExp(`(\\(\\s*)${vendor}\\s+(?=[^)]*\\)\\s*$)`, "i");
    if (leadingInSuffix.test(name)) return name.replace(leadingInSuffix, "$1").trim();

    return name.trim();
}

/**
 * Join vendor and name without stuttering across the seam.
 *
 * Manufacturer "ANC Courtside Table" + name "Courtside Table 2.9mm 10'" is not
 * "ANC Courtside Table Courtside Table 2.9mm 10'" — the longest run of words the
 * end of the vendor shares with the start of the name is written once.
 */
function joinWithoutRepeat(manufacturer: string, name: string): string {
    const vendorWords = words(manufacturer);
    const nameWords = name.split(/\s+/).filter(Boolean);

    for (let overlap = Math.min(vendorWords.length, nameWords.length); overlap > 0; overlap--) {
        const vendorTail = vendorWords.slice(-overlap);
        const nameHead = nameWords.slice(0, overlap);
        if (vendorTail.every((word, i) => equalsIgnoreCase(word, nameHead[i]))) {
            return [...vendorWords, ...nameWords.slice(overlap)].join(" ");
        }
    }

    return `${manufacturer.trim()} ${name}`.trim();
}

/**
 * The name a human should read in a picker: manufacturer first, then the product.
 *
 * A name that already leads with the brand is returned untouched — 'LG 55UH5J-H 55"
 * TV' is stored against manufacturer "LG TV" and must not become 'LG TV LG 55UH5J-H
 * 55" TV'. The test is the brand's first word, so "LG", "LG TV" and "LG USA" all
 * recognise a name that opens with "LG".
 */
export function manufacturerFirstName(
    rawName: string | null | undefined,
    manufacturer: string | null | undefined,
): string {
    const name = (rawName ?? "").trim();
    const vendor = (manufacturer ?? "").trim();
    if (!name) return "";
    if (!vendor) return name;

    const base = liftVendorOutOfSuffix(name, vendor);
    if (!base) return vendor;

    const brand = words(vendor)[0];
    const firstWordOfName = base.split(/\s+/)[0] ?? "";
    if (brand && equalsIgnoreCase(brand, firstWordOfName)) return base;

    return joinWithoutRepeat(vendor, base);
}

/**
 * Alphabetical the way a person means it: "4mm" before "17mm" before "42mm", and
 * case is not a sort key. A plain localeCompare puts '19"' ahead of '2"' because it
 * compares digit by digit, which is exactly the "all over the place" Jireh is
 * looking at inside the OES block.
 */
const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });

export function compareProductNames(a: string, b: string): number {
    return COLLATOR.compare(a, b);
}

export interface NamedProduct {
    name: string | null | undefined;
    manufacturer?: string | null;
}

/**
 * Label a whole catalog at once, positionally, with every label distinct.
 *
 * Uniqueness is not cosmetic here: the label is the lookup key in the exported
 * workbook, so two products sharing one would silently price the second at the
 * first one's rate. A product whose manufacturer-first label is already taken keeps
 * its own raw name instead of being merged into someone else's row; if even that
 * collides, the raw name is already the pre-existing behaviour and the catalog has
 * a genuine duplicate to resolve upstream.
 */
export function labelProducts(products: NamedProduct[]): string[] {
    const taken = new Set<string>();
    const labels: string[] = [];

    for (const product of products) {
        const raw = (product.name ?? "").trim();
        const preferred = manufacturerFirstName(raw, product.manufacturer);
        const label = preferred && !taken.has(preferred.toLowerCase()) ? preferred : raw;
        taken.add(label.toLowerCase());
        labels.push(label);
    }

    return labels;
}
