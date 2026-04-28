import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Page = "editor" | "records" | "settings";

interface Ratings {
  insight: number;
  impulse: number;
  judgment: number;
  global: number;
}

interface NoteData {
  id: string;
  title: string;
  clientId: string;
  sessionDate: string;
  sessionTime: string;
  sessionType: string;
  modality: string;
  chips: Record<string, string[]>;
  ratings: Ratings;
  subjectiveText: string;
  objectiveText: string;
  assessmentText: string;
  planText: string;
  savedAt: string;
}

interface Settings {
  clinicianName: string;
  practice: string;
  credentials: string;
  autosave: boolean;
  showCompletion: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RATING_LABELS: { key: keyof Ratings; label: string }[] = [
  { key: "insight", label: "Insight" },
  { key: "impulse", label: "Impulse control" },
  { key: "judgment", label: "Judgment" },
  { key: "global", label: "Global functioning" },
];

const CHIP_GROUPS = {
  mood: ["Anxious","Depressed","Irritable","Stable","Overwhelmed","Hopeful","Flat / Numb","Angry","Fearful","Grieving","Elated / Manic","Dissociated","Shame","Guilt"],
  complaint: ["Panic attacks","Sleep issues","Relationship conflict","Work stress","Trauma processing","Suicidal ideation","Self-harm urges","Grief / loss","Medication concerns","Substance use","Life transitions","Family conflict","Identity / self-worth","Social isolation"],
  affect: ["Congruent","Incongruent","Blunted","Flat","Labile","Expansive","Restricted","Full range"],
  behavior: ["Cooperative","Guarded","Tearful","Agitated","Calm","Engaged","Avoidant","Disorganized","Ruminating","Redirectable"],
  speech: ["Normal rate & rhythm","Pressured speech","Slowed / poverty","Linear thought","Tangential","Circumstantial","Disorganized","Goal-directed"],
  progress: ["Progressing well","Minimal progress","Regression noted","Goals met","Plateaued","New goals identified","Treatment resistant"],
  risk: ["No current SI/HI","Passive SI present","Active SI — no plan","SI with plan","HI present","Safety plan reviewed","Denied SI/HI","Contract for safety"],
  diagnosis: ["MDD","GAD","PTSD","Panic disorder","OCD","Bipolar I","Bipolar II","BPD","ADHD","ASD","Substance use disorder","Adjustment disorder","R/O — further eval"],
  interventions: [
    "Active listening","Building rapport","Empathic reflection","Paraphrasing","Validation","Unconditional positive regard","Therapeutic alliance building","Open-ended questioning","Summarizing","Clarification",
    "Psychoeducation","Cognitive restructuring","Thought challenging","Behavioral activation","Exposure","Systematic desensitization","Activity scheduling","Habit reversal","Problem-solving","Decision-making skills",
    "Emotion identification","Emotion regulation skills","Distress tolerance","Mindfulness","Grounding techniques","Relaxation training","Breathing exercises","Progressive muscle relaxation","Urge surfing",
    "Somatic work","EMDR processing","Trauma processing","Titration","Pendulation","Containment exercise","Safe place visualization",
    "DBT skills","Values clarification","Motivational interviewing","Narrative therapy","Externalizing the problem","Miracle question","Scaling questions","Chair work","Role play / modeling","Family systems work","Genogram work",
    "Crisis intervention","Safety planning","Coping plan development",
    "Grief work","Meaning-making",
  ],
  followup: ["1 week","2 weeks","Monthly","As needed","Referral made","Psychiatry consult","Higher level of care","Discharge planned"],
};

const DANGER_CHIPS = new Set(["SI with plan", "HI present"]);

const SECTION_COLORS = {
  S: "#3d6b5e",
  O: "#2f5c8f",
  A: "#8b5e2f",
  P: "#6b3d5e",
};

const SESSION_TYPES = ["Individual (50 min)","Individual (90 min)","Couples therapy","Family therapy","Group therapy","Intake / Assessment","Crisis session","Telehealth"];
const MODALITIES = ["CBT","DBT","Psychodynamic","ACT","EMDR","Person-centered","Trauma-focused CBT","Motivational Interviewing","Solution-focused","Eclectic / Integrative"];

const DEFAULT_NOTE = (): Omit<NoteData, "id" | "savedAt"> => {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    title: "",
    clientId: "",
    sessionDate: localDate,
    sessionTime: localTime,
    sessionType: "",
    modality: "",
    chips: {},
    ratings: { insight: 0, impulse: 0, judgment: 0, global: 0 },
    subjectiveText: "",
    objectiveText: "",
    assessmentText: "",
    planText: "",
  };
};

const DEFAULT_SETTINGS: Settings = {
  clinicianName: "",
  practice: "",
  credentials: "",
  autosave: true,
  showCompletion: true,
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadNotes(): NoteData[] {
  try { return JSON.parse(localStorage.getItem("soap_notes") || "[]"); } catch { return []; }
}
function saveNotes(notes: NoteData[]) { localStorage.setItem("soap_notes", JSON.stringify(notes)); }
function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("soap_settings") || "{}") }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function persistSettings(s: Settings) { localStorage.setItem("soap_settings", JSON.stringify(s)); }

// ─── Note builder helpers ─────────────────────────────────────────────────────

function fmtDate(d: string, long = false) {
  if (!d) return "—";
  const [year, month, day] = d.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", long
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildProseNote(note: Omit<NoteData, "id" | "savedAt">): {
  subjective: string; objective: string; assessment: string; plan: string;
} {
  const c = (g: string) => (note.chips[g] || []);
  const sParts: string[] = [];
  if (c("mood").length) sParts.push(`Client presented with a mood that was ${joinList(c("mood").map(m => m.toLowerCase()))}.`);
  if (c("complaint").length) sParts.push(`The client identified ${joinList(c("complaint").map(v => v.toLowerCase()))} as the primary concern(s) for this session.`);
  if (note.subjectiveText) sParts.push(note.subjectiveText.trim());

  const oParts: string[] = [];
  const affectChips = c("affect"), behaviorChips = c("behavior"), speechChips = c("speech");
  if (affectChips.length && behaviorChips.length) {
    oParts.push(`Client presented as ${joinList(behaviorChips.map(v => v.toLowerCase()))} with ${joinList(affectChips.map(v => v.toLowerCase()))} affect.`);
  } else if (affectChips.length) {
    oParts.push(`Client's affect was ${joinList(affectChips.map(v => v.toLowerCase()))}.`);
  } else if (behaviorChips.length) {
    oParts.push(`Client presented as ${joinList(behaviorChips.map(v => v.toLowerCase()))}.`);
  }
  if (speechChips.length) oParts.push(`Speech and thought process were ${joinList(speechChips.map(v => v.toLowerCase()))}.`);
  const ratedItems = RATING_LABELS.filter(r => note.ratings[r.key] > 0);
  if (ratedItems.length) {
    const ratingStr = ratedItems.map(r => `${r.label.toLowerCase()} was rated ${note.ratings[r.key]}/5`).join("; ");
    oParts.push(`${ratingStr.charAt(0).toUpperCase() + ratingStr.slice(1)}.`);
  }
  if (note.objectiveText) oParts.push(note.objectiveText.trim());

  const aParts: string[] = [];
  if (c("progress").length) aParts.push(`The client is ${joinList(c("progress").map(v => v.toLowerCase()))} toward treatment goals.`);
  if (c("diagnosis").length) aParts.push(`Presentation remains consistent with a diagnosis of ${joinList(c("diagnosis"))}.`);
  const riskChips = c("risk");
  if (riskChips.length) {
    const noRisk = riskChips.includes("No current SI/HI") || riskChips.includes("Denied SI/HI");
    const hasSI = riskChips.some(r => r.toLowerCase().includes("si"));
    const hasHI = riskChips.some(r => r.toLowerCase().includes("hi"));
    const safetyPlan = riskChips.includes("Safety plan reviewed") || riskChips.includes("Contract for safety");
    if (noRisk && !hasSI && !hasHI) {
      aParts.push("Client denied any suicidal or homicidal ideation at this time.");
    } else {
      const riskDesc = riskChips.filter(r => r !== "Safety plan reviewed" && r !== "Contract for safety").map(v => v.toLowerCase());
      if (riskDesc.length) aParts.push(`Risk assessment revealed ${joinList(riskDesc)}.`);
    }
    if (safetyPlan) aParts.push("Safety plan was reviewed and updated with the client.");
  }
  if (note.assessmentText) aParts.push(note.assessmentText.trim());

  const pParts: string[] = [];
  if (c("interventions").length) {
    const ints = c("interventions");
    pParts.push(ints.length === 1
      ? `This session included ${ints[0].toLowerCase()}.`
      : `Interventions utilized during this session included ${joinList(ints.map(v => v.toLowerCase()))}.`);
  }
  if (c("followup").length) {
    const fu = c("followup");
    const timeframes = fu.filter(f => ["1 week","2 weeks","Monthly","As needed"].includes(f));
    const actions = fu.filter(f => !["1 week","2 weeks","Monthly","As needed"].includes(f));
    if (timeframes.length) pParts.push(`Client will return for follow-up in ${joinList(timeframes.map(v => v.toLowerCase()))}.`);
    if (actions.length) pParts.push(`Additional steps include: ${joinList(actions.map(v => v.toLowerCase()))}.`);
  }
  if (note.planText) pParts.push(note.planText.trim());

  return { subjective: sParts.join(" "), objective: oParts.join(" "), assessment: aParts.join(" "), plan: pParts.join(" ") };
}

function buildPlainText(note: Omit<NoteData, "id" | "savedAt">, settings: Settings): string {
  const prose = buildProseNote(note);
  const line = "─".repeat(42);
  let t = `SOAP NOTE\n${line}\n`;
  if (settings.clinicianName) t += `Clinician: ${settings.clinicianName}${settings.credentials ? ", " + settings.credentials : ""}\n`;
  if (settings.practice) t += `Practice: ${settings.practice}\n`;
  t += `Client: ${note.clientId || "[Not specified]"}\n`;
  t += `Date: ${fmtDate(note.sessionDate, true)}${note.sessionTime ? " at " + fmtTime(note.sessionTime) : ""}\n`;
  if (note.sessionType) t += `Session: ${note.sessionType}\n`;
  if (note.modality) t += `Modality: ${note.modality}\n`;
  t += `\nSUBJECTIVE\n${line}\n${prose.subjective}\n`;
  t += `\nOBJECTIVE\n${line}\n${prose.objective}\n`;
  t += `\nASSESSMENT\n${line}\n${prose.assessment}\n`;
  t += `\nPLAN\n${line}\n${prose.plan}\n`;
  return t;
}

function buildRichHTML(note: Omit<NoteData, "id" | "savedAt">, settings: Settings): string {
  const prose = buildProseNote(note);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");
  const P = (text: string) => text ? `<p style="margin:6pt 0;font-size:10.5pt;line-height:1.7;font-family:Arial,sans-serif;">${nl2br(text)}</p>` : "";
  const SH = (letter: string, title: string, color: string) =>
    `<h2 style="font-size:13pt;color:${color};margin:16pt 0 4pt;border-bottom:1pt solid ${color};padding-bottom:3pt;font-family:Arial,sans-serif;">${letter} — ${title}</h2>`;
  let h = `<h1 style="font-size:18pt;margin:0 0 8pt;font-family:Georgia,serif;">SOAP Note</h1>`;
  h += `<table style="border-collapse:collapse;width:100%;margin-bottom:12pt;font-size:10pt;font-family:Arial,sans-serif;">`;
  h += `<tr><td style="padding:3pt 8pt 3pt 0;width:50%;"><b>Client:</b>&nbsp;${esc(note.clientId || "[Not specified]")}</td>`;
  h += `<td style="padding:3pt 0;"><b>Date:</b>&nbsp;${esc(fmtDate(note.sessionDate, true))}${note.sessionTime ? " at " + esc(fmtTime(note.sessionTime)) : ""}</td></tr>`;
  h += `<tr><td style="padding:3pt 8pt 3pt 0;"><b>Session:</b>&nbsp;${esc(note.sessionType || "—")}</td>`;
  h += `<td style="padding:3pt 0;"><b>Modality:</b>&nbsp;${esc(note.modality || "—")}</td></tr>`;
  if (settings.clinicianName) h += `<tr><td colspan="2" style="padding:3pt 0;"><b>Clinician:</b>&nbsp;${esc(settings.clinicianName + (settings.credentials ? ", " + settings.credentials : ""))}</td></tr>`;
  if (settings.practice) h += `<tr><td colspan="2" style="padding:3pt 0;"><b>Practice:</b>&nbsp;${esc(settings.practice)}</td></tr>`;
  h += `</table><hr style="border:none;border-top:1pt solid #bbb;margin-bottom:12pt;">`;
  h += SH("S", "Subjective", SECTION_COLORS.S) + P(prose.subjective);
  h += SH("O", "Objective", SECTION_COLORS.O) + P(prose.objective);
  h += SH("A", "Assessment", SECTION_COLORS.A) + P(prose.assessment);
  h += SH("P", "Plan", SECTION_COLORS.P) + P(prose.plan);
  h += `<hr style="border:none;border-top:1pt solid #ccc;margin-top:16pt;"><p style="font-size:8pt;color:#888;font-family:Arial,sans-serif;">Generated by SOAPnote · ${new Date().toLocaleDateString()}</p>`;
  return h;
}

// ─── useIsMobile hook ─────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChipGroup({ group, selected, onToggle }: { group: string; selected: string[]; onToggle: (g: string, v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(CHIP_GROUPS as Record<string, string[]>)[group].map(v => {
        const active = selected.includes(v);
        const isDanger = DANGER_CHIPS.has(v) && active;
        return (
          <button
            key={v}
            onClick={() => onToggle(group, v)}
            style={{
              padding: "6px 13px", borderRadius: 20, fontSize: 13,
              cursor: "pointer", border: `1px solid ${active ? (isDanger ? "#c0392b" : "#3d6b5e") : "#dde4e1"}`,
              background: active ? (isDanger ? "#fdf2f1" : "#e8f0ed") : "#f7f9f8",
              color: active ? (isDanger ? "#8b2218" : "#2a4d44") : "#4a5550",
              fontWeight: active ? 500 : 400, transition: "all 0.12s",
              fontFamily: "inherit", lineHeight: 1.4, touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >{v}</button>
        );
      })}
    </div>
  );
}

function RatingRow({ label, rKey, value, onChange }: { label: string; rKey: keyof Ratings; value: number; onChange: (k: keyof Ratings, v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#4a5550", width: 110, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        {[1,2,3,4,5].map(i => (
          <button key={i} onClick={() => onChange(rKey, i)} style={{
            width: 30, height: 30, borderRadius: "50%",
            border: `1px solid ${value >= i ? "#3d6b5e" : "#dde4e1"}`,
            background: value >= i ? "#3d6b5e" : "#f7f9f8",
            color: value >= i ? "white" : "#8a9491",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
            fontFamily: "inherit", touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}>{i}</button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: "#8a9491", minWidth: 28 }}>{value > 0 ? `${value}/5` : "—"}</span>
    </div>
  );
}

function SectionCard({
  letter, title, desc, color, expanded, onToggle, status, children
}: {
  letter: string; title: string; desc: string; color: string;
  expanded: boolean; onToggle: () => void;
  status: "empty" | "partial" | "done";
  children: React.ReactNode;
}) {
  const statusStyles = {
    empty: { background: "#f0ede8", color: "#9a8870" },
    partial: { background: "#fff4e6", color: "#9a6a20" },
    done: { background: "#e8f0ed", color: "#2a4d44" },
  };
  const statusLabels = { empty: "Empty", partial: "In progress", done: "Complete" };
  return (
    <div style={{ background: "white", border: "1px solid #dde4e1", borderRadius: 16, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18, color: "white", flexShrink: 0 }}>
          {letter}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#1a1f1d" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#8a9491", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</div>
        </div>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 500, flexShrink: 0, ...statusStyles[status] }}>
          {statusLabels[status]}
        </span>
        <svg style={{ width: 18, height: 18, color: "#8a9491", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none", flexShrink: 0 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M5 7l5 5 5-5" />
        </svg>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 20px", borderTop: "1px solid #eef1f0" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", padding: "10px 12px", border: "1px solid #dde4e1", borderRadius: 6,
        fontSize: 14, fontFamily: "inherit", color: "#1a1f1d", background: "#f7f9f8",
        resize: "vertical", minHeight: 90, outline: "none", lineHeight: 1.65,
        transition: "border-color 0.15s", boxSizing: "border-box",
      }}
      onFocus={e => { e.target.style.borderColor = "#3d6b5e"; e.target.style.boxShadow = "0 0 0 3px rgba(61,107,94,0.1)"; e.target.style.background = "white"; }}
      onBlur={e => { e.target.style.borderColor = "#dde4e1"; e.target.style.boxShadow = "none"; e.target.style.background = "#f7f9f8"; }}
    />
  );
}

function Btn({ children, onClick, variant = "default", style: extraStyle }: { children: React.ReactNode; onClick: () => void; variant?: "default" | "sage" | "ghost" | "danger"; style?: React.CSSProperties }) {
  const styles = {
    default: { background: "white", color: "#4a5550", border: "1px solid #dde4e1" },
    sage: { background: "#3d6b5e", color: "white", border: "1px solid #3d6b5e", fontWeight: 500 as const },
    ghost: { background: "transparent", color: "#8a9491", border: "1px solid transparent" },
    danger: { background: "#fdf2f1", color: "#c0392b", border: "1px solid #f0c9c6" },
  };
  return (
    <button onClick={onClick} style={{
      padding: "9px 16px", borderRadius: 6, fontSize: 13, fontFamily: "inherit",
      cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
      touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
      ...styles[variant], ...extraStyle,
    }}>{children}</button>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: 44, height: 26, borderRadius: 13, border: "none",
      background: on ? "#3d6b5e" : "#dde4e1", cursor: "pointer",
      position: "relative", transition: "background 0.2s", flexShrink: 0,
      touchAction: "manipulation",
    }}>
      <span style={{
        position: "absolute", width: 20, height: 20, borderRadius: "50%",
        background: "white", top: 3, left: on ? 21 : 3,
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function MetaSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491" }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        padding: "9px 28px 9px 10px", border: "1px solid #dde4e1", borderRadius: 6,
        fontSize: 14, fontFamily: "inherit", color: value ? "#1a1f1d" : "#8a9491",
        background: "#f7f9f8", outline: "none", cursor: "pointer", appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a9491' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
        width: "100%",
      }}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MetaInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        padding: "9px 10px", border: "1px solid #dde4e1", borderRadius: 6,
        fontSize: 14, fontFamily: "inherit", color: "#1a1f1d",
        background: "#f7f9f8", outline: "none", width: "100%", boxSizing: "border-box",
      }}
        onFocus={e => { e.target.style.borderColor = "#3d6b5e"; e.target.style.background = "white"; }}
        onBlur={e => { e.target.style.borderColor = "#dde4e1"; e.target.style.background = "#f7f9f8"; }}
      />
    </div>
  );
}

function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const parseTime = (v: string) => {
    if (!v) return { hour: "12", minute: "00", ampm: "AM" };
    const [h, m] = v.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = String(h % 12 || 12);
    return { hour, minute: String(m).padStart(2, "0"), ampm };
  };
  const { hour, minute, ampm } = parseTime(value);
  const update = (h: string, m: string, ap: string) => {
    let h24 = parseInt(h) % 12;
    if (ap === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${m}`);
  };
  const selectStyle: React.CSSProperties = {
    padding: "9px 4px", border: "1px solid #dde4e1", borderRadius: 6,
    fontSize: 14, fontFamily: "inherit", color: "#1a1f1d",
    background: "#f7f9f8", outline: "none", cursor: "pointer",
    appearance: "none", textAlign: "center", flex: 1,
  };
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = ["00","05","10","15","20","25","30","35","40","45","50","55"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491" }}>{label}</label>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <select value={hour} onChange={e => update(e.target.value, minute, ampm)} style={selectStyle}
          onFocus={e => { e.target.style.borderColor = "#3d6b5e"; e.target.style.background = "white"; }}
          onBlur={e => { e.target.style.borderColor = "#dde4e1"; e.target.style.background = "#f7f9f8"; }}>
          {hours.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{ color: "#8a9491", fontWeight: 500, flexShrink: 0 }}>:</span>
        <select value={minute} onChange={e => update(hour, e.target.value, ampm)} style={selectStyle}
          onFocus={e => { e.target.style.borderColor = "#3d6b5e"; e.target.style.background = "white"; }}
          onBlur={e => { e.target.style.borderColor = "#dde4e1"; e.target.style.background = "#f7f9f8"; }}>
          {minutes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={ampm} onChange={e => update(hour, minute, e.target.value)} style={selectStyle}
          onFocus={e => { e.target.style.borderColor = "#3d6b5e"; e.target.style.background = "white"; }}
          onBlur={e => { e.target.style.borderColor = "#dde4e1"; e.target.style.background = "#f7f9f8"; }}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

// ─── Mobile Drawer (sidebar) ──────────────────────────────────────────────────

function MobileDrawer({ open, onClose, notes, currentNoteId, onOpen, onNew }: {
  open: boolean; onClose: () => void; notes: NoteData[]; currentNoteId: string | null;
  onOpen: (id: string) => void; onNew: () => void;
}) {
  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 150, backdropFilter: "blur(2px)" }} />
      )}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 280, background: "white",
        zIndex: 160, transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: open ? "4px 0 24px rgba(0,0,0,0.15)" : "none",
        overflowY: "auto", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "1.25rem 1rem 0.5rem", borderBottom: "1px solid #eef1f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18 }}>Notes</span>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#f7f9f8", cursor: "pointer", fontSize: 16, color: "#8a9491" }}>✕</button>
        </div>
        <div style={{ padding: "1rem" }}>
          <button onClick={() => { onNew(); onClose(); }} style={{ width: "100%", padding: 10, background: "#3d6b5e", color: "white", border: "none", borderRadius: 6, fontSize: 14, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 500, marginBottom: "1rem", touchAction: "manipulation" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>
            New note
          </button>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a9491", marginBottom: 8, padding: "0 4px" }}>Recent notes</div>
          {notes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#8a9491", fontSize: 12, lineHeight: 1.7 }}>No notes yet.<br />Create your first note above.</div>
          ) : notes.slice(0, 10).map(n => (
            <div key={n.id} onClick={() => { onOpen(n.id); onClose(); }} style={{
              padding: "10px 12px", borderRadius: 6, cursor: "pointer",
              background: n.id === currentNoteId ? "#e8f0ed" : "transparent",
              border: `1px solid ${n.id === currentNoteId ? "#b0cdc4" : "transparent"}`,
              marginBottom: 2, WebkitTapHighlightColor: "transparent",
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1f1d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title || "Untitled"}</div>
              <div style={{ fontSize: 11, color: "#8a9491", marginTop: 2 }}>{n.clientId || "No client"} · {n.sessionDate ? fmtDate(n.sessionDate) : "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ note, settings, onClose, onCopy, onPrint, isMobile }: {
  note: Omit<NoteData, "id" | "savedAt">;
  settings: Settings;
  onClose: () => void;
  onCopy: () => void;
  onPrint: () => void;
  isMobile: boolean;
}) {
  const prose = buildProseNote(note);
  const SectionPreview = ({ letter, title, color, text }: { letter: string; title: string; color: string; text: string }) => (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `1.5px solid ${color}22` }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "white", fontFamily: "Georgia, serif", flexShrink: 0 }}>{letter}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color, letterSpacing: "0.01em" }}>{title}</span>
      </div>
      {text
        ? <p style={{ fontSize: 13, color: "#2a2e2c", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{text}</p>
        : <p style={{ fontSize: 12, color: "#b0bbb8", fontStyle: "italic", margin: 0 }}>No content recorded for this section.</p>
      }
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,26,0.55)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : "2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "16px 16px 0 0" : 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)", width: "100%", maxWidth: isMobile ? "100%" : 680, maxHeight: isMobile ? "92vh" : "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #dde4e1", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: "-0.02em" }}>Note preview</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f7f9f8", cursor: "pointer", fontSize: 16, color: "#8a9491", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          <div style={{ background: "#f7f9f8", borderRadius: 6, padding: "12px 14px", marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[["Client", note.clientId || "—"], ["Date", fmtDate(note.sessionDate, true)], ["Time", note.sessionTime ? fmtTime(note.sessionTime) : "—"], ["Session", note.sessionType || "—"], ["Modality", note.modality || "—"], ...(settings.clinicianName ? [["Clinician", settings.clinicianName + (settings.credentials ? `, ${settings.credentials}` : "")]] : []), ...(settings.practice ? [["Practice", settings.practice]] : [])].map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: "#4a5550" }}><strong style={{ color: "#1a1f1d", fontWeight: 500 }}>{k}:</strong> {v}</div>
            ))}
          </div>
          <SectionPreview letter="S" title="Subjective" color={SECTION_COLORS.S} text={prose.subjective} />
          <SectionPreview letter="O" title="Objective" color={SECTION_COLORS.O} text={prose.objective} />
          <SectionPreview letter="A" title="Assessment" color={SECTION_COLORS.A} text={prose.assessment} />
          <SectionPreview letter="P" title="Plan" color={SECTION_COLORS.P} text={prose.plan} />
        </div>
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid #dde4e1", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          {!isMobile && <Btn onClick={onPrint}>Print / PDF</Btn>}
          <Btn variant="sage" onClick={onCopy}>Copy for Google Docs</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: "#1a1f1d", color: "white", padding: "10px 20px",
      borderRadius: 20, fontSize: 13, fontWeight: 500,
      pointerEvents: "none", zIndex: 999, whiteSpace: "nowrap",
      opacity: msg ? 1 : 0, transition: "opacity 0.25s",
    }}>{msg}</div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const isMobile = useIsMobile();
  const [page, setPage] = useState<Page>("editor");
  const [note, setNote] = useState<Omit<NoteData, "id" | "savedAt">>(DEFAULT_NOTE());
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState("Draft · Not saved");
  const [expandedSections, setExpandedSections] = useState({ s: true, o: false, a: false, p: false });
  const [showPreview, setShowPreview] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [notes, setNotesState] = useState<NoteData[]>(loadNotes);
  const [toast, setToast] = useState("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    if (!settings.autosave) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem("soap_draft", JSON.stringify(note));
      setSavedStatus("Draft · Autosaved");
    }, 800);
  }, [note, settings.autosave]);

  const completion = (() => {
    let s = 0;
    if (note.clientId) s++;
    if (note.sessionDate) s++;
    if (note.sessionType) s++;
    if (note.modality) s++;
    if ((note.chips.mood?.length || 0) + (note.chips.complaint?.length || 0) > 0) s++;
    if (note.subjectiveText) s++;
    if ((note.chips.affect?.length || 0) + (note.chips.behavior?.length || 0) > 0) s++;
    if (note.objectiveText) s++;
    if ((note.chips.progress?.length || 0) + (note.chips.risk?.length || 0) + (note.assessmentText ? 1 : 0) > 0) s++;
    if ((note.chips.interventions?.length || 0) + (note.planText ? 1 : 0) > 0) s++;
    return Math.round((s / 10) * 100);
  })();

  const sectionStatus = (id: "s" | "o" | "a" | "p"): "empty" | "partial" | "done" => {
    const c = (g: string) => (note.chips[g] || []).length;
    let score = 0;
    if (id === "s") { if (c("mood")) score++; if (c("complaint")) score++; if (note.subjectiveText) score++; }
    else if (id === "o") { if (c("affect")) score++; if (c("behavior")) score++; if (Object.values(note.ratings).some(v => v > 0)) score++; if (note.objectiveText) score++; score = Math.min(score, 3); }
    else if (id === "a") { if (c("progress")) score++; if (c("risk")) score++; if (note.assessmentText) score++; }
    else if (id === "p") { if (c("interventions")) score++; if (c("followup")) score++; if (note.planText) score++; }
    return score === 0 ? "empty" : score < 3 ? "partial" : "done";
  };

  const toggleChip = (group: string, value: string) => {
    setNote(prev => {
      const existing = prev.chips[group] || [];
      const next = existing.includes(value) ? existing.filter(v => v !== value) : [...existing, value];
      return { ...prev, chips: { ...prev.chips, [group]: next } };
    });
  };

  const setRating = (key: keyof Ratings, val: number) => {
    setNote(prev => ({ ...prev, ratings: { ...prev.ratings, [key]: val } }));
  };

  const saveNote = () => {
    const all = loadNotes();
    const id = currentNoteId || Date.now().toString();
    setCurrentNoteId(id);
    const record: NoteData = { ...note, id, savedAt: new Date().toISOString() };
    const idx = all.findIndex(n => n.id === id);
    if (idx >= 0) all[idx] = record; else all.unshift(record);
    saveNotes(all);
    setNotesState([...all]);
    setSavedStatus(`Saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    showToast("Note saved!");
  };

  const newNote = () => {
    setCurrentNoteId(null);
    setNote(DEFAULT_NOTE());
    setSavedStatus("Draft · Not saved");
    setPage("editor");
  };

  const openNote = (id: string) => {
    const n = notes.find(n => n.id === id);
    if (!n) return;
    setCurrentNoteId(id);
    const { id: _id, savedAt, ...rest } = n;
    setNote({ ...rest, sessionTime: rest.sessionTime || "" });
    setSavedStatus(`Saved · ${new Date(n.savedAt).toLocaleDateString()}`);
    setPage("editor");
  };

  const clearEditor = () => {
    if (!window.confirm("Clear this note?")) return;
    setCurrentNoteId(null);
    setNote(DEFAULT_NOTE());
    setSavedStatus("Draft · Not saved");
  };

  const copyForGoogleDocs = () => {
    const html = buildRichHTML(note, settings);
    const plain = buildPlainText(note, settings);
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([plain], { type: "text/plain" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })])
        .then(() => showToast("Copied! Paste into Google Docs ✓"))
        .catch(() => navigator.clipboard.writeText(plain).then(() => showToast("Copied as plain text")));
    } else {
      navigator.clipboard.writeText(plain).then(() => showToast("Copied to clipboard"));
    }
    setShowPreview(false);
  };

  const printNote = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SOAP Note</title>
      <style>body{font-family:Georgia,serif;font-size:11pt;line-height:1.6;color:#111;padding:2cm 2.5cm;max-width:800px;margin:0 auto;}h1{font-size:16pt;margin-bottom:6pt;}h2{font-size:12pt;margin:14pt 0 5pt;padding-bottom:3pt;border-bottom:1pt solid currentColor;}table{width:100%;border-collapse:collapse;margin-bottom:12pt;font-size:10pt;}td{padding:3pt 8pt 3pt 0;vertical-align:top;width:50%;}p{margin:4pt 0;font-size:10pt;}hr{border:none;border-top:.5pt solid #ccc;margin:14pt 0;}</style>
      </head><body>${buildRichHTML(note, settings)}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const exportAll = () => {
    if (!notes.length) { showToast("No records to export"); return; }
    const text = notes.map(n => { const { id, savedAt, ...rest } = n; return buildPlainText(rest, settings); }).join("\n\n" + "═".repeat(60) + "\n\n");
    const a = document.createElement("a");
    a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
    a.download = "soap_notes_export.txt";
    a.click();
    showToast("Exported!");
  };

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    persistSettings(next);
  };

  const deleteAllRecords = () => {
    if (!window.confirm("Delete ALL saved records? This cannot be undone.")) return;
    localStorage.removeItem("soap_notes");
    setNotesState([]);
    showToast("All records cleared");
  };

  // ── Bottom nav pages (mobile) ──
  const NAV_ITEMS: { p: Page; label: string; icon: React.ReactNode }[] = [

    {
      p: "editor", label: "Editor",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    },
    {
      p: "records", label: "Records",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    },
    {
      p: "settings", label: "Settings",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }
        input[type="date"] { -webkit-appearance: none; appearance: none; }
        @media (max-width: 767px) {
          .meta-grid-mobile { grid-template-columns: 1fr 1fr !important; }
          .meta-grid-mobile > *:last-child:nth-child(odd) { grid-column: span 2; }
          .editor-actions-mobile { flex-wrap: wrap; gap: 6px !important; }
          .editor-actions-mobile > * { flex: 1; min-width: 80px; text-align: center; justify-content: center; }
          .bottom-actions-mobile { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px; }
          .objective-grid-mobile { grid-template-columns: 1fr !important; }
          .assessment-grid-mobile { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif", background: "#f7f9f8", color: "#1a1f1d", minHeight: "100vh", fontSize: 14, lineHeight: 1.6, paddingBottom: isMobile ? 64 : 0 }}>

        {/* TOP BAR */}
        <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(247,249,248,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #dde4e1", padding: isMobile ? "0 1rem" : "0 2rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isMobile && (
              <button onClick={() => setShowDrawer(true)} style={{ width: 36, height: 36, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: 6, touchAction: "manipulation" }}>
                <span style={{ width: 20, height: 2, background: "#4a5550", borderRadius: 1, display: "block" }} />
                <span style={{ width: 20, height: 2, background: "#4a5550", borderRadius: 1, display: "block" }} />
                <span style={{ width: 20, height: 2, background: "#4a5550", borderRadius: 1, display: "block" }} />
              </button>
            )}
            <div style={{ width: 32, height: 32, background: "#3d6b5e", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="white"><path d="M3 5h14v2H3zm0 4h10v2H3zm0 4h12v2H3z" /></svg>
            </div>
            <span style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: isMobile ? 18 : 20, letterSpacing: "-0.02em" }}>SOAPnote</span>
            {!isMobile && <span style={{ fontSize: 11, color: "#8a9491", letterSpacing: "0.05em", textTransform: "uppercase", marginLeft: 4 }}>Clinical</span>}
          </div>

          {/* Desktop tab nav */}
          {!isMobile && (
            <div style={{ display: "flex", gap: 2, background: "#eef1f0", borderRadius: 6, padding: 3 }}>
              {(["editor", "records", "settings"] as Page[]).map((p, i) => (
                <button key={p} onClick={() => setPage(p)} style={{
                  padding: "5px 14px", borderRadius: 5, fontSize: 13, cursor: "pointer", border: "none",
                  background: page === p ? "white" : "transparent",
                  color: page === p ? "#1a1f1d" : "#8a9491",
                  boxShadow: page === p ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  fontWeight: page === p ? 500 : 400, transition: "all 0.15s", fontFamily: "inherit",
                }}>
                  {["New note", "Records", "Settings"][i]}
                </button>
              ))}
            </div>
          )}

          {/* Mobile: save button in topbar */}
          {isMobile && page === "editor" && (
            <Btn variant="sage" onClick={saveNote} style={{ padding: "7px 14px", fontSize: 13 }}>Save</Btn>
          )}
          {isMobile && page !== "editor" && (
            <button onClick={newNote} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#3d6b5e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>
            </button>
          )}
        </div>

        {/* Mobile drawer */}
        {isMobile && (
          <MobileDrawer
            open={showDrawer}
            onClose={() => setShowDrawer(false)}
            notes={notes}
            currentNoteId={currentNoteId}
            onOpen={openNote}
            onNew={newNote}
          />
        )}

        {/* LAYOUT */}
        <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>

          {/* Desktop Sidebar */}
          {!isMobile && (
            <div style={{ width: 260, flexShrink: 0, background: "white", borderRight: "1px solid #dde4e1", padding: "1.5rem 0", position: "sticky", top: 56, height: "calc(100vh - 56px)", overflowY: "auto" }}>
              <div style={{ padding: "0 1rem 1.5rem" }}>
                <button onClick={newNote} style={{ width: "100%", padding: 9, background: "#3d6b5e", color: "white", border: "none", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 500, marginBottom: "1rem" }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>
                  New note
                </button>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a9491", marginBottom: 8, padding: "0 4px" }}>Recent notes</div>
                {notes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#8a9491", fontSize: 12, lineHeight: 1.7 }}>No notes yet.<br />Create your first note above.</div>
                ) : notes.slice(0, 10).map(n => (
                  <div key={n.id} onClick={() => openNote(n.id)} style={{ padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: n.id === currentNoteId ? "#e8f0ed" : "transparent", border: `1px solid ${n.id === currentNoteId ? "#b0cdc4" : "transparent"}`, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1f1d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: "#8a9491", marginTop: 2 }}>{n.clientId || "No client"} · {n.sessionDate ? fmtDate(n.sessionDate) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MAIN */}
          <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "1rem" : "2rem", maxWidth: isMobile ? "100%" : 820 }}>

            {/* ── EDITOR ── */}
            {page === "editor" && (
              <div>
                {/* Header */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <input
                    value={note.title}
                    onChange={e => setNote(p => ({ ...p, title: e.target.value }))}
                    placeholder="Untitled note"
                    style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: isMobile ? 22 : 28, border: "none", background: "transparent", color: "#1a1f1d", outline: "none", width: "100%", letterSpacing: "-0.02em", lineHeight: 1.2 }}
                  />
                  <div style={{ fontSize: 12, color: "#8a9491", marginTop: 4 }}>{savedStatus}</div>
                </div>

                {/* Desktop action buttons */}
                {!isMobile && (
                  <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", justifyContent: "flex-end" }}>
                    <Btn variant="ghost" onClick={clearEditor}>Clear</Btn>
                    <Btn onClick={() => setShowPreview(true)}>Preview</Btn>
                    <Btn variant="sage" onClick={saveNote}>Save note</Btn>
                  </div>
                )}

                {/* Mobile action row */}
                {isMobile && (
                  <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
                    <Btn onClick={() => setShowPreview(true)} style={{ flex: 1, textAlign: "center" }}>Preview</Btn>
                    <Btn onClick={copyForGoogleDocs} style={{ flex: 1, textAlign: "center", fontSize: 12 }}>Copy</Btn>
                    <Btn variant="ghost" onClick={clearEditor} style={{ padding: "9px 12px" }}>Clear</Btn>
                  </div>
                )}

                {/* Completion bar */}
                {settings.showCompletion && (
                  <div style={{ height: 3, background: "#eef1f0", borderRadius: 2, marginBottom: "1.5rem", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#3d6b5e", borderRadius: 2, width: `${completion}%`, transition: "width 0.4s ease" }} />
                  </div>
                )}

                {/* Meta grid — 2 cols on mobile, 5 on desktop */}
                <div className="meta-grid-mobile" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,1fr)", gap: isMobile ? 10 : 12, marginBottom: "1.5rem", padding: isMobile ? "1rem" : "1.25rem", background: "white", border: "1px solid #dde4e1", borderRadius: 10 }}>
                  <MetaInput label="Client ID" value={note.clientId} onChange={v => setNote(p => ({ ...p, clientId: v }))} placeholder="e.g. J. Smith" />
                  <MetaInput label="Session date" value={note.sessionDate} onChange={v => setNote(p => ({ ...p, sessionDate: v }))} type="date" />
                  <TimePicker label="Session time" value={note.sessionTime} onChange={v => setNote(p => ({ ...p, sessionTime: v }))} />
                  <MetaSelect label="Session type" value={note.sessionType} onChange={v => setNote(p => ({ ...p, sessionType: v }))} options={SESSION_TYPES} />
                  <MetaSelect label="Modality" value={note.modality} onChange={v => setNote(p => ({ ...p, modality: v }))} options={MODALITIES} />
                </div>

                {/* SOAP sections */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                  <SectionCard letter="S" title="Subjective" desc="Client's self-report, presenting concerns & mood" color={SECTION_COLORS.S} expanded={expandedSections.s} onToggle={() => setExpandedSections(p => ({ ...p, s: !p.s }))} status={sectionStatus("s")}>
                    <FieldGroup label="Presenting mood">
                      <ChipGroup group="mood" selected={note.chips.mood || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Chief complaint / focus">
                      <ChipGroup group="complaint" selected={note.chips.complaint || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Client's own words / narrative">
                      <TextArea value={note.subjectiveText} onChange={v => setNote(p => ({ ...p, subjectiveText: v }))} placeholder="Client reported that…" rows={4} />
                    </FieldGroup>
                  </SectionCard>

                  <SectionCard letter="O" title="Objective" desc="Clinician observations — affect, behavior, mental status" color={SECTION_COLORS.O} expanded={expandedSections.o} onToggle={() => setExpandedSections(p => ({ ...p, o: !p.o }))} status={sectionStatus("o")}>
                    <div className="objective-grid-mobile" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", marginBottom: 8 }}>Affect</div>
                        <ChipGroup group="affect" selected={note.chips.affect || []} onToggle={toggleChip} />
                      </div>
                      <div style={{ marginTop: isMobile ? 12 : 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", marginBottom: 8 }}>Behavior / presentation</div>
                        <ChipGroup group="behavior" selected={note.chips.behavior || []} onToggle={toggleChip} />
                      </div>
                    </div>
                    <div style={{ height: 1, background: "#eef1f0", margin: "16px 0" }} />
                    <FieldGroup label="Functional ratings (1 = low, 5 = high)">
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto" }}>
                        {RATING_LABELS.map(r => <RatingRow key={r.key} label={r.label} rKey={r.key} value={note.ratings[r.key]} onChange={setRating} />)}
                      </div>
                    </FieldGroup>
                    <FieldGroup label="Speech & thought process">
                      <ChipGroup group="speech" selected={note.chips.speech || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Additional observations">
                      <TextArea value={note.objectiveText} onChange={v => setNote(p => ({ ...p, objectiveText: v }))} placeholder="Client presented as… Eye contact was…" rows={3} />
                    </FieldGroup>
                  </SectionCard>

                  <SectionCard letter="A" title="Assessment" desc="Clinical formulation, diagnosis status, risk level" color={SECTION_COLORS.A} expanded={expandedSections.a} onToggle={() => setExpandedSections(p => ({ ...p, a: !p.a }))} status={sectionStatus("a")}>
                    <div className="assessment-grid-mobile" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", marginBottom: 8 }}>Progress toward goals</div>
                        <ChipGroup group="progress" selected={note.chips.progress || []} onToggle={toggleChip} />
                      </div>
                      <div style={{ marginTop: isMobile ? 12 : 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", marginBottom: 8 }}>Risk assessment</div>
                        <ChipGroup group="risk" selected={note.chips.risk || []} onToggle={toggleChip} />
                      </div>
                    </div>
                    <FieldGroup label="Diagnostic impression">
                      <ChipGroup group="diagnosis" selected={note.chips.diagnosis || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Clinical impressions">
                      <TextArea value={note.assessmentText} onChange={v => setNote(p => ({ ...p, assessmentText: v }))} placeholder="Client continues to demonstrate… Symptoms are consistent with…" rows={4} />
                    </FieldGroup>
                  </SectionCard>

                  <SectionCard letter="P" title="Plan" desc="Interventions used, next steps, homework" color={SECTION_COLORS.P} expanded={expandedSections.p} onToggle={() => setExpandedSections(p => ({ ...p, p: !p.p }))} status={sectionStatus("p")}>
                    <FieldGroup label="Interventions used this session">
                      <ChipGroup group="interventions" selected={note.chips.interventions || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Follow-up">
                      <ChipGroup group="followup" selected={note.chips.followup || []} onToggle={toggleChip} />
                    </FieldGroup>
                    <FieldGroup label="Plan details & homework">
                      <TextArea value={note.planText} onChange={v => setNote(p => ({ ...p, planText: v }))} placeholder="Continue to work on… Client will practice…" rows={4} />
                    </FieldGroup>
                  </SectionCard>
                </div>

                {/* Bottom actions */}
                {!isMobile && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #dde4e1" }}>
                    <Btn variant="ghost" onClick={clearEditor}>Clear all</Btn>
                    <Btn onClick={copyForGoogleDocs}>Copy for Google Docs</Btn>
                    <Btn onClick={() => setShowPreview(true)}>Preview</Btn>
                    <Btn variant="sage" onClick={saveNote}>Save note</Btn>
                  </div>
                )}
                {isMobile && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #dde4e1" }}>
                    <Btn onClick={() => setShowPreview(true)} style={{ textAlign: "center" }}>Preview</Btn>
                    <Btn variant="sage" onClick={saveNote} style={{ textAlign: "center" }}>Save note</Btn>
                  </div>
                )}
              </div>
            )}

            {/* ── RECORDS ── */}
            {page === "records" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                  <h2 style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: isMobile ? 22 : 26, letterSpacing: "-0.02em" }}>Saved records</h2>
                  {!isMobile && <Btn variant="sage" onClick={newNote}>New note</Btn>}
                </div>
                {notes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#8a9491" }}>
                    <div style={{ width: 56, height: 56, background: "#e8f0ed", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#3d6b5e"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2zm-1 7V3.5L18.5 9H13z" /></svg>
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: "#4a5550", marginBottom: 6 }}>No records yet</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.7 }}>Save your first note to see it appear here.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 10 }}>
                    {notes.map(n => (
                      <div key={n.id} onClick={() => openNote(n.id)} style={{ background: "white", border: "1px solid #dde4e1", borderRadius: 10, padding: "1rem", cursor: "pointer", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#b0cdc4"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#dde4e1"; }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1f1d", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || n.clientId || "Untitled"}</div>
                          <div style={{ fontSize: 11, color: "#8a9491", flexShrink: 0 }}>{fmtDate(n.sessionDate)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {[n.sessionType, n.modality].filter(Boolean).map(t => (
                            <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "#eef1f0", color: "#8a9491", fontWeight: 500 }}>{t}</span>
                          ))}
                        </div>
                        {(n.subjectiveText || n.assessmentText) && (
                          <div style={{ fontSize: 12, color: "#8a9491", marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {(n.subjectiveText || n.assessmentText).slice(0, 120)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SETTINGS ── */}
            {page === "settings" && (
              <div>
                <h2 style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: isMobile ? 22 : 26, letterSpacing: "-0.02em", marginBottom: "1.5rem" }}>Settings</h2>
                {[
                  {
                    title: "Clinician info",
                    rows: [
                      { label: "Clinician name", desc: "Appears in exported notes", el: <input value={settings.clinicianName} onChange={e => updateSettings({ clinicianName: e.target.value })} placeholder="Dr. Jane Smith" style={{ padding: "9px 10px", border: "1px solid #dde4e1", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "#1a1f1d", background: "#f7f9f8", outline: "none", width: isMobile ? "100%" : 220 }} /> },
                      { label: "Practice / Organization", desc: "Optional — shown in note header", el: <input value={settings.practice} onChange={e => updateSettings({ practice: e.target.value })} placeholder="Westside Wellness Center" style={{ padding: "9px 10px", border: "1px solid #dde4e1", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "#1a1f1d", background: "#f7f9f8", outline: "none", width: isMobile ? "100%" : 220 }} /> },
                      { label: "License / credentials", desc: "", el: <input value={settings.credentials} onChange={e => updateSettings({ credentials: e.target.value })} placeholder="LCSW, Licensed Psychologist…" style={{ padding: "9px 10px", border: "1px solid #dde4e1", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "#1a1f1d", background: "#f7f9f8", outline: "none", width: isMobile ? "100%" : 220 }} /> },
                    ]
                  },
                  {
                    title: "Preferences",
                    rows: [
                      { label: "Auto-save drafts", desc: "Saves note state to local storage as you type", el: <Toggle on={settings.autosave} onToggle={() => updateSettings({ autosave: !settings.autosave })} /> },
                      { label: "Show completion bar", desc: "", el: <Toggle on={settings.showCompletion} onToggle={() => updateSettings({ showCompletion: !settings.showCompletion })} /> },
                    ]
                  },
                  {
                    title: "Data",
                    rows: [
                      { label: "Export all records", desc: "Downloads all saved notes as a .txt file", el: <Btn onClick={exportAll}>Export all</Btn> },
                      { label: "Clear all records", desc: "Permanently deletes all saved notes", el: <Btn variant="danger" onClick={deleteAllRecords}>Clear records</Btn> },
                    ]
                  }
                ].map(section => (
                  <div key={section.title} style={{ background: "white", border: "1px solid #dde4e1", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
                    <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#8a9491", background: "#f7f9f8", borderBottom: "1px solid #dde4e1" }}>{section.title}</div>
                    {section.rows.map((row, i) => (
                      <div key={row.label} style={{ padding: "14px 16px", display: "flex", alignItems: isMobile && typeof row.el === "object" && (row.el as any)?.props?.placeholder ? "flex-start" : "center", flexDirection: isMobile && typeof row.el === "object" && (row.el as any)?.props?.placeholder ? "column" : "row", justifyContent: "space-between", borderBottom: i < section.rows.length - 1 ? "1px solid #eef1f0" : "none", gap: "8px" }}>
                        <div>
                          <div style={{ fontSize: 13, color: "#1a1f1d" }}>{row.label}</div>
                          {row.desc && <div style={{ fontSize: 11, color: "#8a9491", marginTop: 2 }}>{row.desc}</div>}
                        </div>
                        {row.el}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile bottom nav */}
        {isMobile && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 64, background: "rgba(247,249,248,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid #dde4e1", display: "flex", zIndex: 100 }}>
            {NAV_ITEMS.map(({ p, label, icon }) => (
              <button key={p} onClick={() => setPage(p)} style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: page === p ? "#3d6b5e" : "#8a9491", fontFamily: "inherit", touchAction: "manipulation", WebkitTapHighlightColor: "transparent", transition: "color 0.15s" }}>
                {icon}
                <span style={{ fontSize: 10, fontWeight: page === p ? 500 : 400 }}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPreview && (
        <PreviewModal
          note={note}
          settings={settings}
          onClose={() => setShowPreview(false)}
          onCopy={copyForGoogleDocs}
          onPrint={printNote}
          isMobile={isMobile}
        />
      )}

      <Toast msg={toast} />
    </>
  );
}
