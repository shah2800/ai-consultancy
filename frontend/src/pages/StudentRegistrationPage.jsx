import { useMemo, useState } from "react";
import api from "../api/api";

const COUNTRIES = ["Georgia", "Azerbaijan", "Russia", "Turkey", "China", "Other"];
const PROGRAMS = ["MBBS", "MD", "Engineering", "Business", "Other"];

function fieldStyle() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    background: "var(--surface)",
  };
}

export default function StudentRegistrationPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    fatherName: "",
    dob: "",
    gender: "",
    phone: "",
    email: "",
    cityAddress: "",
    passportNumber: "",
    passportIssueDate: "",
    passportExpiry: "",
    matricGrade: "",
    fscGrade: "",
    otherDegree: "",
    ieltsScore: "",
    countryInterest: "Georgia",
    universityInterest: "Not decided",
    courseInterest: "MBBS",
  });
  const [docs, setDocs] = useState({
    matric: null,
    fsc: null,
    passport: null,
    photo: null,
    cnic: null,
    other: null,
  });

  const canSubmit = useMemo(() => (
    form.fullName &&
    form.fatherName &&
    form.dob &&
    form.gender &&
    form.phone &&
    form.email &&
    form.passportNumber &&
    form.passportExpiry &&
    form.countryInterest &&
    form.courseInterest
  ), [form]);

  const onChange = (key, value) => setForm((s) => ({ ...s, [key]: value }));
  const onFile = (key, file) => setDocs((s) => ({ ...s, [key]: file || null }));

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v || "")));
      for (const f of Object.values(docs)) {
        if (f) fd.append("attachments", f);
      }
      const res = await api.post("/public/website/apply", fd);
      if (!res?.data?.ok) throw new Error("Submission failed");
      setMsg("Your application has been received. Our team will contact you within 24 hours.");
    } catch (x) {
      setErr(x.response?.data?.error || x.message || "Could not submit application.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: 900, padding: "24px 20px 56px" }}>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Student Registration Form</h1>
      <p className="page-subtitle" style={{ marginBottom: 20 }}>
        Next Step International admissions registration.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <input style={fieldStyle()} placeholder="Full Name *" value={form.fullName} onChange={(e) => onChange("fullName", e.target.value)} required />
          <input style={fieldStyle()} placeholder="Father's Name *" value={form.fatherName} onChange={(e) => onChange("fatherName", e.target.value)} required />
          <input style={fieldStyle()} type="date" value={form.dob} onChange={(e) => onChange("dob", e.target.value)} required />
          <select style={fieldStyle()} value={form.gender} onChange={(e) => onChange("gender", e.target.value)} required>
            <option value="">Gender *</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <input style={fieldStyle()} placeholder="WhatsApp Number *" value={form.phone} onChange={(e) => onChange("phone", e.target.value)} required />
          <input style={fieldStyle()} type="email" placeholder="Email Address *" value={form.email} onChange={(e) => onChange("email", e.target.value)} required />
          <input style={fieldStyle()} placeholder="City / Address" value={form.cityAddress} onChange={(e) => onChange("cityAddress", e.target.value)} />
          <input style={fieldStyle()} placeholder="Passport Number *" value={form.passportNumber} onChange={(e) => onChange("passportNumber", e.target.value)} required />
          <input style={fieldStyle()} type="date" value={form.passportIssueDate} onChange={(e) => onChange("passportIssueDate", e.target.value)} />
          <input style={fieldStyle()} type="date" value={form.passportExpiry} onChange={(e) => onChange("passportExpiry", e.target.value)} required />
          <input style={fieldStyle()} placeholder="Matric Marks / Grade" value={form.matricGrade} onChange={(e) => onChange("matricGrade", e.target.value)} />
          <input style={fieldStyle()} placeholder="FSc Marks / Grade" value={form.fscGrade} onChange={(e) => onChange("fscGrade", e.target.value)} />
          <input style={fieldStyle()} placeholder="Other degree (optional)" value={form.otherDegree} onChange={(e) => onChange("otherDegree", e.target.value)} />
          <input style={fieldStyle()} placeholder="IELTS score (optional)" value={form.ieltsScore} onChange={(e) => onChange("ieltsScore", e.target.value)} />
          <select style={fieldStyle()} value={form.countryInterest} onChange={(e) => onChange("countryInterest", e.target.value)}>{COUNTRIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <input style={fieldStyle()} placeholder="University preference" value={form.universityInterest} onChange={(e) => onChange("universityInterest", e.target.value)} />
          <select style={fieldStyle()} value={form.courseInterest} onChange={(e) => onChange("courseInterest", e.target.value)}>{PROGRAMS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </div>

        <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Document Uploads</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <label style={{ fontSize: 12 }}>Matric Certificate<input type="file" onChange={(e) => onFile("matric", e.target.files?.[0])} /></label>
            <label style={{ fontSize: 12 }}>FSc Certificate<input type="file" onChange={(e) => onFile("fsc", e.target.files?.[0])} /></label>
            <label style={{ fontSize: 12 }}>Passport Copy<input type="file" onChange={(e) => onFile("passport", e.target.files?.[0])} /></label>
            <label style={{ fontSize: 12 }}>Passport Size Photo<input type="file" onChange={(e) => onFile("photo", e.target.files?.[0])} /></label>
            <label style={{ fontSize: 12 }}>CNIC Copy<input type="file" onChange={(e) => onFile("cnic", e.target.files?.[0])} /></label>
            <label style={{ fontSize: 12 }}>Other Document<input type="file" onChange={(e) => onFile("other", e.target.files?.[0])} /></label>
          </div>
        </div>

        {msg ? <div style={{ color: "#065f46", fontSize: 13 }}>{msg}</div> : null}
        {err ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div> : null}

        <button type="submit" disabled={!canSubmit || loading} className="btn btn-primary" style={{ width: 220 }}>
          {loading ? "Submitting..." : "Submit Application"}
        </button>
      </form>
    </div>
  );
}

