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
                    ? "border-red-500 bg-red-500 text-white"
                    : current
                    ? "border-blue-600 bg-blue-600 text-white"
                    : done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-gray-300 bg-white text-gray-300"
                }`}
              >
                {isTerminalBad ? <X size={14} /> : done ? <Check size={14} /> : <Circle size={9} className="fill-current" />}
              </span>
              {i < flow.length - 1 && (
                <span className={`w-0.5 flex-1 ${done ? "bg-emerald-400" : "bg-gray-200"}`} />
              )}
            </div>
            <div className="-mt-0.5 pb-1">
              <p className={`text-sm font-medium ${current ? "text-blue-700" : done ? "text-gray-900" : "text-gray-400"}`}>
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
