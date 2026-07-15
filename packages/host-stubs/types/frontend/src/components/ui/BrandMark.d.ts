import type { JSX } from "react";
export type BrandKey = "google" | "telegram" | "x" | "linkedin";
export interface BrandMarkProps {
    readonly brand: BrandKey;
    readonly size?: number;
}
/**
 * Circular brand glyph shared by the Extensions catalog and the
 * Settings → Add Account picker. Extend by adding a new case below.
 */
export declare function BrandMark({ brand, size }: BrandMarkProps): JSX.Element;
export declare function resolveBrand(id: string): BrandKey | undefined;
