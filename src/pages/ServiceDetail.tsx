import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getService } from "@/api/services.api";
import { categoryById } from "@/data/catalog";
import { useAuth } from "@/context/AuthContext";
import type { Service } from "@/types";
import { toast } from "sonner";
import { waLink } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileQuestion,
  Globe,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";

export default function ServiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const d = await getService(id ?? "");
        if (active) setService(d);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <FileQuestion size={48} className="mx-auto mb-4 text-muted-foreground/40" />
        <h1 className="font-display text-xl font-semibold text-navy">Service not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The service you are looking for does not exist or is no longer available.
        </p>
        <Button asChild className="mt-6">
          <Link to="/services">
            <ArrowLeft size={16} /> Back to Services
          </Link>
        </Button>
      </div>
    );
  }

  const category = categoryById(service.category);

  const requestService = () => {
    if (user && user.role === "customer") navigate(`/new-request/${service.id}`);
    else navigate("/login");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
        <Link to="/services">
          <ArrowLeft size={16} /> Back to Services
        </Link>
      </Button>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {category && (
              <Badge variant="secondary" className="font-medium">
                {category.name}
              </Badge>
            )}
            {service.popular && (
              <Badge className="border border-gold/30 bg-gold/10 text-gold hover:bg-gold/10">
                Popular
              </Badge>
            )}
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{service.name}</h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">{service.description}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="font-medium">
              {service.priceLabel}
            </Badge>
            {service.processingTime && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock size={14} /> {service.processingTime}
              </span>
            )}
          </div>

          {/* Required documents */}
          {service.requiredDocuments.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-3 font-display font-semibold text-navy">Required Documents</h2>
              <ul className="space-y-2">
                {service.requiredDocuments.map((doc) => (
                  <li key={doc} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Official links */}
          {service.officialLinks.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-navy">
                <Globe size={18} className="text-gold" /> Official Website
              </h2>
              <div className="flex flex-col gap-2">
                {service.officialLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded border border-border p-3 transition-colors hover:border-gold hover:bg-secondary/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy">{link.label}</p>
                      {link.note && <p className="text-xs text-muted-foreground">{link.note}</p>}
                    </div>
                    <ExternalLink size={16} className="shrink-0 text-gold" />
                  </a>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-xs leading-relaxed">
                  We are a private assistance / service center and are not affiliated with any
                  government body. The links above open the official government websites only.
                </p>
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={requestService} className="bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
              Request This Service <ArrowRight size={16} />
            </Button>
            <Button asChild size="lg" variant="outline">
              <a
                href={waLink(`I want to know about ${service.name}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={16} /> Ask about this service
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
