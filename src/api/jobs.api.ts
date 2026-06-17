import type { GovtJob } from "@/types";
import { api } from "@/lib/apiClient";

export async function getJobs(sector?: string, search?: string): Promise<GovtJob[]> {
  const { data } = await api.get<{ jobs: GovtJob[] }>("/jobs", { params: { sector, search } });
  return data.jobs;
}
