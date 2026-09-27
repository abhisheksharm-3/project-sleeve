/** A status page's link preview: its title, overall state and the first backends' 30 days. */
import { ImageResponse } from "next/og";
import { loadStatusPage } from "@/lib/status-page";
import { OVERALL_WORDS } from "@/lib/status-words";

export const alt = "Live status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CELL = { up: "#f4b860", partial: "#6b5433", down: "#e26d5a", none: "#1d1d22" };

/** ponytail: fetched per render; vendor the TTF if previews must render without Google Fonts. */
async function instrument(text: string): Promise<ArrayBuffer | null> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600&text=${encodeURIComponent(text)}`,
  )
    .then((r) => r.text())
    .catch(() => "");
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  return url ? fetch(url).then((r) => r.arrayBuffer()) : null;
}

export default async function StatusOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const page = await loadStatusPage((await params).slug, null);
  const title = page?.title ?? "Status page";
  const words = page ? OVERALL_WORDS[page.overall] : OVERALL_WORDS.empty;
  const rows = (page?.items ?? []).slice(0, 4);
  const font = await instrument(
    `${title}${words.text}${rows.map((r) => r.label).join("")}ProjectSleeve0123456789%`,
  );

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#000",
        color: "#e9e4d8",
        padding: "56px 64px",
        fontFamily: font ? "Instrument" : "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 26, color: "#9b9ba4" }}>Status</div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 64, lineHeight: 1.05 }}>{title}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 20,
          fontSize: 32,
          color: words.color,
        }}
      >
        <div
          style={{
            width: 22,
            height: 30,
            borderRadius: 4,
            background: words.color,
            marginRight: 16,
          }}
        />
        {words.text}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}>
              <span>{r.label}</span>
              <span style={{ color: "#9b9ba4" }}>
                {page?.showUptime && r.uptime.d30 !== null ? `${r.uptime.d30}%` : ""}
              </span>
            </div>
            <div style={{ display: "flex", marginTop: 8 }}>
              {r.cells.slice(-30).map((c) => (
                <div
                  key={c.day}
                  style={{
                    flex: 1,
                    height: 18,
                    marginRight: 4,
                    borderRadius: 2,
                    background: CELL[c.state],
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: font ? [{ name: "Instrument", data: font, weight: 600 }] : undefined },
  );
}
