import type { GovtJob } from "@/types";

// ──────────────────────────────────────────────────────────────────
// Sample government job listings (FreeJobAlert-style discovery).
//
// These are illustrative sample entries for the jobs section. Each
// links ONLY to the official recruitment website — we never host or
// impersonate application forms. In Phase 2 this list will be
// admin-managed / API-driven.
// ──────────────────────────────────────────────────────────────────

export const govtJobs: GovtJob[] = [
  {
    id: "job-ssc-cgl",
    title: "SSC CGL — Combined Graduate Level",
    organization: "Staff Selection Commission",
    sector: "central",
    qualification: "Bachelor's Degree",
    vacancies: "17,000+",
    location: "All India",
    lastDate: "2026-07-24",
    postedAt: "2026-06-10",
    officialUrl: "https://ssc.gov.in/",
  },
  {
    id: "job-ibps-po",
    title: "IBPS PO / MT — Probationary Officer",
    organization: "Institute of Banking Personnel Selection",
    sector: "banking",
    qualification: "Any Graduate",
    vacancies: "4,000+",
    location: "All India",
    lastDate: "2026-07-21",
    postedAt: "2026-06-08",
    officialUrl: "https://www.ibps.in/",
  },
  {
    id: "job-rrb-ntpc",
    title: "RRB NTPC — Non-Technical Popular Categories",
    organization: "Railway Recruitment Board",
    sector: "railway",
    qualification: "12th / Graduate",
    vacancies: "11,500+",
    location: "All India",
    lastDate: "2026-07-15",
    postedAt: "2026-06-05",
    officialUrl: "https://www.rrbcdg.gov.in/",
  },
  {
    id: "job-army-agniveer",
    title: "Indian Army Agniveer Recruitment",
    organization: "Indian Army",
    sector: "defence",
    qualification: "10th / 12th",
    vacancies: "25,000+",
    location: "All India",
    lastDate: "2026-07-30",
    postedAt: "2026-06-12",
    officialUrl: "https://joinindianarmy.nic.in/",
  },
  {
    id: "job-navy-agniveer",
    title: "Indian Navy Agniveer (SSR / MR)",
    organization: "Indian Navy",
    sector: "defence",
    qualification: "10th / 12th",
    vacancies: "2,800+",
    location: "All India",
    lastDate: "2026-07-18",
    postedAt: "2026-06-09",
    officialUrl: "https://www.joinindiannavy.gov.in/",
  },
  {
    id: "job-iaf-agniveervayu",
    title: "Air Force Agniveervayu Intake",
    organization: "Indian Air Force",
    sector: "defence",
    qualification: "12th (PCM) / Diploma",
    vacancies: "3,500+",
    location: "All India",
    lastDate: "2026-07-12",
    postedAt: "2026-06-03",
    officialUrl: "https://agnipathvayu.cdac.in/",
  },
  {
    id: "job-upsc-cse",
    title: "UPSC Civil Services Examination",
    organization: "Union Public Service Commission",
    sector: "central",
    qualification: "Any Graduate",
    vacancies: "1,000+",
    location: "All India",
    lastDate: "2026-08-05",
    postedAt: "2026-06-01",
    officialUrl: "https://upsc.gov.in/",
  },
  {
    id: "job-state-talathi",
    title: "Maharashtra Talathi Bharti",
    organization: "Government of Maharashtra",
    sector: "state",
    qualification: "Any Graduate",
    vacancies: "4,600+",
    location: "Maharashtra",
    lastDate: "2026-07-09",
    postedAt: "2026-06-11",
    officialUrl: "https://www.maharashtra.gov.in/",
  },
];

export const jobSectors: { id: GovtJob["sector"]; label: string }[] = [
  { id: "central", label: "Central Govt" },
  { id: "state", label: "State Govt" },
  { id: "defence", label: "Defence" },
  { id: "banking", label: "Banking" },
  { id: "railway", label: "Railway" },
  { id: "psu", label: "PSU" },
  { id: "other", label: "Other" },
];
