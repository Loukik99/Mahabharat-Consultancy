import { Badge } from "@/components/ui/badge";
import type { RequestStatus, PaymentStatus } from "@/types";
import { labelForStatus } from "@/api/requests.api";

const variants: Record<string, string> = {
  submitted: "bg-indigo-100 text-indigo-800",
  documents_required: "bg-amber-100 text-amber-800",
  in_review: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  waiting_otp: "bg-purple-100 text-purple-800",
  waiting_payment: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
  // payment statuses
  pending: "bg-yellow-100 text-yellow-800",
  received: "bg-green-100 text-green-800",
};

const paymentLabels: Record<string, string> = {
  pending: "Payment Pending",
  received: "Payment Received",
};

export function StatusBadge({ status }: { status: RequestStatus | PaymentStatus | string }) {
  const label = paymentLabels[status] ?? labelForStatus(status as RequestStatus) ?? status;
  return (
    <Badge variant="outline" className={`border-0 text-[11px] font-semibold ${variants[status] || "bg-gray-100 text-gray-700"}`}>
      {label}
    </Badge>
  );
}
