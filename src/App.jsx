import { useState, useMemo, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const START_YEAR = new Date().getFullYear();

const INSURERS = [
  { id: "hcf",      name: "HCF",           tiers: [{ label: "Bronze", monthly: 180 }, { label: "Silver+", monthly: 320 }, { label: "Gold", monthly: 520 }] },
  { id: "medibank", name: "Medibank",       tiers: [{ label: "Bronze", monthly: 175 }, { label: "Silver+", monthly: 310 }, { label: "Gold", monthly: 510 }] },
  { id: "bupa",     name: "Bupa",           tiers: [{ label: "Bronze", monthly: 185 }, { label: "Silver+", monthly: 330 }, { label: "Gold", monthly: 535 }] },
  { id: "nib",      name: "nib",            tiers: [{ label: "Bronze", monthly: 170 }, { label: "Silver+", monthly: 305 }, { label: "Gold", monthly: 500 }] },
  { id: "ahm",      name: "ahm",            tiers: [{ label: "Bronze", monthly: 165 }, { label: "Silver+", monthly: 295 }, { label: "Gold", monthly: 490 }] },
  { id: "other",    name: "Other / Manual", tiers: [] },
];

const COVER_MULTIPLIERS = { single: 1.0, couple: 1.75, family: 2.2 };
const COVER_LABELS      = { single: "Single", couple: "Couple", family: "Family" };

const MLS_THRESHOLDS = {
  single: { base: 101000,  tiers: [{ limit: 118000, rate: 0.01 }, { limit: 158000, rate: 0.0125 }, { limit: Infinity, rate: 0.015 }] },
  couple: { base: 202000,  tiers: [{ limit: 236000, rate: 0.01 }, { limit: 316000, rate: 0.0125 }, { limit: Infinity, rate: 0.015 }] },
  family: { base: 202000,  tiers: [{ limit: 236000, rate: 0.01 }, { limit: 316000, rate: 0.0125 }, { limit: Infinity, rate: 0.015 }] },
};

const FAQS = [
  { q: "What is Private Health Insurance (PHI)?", a: "PHI is optional health coverage you pay for privately, on top of Medicare. It gives you access to private hospitals, choice of specialist, and extras like dental and optical — removing you from public waiting lists for elective procedures." },
  { q: "Do I have to get PHI?", a: "No. Medicare covers all Australians for essential medical treatment. PHI is a choice. However, higher earners without PHI pay an additional tax called the Medicare Levy Surcharge (MLS)." },
  { q: "What is the Medicare Levy Surcharge (MLS)?", a: "An extra tax of 1–1.5% of your taxable income if you earn above the income threshold and don't hold private hospital cover. It is deliberately priced so that the MLS costs roughly the same as basic hospital cover — a government nudge to take out PHI." },
  { q: "What is LHC loading?", a: "Lifetime Health Cover (LHC) loading. For every year you delay taking out hospital cover past age 30, your premium increases by 2%, up to a maximum of 70%. It applies for 10 continuous years of cover, then disappears permanently." },
  { q: "Does PHI cover overseas treatment?", a: "Generally no. Australian PHI covers treatment at Australian registered facilities only. For overseas emergencies, you need travel insurance. Australia has reciprocal healthcare agreements with 11 countries including the UK and New Zealand for emergency and essential care." },
  { q: "Is the investment return in the Self-Insure model pre or post tax?", a: "Enter your net (after-tax) expected return. Investment returns in Australia are typically taxable. Consult your accountant or financial adviser for your applicable after-tax rate." },
  { q: "What hospital cover tiers are available?", a: "Australian hospital cover has four government-defined tiers: Basic, Bronze, Silver, and Gold. Gold covers all 38 clinical categories including heart surgery, cancer treatment and joint replacements. Extras (dental, optical, physio) are a separate product that can be combined with any hospital tier." },
  { q: "Can children stay on a family policy?", a: "Yes. Dependent children are covered at no extra premium cost on a family policy, typically until age 22 (or 25 if a full-time student). After that they need their own policy, and their own LHC clock starts from age 30." },
  { q: "What is the Government PHI Rebate?", a: "A government subsidy on your PHI premium, income-tested and adjusted annually. Higher income earners receive a lower rebate or none at all. Your insurer applies it automatically — confirm your entitlement with your accountant." },
];

const MAIN_DISCLAIMER = "Disclaimer: Hypothetical projections based on user inputs. For educational and research purposes only. Not financial, investment, tax, health or insurance advice. No guarantee of outcomes or accuracy. For Australian residents only. Always read your insurer's Product Disclosure Statement (PDS) and consult a licensed professional before making any decisions.";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function currency(n) {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString("en-AU");
}
function calcLhcLoading(age) {
  if (age <= 30) return 0;
  return Math.min((age - 30) * 2, 70);
}
function getMlsRate(combinedIncome, coverLevel, numDependants) {
  const t = MLS_THRESHOLDS[coverLevel] || MLS_THRESHOLDS.single;
  const bonus = coverLevel === "family" && numDependants > 1 ? (numDependants - 1) * 1500 : 0;
  if (combinedIncome <= t.base + bonus) return 0;
  for (const tier of t.tiers) { if (combinedIncome < tier.limit) return tier.rate; }
  return 0.015;
}
function buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years }) {
  if (!baseMonthly) return Array.from({ length: years }, (_, i) => ({
    year: i + 1, calYear: START_YEAR + i, annual: 0, cumulative: 0, sizeLabel: "No cover", note: "",
  }));
  const adults   = members.filter(m => m.type === "adult").sort((a, b) => b.age - a.age);
  const children = members.filter(m => m.type === "child");
  const avgLhc   = adults.length ? adults.reduce((s, m) => s + calcLhcLoading(m.age), 0) / adults.length : 0;
  const lhcMult  = lhcApplies ? 1 + avgLhc / 100 : 1;
  const lhcClearYear = START_YEAR + 10;
  const adultEndYears = adults.map(a => ({ name: a.name, endYear: START_YEAR + ((a.plannedDeathAge || 85) - a.age) }));
  const childAgeOffEvents = children.map(c => ({ name: c.name, year: START_YEAR + (22 - c.age) })).filter(e => e.year >= START_YEAR);
  let cumulative = 0;
  return Array.from({ length: years }, (_, i) => {
    const calYear = START_YEAR + i;
    const lhcFactor = lhcApplies && calYear < lhcClearYear ? lhcMult : 1;
    const inflation = Math.pow(1.04, i);
    const aliveAdults    = adultEndYears.filter(a => a.endYear > calYear).length;
    const activeChildren = children.filter(c => (START_YEAR + (22 - c.age)) > calYear).length;
    let fsm = 1.0, sizeLabel = COVER_LABELS[coverLevel];
    if (aliveAdults === 0) { fsm = 0; sizeLabel = "Policy ended"; }
    else if (aliveAdults === 1 && activeChildren > 0 && coverLevel === "family") { fsm = 1.0; sizeLabel = "Single parent family"; }
    else if (aliveAdults === 1 && activeChildren === 0) { fsm = COVER_MULTIPLIERS.single / COVER_MULTIPLIERS[coverLevel]; sizeLabel = "Single"; }
    else if (aliveAdults === 2 && activeChildren === 0 && coverLevel === "family") { fsm = COVER_MULTIPLIERS.couple / COVER_MULTIPLIERS[coverLevel]; sizeLabel = "Couple"; }
    const notes = [];
    if (calYear === lhcClearYear && lhcApplies) notes.push("LHC loading removed ✓");
    childAgeOffEvents.filter(e => e.year === calYear).forEach(e => notes.push(`${e.name} ages off policy (22)`));
    adultEndYears.forEach(a => { if (a.endYear === calYear) notes.push(`${a.name} — end of planning horizon`); });
    const annual = baseMonthly * 12 * lhcFactor * inflation * fsm;
    cumulative += annual;
    return { year: i + 1, calYear, annual: Math.round(annual), cumulative: Math.round(cumulative), sizeLabel, note: notes.join(" · ") };
  });
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────

const C = {
  bg:         "#0a0f1e",
  surface:    "rgba(15,23,42,0.95)",
  card:       "rgba(22,32,52,0.9)",
  border:     "rgba(71,85,105,0.45)",
  borderGlow: "rgba(251,191,36,0.35)",
  amber:      "#fbbf24",
  amberDim:   "#d97706",
  slate300:   "#cbd5e1",
  slate400:   "#94a3b8",
  slate500:   "#64748b",
  slate600:   "#475569",
  white:      "#f1f5f9",
  green:      "#34d399",
  red:        "#f87171",
  blue:       "#60a5fa",
};

const colorMap = {
  "text-amber-400":   C.amber,
  "text-emerald-400": C.green,
  "text-red-400":     C.red,
  "text-blue-400":    C.blue,
};

// ─── UI PRIMITIVES ───────────────────────────────────────────────────────────

function Card({ children, glow, color, style: s = {}, onClick }) {
  const glows = {
    amber: { border: "rgba(251,191,36,0.4)",  shadow: "rgba(251,191,36,0.08)"  },
    red:   { border: "rgba(248,113,113,0.4)", shadow: "rgba(248,113,113,0.08)" },
    blue:  { border: "rgba(96,165,250,0.4)",  shadow: "rgba(96,165,250,0.08)"  },
    green: { border: "rgba(52,211,153,0.4)",  shadow: "rgba(52,211,153,0.08)"  },
  };
  const g = glows[color || glow];
  return (
    <div onClick={onClick} style={{
      background: C.card,
      border: `1px solid ${g ? g.border : C.border}`,
      borderRadius: 14,
      padding: 20,
      boxShadow: g ? `0 0 0 3px ${g.shadow}, 0 4px 24px rgba(0,0,0,0.4)` : "0 2px 16px rgba(0,0,0,0.35)",
      transition: "box-shadow 0.2s, border-color 0.2s",
      cursor: onClick ? "pointer" : undefined,
      ...s,
    }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "rgba(30,41,59,0.7)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", flex: 1 }}>
      <div style={{ fontSize: 12, color: C.slate400, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: "bold", color: colorMap[color] || C.white, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate500, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function StatRow({ stats }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {stats.map((s, i) => <StatCard key={i} {...s} />)}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: C.amber, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>{children}</div>
      {sub && <div style={{ color: C.slate500, fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ options, value, onChange, small }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, background: "rgba(15,23,42,0.8)", borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
      {options.map(o => (
        <button key={String(o.value)} onClick={() => onChange(o.value)} style={{
          padding: small ? "5px 12px" : "7px 18px", borderRadius: 7, fontSize: small ? 12 : 13, fontWeight: "600",
          background: value === o.value ? C.amber : "transparent",
          color: value === o.value ? "#1e293b" : C.slate300,
          border: "none", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: C.slate400, marginBottom: 5, fontWeight: 500 }}>{children}</div>;
}

function DInput({ label, ...props }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && <Label>{label}</Label>}
      <input {...props} style={{
        width: "100%", background: "rgba(15,23,42,0.8)", border: `1px solid ${C.border}`,
        color: C.white, fontSize: 14, borderRadius: 9, padding: "9px 13px",
        outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
        ...(props.style || {})
      }}
      onFocus={e => e.target.style.borderColor = C.amberDim}
      onBlur={e => e.target.style.borderColor = C.border}
      />
    </div>
  );
}

function Disclosure({ text }) {
  return <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, marginTop: 12 }}>{text}</p>;
}

function Divider() {
  return <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${C.border}, transparent)`, margin: "20px 0" }} />;
}

// ─── NAV ICONS ────────────────────────────────────────────────────────────────

const NAV_ICONS = {
  summary:  (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  levy:     (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  cost:     (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  invest:   (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  coverage: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  faq:      (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

const SCREENS = [
  { id: "summary",  label: "Summary"  },
  { id: "levy",     label: "Levy"     },
  { id: "cost",     label: "Cost"     },
  { id: "invest",   label: "Invest"   },
  { id: "coverage", label: "Cover"    },
  { id: "faq",      label: "FAQ"      },
];

// ─── QUESTIONNAIRE ────────────────────────────────────────────────────────────

function Questionnaire({ onComplete, existingConfig }) {
  const [step, setStep]             = useState(0);
  const [coverLevel, setCoverLevel] = useState(existingConfig?.coverLevel || "family");
  const [members, setMembers]       = useState(existingConfig?.members || [
    { id: 1, name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" },
    { id: 2, name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" },
  ]);
  const [insurerId, setInsurerId]   = useState(existingConfig?.insurerId || "hcf");
  const [tierId, setTierId]         = useState(() => {
    if (!existingConfig) return 2;
    const ins = INSURERS.find(i => i.id === existingConfig.insurerId);
    return ins?.tiers?.findIndex(t => t.label === existingConfig.tierLabel) ?? 2;
  });
  const [manualMonthly, setManualMonthly] = useState(existingConfig?.insurerId === "other" ? String(existingConfig.baseMonthly) : "");
  const [lhcApplies, setLhcApplies] = useState(existingConfig?.lhcApplies ?? true);

  const insurer  = INSURERS.find(i => i.id === insurerId);
  const adults   = members.filter(m => m.type === "adult");
  const children = members.filter(m => m.type === "child");

  const updateMember = (id, field, val) => setMembers(p => p.map(m => m.id === id ? { ...m, [field]: val } : m));

  useEffect(() => {
    if (coverLevel === "single") setMembers(p => { const a = p.filter(m => m.type === "adult"); const k = p.filter(m => m.type !== "adult"); return [a[0], ...k]; });
    if (coverLevel === "couple" && adults.length < 2) setMembers(p => [...p, { id: Date.now(), name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" }]);
  }, [coverLevel]);

  const addChild    = () => { setMembers(p => [...p, { id: Date.now(), name: "", age: "", income: "", type: "child" }]); setCoverLevel("family"); };
  const removeMember = id => setMembers(p => p.filter(m => m.id !== id));

  const baseFromInsurer = () => {
    if (insurerId === "other") return Number(manualMonthly) || 0;
    const t = insurer?.tiers?.[tierId];
    return t ? Math.round(t.monthly * COVER_MULTIPLIERS[coverLevel]) : 0;
  };

  const canProceed = step === 0 ? adults.every(m => m.name && m.age) : (insurerId === "other" ? !!manualMonthly : true);

  const handleComplete = () => {
    const base    = baseFromInsurer();
    const parsed  = members.map(m => ({ ...m, age: Number(m.age), income: Number(m.income), plannedDeathAge: Number(m.plannedDeathAge) || 85 }));
    const combined = parsed.filter(m => m.type === "adult").reduce((s, m) => s + m.income, 0);
    const numDep  = children.length;
    const mlsRate = getMlsRate(combined, coverLevel, numDep);
    const avgLhc  = parsed.filter(m => m.type === "adult").reduce((s, m) => s + calcLhcLoading(m.age), 0) / Math.max(parsed.filter(m => m.type === "adult").length, 1);
    const maxYears = Math.max(...parsed.filter(m => m.type === "adult").map(m => (m.plannedDeathAge || 85) - m.age), 20);
    onComplete({ members: parsed, coverLevel, insurerId, insurerName: insurer?.name || "Other", tierLabel: insurer?.tiers?.[tierId]?.label || "Manual", baseMonthly: base, lhcApplies, avgLhc, combinedIncome: combined, mlsRate, mlsCost: combined * mlsRate, numDependants: numDep, projectionYears: Math.min(maxYears, 60) });
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ background: "linear-gradient(135deg,#1e293b,#0a0f1e)", borderBottom: `1px solid ${C.border}`, padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: C.amber, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>🇦🇺 For Australian Residents Only</div>
          <div style={{ color: C.white, fontWeight: "bold", fontSize: 22, marginTop: 2 }}>Should I get Private Health Insurance?</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {["Who's covered?", "Choose your insurer"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", background: i <= step ? C.amber : "rgba(51,65,85,0.5)", color: i <= step ? "#1e293b" : C.slate500 }}>{i + 1}</div>
              <span style={{ fontSize: 13, color: i === step ? C.white : C.slate500, fontWeight: i === step ? "600" : "normal" }}>{label}</span>
              {i < 1 && <div style={{ width: 40, height: 1, background: step > i ? C.amber : C.border, marginLeft: 4 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", gap: 0, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "40px 48px", boxSizing: "border-box" }}>

        {/* ── STEP 1 ── */}
        {step === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, width: "100%" }}>

            {/* Left column */}
            <div>
              <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>Who's covered?</h2>
              <p style={{ color: C.slate400, fontSize: 14, marginBottom: 28 }}>Tell us about the people on this policy.</p>

              <SectionTitle>Cover type</SectionTitle>
              <Toggle options={[{ value: "single", label: "Single" }, { value: "couple", label: "Couple" }, { value: "family", label: "Family" }]} value={coverLevel} onChange={setCoverLevel} />

              <div style={{ height: 28 }} />
              <SectionTitle>Adults on this policy</SectionTitle>
              {adults.map((m, idx) => (
                <Card key={m.id} glow="amber" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: C.slate400, marginBottom: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em" }}>Adult {idx + 1}</div>
                  <DInput placeholder="Full name" value={m.name} onChange={e => updateMember(m.id, "name", e.target.value)} style={{ marginBottom: 12 }} />
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <DInput label="Age" type="number" min="18" max="100" placeholder="e.g. 45" value={m.age} onChange={e => updateMember(m.id, "age", e.target.value)} />
                    <DInput label="Annual income ($)" type="number" placeholder="e.g. 85000" value={m.income} onChange={e => updateMember(m.id, "income", e.target.value)} />
                  </div>
                  <DInput label="Life planning horizon — age" type="number" min="50" max="110" placeholder="e.g. 85" value={m.plannedDeathAge} onChange={e => updateMember(m.id, "plannedDeathAge", e.target.value)} />
                  <div style={{ fontSize: 11, color: C.slate600, marginTop: 6 }}>The age to which you'd like to model insurance cover.</div>
                  {idx === 1 && (
                    <button onClick={() => { removeMember(m.id); setCoverLevel("single"); }} style={{ color: C.red, fontSize: 12, marginTop: 10, background: "none", border: "none", cursor: "pointer" }}>Remove adult 2</button>
                  )}
                </Card>
              ))}
            </div>

            {/* Right column */}
            <div>
              {coverLevel === "family" && (
                <>
                  <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>Children</h2>
                  <p style={{ color: C.slate400, fontSize: 14, marginBottom: 28 }}>Covered at no extra premium cost on a family policy until age 22.</p>
                  {children.map((c, idx) => (
                    <Card key={c.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                        <DInput placeholder={`Child ${idx + 1} name`} value={c.name} onChange={e => updateMember(c.id, "name", e.target.value)} />
                        <DInput label="Age" type="number" min="0" max="21" placeholder="Age" value={c.age} onChange={e => updateMember(c.id, "age", e.target.value)} style={{ maxWidth: 90 }} />
                        <button onClick={() => removeMember(c.id)} style={{ color: C.red, fontSize: 24, fontWeight: "bold", paddingBottom: 2, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>×</button>
                      </div>
                    </Card>
                  ))}
                  <button onClick={addChild} style={{ width: "100%", padding: "11px", borderRadius: 10, background: "rgba(30,41,59,0.5)", border: `1px dashed ${C.border}`, color: C.slate300, fontSize: 14, cursor: "pointer", marginTop: 4 }}>+ Add child</button>
                  <Divider />
                </>
              )}

              {/* Info card */}
              <Card color="blue" style={{ marginTop: coverLevel !== "family" ? 0 : 0 }}>
                <div style={{ color: C.blue, fontWeight: "700", fontSize: 14, marginBottom: 10 }}>💡 About this model</div>
                <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.7 }}>
                  This tool models the <strong style={{ color: C.white }}>financial decision</strong> around Private Health Insurance for Australian residents. It accounts for LHC loading, the Medicare Levy Surcharge, premium step-downs as family size changes, and a self-insurance investment scenario.
                </p>
                <Disclosure text="For educational purposes only. Not financial, tax or insurance advice. Always consult a licensed professional." />
              </Card>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, width: "100%" }}>

            {/* Left: insurer selection */}
            <div>
              <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>Choose your insurer</h2>
              <p style={{ color: C.slate400, fontSize: 14, marginBottom: 28 }}>Select a provider and cover level.</p>

              <SectionTitle>Insurer</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                {INSURERS.map(ins => (
                  <button key={ins.id} onClick={() => { setInsurerId(ins.id); if (ins.tiers.length) setTierId(2); }} style={{
                    padding: "12px 16px", borderRadius: 10, textAlign: "left", fontSize: 14, fontWeight: "600",
                    background: insurerId === ins.id ? "rgba(120,53,15,0.3)" : "rgba(15,23,42,0.8)",
                    border: `1px solid ${insurerId === ins.id ? "rgba(251,191,36,0.6)" : C.border}`,
                    color: insurerId === ins.id ? C.amber : C.slate300,
                    boxShadow: insurerId === ins.id ? "0 0 0 2px rgba(251,191,36,0.1)" : "none",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{ins.name}</button>
                ))}
              </div>

              {insurerId !== "other" && insurer?.tiers?.length > 0 && (
                <>
                  <SectionTitle>Cover level</SectionTitle>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {insurer.tiers.map((t, idx) => {
                      const mo = Math.round(t.monthly * COVER_MULTIPLIERS[coverLevel]);
                      const active = tierId === idx;
                      return (
                        <button key={idx} onClick={() => setTierId(idx)} style={{
                          padding: "14px 18px", borderRadius: 10, textAlign: "left",
                          background: active ? "rgba(120,53,15,0.3)" : "rgba(15,23,42,0.8)",
                          border: `1px solid ${active ? "rgba(251,191,36,0.6)" : C.border}`,
                          boxShadow: active ? "0 0 0 2px rgba(251,191,36,0.1)" : "none",
                          cursor: "pointer", transition: "all 0.15s",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: "700", fontSize: 15, color: active ? C.amber : C.slate300 }}>{t.label}</span>
                            <span style={{ fontWeight: "bold", fontSize: 18, color: C.white }}>{currency(mo)}<span style={{ fontSize: 12, color: C.slate400, fontWeight: "normal" }}>/mo</span></span>
                          </div>
                          <div style={{ fontSize: 12, color: C.slate500, marginTop: 3 }}>{currency(mo * 12)}/yr · {COVER_LABELS[coverLevel]} rate (indicative)</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {insurerId === "other" && (
                <>
                  <SectionTitle sub="Enter your quoted amount">Monthly premium</SectionTitle>
                  <DInput type="number" placeholder="e.g. 650" value={manualMonthly} onChange={e => setManualMonthly(e.target.value)} />
                  <div style={{ fontSize: 12, color: C.slate500, marginTop: 6 }}>Enter the total monthly premium for your {COVER_LABELS[coverLevel]} policy.</div>
                </>
              )}
            </div>

            {/* Right: LHC + summary */}
            <div>
              <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>LHC Loading</h2>
              <p style={{ color: C.slate400, fontSize: 14, marginBottom: 28 }}>Applies if any adult has not held hospital cover since age 30.</p>

              <Toggle options={[{ value: true, label: "Yes — loading applies" }, { value: false, label: "No loading" }]} value={lhcApplies} onChange={setLhcApplies} />

              {lhcApplies && adults.filter(m => m.age).map(m => {
                const loading = calcLhcLoading(Number(m.age));
                return loading > 0 ? (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14, marginTop: 8 }}>
                    <span style={{ color: C.slate300 }}>{m.name || "Adult"} (age {m.age})</span>
                    <span style={{ color: C.amber, fontWeight: "700" }}>{loading}% loading</span>
                  </div>
                ) : null;
              })}
              <Disclosure text="LHC loading = (age − 30) × 2%, capped at 70%. New migrants have 12 months from Medicare registration to take out cover without loading. Verify exact loading with your insurer." />

              <Divider />

              {/* Preview card */}
              <Card glow="amber">
                <div style={{ color: C.amber, fontWeight: "700", fontSize: 14, marginBottom: 14 }}>Your Configuration Preview</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Cover type",  value: COVER_LABELS[coverLevel] },
                    { label: "Insurer",     value: insurer?.name || "—" },
                    { label: "Tier",        value: insurer?.tiers?.[tierId]?.label || "—" },
                    { label: "Base monthly", value: currency(insurerId === "other" ? Number(manualMonthly) : (insurer?.tiers?.[tierId]?.monthly || 0) * COVER_MULTIPLIERS[coverLevel]) },
                    { label: "Adults",      value: adults.filter(m => m.name).map(m => m.name).join(", ") || "—" },
                    { label: "Children",    value: children.length ? children.map(c => c.name || "Child").join(", ") : "None" },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: C.slate400 }}>{row.label}</span>
                      <span style={{ color: C.white, fontWeight: "600" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ background: "rgba(10,15,30,0.98)", borderTop: `1px solid ${C.border}`, padding: "16px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic" }}>For Australian residents only · Educational purposes only · Not financial advice</p>
        <div style={{ display: "flex", gap: 12 }}>
          {step > 0 && (
            <button onClick={() => setStep(0)} style={{ padding: "11px 28px", borderRadius: 10, background: "rgba(51,65,85,0.4)", color: C.slate300, fontSize: 14, fontWeight: "600", border: `1px solid ${C.border}`, cursor: "pointer" }}>← Back</button>
          )}
          {step < 1 ? (
            <button onClick={() => canProceed && setStep(1)} disabled={!canProceed} style={{ padding: "11px 28px", borderRadius: 10, fontSize: 14, fontWeight: "bold", background: canProceed ? C.amber : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Continue →</button>
          ) : (
            <button onClick={() => canProceed && handleComplete()} disabled={!canProceed} style={{ padding: "11px 32px", borderRadius: 10, fontSize: 14, fontWeight: "bold", background: canProceed ? C.amber : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Build My Model →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN TOOL SHELL ─────────────────────────────────────────────────────────

function MainTool({ config, onReset }) {
  const [screen, setScreen] = useState("summary");
  const contentRef = useRef(null);
  const go = id => { setScreen(id); setTimeout(() => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 30); };
  const current = SCREENS.find(s => s.id === screen);

  const renderScreen = () => {
    switch (screen) {
      case "summary":  return <SummaryScreen  config={config} />;
      case "levy":     return <LevyScreen     config={config} />;
      case "cost":     return <CostScreen     config={config} />;
      case "invest":   return <InvestScreen   config={config} />;
      case "coverage": return <CoverageScreen />;
      case "faq":      return <FaqScreen />;
      default:         return <SummaryScreen  config={config} />;
    }
  };

  return (
    <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* Top bar */}
      <div style={{ background: "linear-gradient(135deg,#1e293b,#0a0f1e)", borderBottom: `1px solid ${C.border}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ color: C.amber, fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.12em" }}>🇦🇺 Private Health Insurance · Decision Model</div>
          <div style={{ color: C.white, fontWeight: "bold", fontSize: 18, marginTop: 1 }}>PHI — Should I or Shouldn't I?</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.amber, fontSize: 13, fontWeight: "600" }}>{config.insurerName} · {config.tierLabel}</div>
            <div style={{ color: C.slate400, fontSize: 12 }}>{COVER_LABELS[config.coverLevel]} · {currency(config.baseMonthly)}/mo base</div>
          </div>
          <button onClick={onReset} style={{ fontSize: 12, color: C.slate300, background: "rgba(51,65,85,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 16px", cursor: "pointer" }}>Edit inputs</button>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 220, background: "rgba(10,15,30,0.98)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, padding: "24px 0" }}>
          {SCREENS.map(s => {
            const active = screen === s.id;
            return (
              <button key={s.id} onClick={() => go(s.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 24px",
                background: active ? "rgba(251,191,36,0.08)" : "transparent",
                borderLeft: active ? `3px solid ${C.amber}` : "3px solid transparent",
                borderTop: "none", borderRight: "none", borderBottom: "none",
                cursor: "pointer", transition: "all 0.15s", textAlign: "left",
              }}>
                {NAV_ICONS[s.id](active ? C.amber : C.slate400)}
                <span style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? C.amber : C.slate400 }}>{s.label}</span>
              </button>
            );
          })}

          <div style={{ flex: 1 }} />
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.slate600, lineHeight: 1.6 }}>
              For Australian residents only.<br />Educational use only. Not advice.
            </div>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: C.bg }}>
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              {NAV_ICONS[screen](C.amber)}
              <h1 style={{ color: C.white, fontSize: 22, fontWeight: "bold", margin: 0 }}>{current?.label}</h1>
            </div>
            {renderScreen()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SUMMARY SCREEN ──────────────────────────────────────────────────────────

function SummaryScreen({ config }) {
  const { members, coverLevel, baseMonthly, lhcApplies, avgLhc, combinedIncome, mlsRate, mlsCost, insurerName, tierLabel, projectionYears } = config;
  const adults   = members.filter(m => m.type === "adult");
  const children = members.filter(m => m.type === "child");
  const monthly  = baseMonthly * (lhcApplies ? 1 + avgLhc / 100 : 1);
  const proj     = useMemo(() => buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years: projectionYears }), []);
  const total    = proj[proj.length - 1]?.cumulative || 0;
  const lhcYear  = START_YEAR + 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <StatRow stats={[
        { label: "Base monthly premium",              value: currency(baseMonthly),    sub: `${insurerName} ${tierLabel}` },
        { label: `Monthly incl. LHC (${avgLhc.toFixed(0)}%)`, value: lhcApplies ? currency(monthly) : "No loading", color: lhcApplies ? "text-amber-400" : "text-emerald-400" },
        { label: "Annual (Year 1)",                   value: currency(monthly * 12) },
        { label: `Lifetime total (${projectionYears}yr)`, value: currency(total), color: "text-amber-400", sub: "incl. inflation + step-downs" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Policy members */}
        <Card glow="amber">
          <div style={{ color: C.amber, fontWeight: "700", fontSize: 14, marginBottom: 14 }}>Your Policy Members</div>
          {adults.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
              <span style={{ color: C.slate300 }}>{m.name}, age {m.age}</span>
              <span style={{ color: C.amber, fontWeight: "600" }}>{lhcApplies ? `${calcLhcLoading(m.age)}% LHC` : "No LHC"}</span>
            </div>
          ))}
          {children.map(c => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
              <span style={{ color: C.slate300 }}>{c.name}, age {c.age}</span>
              <span style={{ color: C.green, fontSize: 12 }}>Free on policy</span>
            </div>
          ))}
        </Card>

        {/* Alerts column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {lhcApplies && (
            <Card color="amber">
              <div style={{ color: C.amber, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>⚡ LHC Loading Active</div>
              <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.7 }}>Loading clears permanently in <strong style={{ color: C.white }}>{lhcYear}</strong> after 10 continuous years of hospital cover. Every year of further delay pushes that date out by one year.</p>
            </Card>
          )}
          {mlsRate > 0 && (
            <Card color="red">
              <div style={{ color: C.red, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>⚠ Medicare Levy Surcharge — Active</div>
              <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.7 }}>At your combined income of <strong style={{ color: C.white }}>{currency(combinedIncome)}</strong>, without hospital cover you pay <strong style={{ color: C.red }}>{currency(mlsCost)}/yr</strong> in MLS at <strong style={{ color: C.red }}>{(mlsRate * 100).toFixed(1)}%</strong> — for no health benefit. PHI removes this surcharge entirely.</p>
            </Card>
          )}
        </div>
      </div>

      <Card style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
      </Card>
    </div>
  );
}

// ─── LEVY SCREEN ─────────────────────────────────────────────────────────────

function LevyScreen({ config }) {
  const { combinedIncome, coverLevel, numDependants, mlsRate, mlsCost, baseMonthly } = config;
  const bonus     = numDependants > 1 ? (numDependants - 1) * 1500 : 0;
  const threshold = 202000 + bonus;
  const triggered = mlsRate > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card color="blue">
        <div style={{ color: C.blue, fontWeight: "700", fontSize: 15, marginBottom: 10 }}>What is the Medicare Levy? 🐷</div>
        <p style={{ fontSize: 14, color: C.slate300, lineHeight: 1.7, maxWidth: 760 }}>
          Everyone earning income in Australia pays a <strong style={{ color: C.white }}>2% Medicare Levy</strong> — this funds the public health system. On top of that, if you earn above the threshold and don't hold private hospital cover, you pay an extra surcharge (MLS). The MLS is deliberately priced so that at the threshold, it costs roughly the same as basic PHI — making Private Health Insurance the financially neutral or better choice.
        </p>
      </Card>

      <StatRow stats={[
        { label: "Your combined income",  value: currency(combinedIncome) },
        { label: "MLS family threshold",  value: currency(threshold), sub: `${numDependants} ${numDependants === 1 ? "dependant" : "dependants"}` },
        { label: "MLS triggered?",        value: triggered ? "YES" : "NO",  color: triggered ? "text-red-400" : "text-emerald-400" },
        { label: "MLS cost (no PHI)",     value: triggered ? currency(mlsCost) + "/yr" : "$0", color: triggered ? "text-red-400" : "text-emerald-400" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: triggered ? "1fr 1fr" : "1fr", gap: 20 }}>
        {/* Tiers table */}
        <Card>
          <SectionTitle>MLS Tiers 2025–26 · Family thresholds</SectionTitle>
          {[
            { tier: "No surcharge", range: "≤ $203,500",  rate: 0,      label: "0%",    c: C.green  },
            { tier: "Tier 1",       range: "$203k–$236k", rate: 0.01,   label: "1.0%",  c: C.amber  },
            { tier: "Tier 2",       range: "$236k–$316k", rate: 0.0125, label: "1.25%", c: "#fb923c" },
            { tier: "Tier 3",       range: "$316k+",      rate: 0.015,  label: "1.5%",  c: C.red    },
          ].map(t => (
            <div key={t.tier} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", borderRadius: 10, marginBottom: 8,
              background: mlsRate === t.rate ? "rgba(251,191,36,0.07)" : "rgba(15,23,42,0.5)",
              border: `1px solid ${mlsRate === t.rate ? "rgba(251,191,36,0.4)" : C.border}`,
              boxShadow: mlsRate === t.rate ? "0 0 0 2px rgba(251,191,36,0.08)" : "none",
            }}>
              <div>
                <div style={{ color: C.white, fontWeight: "600", fontSize: 14 }}>{t.tier}</div>
                <div style={{ color: C.slate500, fontSize: 12 }}>Family: {t.range}</div>
              </div>
              <div style={{ color: t.c, fontSize: 26, fontWeight: "bold" }}>{t.label}</div>
            </div>
          ))}
          <Disclosure text="Family threshold increases by $1,500 per dependent child after the first. Thresholds reviewed annually. Confirm with your accountant." />
        </Card>

        {/* MLS vs PHI comparison */}
        {triggered && baseMonthly > 0 && (
          <Card color="amber">
            <SectionTitle>MLS vs PHI comparison</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10, background: "rgba(127,29,29,0.15)", border: `1px solid rgba(248,113,113,0.2)` }}>
                <span style={{ color: C.slate300, fontSize: 14 }}>MLS (no PHI)</span>
                <span style={{ color: C.red, fontWeight: "bold", fontSize: 16 }}>{currency(mlsCost)}/yr — no benefit</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10, background: "rgba(52,211,153,0.08)", border: `1px solid rgba(52,211,153,0.2)` }}>
                <span style={{ color: C.slate300, fontSize: 14 }}>PHI base premium</span>
                <span style={{ color: C.green, fontWeight: "bold", fontSize: 16 }}>{currency(baseMonthly * 12)}/yr + coverage</span>
              </div>
            </div>
            <Disclosure text="Confirm your exact MLS liability with your accountant. Income structure and entity arrangements may affect the calculation." />
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── COST SCREEN ─────────────────────────────────────────────────────────────

function CostScreen({ config }) {
  const { baseMonthly, members, coverLevel, lhcApplies, avgLhc, projectionYears } = config;
  const lhcMult     = lhcApplies ? 1 + avgLhc / 100 : 1;
  const lhcYear     = START_YEAR + 10;
  const proj        = useMemo(() => buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years: projectionYears }), []);
  const total       = proj[proj.length - 1]?.cumulative || 0;
  const afterLhcRow = proj.find(r => r.calYear === lhcYear);
  const milestones  = proj.filter(r => r.note);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <StatRow stats={[
        { label: "Monthly today",                         value: currency(baseMonthly * lhcMult), sub: lhcApplies ? `incl. ${avgLhc.toFixed(0)}% LHC` : "No LHC" },
        { label: "Annual Year 1",                         value: currency(baseMonthly * lhcMult * 12) },
        { label: `Annual after LHC removed (${lhcYear})`, value: afterLhcRow ? currency(afterLhcRow.annual) : "—", color: "text-emerald-400" },
        { label: `Lifetime total (${projectionYears}yr)`, value: currency(total), color: "text-amber-400" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Milestones */}
        <Card>
          <SectionTitle sub="Personalised to your life planning horizon">Policy milestones</SectionTitle>
          {milestones.length === 0 && <p style={{ color: C.slate500, fontSize: 13 }}>No milestones in this projection window.</p>}
          {milestones.map(r => (
            <div key={r.calYear} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span style={{ color: C.white, fontWeight: "700", fontSize: 15 }}>{r.calYear}</span>
                <div style={{ color: C.amber, fontSize: 12, marginTop: 2 }}>{r.note}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.slate300, fontSize: 14, fontWeight: "600" }}>{currency(r.annual)}/yr</div>
                <div style={{ color: C.slate500, fontSize: 12 }}>{r.sizeLabel}</div>
              </div>
            </div>
          ))}
          <Disclosure text="4% annual inflation assumed. Actual varies by insurer. Step-downs modelled at indicative multipliers." />
        </Card>

        {/* Full year table */}
        <Card>
          <SectionTitle>Year-by-year projection</SectionTitle>
          <div style={{ overflowY: "auto", maxHeight: 440 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Year", "Policy size", "Annual cost", "Cumulative"].map(h => (
                    <th key={h} style={{ textAlign: h === "Year" ? "left" : "right", padding: "6px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proj.map(r => (
                  <tr key={r.year} style={{ background: r.note ? "rgba(120,53,15,0.08)" : "transparent" }}>
                    <td style={{ padding: "7px 8px", color: C.white, fontWeight: r.note ? "700" : "normal" }}>
                      {r.calYear}
                      {r.note && <div style={{ color: C.amber, fontSize: 10, marginTop: 1 }}>{r.note}</div>}
                    </td>
                    <td style={{ padding: "7px 8px", color: C.slate400, textAlign: "right" }}>{r.sizeLabel}</td>
                    <td style={{ padding: "7px 8px", color: C.slate300, textAlign: "right" }}>{currency(r.annual)}</td>
                    <td style={{ padding: "7px 8px", color: C.slate500, textAlign: "right" }}>{currency(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── INVEST SCREEN ───────────────────────────────────────────────────────────

function InvestScreen({ config }) {
  const { baseMonthly, members, coverLevel, lhcApplies, projectionYears } = config;

  const DEFAULT_DRAWDOWNS = [
    { id: 1, year: START_YEAR + 10, amount: 50000, label: "Major medical event (est.)" },
    { id: 2, year: START_YEAR + 19, amount: 30000, label: "Dental / ortho accumulated" },
    { id: 3, year: START_YEAR + 29, amount: 80000, label: "Cardiac / cancer (est.)" },
  ];

  const load = (key, fb) => { try { const r = sessionStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const [rate, setRate]           = useState(() => load("phi_returnRate", 6));
  const [drawdowns, setDrawdowns] = useState(() => load("phi_drawdowns", DEFAULT_DRAWDOWNS));
  const [nextId, setNextId]       = useState(() => Math.max(...load("phi_drawdowns", DEFAULT_DRAWDOWNS).map(d => d.id), 3) + 1);

  useEffect(() => { try { sessionStorage.setItem("phi_drawdowns", JSON.stringify(drawdowns)); } catch {} }, [drawdowns]);
  useEffect(() => { try { sessionStorage.setItem("phi_returnRate", JSON.stringify(rate)); } catch {} }, [rate]);

  const proj = useMemo(() => buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years: projectionYears }), []);

  const selfInsure = useMemo(() => {
    if (!baseMonthly) return [];
    const r = rate / 100, dm = {};
    drawdowns.forEach(d => { dm[d.year] = (dm[d.year] || 0) + d.amount; });
    let bal = 0, td = 0;
    return proj.map(row => {
      bal += row.annual;
      const drawn = dm[row.calYear] || 0;
      td += drawn; bal -= drawn;
      bal = bal * (1 + r);
      return { ...row, drawn, balance: Math.round(bal), totalDrawn: Math.round(td), premiumSaved: row.annual };
    });
  }, [proj, rate, drawdowns, baseMonthly]);

  const finalBalance  = selfInsure[selfInsure.length - 1]?.balance || 0;
  const finalYear     = selfInsure[selfInsure.length - 1]?.calYear || START_YEAR + projectionYears;
  const totalDrawn    = selfInsure[selfInsure.length - 1]?.totalDrawn || 0;
  const totalPremiums = proj[proj.length - 1]?.cumulative || 0;

  const addDD    = () => { setDrawdowns(p => [...p, { id: nextId, year: START_YEAR + 10, amount: 0, label: "" }]); setNextId(n => n + 1); };
  const removeDD = id => setDrawdowns(p => p.filter(d => d.id !== id));
  const updateDD = (id, field, val) => setDrawdowns(p => p.map(d => d.id === id ? { ...d, [field]: field === "amount" || field === "year" ? Number(val) : val } : d));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card color="blue">
        <p style={{ fontSize: 14, color: C.slate300, lineHeight: 1.7, margin: 0, maxWidth: 760 }}>
          Instead of paying PHI premiums, what if you invested that same amount each year at <strong style={{ color: C.amber }}>{rate}%</strong> net annual return, drawing down when you need medical care? This models your residual savings balance over your life planning horizon. A <span style={{ color: C.red }}>negative balance</span> means the fund is depleted — a risk indicator shown in red.
        </p>
      </Card>

      <StatRow stats={[
        { label: `Premiums invested (${projectionYears}yr)`, value: currency(totalPremiums) },
        { label: "Total medical drawdowns",                  value: currency(totalDrawn),    color: "text-red-400" },
        { label: `Final balance at ${finalYear}`,            value: currency(finalBalance),  color: finalBalance >= 0 ? "text-emerald-400" : "text-red-400", sub: `At ${rate}% net return` },
        { label: "Net position vs PHI",                      value: finalBalance >= 0 ? `+${currency(finalBalance)}` : currency(finalBalance), color: finalBalance >= 0 ? "text-emerald-400" : "text-red-400" },
      ]} />

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20, alignItems: "start" }}>

        {/* Left: controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionTitle sub="Enter your expected after-tax return">Net annual investment return</SectionTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <input type="range" min="2" max="12" step="0.5" value={rate} onChange={e => setRate(Number(e.target.value))} style={{ flex: 1, accentColor: C.amber, height: 4 }} />
              <span style={{ color: C.amber, fontWeight: "bold", fontSize: 28, width: 60, textAlign: "right" }}>{rate}%</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[4, 6, 8, 10].map(r => (
                <button key={r} onClick={() => setRate(r)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 13, fontWeight: "600", background: rate === r ? C.amber : "rgba(51,65,85,0.4)", color: rate === r ? "#1e293b" : C.slate400, border: "none", cursor: "pointer" }}>{r}%</button>
              ))}
            </div>
            <Disclosure text="Enter your net (after-tax) expected return. Investment returns in Australia are typically taxable. Consult your accountant for your applicable after-tax rate." />
          </Card>

          <Card>
            <SectionTitle sub="Edit to model your scenario — recalculates instantly">Medical cost drawdowns</SectionTitle>
            {drawdowns.map((d, idx) => (
              <div key={d.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: C.slate500, fontSize: 13, fontWeight: "bold", width: 22, flexShrink: 0 }}>{idx + 1}.</span>
                  <DInput placeholder="Description (e.g. Heart surgery)" value={d.label} onChange={e => updateDD(d.id, "label", e.target.value)} />
                  <button onClick={() => removeDD(d.id)} style={{ color: C.red, fontSize: 20, fontWeight: "bold", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>×</button>
                </div>
                <div style={{ display: "flex", gap: 8, paddingLeft: 30 }}>
                  <DInput label="Year" type="number" min={START_YEAR} max={START_YEAR + projectionYears} value={d.year} onChange={e => updateDD(d.id, "year", e.target.value)} />
                  <DInput label="Cost Expense ($)" type="number" min="0" step="5000" value={d.amount} onChange={e => updateDD(d.id, "amount", e.target.value)} />
                </div>
              </div>
            ))}
            <button onClick={addDD} style={{ width: "100%", padding: 10, borderRadius: 9, background: "rgba(30,41,59,0.5)", border: `1px dashed ${C.border}`, color: C.slate300, fontSize: 13, cursor: "pointer" }}>+ Add medical cost event</button>
          </Card>
        </div>

        {/* Right: full year table */}
        <Card>
          <SectionTitle>Savings balance — every year</SectionTitle>
          <div style={{ overflowY: "auto", maxHeight: 540 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Year", "Policy size", "Invested", "Drawdown", "Savings Balance"].map(h => (
                    <th key={h} style={{ textAlign: h === "Year" || h === "Policy size" ? "left" : "right", padding: "6px 10px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selfInsure.map(r => {
                  const isNeg = r.balance < 0;
                  return (
                    <tr key={r.year} style={{ background: r.drawn > 0 ? "rgba(127,29,29,0.1)" : r.note ? "rgba(120,53,15,0.06)" : "transparent" }}>
                      <td style={{ padding: "7px 10px", color: C.white, fontWeight: r.note ? "700" : "normal" }}>
                        {r.calYear}
                        {r.note && <div style={{ color: C.amber, fontSize: 10 }}>{r.note}</div>}
                      </td>
                      <td style={{ padding: "7px 10px", color: C.slate400 }}>{r.sizeLabel}</td>
                      <td style={{ padding: "7px 10px", color: C.slate300, textAlign: "right" }}>{currency(r.premiumSaved)}</td>
                      <td style={{ padding: "7px 10px", color: r.drawn > 0 ? C.red : C.slate500, textAlign: "right" }}>{r.drawn > 0 ? `−${currency(r.drawn)}` : "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: "700", textAlign: "right", color: isNeg ? C.red : C.amber }}>
                        {isNeg ? `−${currency(Math.abs(r.balance))}` : currency(r.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Disclosure text="Balance = end-of-year: (prior balance + premium invested − drawdowns) × (1 + net return rate). A negative balance (red) indicates the fund is depleted. Enter your after-tax return rate." />
        </Card>
      </div>
    </div>
  );
}

// ─── COVERAGE SCREEN ─────────────────────────────────────────────────────────

function CoverageScreen() {
  const items = [
    { t: "Heart Bypass / Vascular",       tiers: { Bronze: ["✗", "Excluded"],      "Silver+": ["✓", "Covered"],         Gold: ["✓", "Covered"]       }, note: "Bronze typically excludes cardiac surgery. Confirm inclusions in your PDS." },
    { t: "Cancer (Chemo / Radiotherapy)", tiers: { Bronze: ["~", "Limited"],        "Silver+": ["✓", "Inpatient"],        Gold: ["✓", "Covered"]       }, note: "Cancer as an inpatient is generally covered on Silver+. Confirm with your insurer." },
    { t: "Orthodontics",                  tiers: { Bronze: ["✗", "Excluded"],      "Silver+": ["✗", "Often excluded"],   Gold: ["✓", "Top Extras"]    }, note: "Orthodontics is an Extras product. 12-month waiting period typically applies." },
    { t: "General Dental",                tiers: { Bronze: ["✗", "Not covered"],   "Silver+": ["✓", "Mid Extras"],       Gold: ["✓", "Top Extras"]    }, note: "Dental is an Extras product. Annual limits apply. Check your specific Extras tier." },
    { t: "Joint Replacement",             tiers: { Bronze: ["✗", "Excluded"],      "Silver+": ["~", "Some plans"],       Gold: ["✓", "Covered"]       }, note: "Joint replacements are a key reason many people choose Gold. Confirm with your insurer." },
    { t: "Mental Health (inpatient)",     tiers: { Bronze: ["~", "Limited"],        "Silver+": ["✓", "Covered"],          Gold: ["✓", "Covered"]       }, note: "2-month waiting period applies. Confirm covered days with your insurer." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card color="amber">
        <p style={{ fontSize: 14, color: C.slate300, lineHeight: 1.7, margin: 0 }}>
          Coverage details below are <strong style={{ color: C.amber }}>general indicators only</strong>. Always read your insurer's Product Disclosure Statement (PDS) for exact inclusions, exclusions, waiting periods and annual limits. <span style={{ color: C.slate500 }}>Please consult your insurer directly — this information is of a general nature only.</span>
        </p>
      </Card>

      {/* Coverage table */}
      <Card>
        <SectionTitle>Hospital cover by tier</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>Treatment</th>
              {["Bronze", "Silver+", "Gold"].map(t => (
                <th key={t} style={{ textAlign: "center", padding: "10px 12px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{t}</th>
              ))}
              <th style={{ textAlign: "left", padding: "10px 12px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.t} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "12px 12px", color: C.white, fontWeight: "600" }}>{item.t}</td>
                {["Bronze", "Silver+", "Gold"].map(tier => {
                  const [icon, label] = item.tiers[tier];
                  const col = icon === "✓" ? C.green : icon === "✗" ? C.red : C.amber;
                  return (
                    <td key={tier} style={{ padding: "12px 12px", textAlign: "center" }}>
                      <div style={{ color: col, fontWeight: "700", fontSize: 15 }}>{icon}</div>
                      <div style={{ color: col, fontSize: 11, marginTop: 2 }}>{label}</div>
                    </td>
                  );
                })}
                <td style={{ padding: "12px 12px", color: C.slate400, fontSize: 12, lineHeight: 1.5 }}>{item.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Waiting periods */}
        <Card>
          <SectionTitle>Waiting periods (typical)</SectionTitle>
          {[
            { item: "Pre-existing conditions",     wait: "12 months", c: C.amber  },
            { item: "Orthodontics / major dental", wait: "12 months", c: C.amber  },
            { item: "Psychiatric care",            wait: "2 months",  c: C.blue   },
            { item: "All other hospital",          wait: "2 months",  c: C.blue   },
            { item: "Emergency",                   wait: "No wait",   c: C.green  },
          ].map(w => (
            <div key={w.item} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
              <span style={{ color: C.slate300 }}>{w.item}</span>
              <span style={{ color: w.c, fontWeight: "700" }}>{w.wait}</span>
            </div>
          ))}
          <Disclosure text="Typical waiting periods. Confirm with your insurer's PDS." />
        </Card>

        {/* Overseas */}
        <Card>
          <SectionTitle>Overseas treatment</SectionTitle>
          <p style={{ fontSize: 14, color: C.slate300, lineHeight: 1.7, marginBottom: 12 }}>Australian Private Health Insurance generally covers treatment at Australian registered facilities only.</p>
          <p style={{ fontSize: 14, color: C.slate300, lineHeight: 1.7 }}>Australia has reciprocal healthcare agreements with 11 countries (including UK and NZ) for emergency and essential care when visiting.</p>
          <Disclosure text="Coverage varies by insurer and policy. Consult your insurer directly for guidance specific to your policy and overseas scenarios. This information is of a general nature only." />
        </Card>
      </div>

      <Card style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
      </Card>
    </div>
  );
}

// ─── FAQ SCREEN ──────────────────────────────────────────────────────────────

function FaqScreen() {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
      {FAQS.map((faq, i) => (
        <Card key={i} style={{ cursor: "pointer", padding: 20 }} onClick={() => setOpen(open === i ? null : i)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: "600", color: open === i ? C.amber : C.white, lineHeight: 1.4 }}>{faq.q}</span>
            <span style={{ color: C.amber, fontSize: 22, flexShrink: 0, lineHeight: 1, fontWeight: "300" }}>{open === i ? "−" : "+"}</span>
          </div>
          {open === i && (
            <p style={{ fontSize: 13, color: C.slate300, marginTop: 12, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>{faq.a}</p>
          )}
        </Card>
      ))}
      <div style={{ gridColumn: "1 / -1" }}>
        <Card style={{ padding: 16 }}>
          <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig]       = useState(null);
  const [lastConfig, setLastConfig] = useState(null);
  const handleComplete = c => { setLastConfig(c); setConfig(c); };
  if (!config) return <Questionnaire onComplete={handleComplete} existingConfig={lastConfig} />;
  return <MainTool config={config} onReset={() => setConfig(null)} />;
}
