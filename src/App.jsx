import React, { useState, useMemo, useEffect, useRef } from "react";

// ─── BREAKPOINT HOOK ─────────────────────────────────────────────────────────

function useBreakpoint() {
  const [desk, setDesk] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 768 : false);
  useEffect(() => {
    const fn = () => setDesk(window.innerWidth >= 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return desk;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

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

function currency(n) { if (!n && n !== 0) return "—"; return "$" + Math.round(n).toLocaleString("en-AU"); }
function calcLhcLoading(age) { if (age <= 30) return 0; return Math.min((age - 30) * 2, 70); }

function getMlsRate(combinedIncome, coverLevel, numDependants) {
  const t = MLS_THRESHOLDS[coverLevel] || MLS_THRESHOLDS.single;
  const bonus = coverLevel === "family" && numDependants > 1 ? (numDependants - 1) * 1500 : 0;
  if (combinedIncome <= t.base + bonus) return 0;
  for (const tier of t.tiers) { if (combinedIncome < tier.limit) return tier.rate; }
  return 0.015;
}

function buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years }) {
  if (!baseMonthly) return Array.from({ length: years }, (_, i) => ({ year: i + 1, calYear: START_YEAR + i, annual: 0, cumulative: 0, sizeLabel: "No cover", note: "" }));
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
  bg: "#0a0f1e", card: "rgba(22,32,52,0.9)", border: "rgba(71,85,105,0.45)",
  amber: "#fbbf24", amberDim: "#d97706", white: "#f1f5f9",
  slate300: "#cbd5e1", slate400: "#94a3b8", slate500: "#64748b", slate600: "#475569",
  green: "#34d399", red: "#f87171", blue: "#60a5fa",
};

const colorMap = { "text-amber-400": C.amber, "text-emerald-400": C.green, "text-red-400": C.red, "text-blue-400": C.blue };

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
      background: C.card, border: `1px solid ${g ? g.border : C.border}`, borderRadius: 14, padding: 16,
      boxShadow: g ? `0 0 0 3px ${g.shadow}, 0 4px 20px rgba(0,0,0,0.35)` : "0 2px 12px rgba(0,0,0,0.3)",
      cursor: onClick ? "pointer" : undefined, ...s,
    }}>{children}</div>
  );
}

function StatGrid({ stats, desk }) {
  const cols = desk ? Math.min(stats.length, 4) : 2;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: desk ? 12 : 10 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: "rgba(30,41,59,0.7)", border: `1px solid ${C.border}`, borderRadius: 12, padding: desk ? "16px 18px" : 12, textAlign: "center" }}>
          <div style={{ fontSize: desk ? 12 : 11, color: C.slate400, marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: desk ? 22 : 18, fontWeight: "bold", color: colorMap[s.color] || C.white }}>{s.value}</div>
          {s.sub && <div style={{ fontSize: 11, color: C.slate500, marginTop: 3 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 8 }}>
      <div style={{ color: C.amber, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate500, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(51,65,85,0.5)", borderRadius: 14, padding: 4 }}>
      {options.map(o => (
        <button key={String(o.value)} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 12, fontWeight: "600",
          background: value === o.value ? C.amber : "transparent",
          color: value === o.value ? "#1e293b" : C.slate300,
          border: "none", cursor: "pointer", transition: "all 0.15s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function FInput({ label, desk, ...props }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && <div style={{ fontSize: 11, color: C.slate400, marginBottom: 4 }}>{label}</div>}
      <input {...props} style={{
        width: "100%", background: "rgba(15,23,42,0.8)", border: `1px solid ${C.border}`,
        color: C.white, fontSize: desk ? 14 : 13, borderRadius: 10, padding: desk ? "10px 13px" : "9px 11px",
        outline: "none", boxSizing: "border-box", ...(props.style || {})
      }} />
    </div>
  );
}

function Disclosure({ text }) {
  return <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.5, marginTop: 10 }}>{text}</p>;
}

// ─── NAV ICONS ───────────────────────────────────────────────────────────────

const NAV_ICONS = {
  summary:  (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  levy:     (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  cost:     (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  invest:   (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  coverage: (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  faq:      (c, sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

const SCREENS = [
  { id: "summary",  label: "Summary"  },
  { id: "levy",     label: "Levy"     },
  { id: "cost",     label: "Cost"     },
  { id: "invest",   label: "Invest"   },
  { id: "coverage", label: "Cover"    },
  { id: "faq",      label: "FAQ"      },
];

// ─── QUESTIONNAIRE ───────────────────────────────────────────────────────────

function Questionnaire({ onComplete, existingConfig }) {
  const desk = useBreakpoint();
  const [step, setStep]           = useState(0);
  const [coverLevel, setCoverLevel] = useState(existingConfig?.coverLevel || "family");
  const [members, setMembers]     = useState(existingConfig?.members || [
    { id: 1, name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" },
    { id: 2, name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" },
  ]);
  const [insurerId, setInsurerId] = useState(existingConfig?.insurerId || "hcf");
  const [tierId, setTierId]       = useState(() => {
    if (!existingConfig) return 2;
    const ins = INSURERS.find(i => i.id === existingConfig.insurerId);
    return ins?.tiers?.findIndex(t => t.label === existingConfig.tierLabel) ?? 2;
  });
  const [manualMonthly, setManualMonthly] = useState(existingConfig?.insurerId === "other" ? String(existingConfig.baseMonthly) : "");
  const [lhcApplies, setLhcApplies] = useState(existingConfig?.lhcApplies ?? true);
  const topRef = useRef(null);

  const insurer  = INSURERS.find(i => i.id === insurerId);
  const adults   = members.filter(m => m.type === "adult");
  const children = members.filter(m => m.type === "child");

  const updateMember = (id, field, val) => setMembers(p => p.map(m => m.id === id ? { ...m, [field]: val } : m));

  useEffect(() => {
    if (coverLevel === "single") setMembers(p => { const a = p.filter(m => m.type === "adult"); const k = p.filter(m => m.type !== "adult"); return [a[0], ...k]; });
    if (coverLevel === "couple" && adults.length < 2) setMembers(p => [...p, { id: Date.now(), name: "", age: "", income: "", plannedDeathAge: "85", type: "adult" }]);
  }, [coverLevel]);

  const addChild     = () => { setMembers(p => [...p, { id: Date.now(), name: "", age: "", income: "", type: "child" }]); setCoverLevel("family"); };
  const removeMember = id => setMembers(p => p.filter(m => m.id !== id));

  const goStep = n => {
    setStep(n);
    setTimeout(() => { if (topRef.current) { topRef.current.scrollTop = 0; window.scrollTo({ top: 0, behavior: "instant" }); } }, 10);
  };

  const baseFromInsurer = () => {
    if (insurerId === "other") return Number(manualMonthly) || 0;
    const t = insurer?.tiers?.[tierId];
    return t ? Math.round(t.monthly * COVER_MULTIPLIERS[coverLevel]) : 0;
  };

  const canProceed = step === 0 ? adults.every(m => m.name && m.age) : (insurerId === "other" ? !!manualMonthly : true);

  const handleComplete = () => {
    const base     = baseFromInsurer();
    const parsed   = members.map(m => ({ ...m, age: Number(m.age), income: Number(m.income), plannedDeathAge: Number(m.plannedDeathAge) || 85 }));
    const combined = parsed.filter(m => m.type === "adult").reduce((s, m) => s + m.income, 0);
    const numDep   = children.length;
    const mlsRate  = getMlsRate(combined, coverLevel, numDep);
    const avgLhc   = parsed.filter(m => m.type === "adult").reduce((s, m) => s + calcLhcLoading(m.age), 0) / Math.max(parsed.filter(m => m.type === "adult").length, 1);
    const maxYears = Math.max(...parsed.filter(m => m.type === "adult").map(m => (m.plannedDeathAge || 85) - m.age), 20);
    onComplete({ members: parsed, coverLevel, insurerId, insurerName: insurer?.name || "Other", tierLabel: insurer?.tiers?.[tierId]?.label || "Manual", baseMonthly: base, lhcApplies, avgLhc, combinedIncome: combined, mlsRate, mlsCost: combined * mlsRate, numDependants: numDep, projectionYears: Math.min(maxYears, 60) });
  };

  // ── Shared form sections ─────────────────────────────────────────────────

  const AdultCards = () => adults.map((m, idx) => (
    <Card key={m.id} glow="amber" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.slate400, marginBottom: 8, fontWeight: "600", textTransform: "uppercase" }}>Adult {idx + 1}</div>
      <FInput desk={desk} placeholder="Full name" value={m.name} onChange={e => updateMember(m.id, "name", e.target.value)} style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <FInput desk={desk} label="Age" type="number" min="18" max="100" placeholder="e.g. 45" value={m.age} onChange={e => updateMember(m.id, "age", e.target.value)} />
        <FInput desk={desk} label="Annual income ($)" type="number" placeholder="e.g. 85000" value={m.income} onChange={e => updateMember(m.id, "income", e.target.value)} />
      </div>
      <FInput desk={desk} label="Life planning horizon — age" type="number" min="50" max="110" placeholder="e.g. 85" value={m.plannedDeathAge} onChange={e => updateMember(m.id, "plannedDeathAge", e.target.value)} />
      <div style={{ fontSize: 10, color: C.slate600, marginTop: 4 }}>The age to which you'd like to model insurance cover.</div>
      {idx === 1 && (
        <button onClick={() => { removeMember(m.id); setCoverLevel("single"); }} style={{ color: C.red, fontSize: 12, marginTop: 8, background: "none", border: "none", cursor: "pointer" }}>Remove adult 2</button>
      )}
    </Card>
  ));

  const ChildCards = () => (
    <>
      <SectionHeader title="Children" sub="Covered at no extra premium cost until age 22" />
      {children.map((c, idx) => (
        <Card key={c.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <FInput desk={desk} placeholder={`Child ${idx + 1} name`} value={c.name} onChange={e => updateMember(c.id, "name", e.target.value)} />
            <FInput desk={desk} label="Age" type="number" min="0" max="21" placeholder="Age" value={c.age} onChange={e => updateMember(c.id, "age", e.target.value)} style={{ width: 90, flexShrink: 0 }} />
            <button onClick={() => removeMember(c.id)} style={{ color: C.red, fontSize: 22, fontWeight: "bold", paddingBottom: 4, background: "none", border: "none", cursor: "pointer" }}>×</button>
          </div>
        </Card>
      ))}
      <button onClick={addChild} style={{ width: "100%", padding: 11, borderRadius: 12, background: "rgba(51,65,85,0.4)", border: `1px dashed ${C.border}`, color: C.slate300, fontSize: 13, cursor: "pointer", marginTop: 4 }}>+ Add child</button>
    </>
  );

  const InsurerSection = () => (
    <>
      <SectionHeader title="Insurer" />
      <div style={{ display: "grid", gridTemplateColumns: desk ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 16 }}>
        {INSURERS.map(ins => (
          <button key={ins.id} onClick={() => { setInsurerId(ins.id); if (ins.tiers.length) setTierId(2); }} style={{
            padding: "11px 14px", borderRadius: 10, textAlign: "left", fontSize: 13, fontWeight: "600",
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
          <SectionHeader title="Cover level" />
          {insurer.tiers.map((t, idx) => {
            const mo = Math.round(t.monthly * COVER_MULTIPLIERS[coverLevel]);
            const active = tierId === idx;
            return (
              <button key={idx} onClick={() => setTierId(idx)} style={{
                display: "block", width: "100%", padding: "12px 14px", borderRadius: 10, textAlign: "left", marginBottom: 8,
                background: active ? "rgba(120,53,15,0.3)" : "rgba(15,23,42,0.8)",
                border: `1px solid ${active ? "rgba(251,191,36,0.6)" : C.border}`,
                boxShadow: active ? "0 0 0 2px rgba(251,191,36,0.1)" : "none",
                cursor: "pointer", transition: "all 0.15s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: "600", fontSize: 13, color: active ? C.amber : C.slate300 }}>{t.label}</span>
                  <span style={{ fontWeight: "bold", fontSize: desk ? 16 : 13, color: C.white }}>{currency(mo)}<span style={{ fontSize: 11, color: C.slate400, fontWeight: "normal" }}>/mo</span></span>
                </div>
                <div style={{ fontSize: 11, color: C.slate500, marginTop: 2 }}>{currency(mo * 12)}/yr · {COVER_LABELS[coverLevel]} rate (indicative)</div>
              </button>
            );
          })}
        </>
      )}

      {insurerId === "other" && (
        <>
          <SectionHeader title="Monthly premium" sub="Enter your quoted amount" />
          <FInput desk={desk} type="number" placeholder="e.g. 650" value={manualMonthly} onChange={e => setManualMonthly(e.target.value)} />
        </>
      )}
    </>
  );

  const LhcSection = () => (
    <>
      <SectionHeader title="LHC Loading" sub="Applies if any adult has not held hospital cover since age 30" />
      <Toggle options={[{ value: true, label: "Yes — loading applies" }, { value: false, label: "No loading" }]} value={lhcApplies} onChange={setLhcApplies} />
      {lhcApplies && adults.filter(m => m.age).map(m => {
        const loading = calcLhcLoading(Number(m.age));
        return loading > 0 ? (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid rgba(51,65,85,0.5)`, fontSize: 12 }}>
            <span style={{ color: C.slate400 }}>{m.name || "Adult"} (age {m.age})</span>
            <span style={{ color: C.amber, fontWeight: "600" }}>{loading}% loading</span>
          </div>
        ) : null;
      })}
      <Disclosure text="LHC loading = (age − 30) × 2%, capped at 70%. New migrants have 12 months from Medicare registration to take out cover without loading." />
    </>
  );

  // ── Desktop layout ───────────────────────────────────────────────────────

  if (desk) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif" }}>
        {/* Top bar */}
        <div style={{ background: "linear-gradient(135deg,#1e293b,#0a0f1e)", borderBottom: `1px solid ${C.border}`, padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.amber, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>🇦🇺 For Australian Residents Only</div>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 22, marginTop: 2 }}>Should I get Private Health Insurance?</div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {["Who's covered?", "Choose your insurer"].map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold", background: i <= step ? C.amber : "rgba(51,65,85,0.5)", color: i <= step ? "#1e293b" : C.slate500 }}>{i + 1}</div>
                <span style={{ fontSize: 13, color: i === step ? C.white : C.slate500, fontWeight: i === step ? "600" : "normal" }}>{label}</span>
                {i < 1 && <div style={{ width: 32, height: 1, background: step > i ? C.amber : C.border, marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div ref={topRef} style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 48px", boxSizing: "border-box" }}>
          {step === 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Who's covered?</h2>
                <p style={{ color: C.slate400, fontSize: 14, marginBottom: 24 }}>Tell us about the people on this policy.</p>
                <SectionHeader title="Cover type" />
                <Toggle options={[{ value: "single", label: "Single" }, { value: "couple", label: "Couple" }, { value: "family", label: "Family" }]} value={coverLevel} onChange={setCoverLevel} />
                <SectionHeader title="Adults on policy" />
                <AdultCards />
              </div>
              <div>
                {coverLevel === "family" && <ChildCards />}
                <div style={{ marginTop: 24 }}>
                  <Card color="blue">
                    <div style={{ color: C.blue, fontWeight: "700", fontSize: 14, marginBottom: 10 }}>💡 About this model</div>
                    <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.7 }}>This tool models the <strong style={{ color: C.white }}>financial decision</strong> around Private Health Insurance for Australian residents — covering LHC loading, the Medicare Levy Surcharge, premium step-downs as family size changes, and a self-insurance investment scenario.</p>
                    <Disclosure text="For educational purposes only. Not financial, tax or insurance advice." />
                  </Card>
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Choose your insurer</h2>
                <p style={{ color: C.slate400, fontSize: 14, marginBottom: 24 }}>Select a provider and cover level.</p>
                <InsurerSection />
              </div>
              <div>
                <h2 style={{ color: C.white, fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>LHC Loading</h2>
                <p style={{ color: C.slate400, fontSize: 14, marginBottom: 24 }}>Applies if any adult has not held hospital cover since age 30.</p>
                <LhcSection />
                <div style={{ marginTop: 20 }}>
                  <Card glow="amber">
                    <div style={{ color: C.amber, fontWeight: "700", fontSize: 14, marginBottom: 12 }}>Configuration Preview</div>
                    {[
                      { label: "Cover type",   value: COVER_LABELS[coverLevel] },
                      { label: "Insurer",      value: insurer?.name || "—" },
                      { label: "Tier",         value: insurer?.tiers?.[tierId]?.label || "—" },
                      { label: "Base monthly", value: currency(baseFromInsurer()) },
                      { label: "Adults",       value: adults.filter(m => m.name).map(m => m.name).join(", ") || "—" },
                      { label: "Children",     value: children.length ? children.map(c => c.name || "Child").join(", ") : "None" },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                        <span style={{ color: C.slate400 }}>{row.label}</span>
                        <span style={{ color: C.white, fontWeight: "600" }}>{row.value}</span>
                      </div>
                    ))}
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ background: "rgba(10,15,30,0.98)", borderTop: `1px solid ${C.border}`, padding: "14px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 0 }}>
          <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic" }}>For Australian residents only · Educational purposes only · Not financial advice</p>
          <div style={{ display: "flex", gap: 12 }}>
            {step > 0 && <button onClick={() => goStep(0)} style={{ padding: "10px 24px", borderRadius: 10, background: "rgba(51,65,85,0.4)", color: C.slate300, fontSize: 13, fontWeight: "600", border: `1px solid ${C.border}`, cursor: "pointer" }}>← Back</button>}
            {step < 1
              ? <button onClick={() => canProceed && goStep(1)} disabled={!canProceed} style={{ padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: "bold", background: canProceed ? C.amber : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Continue →</button>
              : <button onClick={() => canProceed && handleComplete()} disabled={!canProceed} style={{ padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: "bold", background: canProceed ? C.amber : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Build My Model →</button>
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile layout ────────────────────────────────────────────────────────

  return (
    <div ref={topRef} style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)", borderBottom: `1px solid #1e3a5f`, padding: "18px 16px 14px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ color: C.amber, fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>🇦🇺 For Australian Residents Only</div>
        <div style={{ color: C.white, fontWeight: "bold", fontSize: 20, lineHeight: 1.25 }}>Should I get Private<br />Health Insurance?</div>
        <div style={{ color: C.slate400, fontSize: 11, marginTop: 4 }}>A personal decision model · Step {step + 1} of 2</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[0, 1].map(i => <div key={i} style={{ height: 3, flex: 1, borderRadius: 4, background: i <= step ? C.amber : "rgba(51,65,85,0.8)", transition: "background 0.3s" }} />)}
        </div>
      </div>

      <div style={{ padding: "20px 16px 130px" }}>
        {step === 0 && (
          <>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Who's covered?</div>
            <div style={{ color: C.slate400, fontSize: 13, marginBottom: 16 }}>Tell us about the people on this policy</div>
            <SectionHeader title="Cover Type" />
            <Toggle options={[{ value: "single", label: "Single" }, { value: "couple", label: "Couple" }, { value: "family", label: "Family" }]} value={coverLevel} onChange={setCoverLevel} />
            <SectionHeader title="Adults on policy" />
            <AdultCards />
            {coverLevel === "family" && <ChildCards />}
          </>
        )}
        {step === 1 && (
          <>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 18, marginBottom: 4 }}>Choose your insurer</div>
            <div style={{ color: C.slate400, fontSize: 13, marginBottom: 16 }}>Select a provider and cover level</div>
            <InsurerSection />
            <LhcSection />
          </>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(15,23,42,0.97)", borderTop: `1px solid #1e3a5f`, padding: "12px 16px 24px", zIndex: 20 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && <button onClick={() => goStep(0)} style={{ flex: 1, padding: 14, borderRadius: 14, background: "rgba(51,65,85,0.5)", color: C.slate300, fontSize: 14, fontWeight: "600", border: `1px solid ${C.border}`, cursor: "pointer" }}>← Back</button>}
          {step < 1
            ? <button onClick={() => canProceed && goStep(1)} disabled={!canProceed} style={{ flex: 1, padding: 14, borderRadius: 14, fontSize: 14, fontWeight: "bold", background: canProceed ? "#f59e0b" : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Next →</button>
            : <button onClick={() => canProceed && handleComplete()} disabled={!canProceed} style={{ flex: 1, padding: 14, borderRadius: 14, fontSize: 14, fontWeight: "bold", background: canProceed ? "#f59e0b" : "rgba(51,65,85,0.4)", color: canProceed ? "#1e293b" : C.slate500, border: "none", cursor: canProceed ? "pointer" : "default" }}>Build My Model →</button>
          }
        </div>
        <p style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 8, fontStyle: "italic" }}>For Australian residents only · Educational purposes only · Not advice</p>
      </div>
    </div>
  );
}

// ─── MAIN TOOL SHELL ─────────────────────────────────────────────────────────

function MainTool({ config, onReset }) {
  const desk = useBreakpoint();
  const [screen, setScreen] = useState("summary");
  const contentRef = useRef(null);
  const go = id => { setScreen(id); setTimeout(() => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 30); };
  const current = SCREENS.find(s => s.id === screen);

  const renderScreen = () => {
    switch (screen) {
      case "summary":  return <SummaryScreen  config={config} desk={desk} />;
      case "levy":     return <LevyScreen     config={config} desk={desk} />;
      case "cost":     return <CostScreen     config={config} desk={desk} />;
      case "invest":   return <InvestScreen   config={config} desk={desk} />;
      case "coverage": return <CoverageScreen desk={desk} />;
      case "faq":      return <FaqScreen      desk={desk} />;
      default:         return <SummaryScreen  config={config} desk={desk} />;
    }
  };

  // ── Desktop shell ────────────────────────────────────────────────────────
  if (desk) {
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,-apple-system,sans-serif" }}>
        <div style={{ background: "linear-gradient(135deg,#1e293b,#0a0f1e)", borderBottom: `1px solid ${C.border}`, padding: "13px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ color: C.amber, fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.12em" }}>🇦🇺 Private Health Insurance · Decision Model</div>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 18, marginTop: 1 }}>PHI — Should I or Shouldn't I?</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: C.amber, fontSize: 13, fontWeight: "600" }}>{config.insurerName} · {config.tierLabel}</div>
              <div style={{ color: C.slate400, fontSize: 12 }}>{COVER_LABELS[config.coverLevel]} · {currency(config.baseMonthly)}/mo base</div>
            </div>
            <button onClick={onReset} style={{ fontSize: 12, color: C.slate300, background: "rgba(51,65,85,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>Edit inputs</button>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ width: 210, background: "rgba(10,15,30,0.98)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, padding: "20px 0" }}>
            {SCREENS.map(s => {
              const active = screen === s.id;
              return (
                <button key={s.id} onClick={() => go(s.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 22px", background: active ? "rgba(251,191,36,0.08)" : "transparent", borderLeft: active ? `3px solid ${C.amber}` : "3px solid transparent", borderTop: "none", borderRight: "none", borderBottom: "none", cursor: "pointer", textAlign: "left" }}>
                  {NAV_ICONS[s.id](active ? C.amber : C.slate400, 17)}
                  <span style={{ fontSize: 13, fontWeight: active ? "700" : "500", color: active ? C.amber : C.slate400 }}>{s.label}</span>
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.slate600, lineHeight: 1.6 }}>For Australian residents only.<br />Educational use only. Not advice.</div>
            </div>
          </div>
          <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "28px 36px", background: C.bg }}>
            <div style={{ maxWidth: 1060 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                {NAV_ICONS[screen](C.amber, 20)}
                <h1 style={{ color: C.white, fontSize: 20, fontWeight: "bold", margin: 0 }}>{current?.label}</h1>
              </div>
              {renderScreen()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile shell ─────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)", borderBottom: `1px solid #1e3a5f`, padding: "13px 16px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: C.amber, fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>Private Health Insurance · Decision Model</div>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 15, marginTop: 2 }}>PHI — Should I or Shouldn't I?</div>
          </div>
          <button onClick={onReset} style={{ fontSize: 11, color: C.slate400, background: "rgba(51,65,85,0.5)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 10px", cursor: "pointer" }}>Edit</button>
        </div>
        <div style={{ color: C.slate500, fontSize: 11, marginTop: 4 }}>{config.insurerName} · {config.tierLabel} · {COVER_LABELS[config.coverLevel]} · {currency(config.baseMonthly)}/mo</div>
      </div>

      <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px 16px" }}>
        {renderScreen()}
      </div>

      <div style={{ background: "rgba(15,23,42,0.97)", borderTop: `1px solid #1e3a5f`, display: "flex", flexShrink: 0 }}>
        {SCREENS.map(s => {
          const active = screen === s.id;
          return (
            <button key={s.id} onClick={() => go(s.id)} style={{ flex: 1, padding: "10px 2px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer" }}>
              {NAV_ICONS[s.id](active ? C.amber : C.slate400, 20)}
              <span style={{ fontSize: 9, color: active ? C.amber : C.white, fontWeight: active ? "bold" : "normal" }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── SUMMARY SCREEN ──────────────────────────────────────────────────────────

function SummaryScreen({ config, desk }) {
  const { members, coverLevel, baseMonthly, lhcApplies, avgLhc, combinedIncome, mlsRate, mlsCost, insurerName, tierLabel, projectionYears } = config;
  const adults   = members.filter(m => m.type === "adult");
  const children = members.filter(m => m.type === "child");
  const monthly  = baseMonthly * (lhcApplies ? 1 + avgLhc / 100 : 1);
  const proj     = useMemo(() => buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years: projectionYears }), []);
  const total    = proj[proj.length - 1]?.cumulative || 0;
  const lhcYear  = START_YEAR + 10;

  const membersCard = (
    <Card glow="amber">
      <div style={{ color: C.amber, fontWeight: "bold", fontSize: 13, marginBottom: 10 }}>Your Policy Members</div>
      {adults.map(m => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
          <span style={{ color: C.slate300 }}>{m.name}, age {m.age}</span>
          <span style={{ color: C.amber, fontWeight: "600" }}>{lhcApplies ? `${calcLhcLoading(m.age)}% LHC` : "No LHC"}</span>
        </div>
      ))}
      {children.map(c => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
          <span style={{ color: C.slate300 }}>{c.name}, age {c.age}</span>
          <span style={{ color: C.green, fontSize: 11 }}>Free on policy</span>
        </div>
      ))}
    </Card>
  );

  const alerts = (
    <>
      {lhcApplies && (
        <Card color="amber">
          <div style={{ color: C.amber, fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>⚡ LHC Loading Active</div>
          <p style={{ fontSize: 12, color: C.slate300, lineHeight: 1.6 }}>Loading clears permanently in <strong style={{ color: C.white }}>{lhcYear}</strong> after 10 continuous years of cover. Every year of further delay pushes that date out by one year.</p>
        </Card>
      )}
      {mlsRate > 0 && (
        <Card color="red">
          <div style={{ color: C.red, fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>⚠ Medicare Levy Surcharge — Active</div>
          <p style={{ fontSize: 12, color: C.slate300, lineHeight: 1.6 }}>At your combined income of <strong style={{ color: C.white }}>{currency(combinedIncome)}</strong>, without hospital cover you pay <strong style={{ color: C.red }}>{currency(mlsCost)}/yr</strong> in MLS at <strong style={{ color: C.red }}>{(mlsRate * 100).toFixed(1)}%</strong> — for no health benefit.</p>
        </Card>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StatGrid desk={desk} stats={[
        { label: "Base monthly",                              value: currency(baseMonthly),    sub: `${insurerName} ${tierLabel}` },
        { label: `Monthly incl. LHC (${avgLhc.toFixed(0)}%)`, value: lhcApplies ? currency(monthly) : "No loading", color: lhcApplies ? "text-amber-400" : "text-emerald-400" },
        { label: "Annual (Year 1)",                           value: currency(monthly * 12) },
        { label: `Lifetime (${projectionYears}yr)`,           value: currency(total), color: "text-amber-400", sub: "incl. inflation + step-downs" },
      ]} />
      {desk ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {membersCard}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{alerts}</div>
        </div>
      ) : (
        <>{membersCard}{alerts}</>
      )}
      <Card style={{ padding: 14 }}>
        <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
      </Card>
    </div>
  );
}

// ─── LEVY SCREEN ─────────────────────────────────────────────────────────────

function LevyScreen({ config, desk }) {
  const { combinedIncome, coverLevel, numDependants, mlsRate, mlsCost, baseMonthly } = config;
  const bonus     = numDependants > 1 ? (numDependants - 1) * 1500 : 0;
  const threshold = 202000 + bonus;
  const triggered = mlsRate > 0;

  const tiersCard = (
    <Card>
      <SectionHeader title="MLS Tiers 2025–26 · Family thresholds" />
      {[
        { tier: "No surcharge", range: "≤ $203,500",  rate: 0,      label: "0%",    c: C.green   },
        { tier: "Tier 1",       range: "$203k–$236k", rate: 0.01,   label: "1.0%",  c: C.amber   },
        { tier: "Tier 2",       range: "$236k–$316k", rate: 0.0125, label: "1.25%", c: "#fb923c" },
        { tier: "Tier 3",       range: "$316k+",      rate: 0.015,  label: "1.5%",  c: C.red     },
      ].map(t => (
        <div key={t.tier} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: mlsRate === t.rate ? "rgba(251,191,36,0.07)" : "rgba(15,23,42,0.5)", border: `1px solid ${mlsRate === t.rate ? "rgba(251,191,36,0.4)" : C.border}` }}>
          <div>
            <div style={{ color: C.white, fontWeight: "600", fontSize: 13 }}>{t.tier}</div>
            <div style={{ color: C.slate500, fontSize: 11 }}>Family: {t.range}</div>
          </div>
          <div style={{ color: t.c, fontSize: 24, fontWeight: "bold" }}>{t.label}</div>
        </div>
      ))}
      <Disclosure text="Family threshold increases by $1,500 per dependent child after the first. Confirm with your accountant." />
    </Card>
  );

  const compCard = triggered && baseMonthly > 0 ? (
    <Card color="amber">
      <SectionHeader title="MLS vs PHI comparison" />
      <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(127,29,29,0.15)", border: `1px solid rgba(248,113,113,0.2)`, marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.slate300 }}>MLS (no PHI)</div>
        <div style={{ color: C.red, fontWeight: "bold", fontSize: 16, marginTop: 2 }}>{currency(mlsCost)}/yr — no benefit</div>
      </div>
      <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(52,211,153,0.08)", border: `1px solid rgba(52,211,153,0.2)` }}>
        <div style={{ fontSize: 12, color: C.slate300 }}>PHI base premium</div>
        <div style={{ color: C.green, fontWeight: "bold", fontSize: 16, marginTop: 2 }}>{currency(baseMonthly * 12)}/yr + coverage</div>
      </div>
      <Disclosure text="Confirm your exact MLS liability with your accountant." />
    </Card>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card color="blue">
        <div style={{ color: C.blue, fontWeight: "700", fontSize: 14, marginBottom: 8 }}>What is the Medicare Levy? 🐷</div>
        <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.6 }}>Everyone earning income in Australia pays a <strong style={{ color: C.white }}>2% Medicare Levy</strong>. On top of that, if you earn above the threshold without hospital cover, you pay an extra surcharge (MLS) — deliberately priced to equal the cost of basic PHI.</p>
      </Card>
      <StatGrid desk={desk} stats={[
        { label: "Your combined income", value: currency(combinedIncome) },
        { label: "MLS family threshold", value: currency(threshold), sub: `${numDependants} ${numDependants === 1 ? "dependant" : "dependants"}` },
        { label: "MLS triggered?",       value: triggered ? "YES" : "NO", color: triggered ? "text-red-400" : "text-emerald-400" },
        { label: "MLS cost (no PHI)",    value: triggered ? currency(mlsCost) + "/yr" : "$0", color: triggered ? "text-red-400" : "text-emerald-400" },
      ]} />
      {desk && triggered ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{tiersCard}{compCard}</div>
      ) : (
        <>{tiersCard}{compCard}</>
      )}
    </div>
  );
}

// ─── COST SCREEN ─────────────────────────────────────────────────────────────

function CostScreen({ config, desk }) {
  const { baseMonthly, members, coverLevel, lhcApplies, avgLhc, projectionYears } = config;
  const [expanded, setExpanded] = useState(false);
  const lhcMult     = lhcApplies ? 1 + avgLhc / 100 : 1;
  const lhcYear     = START_YEAR + 10;
  const proj        = useMemo(() => buildProjection({ baseMonthly, members, coverLevel, lhcApplies, years: projectionYears }), []);
  const total       = proj[proj.length - 1]?.cumulative || 0;
  const afterLhcRow = proj.find(r => r.calYear === lhcYear);
  const milestones  = proj.filter(r => r.note);

  const milestonesCard = (
    <Card>
      <SectionHeader title="Policy milestones" sub="Personalised to your life planning horizon" />
      {milestones.length === 0 && <p style={{ color: C.slate500, fontSize: 13 }}>No milestones in this projection window.</p>}
      {milestones.map(r => (
        <div key={r.calYear} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <span style={{ color: C.white, fontWeight: "700", fontSize: 14 }}>{r.calYear}</span>
            <div style={{ color: C.amber, fontSize: 11, marginTop: 2 }}>{r.note}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.slate300, fontSize: 13, fontWeight: "600" }}>{currency(r.annual)}/yr</div>
            <div style={{ color: C.slate500, fontSize: 11 }}>{r.sizeLabel}</div>
          </div>
        </div>
      ))}
      <Disclosure text="4% annual inflation assumed. Step-downs modelled at indicative multipliers." />
    </Card>
  );

  const tableCard = (
    <Card>
      <SectionHeader title="Year-by-year projection" />
      <div style={{ overflowY: "auto", maxHeight: desk ? 440 : 360 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Year", "Policy size", "Annual", "Cumulative"].map(h => (
                <th key={h} style={{ textAlign: h === "Year" || h === "Policy size" ? "left" : "right", padding: "6px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proj.map(r => (
              <tr key={r.year} style={{ background: r.note ? "rgba(120,53,15,0.08)" : "transparent" }}>
                <td style={{ padding: "6px 8px", color: C.white, fontWeight: r.note ? "700" : "normal" }}>
                  {r.calYear}{r.note && <div style={{ color: C.amber, fontSize: 10 }}>{r.note}</div>}
                </td>
                <td style={{ padding: "6px 8px", color: C.slate400 }}>{r.sizeLabel}</td>
                <td style={{ padding: "6px 8px", color: C.slate300, textAlign: "right" }}>{currency(r.annual)}</td>
                <td style={{ padding: "6px 8px", color: C.slate500, textAlign: "right" }}>{currency(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StatGrid desk={desk} stats={[
        { label: "Monthly today",                         value: currency(baseMonthly * lhcMult), sub: lhcApplies ? `incl. ${avgLhc.toFixed(0)}% LHC` : "No LHC" },
        { label: "Annual Year 1",                         value: currency(baseMonthly * lhcMult * 12) },
        { label: `Annual after LHC (${lhcYear})`,         value: afterLhcRow ? currency(afterLhcRow.annual) : "—", color: "text-emerald-400" },
        { label: `Lifetime total (${projectionYears}yr)`, value: currency(total), color: "text-amber-400" },
      ]} />
      {desk ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{milestonesCard}{tableCard}</div>
      ) : (
        <>
          {milestonesCard}
          <button onClick={() => setExpanded(e => !e)} style={{ width: "100%", padding: 12, borderRadius: 14, background: "rgba(51,65,85,0.4)", border: `1px solid ${C.border}`, color: C.slate300, fontSize: 14, cursor: "pointer" }}>
            {expanded ? "▲ Collapse detail" : "▼ Show all years"}
          </button>
          {expanded && tableCard}
        </>
      )}
    </div>
  );
}

// ─── INVEST SCREEN ───────────────────────────────────────────────────────────

function InvestScreen({ config, desk }) {
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
  const tableRows     = selfInsure.filter(r => r.drawn > 0 || r.note || r.year === 1 || r.year % 5 === 0);

  const addDD    = () => { setDrawdowns(p => [...p, { id: nextId, year: START_YEAR + 10, amount: 0, label: "" }]); setNextId(n => n + 1); };
  const removeDD = id => setDrawdowns(p => p.filter(d => d.id !== id));
  const updateDD = (id, field, val) => setDrawdowns(p => p.map(d => d.id === id ? { ...d, [field]: field === "amount" || field === "year" ? Number(val) : val } : d));

  const controlsPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <SectionHeader title="Net annual investment return" sub="Enter your expected after-tax return" />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <input type="range" min="2" max="12" step="0.5" value={rate} onChange={e => setRate(Number(e.target.value))} style={{ flex: 1, accentColor: C.amber }} />
          <span style={{ color: C.amber, fontWeight: "bold", fontSize: 24, width: 56, textAlign: "right" }}>{rate}%</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[4, 6, 8, 10].map(r => (
            <button key={r} onClick={() => setRate(r)} style={{ flex: 1, padding: "7px 4px", borderRadius: 9, fontSize: 12, fontWeight: "600", background: rate === r ? C.amber : "rgba(51,65,85,0.5)", color: rate === r ? "#1e293b" : C.slate400, border: "none", cursor: "pointer" }}>{r}%</button>
          ))}
        </div>
        <Disclosure text="Enter your net (after-tax) expected return. Consult your accountant for your applicable after-tax rate." />
      </Card>

      <Card>
        <SectionHeader title="Medical cost drawdowns" sub="Edit to model your scenario" />
        {drawdowns.map((d, idx) => (
          <div key={d.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: C.slate500, fontSize: 12, fontWeight: "bold", width: 20, flexShrink: 0 }}>{idx + 1}.</span>
              <FInput desk={desk} placeholder="Description (e.g. Heart surgery)" value={d.label} onChange={e => updateDD(d.id, "label", e.target.value)} />
              <button onClick={() => removeDD(d.id)} style={{ color: C.red, fontSize: 20, fontWeight: "bold", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8, paddingLeft: 28 }}>
              <FInput desk={desk} label="Year" type="number" min={START_YEAR} max={START_YEAR + projectionYears} value={d.year} onChange={e => updateDD(d.id, "year", e.target.value)} />
              <FInput desk={desk} label="Cost Expense ($)" type="number" min="0" step="5000" value={d.amount} onChange={e => updateDD(d.id, "amount", e.target.value)} />
            </div>
          </div>
        ))}
        <button onClick={addDD} style={{ width: "100%", padding: 10, borderRadius: 9, background: "rgba(30,41,59,0.5)", border: `1px dashed ${C.border}`, color: C.slate300, fontSize: 13, cursor: "pointer" }}>+ Add medical cost event</button>
      </Card>
    </div>
  );

  const tablePanel = (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionHeader title={desk ? "Savings balance — every year" : "Savings balance at key years"} />
        <span style={{ fontSize: 11, color: C.slate500, fontWeight: "600", alignSelf: "flex-end", marginBottom: 8 }}>Balance</span>
      </div>
      <div style={{ overflowY: "auto", maxHeight: desk ? 520 : 360, paddingRight: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "5px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>Year</th>
              {desk && <th style={{ textAlign: "left",  padding: "5px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>Size</th>}
              {desk && <th style={{ textAlign: "right", padding: "5px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>Invested</th>}
              <th style={{ textAlign: "right", padding: "5px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>Drawdown</th>
              <th style={{ textAlign: "right", padding: "5px 8px", color: C.slate400, fontWeight: "600", fontSize: 11, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>Savings Balance</th>
            </tr>
          </thead>
          <tbody>
            {(desk ? selfInsure : tableRows).map(r => {
              const isNeg = r.balance < 0;
              return (
                <tr key={r.year} style={{ background: r.drawn > 0 ? "rgba(127,29,29,0.1)" : r.note ? "rgba(120,53,15,0.06)" : "transparent" }}>
                  <td style={{ padding: "6px 8px", color: C.white, fontWeight: r.note ? "700" : "normal" }}>
                    {r.calYear}{r.note && <div style={{ color: C.amber, fontSize: 10 }}>{r.note}</div>}
                  </td>
                  {desk && <td style={{ padding: "6px 8px", color: C.slate400 }}>{r.sizeLabel}</td>}
                  {desk && <td style={{ padding: "6px 8px", color: C.slate300, textAlign: "right" }}>{currency(r.premiumSaved)}</td>}
                  <td style={{ padding: "6px 8px", color: r.drawn > 0 ? C.red : C.slate500, textAlign: "right" }}>{r.drawn > 0 ? `−${currency(r.drawn)}` : "—"}</td>
                  <td style={{ padding: "6px 8px", fontWeight: "700", textAlign: "right", color: isNeg ? C.red : C.amber }}>
                    {isNeg ? `−${currency(Math.abs(r.balance))}` : currency(r.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Disclosure text="Balance = (prior balance + premium invested − drawdowns) × (1 + net return rate). Negative balance shown in red = fund depleted." />
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card color="blue">
        <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.6, margin: 0 }}>
          Instead of paying PHI premiums, what if you invested that same amount at <strong style={{ color: C.amber }}>{rate}%</strong> net annual return, drawing down when you need medical care? A <span style={{ color: C.red }}>negative balance</span> means the fund is depleted — shown in red as a risk indicator.
        </p>
      </Card>
      <StatGrid desk={desk} stats={[
        { label: `Premiums invested (${projectionYears}yr)`, value: currency(totalPremiums) },
        { label: "Total medical drawdowns",                  value: currency(totalDrawn),    color: "text-red-400" },
        { label: `Final balance at ${finalYear}`,            value: currency(finalBalance),  color: finalBalance >= 0 ? "text-emerald-400" : "text-red-400", sub: `At ${rate}% net return` },
        { label: "Net position vs PHI",                      value: finalBalance >= 0 ? `+${currency(finalBalance)}` : currency(finalBalance), color: finalBalance >= 0 ? "text-emerald-400" : "text-red-400" },
      ]} />
      {desk ? (
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>{controlsPanel}{tablePanel}</div>
      ) : (
        <>{controlsPanel}{tablePanel}</>
      )}
    </div>
  );
}

// ─── COVERAGE SCREEN ─────────────────────────────────────────────────────────

function CoverageScreen({ desk }) {
  const items = [
    { t: "Heart Bypass / Vascular",       tiers: { Bronze: ["✗","Excluded"],     "Silver+": ["✓","Covered"],       Gold: ["✓","Covered"]     }, note: "Bronze typically excludes cardiac surgery. Confirm in PDS." },
    { t: "Cancer (Chemo / Radiotherapy)", tiers: { Bronze: ["~","Limited"],       "Silver+": ["✓","Inpatient"],     Gold: ["✓","Covered"]     }, note: "Cancer as inpatient generally covered on Silver+. Confirm with insurer." },
    { t: "Orthodontics",                  tiers: { Bronze: ["✗","Excluded"],     "Silver+": ["✗","Often excluded"], Gold: ["✓","Top Extras"]  }, note: "Orthodontics is an Extras product. 12-month waiting period typically applies." },
    { t: "General Dental",                tiers: { Bronze: ["✗","Not covered"],  "Silver+": ["✓","Mid Extras"],    Gold: ["✓","Top Extras"]  }, note: "Dental is an Extras product. Annual limits apply." },
    { t: "Joint Replacement",             tiers: { Bronze: ["✗","Excluded"],     "Silver+": ["~","Some plans"],    Gold: ["✓","Covered"]     }, note: "Joint replacements are a key reason many choose Gold." },
    { t: "Mental Health (inpatient)",     tiers: { Bronze: ["~","Limited"],       "Silver+": ["✓","Covered"],       Gold: ["✓","Covered"]     }, note: "2-month waiting period applies. Confirm covered days with insurer." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card color="amber">
        <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.6, margin: 0 }}>Coverage details below are <strong style={{ color: C.amber }}>general indicators only</strong>. Always read your insurer's PDS for exact inclusions, exclusions and waiting periods.</p>
      </Card>

      {desk ? (
        <Card>
          <SectionHeader title="Hospital cover by tier" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left",   padding: "8px 10px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>Treatment</th>
                {["Bronze","Silver+","Gold"].map(t => <th key={t} style={{ textAlign: "center", padding: "8px 10px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{t}</th>)}
                <th style={{ textAlign: "left",   padding: "8px 10px", color: C.slate400, fontWeight: "600", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.t} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 10px", color: C.white, fontWeight: "600" }}>{item.t}</td>
                  {["Bronze","Silver+","Gold"].map(tier => {
                    const [icon, label] = item.tiers[tier];
                    const col = icon === "✓" ? C.green : icon === "✗" ? C.red : C.amber;
                    return <td key={tier} style={{ padding: "10px 10px", textAlign: "center" }}><div style={{ color: col, fontWeight: "700" }}>{icon}</div><div style={{ color: col, fontSize: 11 }}>{label}</div></td>;
                  })}
                  <td style={{ padding: "10px 10px", color: C.slate400, fontSize: 12, lineHeight: 1.5 }}>{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        items.map(item => (
          <Card key={item.t}>
            <div style={{ color: C.white, fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>{item.t}</div>
            {Object.entries(item.tiers).map(([tier, [icon, label]]) => {
              const col = icon === "✓" ? C.green : icon === "✗" ? C.red : C.amber;
              return (
                <div key={tier} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.slate500, width: 56, flexShrink: 0 }}>{tier}:</span>
                  <span style={{ color: col }}>{icon} {label}</span>
                </div>
              );
            })}
            <Disclosure text={item.note} />
          </Card>
        ))
      )}

      <div style={{ display: desk ? "grid" : "flex", gridTemplateColumns: desk ? "1fr 1fr" : undefined, flexDirection: "column", gap: 14 }}>
        <Card>
          <SectionHeader title="Waiting periods (typical)" />
          {[
            { item: "Pre-existing conditions",     wait: "12 months", c: C.amber },
            { item: "Orthodontics / major dental", wait: "12 months", c: C.amber },
            { item: "Psychiatric care",            wait: "2 months",  c: C.blue  },
            { item: "All other hospital",          wait: "2 months",  c: C.blue  },
            { item: "Emergency",                   wait: "No wait",   c: C.green },
          ].map(w => (
            <div key={w.item} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span style={{ color: C.slate300 }}>{w.item}</span>
              <span style={{ color: w.c, fontWeight: "700" }}>{w.wait}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionHeader title="Overseas treatment" />
          <p style={{ fontSize: 13, color: C.slate300, lineHeight: 1.6 }}>Australian PHI generally covers treatment at Australian registered facilities only. Australia has reciprocal healthcare agreements with 11 countries (including UK and NZ) for emergency care when visiting.</p>
          <Disclosure text="Coverage varies by insurer and policy. Consult your insurer directly." />
        </Card>
      </div>
      <Card style={{ padding: 14 }}>
        <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
      </Card>
    </div>
  );
}

// ─── FAQ SCREEN ──────────────────────────────────────────────────────────────

function FaqScreen({ desk }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: desk ? "grid" : "flex", gridTemplateColumns: desk ? "1fr 1fr" : undefined, flexDirection: "column", gap: 12, alignItems: "start" }}>
      {FAQS.map((faq, i) => (
        <Card key={i} style={{ cursor: "pointer" }} onClick={() => setOpen(open === i ? null : i)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: "600", color: open === i ? C.amber : C.white, lineHeight: 1.4 }}>{faq.q}</span>
            <span style={{ color: C.amber, fontSize: 20, flexShrink: 0, lineHeight: 1, fontWeight: "300" }}>{open === i ? "−" : "+"}</span>
          </div>
          {open === i && <p style={{ fontSize: 13, color: C.slate300, marginTop: 10, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{faq.a}</p>}
        </Card>
      ))}
      <div style={{ gridColumn: desk ? "1 / -1" : undefined }}>
        <Card style={{ padding: 14 }}>
          <p style={{ fontSize: 11, color: C.slate600, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{MAIN_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig]         = useState(null);
  const [lastConfig, setLastConfig] = useState(null);
  const handleComplete = c => { setLastConfig(c); setConfig(c); };
  if (!config) return <Questionnaire onComplete={handleComplete} existingConfig={lastConfig} />;
  return <MainTool config={config} onReset={() => setConfig(null)} />;
}
