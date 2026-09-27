"use client";
/** The header's section links, underlined in lamplight on the section you are in. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; match: string[] };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="flex h-full items-stretch gap-6 overflow-x-auto">
      {items.map((item) => {
        const active = item.match.some((m) => path === m || path.startsWith(`${m}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center border-b-2 pt-0.5 text-sm transition-colors ${
              active ? "border-alive text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
