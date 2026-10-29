import { api } from "@/lib/apiClient";

export interface ProfileAddress {
  line?: string;
  village?: string;
  tehsil?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

export interface ProfileEducation {
  board?: string;
  rollNumber?: string;
  passingYear?: number | string;
  percentage?: number | string;
}

export interface ProfileExam {
  examName?: string;
  applicationNumber?: string;
  rollNumber?: string;
  examCentre?: string;
  examDate?: string;
}

export interface ApplicantProfile {
  personal: {
    fullName?: string;
    fatherName?: string;
    motherName?: string;
    dob?: string;
    gender?: string;
    category?: string;
    religion?: string;
    maritalStatus?: string;
    nationality?: string;
  };
  contact: { mobile?: string; email?: string };
  permanentAddress: ProfileAddress;
  correspondenceAddress: ProfileAddress;
  education: { tenth: ProfileEducation; twelfth: ProfileEducation; graduation: ProfileEducation };
  exams: ProfileExam[];
  /** Masked only, e.g. XXXX-XXXX-1234. */
  aadhaarRef: string;
  /** Masked only, e.g. XXXXXX234F. */
  panRef: string;
  updatedAt?: string | null;
}

export async function getProfile(): Promise<ApplicantProfile> {
  const { data } = await api.get<{ profile: ApplicantProfile }>("/profile");
  return data.profile;
}

/** Full replace — fields left empty are cleared. `updatedAt` is ignored by the server. */
export async function updateProfile(profile: ApplicantProfile): Promise<ApplicantProfile> {
  const { data } = await api.put<{ profile: ApplicantProfile }>("/profile", profile);
  return data.profile;
}

/** Applicant-detail fields on a new request that the profile can prefill. */
export function applicantPrefill(p: ApplicantProfile): { fullName?: string; fatherName?: string; dob?: string } {
  const out: { fullName?: string; fatherName?: string; dob?: string } = {};
  if (p.personal.fullName) out.fullName = p.personal.fullName;
  if (p.personal.fatherName) out.fatherName = p.personal.fatherName;
  if (p.personal.dob) out.dob = p.personal.dob;
  return out;
}
