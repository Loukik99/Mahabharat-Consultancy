import type { GovtJob } from "@/types";
import { govtJobs } from "@/data/govtJobs";

export function getJobs(sector?: string, search?: string): GovtJob[] {
  let list = [...govtJobs];
  if (sector && sector !== "all") list = list.filter((j) => j.sector === sector);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((j) => j.title.toLowerCase().includes(q) || j.organization.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
}
