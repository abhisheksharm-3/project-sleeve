/** Status page addresses: lowercase letters, digits and inner hyphens, 3 to 40 long. */

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function isSlug(value: string): boolean {
  return SLUG.test(value);
}

/** A best-effort slug from free text, or "" when nothing usable is left. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return isSlug(slug) ? slug : "";
}
