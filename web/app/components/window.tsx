/** A backend drawn as a window: lit when awake, flickering when in trouble, dark when paused. */
import type { State } from "@/lib/health";

const LOOK: Record<State, string> = {
  idle: "window-dim",
  alive: "window-lit",
  pause_soon: "window-lit flicker",
  failing: "bg-dead flicker",
  paused: "window-dark ring-1 ring-dead/70 ring-inset",
  maintenance: "window-dim ring-1 ring-warn/70 ring-inset",
};

const SIZE = {
  sm: "h-3.5 w-2.5 rounded-[2px]",
  md: "h-6 w-[18px] rounded-[3px]",
  lg: "h-10 w-7 rounded-[4px]",
};

export function Window({ state, size = "md" }: { state: State; size?: keyof typeof SIZE }) {
  return <span aria-hidden className={`inline-block shrink-0 ${SIZE[size]} ${LOOK[state]}`} />;
}

const WORD_TONE: Record<State, string> = {
  idle: "text-muted",
  alive: "text-alive",
  pause_soon: "text-warn",
  failing: "text-dead",
  paused: "text-dead",
  maintenance: "text-warn",
};

/** The window plus its state in words, so colour and motion are never the only signal. */
export function WindowState({ state, label }: { state: State; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Window state={state} size="sm" />
      <span className={`text-sm font-medium ${WORD_TONE[state]}`}>{label}</span>
    </span>
  );
}
