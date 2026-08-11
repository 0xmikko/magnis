/**
 * Return a media URL that is meaningful for the browser to fetch.
 *
 * Demo fixtures use RFC-reserved `.example` hosts to retain synthetic
 * provenance without pointing at real people or infrastructure. Rendering
 * those placeholders as image sources would still trigger DNS requests and
 * noisy browser errors, so treat them as absent media.
 */
export declare function renderableMediaUrl(url: string | null): string | null;
