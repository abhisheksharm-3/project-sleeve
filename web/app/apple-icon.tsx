/** The home-screen icon: the favicon's building, drawn as a PNG because iOS ignores SVG icons. */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const LIT = "#f4b860";
const WINDOWS = [LIT, "rgb(244 184 96 / 0.35)", "#2c2c33", LIT];

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#000",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          width: 92,
          padding: "22px 14px",
          background: "#1d1d22",
          borderRadius: 8,
        }}
      >
        {WINDOWS.map((color, i) => (
          <div
            key={`w${i}`}
            style={{ width: 25, height: 32, borderRadius: 4, background: color }}
          />
        ))}
      </div>
    </div>,
    size,
  );
}
