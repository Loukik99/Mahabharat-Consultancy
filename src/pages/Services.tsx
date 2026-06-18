import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getServices, getCategories } from "@/api/services.api";
import { serviceCategories, categoryById } from "@/data/catalog";
import type { Service, ServiceCategory } from "@/types";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight, Clock, SearchX } from "lucide-react";

export default function Services() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "all";
  const [search, setSearch] = useState(params.get("q") || "");
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>(serviceCategories);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cats = await getCategories();
        if (active) setCategories(cats);
      } catch {
        if (active) setCategories(serviceCategories);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const d = await getServices(cat, search.trim() || undefined);
        if (active) setServices(d);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [cat, search]);

  const setCat = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("cat");
    else next.set("cat", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="eyebrow text-gold">What we do</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">Our Services</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Browse our government and online services. Pricing is shared on request.
      </p>

      {/* Search */}
      <div className="relative mt-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          placeholder="Search services…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category chips */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCat("all")}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            cat === "all" ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              cat === c.id ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : services.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
            <SearchX size={40} className="mb-3 text-muted-foreground/40" />
            <p>No services found.</p>
            <p className="mt-1 text-sm">Try a different category or search term.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const category = categoryById(s.category);
            return (
              <Link key={s.id} to={`/services/${s.id}`} className="group">
                <Card className="h-full rounded border-border transition-colors hover:border-gold hover:shadow-sm">
                  <CardContent className="flex h-full flex-col pt-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {category && (
                        <Badge variant="secondary" className="font-medium">
                          {category.name}
                        </Badge>
                      )}
                      {s.popular && (
                        <Badge className="border border-gold/30 bg-gold/10 text-gold hover:bg-gold/10">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-display font-semibold text-navy transition-colors group-hover:text-gold">{s.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                      <Badge variant="outline" className="font-medium">
                        {s.priceLabel}
                      </Badge>
                      {s.processingTime && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock size={12} /> {s.processingTime}
                        </span>
                      )}
                    </div>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gold transition-all group-hover:gap-2">
                      View details <ArrowRight size={14} />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
