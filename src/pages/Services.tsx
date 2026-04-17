import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ServiceCategory } from "@/types";
import { getServices } from "@/api/services.api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IndianRupee, Search } from "lucide-react";

const cats: { key: ServiceCategory | ""; label: string }[] = [
  { key: "", label: "All" },
  { key: "government", label: "Government" },
  { key: "home", label: "Home" },
  { key: "housekeeping", label: "Housekeeping" },
  { key: "manpower", label: "Manpower" },
  { key: "ecommerce", label: "E-Commerce" },
];

const catColors: Record<string, string> = {
  government: "bg-blue-50 text-blue-700",
  home: "bg-green-50 text-green-700",
  housekeeping: "bg-violet-50 text-violet-700",
  manpower: "bg-orange-50 text-orange-700",
  ecommerce: "bg-rose-50 text-rose-700",
};

export default function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const active = (params.get("category") || "") as ServiceCategory | "";

  const services = useMemo(() => getServices(active || undefined, search || undefined), [active, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Our Services</h1>
      <p className="text-muted-foreground text-sm mb-6">Browse and book from our wide range of services</p>

      <div className="flex flex-col sm:flex-row gap-4 mb-7">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Search services..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cats.map(c => (
            <button key={c.key} onClick={() => setParams(c.key ? { category: c.key } : {})}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active === c.key ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {services.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">No services found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(s => (
            <Link key={s.id} to={`/services/${s.id}`}>
              <Card className="hover:shadow-md transition-shadow group h-full">
                <CardContent className="pt-5 pb-4">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${catColors[s.category]} mb-2`}>
                    {s.category.replace("ecommerce", "E-Commerce").toUpperCase()}
                  </span>
                  <h3 className="font-semibold group-hover:text-blue-600 transition-colors">{s.name}</h3>
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{s.description}</p>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <span className="flex items-center text-lg font-bold">
                      <IndianRupee size={16} className="text-green-600" />{s.price.toLocaleString("en-IN")}
                    </span>
                    <span className="text-blue-600 font-medium text-sm">
                      {s.category === "government" ? "Apply Now" : "Book Now"} &rarr;
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
