/**
 * A compact widget for an iframe on someone's own site: the overall state and a link to
 * the full page. Published pages only; anything else renders nothing.
 */
import type { Metadata } from "next";
import { loadStatusPage } from "@/lib/status-page";
import { OVERALL_WORDS } from "@/lib/status-words";

export const metadata: Metadata = { robots: { index: false } };

export default async function StatusEmbed({ params }: PageProps<"/s/[slug]/embed">) {
  const { slug } = await params;
  const page = await loadStatusPage(slug, null);
  if (!page) return null;
  const words = OVERALL_WORDS[page.overall];
  return (
    <a
      href={`/s/${slug}`}
      target="_blank"
      rel="noopener"
      className="flex h-full min-h-12 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3 hover:border-alive/50"
    >
      <span
        aria-hidden
        className="h-5 w-3.5 shrink-0 rounded-[2px]"
        style={{ background: words.color }}
      />
      <span className="min-w-0 text-sm">
        <span className="block truncate font-semibold">{page.title}</span>
        <span className="block truncate" style={{ color: words.color }}>
          {words.text}
        </span>
      </span>
    </a>
  );
}
