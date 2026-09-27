/** Turns an open alert into the email a person reads. Pure: no clock or network of its own. */

export type Alert = {
  alert_id: number;
  kind: "failing" | "pause_soon" | "paused";
  email: string;
  project_name: string;
  url: string;
  platform: string;
  last_ok_at: string | null;
  pause_at: string | null;
  failures: number;
};

export type Email = { to: string; subject: string; text: string };

function span(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

function shortName(project: string): string {
  return project.split("/").pop() ?? project;
}

function lastGood(alert: Alert): string {
  return alert.last_ok_at
    ? `The last good ping was ${new Date(alert.last_ok_at).toUTCString()}.`
    : "There has been no good ping in 30 days.";
}

/**
 * Status, deadlines and the target URL only. The target's secret and anything a ping
 * returned are never part of an alert (spec §8).
 */
export function composeEmail(alert: Alert, siteUrl: string, now: number): Email {
  const name = shortName(alert.project_name);
  const left = alert.pause_at ? span(Date.parse(alert.pause_at) - now) : null;
  const footer =
    `\n\nTarget: ${alert.url}\nDashboard: ${siteUrl}/dashboard\n\nTurn these emails off from the dashboard.`;

  if (alert.kind === "failing") {
    return {
      to: alert.email,
      subject: `${name}: keep-alive is failing`,
      text: `${alert.failures} pings in a row to ${name} have failed. ${lastGood(alert)}` +
        (left ? ` If nothing succeeds, ${alert.platform} could pause it in about ${left}.` : "") +
        footer,
    };
  }
  if (alert.kind === "pause_soon") {
    return {
      to: alert.email,
      subject: `${name} may pause within 48 hours`,
      text:
        `${
          lastGood(alert)
        } ${alert.platform} pauses a free project after a stretch of inactivity, and ${name} has about ${left} left.` +
        footer,
    };
  }
  return {
    to: alert.email,
    subject: `${name} has probably paused`,
    text:
      `${
        lastGood(alert)
      } That is longer than ${alert.platform}'s pause window, so ${name} is probably paused. ` +
      `Keep-alive cannot resume a paused project: restore it from the ${alert.platform} dashboard, and the next ping will confirm it.` +
      footer,
  };
}
