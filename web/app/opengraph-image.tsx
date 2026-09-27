/** The link preview: the landing headline over the same skyline the landing page draws. */
import { ImageResponse } from "next/og";
import { BUILDINGS, DARK, UNLIT } from "./components/skyline";

export const alt = "ProjectSleeve keeps free-tier backends awake.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Keeping the lights on for the projects you are not touching.";
const WORDMARK = "ProjectSleeve";

/**
 * Bricolage Grotesque, subset by Google Fonts to just the characters drawn here.
 *
 * ponytail: fetched at build time, so a build without network fails here; vendor the TTF
 * into the repo if builds must run offline.
 */
async function bricolage(): Promise<ArrayBuffer> {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600&text=${encodeURIComponent(HEADLINE + WORDMARK)}`,
    )
  ).text();
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error("Google Fonts returned no font URL for the OG image.");
  return (await fetch(url)).arrayBuffer();
}

const LIT = "#f4b860";

function windowColor(key: string): string {
  return key === DARK || UNLIT.has(key) ? "#1d1d22" : LIT;
}

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        background: "#000",
        color: "#e9e4d8",
        fontFamily: "Bricolage",
        padding: "56px 64px 0",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30, color: "#f4b860" }}>{WORDMARK}</div>
        <div style={{ marginTop: 28, fontSize: 62, lineHeight: 1.06 }}>{HEADLINE}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: "2px solid #26262c",
        }}
      >
        {BUILDINGS.slice(0, 11).map((b, bi) => (
          <div
            key={b.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              width: b.cols * 10 + (b.cols - 1) * 6 + 16,
              padding: 8,
              background: "#0d0d0f",
              borderTop: "1px solid #26262c",
            }}
          >
            {Array.from({ length: b.rows * b.cols }, (_, i) => {
              const key = `${bi}-${Math.floor(i / b.cols)}-${i % b.cols}`;
              return (
                <div
                  key={key}
                  style={{
                    width: 10,
                    height: 14,
                    borderRadius: 2,
                    background: windowColor(key),
                    boxShadow: windowColor(key) === LIT ? "0 0 8px rgb(244 184 96 / 0.45)" : "none",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: [{ name: "Bricolage", data: await bricolage(), weight: 600 }] },
  );
}
