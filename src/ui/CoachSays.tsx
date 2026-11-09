import { coach } from "@coach";
import type { ReactNode } from "react";
import type { Expression } from "../coach/types";

interface CoachSaysProps {
  expression: Expression;
  size?: number;
  layout?: "stacked" | "inline";
  /** A longer follow-up shown under the main line. */
  detail?: string;
  detailLoading?: boolean;
  children: ReactNode;
}

export function CoachSays({
  expression,
  size = 148,
  layout = "stacked",
  detail,
  detailLoading = false,
  children,
}: CoachSaysProps) {
  return (
    <div className={`coach coach-${layout}`}>
      {/* The key restarts the reaction animation whenever the expression changes. */}
      <div key={expression} className={`coach-avatar coach-react-${expression}`}>
        <coach.Avatar expression={expression} size={size} />
      </div>
      <div className="coach-bubble" role="status">
        <p className="coach-name">{coach.name}</p>
        <p key={String(children)} className="coach-line">
          {children}
        </p>
        {detail && (
          <p key={detail} className={`coach-detail${detailLoading ? " coach-detail-loading" : ""}`}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
