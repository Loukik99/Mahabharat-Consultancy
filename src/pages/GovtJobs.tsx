import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getJobs } from "@/api/jobs.api";
import { jobSectors } from "@/data/govtJobs";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { GovtJob } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  ExternalLink,
  HelpCircle,
  Briefcase,
  MapPin,
  Users,
  GraduationCap,
  CalendarClock,
  SearchX,
  AlertTriangle,
} from "lucide-react";

const sectorLabel = (id: GovtJob["sector"]) =>
  jobSectors.find((s) => s.id === id)?.label ?? id;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const isClosingSoon = (iso: string) => {
  const last = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = (last - now) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
};

export default function GovtJobs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sector, setSector] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<GovtJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const d = await getJobs(sector, search.trim() || undefined);
        if (active) setJobs(d);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sector, search]);

  const helpApplying = () => {
    if (user && user.role === "customer") navigate("/new-request/govt-job-forms");
    else navigate("/login");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded bg-navy text-gold">
          <Briefcase size={22} />
        </div>
        <div>
          <p className="eyebrow text-gold">Opportunities</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-navy sm:text-3xl">Latest Government Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Central, state, defence, banking, railway and PSU openings — all in one place.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-5 flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm leading-relaxed">
          We help you apply; applications are submitted on the official websites only. We are a
          private assistance / service center and do not represent any recruitment body.
        </p>
      </div>

      {/* Search */}
      <div className="relative mt-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          placeholder="Search jobs by title or organisation…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Sector chips */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setSector("all")}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            sector === "all" ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"
          }`}
        >
          All
        </button>
        {jobSectors.map((s) => (
          <button
            key={s.id}
            onClick={() => setSector(s.id)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              sector === s.id ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center py-16 text-center text-muted-foreground">
            <SearchX size={40} className="mb-3 text-muted-foreground/40" />
            <p>No jobs found.</p>
            <p className="mt-1 text-sm">Try a different sector or search term.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="mt-7 space-y-4 lg:hidden">
            {jobs.map((job) => (
              <Card key={job.id} className="rounded border-border transition-colors hover:border-gold">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-semibold leading-tight text-navy">{job.title}</h3>
                    <Badge variant="secondary" className="shrink-0 font-medium">
                      {sectorLabel(job.sector)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{job.organization}</p>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <p className="flex items-center gap-2">
                      <GraduationCap size={14} className="shrink-0 text-muted-foreground" />
                      {job.qualification}
                    </p>
                    {job.vacancies && (
                      <p className="flex items-center gap-2">
                        <Users size={14} className="shrink-0 text-muted-foreground" />
                        <span className="tnum">{job.vacancies}</span> vacancies
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <MapPin size={14} className="shrink-0 text-muted-foreground" />
                      {job.location}
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarClock size={14} className="shrink-0 text-muted-foreground" />
                      Last date: <span className="tnum">{formatDate(job.lastDate)}</span>
                      {isClosingSoon(job.lastDate) && (
                        <Badge className="border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Closing soon
                        </Badge>
                      )}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline" size="sm" className="flex-1 text-navy">
                      <a href={job.officialUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> Official Site
                      </a>
                    </Button>
                    <Button size="sm" className="flex-1 bg-gold font-semibold text-gold-foreground hover:bg-gold/90" onClick={helpApplying}>
                      <HelpCircle size={14} /> Get Help Applying
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <div className="mt-7 hidden overflow-hidden rounded border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Post</th>
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">Qualification</th>
                  <th className="px-4 py-3 font-medium">Vacancies</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Last Date</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-border/60 transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.organization}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="font-medium">
                        {sectorLabel(job.sector)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{job.qualification}</td>
                    <td className="px-4 py-3 tnum text-muted-foreground">{job.vacancies ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.location}</td>
                    <td className="px-4 py-3">
                      <span className="tnum whitespace-nowrap">{formatDate(job.lastDate)}</span>
                      {isClosingSoon(job.lastDate) && (
                        <Badge className="ml-2 border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Soon
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm" className="text-navy">
                          <a href={job.officialUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={14} /> Official
                          </a>
                        </Button>
                        <Button size="sm" className="bg-gold font-semibold text-gold-foreground hover:bg-gold/90" onClick={helpApplying}>
                          <HelpCircle size={14} /> Get Help
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
