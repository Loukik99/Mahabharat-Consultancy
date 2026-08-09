import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getJobs } from "@/api/jobs.api";
import { jobSectors } from "@/data/govtJobs";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { GovtJob } from "@/types";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { Seo } from "@/components/Seo";
import { pageSeo, organizationJsonLd, webPageJsonLd } from "@/config/seo";
import { cn } from "@/lib/utils";
import jobSeekerLogo from "@/assets/services/job-seeker.png";
import {
  Search,
  ExternalLink,
  HelpCircle,
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
    <div className="bg-white">
      <Seo
        {...pageSeo.jobs}
        jsonLd={[organizationJsonLd(), webPageJsonLd(pageSeo.jobs)]}
      />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-mist bg-white shadow-subtle">
            <img src={jobSeekerLogo} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
          </div>
          <SectionHeader
            eyebrow="Opportunities"
            title="Latest Government Jobs"
            sub="Central, state, defence, banking, railway and PSU openings, all in one place."
          />
        </div>

        {/* Explore more jobs on FreeJobAlert */}
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-gold/35 bg-gold/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-mist bg-white">
              <img src={jobSeekerLogo} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-ink sm:text-lg">
                Looking for railway, banking or other jobs?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-smoke">
                Explore thousands of the latest government jobs across India on FreeJobAlert, then ask us to help you apply.
              </p>
            </div>
          </div>
          <Button
            asChild
            className="shrink-0 rounded-full bg-gold px-5 font-semibold text-gold-foreground hover:bg-gold/90"
          >
            <a href="https://www.freejobalert.com/" target="_blank" rel="noopener noreferrer">
              Explore on FreeJobAlert <ExternalLink size={15} />
            </a>
          </Button>
        </div>

        {/* Disclaimer */}
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 sm:p-5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed">
            We help you apply; applications are submitted on the official websites only. We are a
            private assistance / service center and do not represent any recruitment body.
          </p>
        </div>

        {/* Search */}
        <div className="relative mt-8 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fog" size={16} />
          <input
            placeholder="Search jobs by title or organisation…"
            className="h-11 w-full rounded-full border border-mist bg-white pl-10 pr-4 text-[15px] text-ink shadow-subtle placeholder:text-fog transition-colors focus:border-navy/30 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Sector chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setSector("all")}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
              sector === "all"
                ? "bg-navy text-white"
                : "border border-mist bg-white text-ink hover:border-navy/25"
            )}
          >
            All
          </button>
          {jobSectors.map((s) => (
            <button
              key={s.id}
              onClick={() => setSector(s.id)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                sector === s.id
                  ? "bg-navy text-white"
                  : "border border-mist bg-white text-ink hover:border-navy/25"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-gold" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-mist bg-white py-16 text-center shadow-subtle">
            <SearchX size={40} className="mb-3 text-fog/50" />
            <p className="font-medium text-ink">No jobs found.</p>
            <p className="mt-1 text-sm text-smoke">Try a different sector or search term.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="mt-8 space-y-4 lg:hidden">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-2xl border border-mist bg-white p-5 shadow-subtle transition-colors hover:border-navy/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold leading-tight text-ink">{job.title}</h3>
                    <span className="shrink-0 rounded-full bg-navy/[0.07] px-2.5 py-1 text-[11px] font-semibold text-navy">
                      {sectorLabel(job.sector)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-smoke">{job.organization}</p>

                  <div className="mt-4 space-y-1.5 text-sm text-ink">
                    <p className="flex items-center gap-2">
                      <GraduationCap size={14} className="shrink-0 text-fog" />
                      {job.qualification}
                    </p>
                    {job.vacancies && (
                      <p className="flex items-center gap-2">
                        <Users size={14} className="shrink-0 text-fog" />
                        <span className="tnum">{job.vacancies}</span> vacancies
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <MapPin size={14} className="shrink-0 text-fog" />
                      {job.location}
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarClock size={14} className="shrink-0 text-fog" />
                      Last date: <span className="tnum">{formatDate(job.lastDate)}</span>
                      {isClosingSoon(job.lastDate) && (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Closing soon
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-full border-mist bg-white text-ink hover:bg-ink/[0.03] hover:text-ink"
                    >
                      <a href={job.officialUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> Official Site
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 rounded-full bg-navy font-semibold text-white hover:bg-navy/90"
                      onClick={helpApplying}
                    >
                      <HelpCircle size={14} /> Get Help Applying
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="mt-8 hidden overflow-hidden rounded-2xl border border-mist bg-white shadow-subtle lg:block">
              <table className="w-full text-sm">
                <thead className="border-b border-mist bg-snow text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-fog">
                  <tr>
                    <th className="px-4 py-3.5">Post</th>
                    <th className="px-4 py-3.5">Sector</th>
                    <th className="px-4 py-3.5">Qualification</th>
                    <th className="px-4 py-3.5">Vacancies</th>
                    <th className="px-4 py-3.5">Location</th>
                    <th className="px-4 py-3.5">Last Date</th>
                    <th className="px-4 py-3.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-mist/70 transition-colors last:border-0 hover:bg-snow/80">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-ink">{job.title}</p>
                        <p className="text-xs text-smoke">{job.organization}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-navy/[0.07] px-2.5 py-1 text-[11px] font-semibold text-navy">
                          {sectorLabel(job.sector)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-smoke">{job.qualification}</td>
                      <td className="px-4 py-3.5 tnum text-smoke">{job.vacancies ?? "-"}</td>
                      <td className="px-4 py-3.5 text-smoke">{job.location}</td>
                      <td className="px-4 py-3.5">
                        <span className="tnum whitespace-nowrap text-ink">{formatDate(job.lastDate)}</span>
                        {isClosingSoon(job.lastDate) && (
                          <span className="ml-2 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Soon
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="rounded-full border-mist bg-white text-ink hover:bg-ink/[0.03] hover:text-ink"
                          >
                            <a href={job.officialUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={14} /> Official
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            className="rounded-full bg-navy font-semibold text-white hover:bg-navy/90"
                            onClick={helpApplying}
                          >
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
    </div>
  );
}
