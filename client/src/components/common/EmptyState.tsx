import type { ReactNode } from "react";
import { C } from "@/theme";
import Icon, { type IconName } from "./Icon";

// What a list shows when it has nothing in it: what is missing, and how to put
// something there. The lists used to say it in one grey 12px line pinned to the
// left of an otherwise empty card, which read like a caption that had lost its
// table.
//
// NOT for a clinical suggestion list. "Your usual" and the learned phrases
// render nothing when they are empty, on purpose: there, "no suggestions" and
// "the lookup failed" must not look alike (client/CLAUDE.md).
interface Props {
  icon: IconName;
  title: string;
  /** How to fill the list. One sentence. */
  hint?: ReactNode;
  action?: ReactNode;
  /** Less padding, for a list that sits inside a card with other content. */
  compact?: boolean;
}

export default function EmptyState({ icon, title, hint, action, compact }: Props) {
  return (
    <div style={{ textAlign: "center", padding: compact ? "18px 12px" : "32px 16px" }}>
      <div aria-hidden style={{ width: 44, height: 44, borderRadius: "50%", background: C.n[100], color: C.n[500], display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.n[800] }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: C.n[600], marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
