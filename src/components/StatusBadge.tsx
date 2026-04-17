import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus } from "@/types";

const variants: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  verified: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  submitted: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  booked: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  assigned: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100",
  in_progress: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  completed: "bg-green-100 text-green-800 hover:bg-green-100",
  rejected: "bg-red-100 text-red-800 hover:bg-red-100",
  cancelled: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
};

export function StatusBadge({ status }: { status: BookingStatus | PaymentStatus | string }) {
  return (
    <Badge variant="outline" className={`border-0 text-[11px] font-semibold ${variants[status] || "bg-gray-100 text-gray-700"}`}>
      {status.replace("_", " ").toUpperCase()}
    </Badge>
  );
}
