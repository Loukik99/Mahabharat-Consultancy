import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  getProfile,
  updateProfile,
  type ApplicantProfile,
  type ProfileAddress,
  type ProfileEducation,
  type ProfileExam,
} from "@/api/profile.api";

const EMPTY: ApplicantProfile = {
  personal: {},
  contact: {},
  permanentAddress: {},
  correspondenceAddress: {},
  education: { tenth: {}, twelfth: {}, graduation: {} },
  exams: [],
  aadhaarRef: "",
  panRef: "",
};
const MAX_EXAMS = 5;
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GENDERS = [["male", "Male"], ["female", "Female"], ["transgender", "Transgender"]];
const CATEGORIES = [["general", "General"], ["ews", "EWS"], ["obc", "OBC"], ["sc", "SC"], ["st", "ST"]];
const MARITAL = [["unmarried", "Unmarried"], ["married", "Married"], ["widowed", "Widowed"], ["divorced", "Divorced"], ["separated", "Separated"]];
const ADDRESS_FIELDS: [keyof ProfileAddress, string][] = [
  ["line", "Address line"], ["village", "Village / Town"], ["tehsil", "Tehsil / Taluka"],
  ["district", "District"], ["state", "State"], ["pincode", "PIN code"],
];
const EDU_LEVELS: [keyof ApplicantProfile["education"], string][] = [
  ["tenth", "10th"], ["twelfth", "12th"], ["graduation", "Graduation"],
];
const EXAM_FIELDS: [keyof ProfileExam, string, string?][] = [
  ["examName", "Exam name"], ["applicationNumber", "Application no."], ["rollNumber", "Roll no."],
  ["examCentre", "Exam centre"], ["examDate", "Exam date", "date"],
];

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

function Choice({ id, label, value, options, onChange }: {
  id: string; label: string; value?: string; options: string[][]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={SELECT_CLASS} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState<ApplicantProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getProfile()
      .then((p) => active && setProfile({ ...EMPTY, ...p, education: { ...EMPTY.education, ...p.education } }))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const setSection = <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const setPersonal = (k: keyof ApplicantProfile["personal"], v: string) =>
    setSection("personal", { ...profile.personal, [k]: v });
  const setAddress = (which: "permanentAddress" | "correspondenceAddress", k: keyof ProfileAddress, v: string) =>
    setSection(which, { ...profile[which], [k]: v });
  const setEducation = (level: keyof ApplicantProfile["education"], k: keyof ProfileEducation, v: string) =>
    setSection("education", { ...profile.education, [level]: { ...profile.education[level], [k]: v } });
  const setExam = (i: number, k: keyof ProfileExam, v: string) =>
    setSection("exams", profile.exams.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await updateProfile(profile);
      setProfile({ ...EMPTY, ...saved, education: { ...EMPTY.education, ...saved.education } });
      toast.success("Profile saved.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/dashboard" className="text-sm font-medium text-navy hover:text-gold mb-4 inline-flex items-center gap-1 transition-colors">
        <ChevronLeft size={15} /> Dashboard
      </Link>
      <div className="mb-6">
        <p className="eyebrow text-gold">Reusable details</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">My Applicant Profile</h1>
        <p className="text-sm text-muted-foreground">
          Saved once, used to prefill new requests. Every field is optional and you can review it before each request.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : (
        <form onSubmit={save} className="space-y-5">
          <Card className="rounded border border-border">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base text-navy">Personal details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="p-fullName" label="Full name" value={profile.personal.fullName || ""} onChange={(e) => setPersonal("fullName", e.target.value)} />
              <Field id="p-fatherName" label="Father's name" value={profile.personal.fatherName || ""} onChange={(e) => setPersonal("fatherName", e.target.value)} />
              <Field id="p-motherName" label="Mother's name" value={profile.personal.motherName || ""} onChange={(e) => setPersonal("motherName", e.target.value)} />
              <Field id="p-dob" label="Date of birth" type="date" value={profile.personal.dob || ""} onChange={(e) => setPersonal("dob", e.target.value)} />
              <Choice id="p-gender" label="Gender" value={profile.personal.gender} options={GENDERS} onChange={(v) => setPersonal("gender", v)} />
              <Choice id="p-category" label="Category" value={profile.personal.category} options={CATEGORIES} onChange={(v) => setPersonal("category", v)} />
              <Field id="p-religion" label="Religion" value={profile.personal.religion || ""} onChange={(e) => setPersonal("religion", e.target.value)} />
              <Choice id="p-marital" label="Marital status" value={profile.personal.maritalStatus} options={MARITAL} onChange={(v) => setPersonal("maritalStatus", v)} />
              <Field id="p-nationality" label="Nationality" value={profile.personal.nationality || ""} onChange={(e) => setPersonal("nationality", e.target.value)} />
            </CardContent>
          </Card>

          <Card className="rounded border border-border">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base text-navy">Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="c-mobile" label="Mobile" inputMode="tel" value={profile.contact.mobile || ""} onChange={(e) => setSection("contact", { ...profile.contact, mobile: e.target.value })} />
              <Field id="c-email" label="Email" type="email" value={profile.contact.email || ""} onChange={(e) => setSection("contact", { ...profile.contact, email: e.target.value })} />
            </CardContent>
          </Card>

          {(["permanentAddress", "correspondenceAddress"] as const).map((which) => (
            <Card key={which} className="rounded border border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="font-display text-base text-navy">
                  {which === "permanentAddress" ? "Permanent address" : "Correspondence address"}
                </CardTitle>
                {which === "correspondenceAddress" && (
                  <Button type="button" variant="outline" size="sm" className="border-navy/20 text-navy hover:text-navy"
                    onClick={() => setSection("correspondenceAddress", { ...profile.permanentAddress })}>
                    Same as permanent
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ADDRESS_FIELDS.map(([k, label]) => (
                  <Field key={k} id={`${which}-${k}`} label={label} inputMode={k === "pincode" ? "numeric" : undefined}
                    value={profile[which][k] || ""} onChange={(e) => setAddress(which, k, e.target.value)} />
                ))}
              </CardContent>
            </Card>
          ))}

          <Card className="rounded border border-border">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base text-navy">Education</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {EDU_LEVELS.map(([level, title]) => (
                <div key={level}>
                  <p className="text-sm font-semibold text-navy mb-2">{title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <Field id={`${level}-board`} label={level === "graduation" ? "University" : "Board"} value={profile.education[level].board || ""} onChange={(e) => setEducation(level, "board", e.target.value)} />
                    <Field id={`${level}-roll`} label="Roll no." value={profile.education[level].rollNumber || ""} onChange={(e) => setEducation(level, "rollNumber", e.target.value)} />
                    <Field id={`${level}-year`} label="Passing year" inputMode="numeric" value={String(profile.education[level].passingYear ?? "")} onChange={(e) => setEducation(level, "passingYear", e.target.value)} />
                    <Field id={`${level}-pct`} label="Percentage" inputMode="decimal" value={String(profile.education[level].percentage ?? "")} onChange={(e) => setEducation(level, "percentage", e.target.value)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded border border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="font-display text-base text-navy">Examination details</CardTitle>
              <Button type="button" variant="outline" size="sm" disabled={profile.exams.length >= MAX_EXAMS}
                className="border-navy/20 text-navy hover:text-navy"
                onClick={() => setSection("exams", [...profile.exams, {}])}>
                <Plus size={14} className="mr-1" /> Add exam
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.exams.length === 0 && <p className="text-sm text-muted-foreground">No exams added.</p>}
              {profile.exams.map((exam, i) => (
                <div key={i} className="rounded border border-border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXAM_FIELDS.map(([k, label, type]) => (
                      <Field key={k} id={`exam-${i}-${k}`} label={label} type={type} value={exam[k] || ""} onChange={(e) => setExam(i, k, e.target.value)} />
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="text-red-600"
                    onClick={() => setSection("exams", profile.exams.filter((_, j) => j !== i))}>
                    <Trash2 size={14} className="mr-1" /> Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded border border-border border-l-2 border-l-gold">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base text-navy flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-gold" /> Identity references (last 4 only)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                We never store full Aadhaar or PAN numbers. Enter only the last 4 characters; the full number is typed on the official portal.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="aadhaarRef" label="Aadhaar (last 4 digits)" placeholder="XXXX-XXXX-1234" maxLength={14} value={profile.aadhaarRef} onChange={(e) => setSection("aadhaarRef", e.target.value)} />
              <Field id="panRef" label="PAN (last 4 characters)" placeholder="XXXXXX234F" maxLength={10} value={profile.panRef} onChange={(e) => setSection("panRef", e.target.value)} />
            </CardContent>
          </Card>

          <Button type="submit" disabled={saving} className="w-full bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </form>
      )}
    </div>
  );
}
