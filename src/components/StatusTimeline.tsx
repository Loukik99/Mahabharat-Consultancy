import { REQUEST_STATUS_FLOW, type ServiceRequest, type RequestStatus } from "@/types";
import { labelForStatus } from "@/api/requests.api";
import { Check, Circle, X } from "lucide-react";

// Vertical status timeline for a request. Highlights the current step,
// marks completed steps, and shows the timestamp from status history.
export function StatusTimeline({ request }: { request: ServiceRequest }) {
  const terminal = request.status === "rejected" || request.status === "cancelled";
  const flow: RequestStatus[] = terminal
    ? [...REQUEST_STATUS_FLOW.slice(0, 3), request.status]
    : REQUEST_STATUS_FLOW;

  const reachedIndex = flow.indexOf(request.status);
  const lastAt = (s: RequestStatus) =>
    [...request.statusHistory].reverse().find((h) => h.status === s)?.at;

  return (
    <ol className="relative space-y-0">
      {flow.map((step, i) => {
        const done = reachedIndex >= 0 && i < reachedIndex;
        const current = step === request.status;
        const isTerminalBad = terminal && current;
        const at = lastAt(step);
        return (
          <li key={step} className="flex gap-3 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  isTerminalBad
                    ? "border-destructive bg-destructive text-white"
                    : current
                    ? "border-navy bg-navy text-gold"
                    : done
                    ? "border-gold bg-gold text-gold-foreground"
                    : "border-border bg-card text-muted-foreground/40"
                }`}
              >
                {isTerminalBad ? <X size={14} /> : done ? <Check size={14} /> : <Circle size={9} className="fill-current" />}
              </span>
              {i < flow.length - 1 && (
                <span className={`w-0.5 flex-1 ${done ? "bg-gold/60" : "bg-border"}`} />
              )}
            </div>
            <div className="-mt-0.5 pb-1">
              <p className={`text-sm font-medium ${current ? "text-navy" : done ? "text-foreground" : "text-muted-foreground/60"}`}>
                {labelForStatus(step)}
              </p>
              {at && <p className="text-[11px] text-gray-400">{new Date(at).toLocaleString("en-IN")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
