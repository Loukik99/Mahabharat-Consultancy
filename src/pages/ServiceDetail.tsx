import { useParams, useNavigate } from "react-router-dom";
import { getService } from "@/api/services.api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IndianRupee, FileText, ArrowRight } from "lucide-react";

export default function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const service = getService(id!);

  if (!service) return <p className="text-center py-20 text-muted-foreground">Service not found</p>;

  const isGov = service.category === "government";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
            <div>
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 capitalize mb-1">{service.category}</span>
              <h1 className="text-2xl font-bold tracking-tight">{service.name}</h1>
            </div>
            <span className="flex items-center text-2xl font-bold shrink-0">
              <IndianRupee size={20} className="text-green-600" />{service.price.toLocaleString("en-IN")}
            </span>
          </div>

          <p className="text-muted-foreground leading-relaxed">{service.description}</p>

          {service.requiredDocuments.length > 0 && (
            <div className="mt-5 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <FileText size={16} className="text-yellow-600" /> Required Documents
              </h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                {service.requiredDocuments.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-7 flex gap-3">
            <Button size="lg" onClick={() => user ? navigate(`/book/${service.id}`) : navigate("/login")}>
              {isGov ? "Apply Now" : "Book Service"} <ArrowRight className="ml-1" size={16} />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/services")}>Back</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
