/** How a status page's overall state reads to visitors, shared by the page, images and embeds. */
import type { Overall } from "./status-page";

export const OVERALL_WORDS: Record<Overall, { text: string; short: string; color: string }> = {
  up: { text: "Everything is up.", short: "up", color: "#f4b860" },
  degraded: {
    text: "Mostly up. A backend failed its latest check.",
    short: "mostly up",
    color: "#f2c98a",
  },
  partial: { text: "Some of this is down.", short: "partly down", color: "#e26d5a" },
  down: { text: "Everything here is down.", short: "down", color: "#e26d5a" },
  empty: { text: "Nothing is on this page yet.", short: "empty", color: "#9b9ba4" },
};
