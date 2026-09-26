import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Ticket, Users, Clock, Bell, TrendingUp, RadioTower, CheckCircle2, RotateCcw,
  X, LogOut, ShieldCheck, UserCircle2, Settings2, Plus, Trash2, Lock,
  Stethoscope, HeartPulse, Baby, Bone, Eye, Brain, Syringe, Activity,
  Building2, ArrowLeft, PlayCircle, PauseCircle, ClipboardList
} from "lucide-react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

// ---------------------------------------------------------------------------
// Domain data & helpers
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const currentHour = new Date().getHours();

function loadShape(peaks) {
  return HOURS.map((h) => {
    let v = 0.28;
    peaks.forEach(([c, spread, height]) => { v += height * Math.exp(-((h - c) ** 2) / (2 * spread ** 2)); });
    return Math.min(1, v);
  });
}

const SPECIALTIES = {
  "General Physician": { icon: Stethoscope, code: "GEN", peaks: [[10, 1.8, 0.6]] },
  Cardiology: { icon: HeartPulse, code: "CARD", peaks: [[11, 1.6, 0.55]] },
  Pediatrics: { icon: Baby, code: "PED", peaks: [[10.5, 1.5, 0.55]] },
  Orthopedics: { icon: Bone, code: "ORTH", peaks: [[16, 1.6, 0.5]] },
  Ophthalmology: { icon: Eye, code: "EYE", peaks: [[10, 1.5, 0.45]] },
  Neurology: { icon: Brain, code: "NEU", peaks: [[14, 1.6, 0.45]] },
  Dermatology: { icon: Syringe, code: "DERM", peaks: [[13, 1.5, 0.45]] },
  "ENT": { icon: Activity, code: "ENT", peaks: [[9.5, 1.4, 0.5]] },
  Gynecology: { icon: Users, code: "GYN", peaks: [[11, 1.4, 0.5]] },
};
const SPEC_NAMES = Object.keys(SPECIALTIES);
const HOSPITAL_TYPES = ["Government Hospital", "Private Hospital", "Multi-specialty Hospital", "Community Health Centre"];

function makeDoctorState(seed) {
  const spec = SPECIALTIES[seed.specialization];
  const shape = loadShape(spec.peaks);
  return {
    ...seed, shape, nowServing: 100,
    lastIssued: 100 + Math.floor(shape[currentHour] * seed.capacity * 0.5),
    servedToday: 0, serviceSamples: [], onDuty: true,
  };
}

const HOSPITAL_SEED = [
  {
    id: "city-general", name: "City General Hospital", type: "Government Hospital", distanceKm: 1.8,
    doctors: [
      { id: "d1", name: "Dr. A. Sharma", specialization: "General Physician", room: "OPD 3", baseService: 6, capacity: 26 },
      { id: "d2", name: "Dr. R. Singh", specialization: "Pediatrics", room: "OPD 5", baseService: 8, capacity: 20 },
      { id: "d3", name: "Dr. K. Verma", specialization: "Orthopedics", room: "OPD 7", baseService: 10, capacity: 18 },
    ],
  },
  {
    id: "sunrise", name: "Sunrise Multi-specialty Hospital", type: "Multi-specialty Hospital", distanceKm: 3.2,
    doctors: [
      { id: "d4", name: "Dr. N. Rao", specialization: "Cardiology", room: "Room 2A", baseService: 12, capacity: 16 },
      { id: "d5", name: "Dr. P. Iyer", specialization: "Dermatology", room: "Room 2C", baseService: 9, capacity: 20 },
      { id: "d6", name: "Dr. S. Kapoor", specialization: "Gynecology", room: "Room 3B", baseService: 11, capacity: 18 },
    ],
  },
  {
    id: "prayag-chc", name: "Prayag Community Health Centre", type: "Community Health Centre", distanceKm: 0.9,
    doctors: [
      { id: "d7", name: "Dr. M. Khan", specialization: "General Physician", room: "Counter 1", baseService: 5, capacity: 30 },
      { id: "d8", name: "Dr. T. Bose", specialization: "ENT", room: "Counter 2", baseService: 8, capacity: 20 },
      { id: "d9", name: "Dr. V. Joshi", specialization: "Ophthalmology", room: "Counter 3", baseService: 9, capacity: 18 },
    ],
  },
].map((h) => ({ ...h, doctors: h.doctors.map(makeDoctorState) }));

function crowdLevel(obj) {
  const ratio = (obj.lastIssued - obj.nowServing) / obj.capacity;
  if (ratio < 0.3) return { label: "Light", tone: "low" };
  if (ratio < 0.7) return { label: "Moderate", tone: "mid" };
  return { label: "Heavy", tone: "high" };
}

function learnedServiceTime(doc) {
  if (doc.serviceSamples.length === 0) return doc.baseService;
  const alpha = 0.35;
  return doc.serviceSamples.reduce((ema, s) => ema * (1 - alpha) + s * alpha, doc.baseService);
}

function estimateWaitMinutes(doc, peopleAhead) {
  const factor = doc.shape[currentHour];
  return Math.max(0, Math.round(peopleAhead * learnedServiceTime(doc) * (0.6 + 0.8 * factor)));
}

const fmtMin = (m) => (m < 1 ? "<1 min" : `${m} min`);
const tokenCode = (doc, n) => `${SPECIALTIES[doc.specialization].code}-${n}`;
const uid = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.floor(Math.random() * 9000 + 1000);

const hospitalStats = (h) => {
  const waiting = h.doctors.reduce((s, d) => s + Math.max(0, d.lastIssued - d.nowServing), 0);
  const capacity = h.doctors.reduce((s, d) => s + d.capacity, 0) || 1;
  const served = h.doctors.reduce((s, d) => s + d.servedToday, 0);
  return { waiting, served, crowd: crowdLevel({ lastIssued: waiting, nowServing: 0, capacity }) };
};

// ---------------------------------------------------------------------------
// Root — auth + shared engine (keeps ticking under the login screen)
// ---------------------------------------------------------------------------

export default function SmartQueueSystem() {
  const [auth, setAuth] = useState(null); // { role, name, email, hospitalId, doctorId }
  const [hospitals, setHospitals] = useState(HOSPITAL_SEED);
  const [myTokens, setMyTokens] = useState([]); // {hospitalId, doctorId, tokenNo}
  const [notified, setNotified] = useState({});
  const [toasts, setToasts] = useState([]);
  const [autoRun, setAutoRun] = useState(true);
  const toastId = useRef(0);

  const findDoctor = useCallback((hospitalId, doctorId) => {
    const h = hospitals.find((x) => x.id === hospitalId);
    return h ? h.doctors.find((d) => d.id === doctorId) : null;
  }, [hospitals]);

  const pushToast = useCallback((text, kind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const patchDoctor = (hospitalId, doctorId, patch) => {
    setHospitals((prev) => prev.map((h) => h.id !== hospitalId ? h : {
      ...h, doctors: h.doctors.map((d) => d.id === doctorId ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d),
    }));
  };

  const callNext = useCallback((hospitalId, doctorId) => {
    patchDoctor(hospitalId, doctorId, (d) => {
      if (d.nowServing >= d.lastIssued) return {};
      const factor = d.shape[currentHour];
      const sample = Math.round(d.baseService * (0.75 + factor * 0.6 + Math.random() * 0.5));
      return { nowServing: d.nowServing + 1, servedToday: d.servedToday + 1, serviceSamples: [...d.serviceSamples.slice(-19), sample] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takeToken = (hospitalId, doctorId) => {
    const doc = findDoctor(hospitalId, doctorId);
    const tokenNo = doc.lastIssued + 1;
    patchDoctor(hospitalId, doctorId, { lastIssued: tokenNo });
    setMyTokens((prev) => [...prev, { hospitalId, doctorId, tokenNo }]);
    pushToast(`Token ${tokenCode(doc, tokenNo)} booked with ${doc.name}.`, "success");
  };

  const dropToken = (hospitalId, doctorId, tokenNo) => {
    setMyTokens((prev) => prev.filter((t) => !(t.hospitalId === hospitalId && t.doctorId === doctorId && t.tokenNo === tokenNo)));
  };

  const toggleDuty = (hospitalId, doctorId) => patchDoctor(hospitalId, doctorId, (d) => ({ onDuty: !d.onDuty }));

  const resetQueue = (hospitalId, doctorId) => {
    patchDoctor(hospitalId, doctorId, { nowServing: 100, lastIssued: 100, servedToday: 0, serviceSamples: [] });
    pushToast("Queue reset for a new day.", "info");
  };

  const addHospital = (form) => {
    setHospitals((prev) => [...prev, { id: uid(form.name), name: form.name, type: form.type, distanceKm: Number(form.distanceKm) || 1, doctors: [] }]);
    pushToast(`${form.name} registered.`, "success");
  };

  const removeHospital = (hospitalId) => setHospitals((prev) => prev.filter((h) => h.id !== hospitalId));

  const addDoctor = (hospitalId, form) => {
    const doc = makeDoctorState({
      id: uid(form.name), name: form.name, specialization: form.specialization,
      room: form.room, baseService: Number(form.baseService) || 6, capacity: Number(form.capacity) || 20,
    });
    setHospitals((prev) => prev.map((h) => h.id === hospitalId ? { ...h, doctors: [...h.doctors, doc] } : h));
    pushToast(`${form.name} added to the roster.`, "success");
  };

  const removeDoctor = (hospitalId, doctorId) =>
    setHospitals((prev) => prev.map((h) => h.id === hospitalId ? { ...h, doctors: h.doctors.filter((d) => d.id !== doctorId) } : h));

  // background simulation
  useEffect(() => {
    if (!autoRun) return;
    const interval = setInterval(() => {
      setHospitals((prev) => {
        const pool = [];
        prev.forEach((h) => h.doctors.forEach((d) => { if (d.onDuty && d.nowServing < d.lastIssued) pool.push([h.id, d.id]); }));
        if (pool.length === 0) return prev;
        const [hid, did] = pool[Math.floor(Math.random() * pool.length)];
        return prev.map((h) => h.id !== hid ? h : {
          ...h, doctors: h.doctors.map((d) => {
            if (d.id !== did) return d;
            const factor = d.shape[currentHour];
            const sample = Math.round(d.baseService * (0.75 + factor * 0.6 + Math.random() * 0.5));
            return { ...d, nowServing: d.nowServing + 1, servedToday: d.servedToday + 1, serviceSamples: [...d.serviceSamples.slice(-19), sample] };
          }),
        });
      });
    }, 2600);
    return () => clearInterval(interval);
  }, [autoRun]);

  // notifications
  useEffect(() => {
    myTokens.forEach((t) => {
      const doc = findDoctor(t.hospitalId, t.doctorId);
      if (!doc) return;
      const ahead = t.tokenNo - doc.nowServing - 1;
      const key = `${t.hospitalId}-${t.doctorId}-${t.tokenNo}`;
      const code = tokenCode(doc, t.tokenNo);
      if (ahead <= 0 && notified[key] !== "now") {
        pushToast(`It's your turn — token ${code} with ${doc.name} is being called.`, "urgent");
        setNotified((n) => ({ ...n, [key]: "now" }));
      } else if (ahead > 0 && ahead <= 2 && !notified[key]) {
        pushToast(`Almost there — ${ahead} ${ahead === 1 ? "person" : "people"} ahead of token ${code} with ${doc.name}.`, "warn");
        setNotified((n) => ({ ...n, [key]: "soon" }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitals]);

  const handleLogout = () => { setAuth(null); setMyTokens([]); setNotified({}); };

  return (
    <div style={styles.app}>
      <style>{FONT_IMPORT}</style>
      {!auth ? (
        <LoginScreen hospitals={hospitals} onLogin={setAuth} />
      ) : auth.role === "user" ? (
        <UserShell auth={auth} onLogout={handleLogout} hospitals={hospitals} myTokens={myTokens} takeToken={takeToken} dropToken={dropToken} />
      ) : auth.role === "doctor" ? (
        <DoctorShell auth={auth} onLogout={handleLogout} hospitals={hospitals} callNext={callNext} toggleDuty={toggleDuty} patchDoctor={patchDoctor} resetQueue={resetQueue} />
      ) : (
        <AdminShell auth={auth} onLogout={handleLogout} hospitals={hospitals} addHospital={addHospital} removeHospital={removeHospital} addDoctor={addDoctor} removeDoctor={removeDoctor} patchDoctor={patchDoctor} />
      )}
      <ToastStack toasts={toasts} />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const ROLE_TABS = [
  { id: "user", label: "Patient", icon: UserCircle2, blurb: "Pick a hospital, then a doctor, and take a token." },
  { id: "doctor", label: "Doctor", icon: Stethoscope, blurb: "Run your own consultation queue." },
  { id: "admin", label: "Admin", icon: ShieldCheck, blurb: "Register hospitals and their doctors/counters." },
];

function LoginScreen({ hospitals, onLogin }) {
  const [role, setRole] = useState("user");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id || "");
  const [doctorId, setDoctorId] = useState(hospitals[0]?.doctors[0]?.id || "");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  const activeTab = ROLE_TABS.find((r) => r.id === role);
  const currentHospital = hospitals.find((h) => h.id === hospitalId) || hospitals[0];
  const doctorOptions = currentHospital?.doctors || [];

  useEffect(() => { if (doctorOptions.length && !doctorOptions.find((d) => d.id === doctorId)) setDoctorId(doctorOptions[0].id); }, [hospitalId]); // eslint-disable-line

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Fill in your name, email and password to continue."); return; }
    if (role === "doctor" && !doctorId) { setError("Select which doctor account you're signing in to."); return; }
    setError("");
    onLogin({ role, name: name.trim(), email: email.trim(), hospitalId: role === "doctor" ? hospitalId : undefined, doctorId: role === "doctor" ? doctorId : undefined, via: "password" });
  };

  const continueWithGoogle = () => {
    setError(""); setGoogleBusy(true);
    // Simulated — a real build exchanges a Google ID token with a backend
    // endpoint here, which resolves the account's real role (and, for a
    // doctor, their linked hospital/doctor record) from your user table.
    setTimeout(() => {
      setGoogleBusy(false);
      const doc = doctorOptions.find((d) => d.id === doctorId);
      onLogin({
        role,
        name: role === "admin" ? "Admin — Priya Nair" : role === "doctor" ? doc?.name || "Dr. Guest" : "Ananya Verma",
        email: role === "admin" ? "priya.nair@myturn.io" : role === "doctor" ? "doctor@myturn.io" : "ananya.verma@gmail.com",
        hospitalId: role === "doctor" ? hospitalId : undefined,
        doctorId: role === "doctor" ? doctorId : undefined,
        via: "google",
      });
    }, 900);
  };

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrandRow}>
          <div style={styles.brandMark}><RadioTower size={20} color={COLORS.amber} strokeWidth={2.2} /></div>
          <div><div style={styles.brandName}>MyTurn · Hospitals</div><div style={styles.brandSub}>digital OPD tokens · live wait times</div></div>
        </div>

        <div style={styles.roleTabs}>
          {ROLE_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setRole(id); setError(""); }} style={styles.roleTab(role === id)}><Icon size={15} />{label}</button>
          ))}
        </div>
        <div style={styles.roleBlurb}>{activeTab.blurb}</div>

        {role === "doctor" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={styles.fieldLabel}>Hospital</label>
              <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} style={styles.select}>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.fieldLabel}>You are</label>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} style={styles.select}>
                {doctorOptions.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
              </select>
            </div>
          </div>
        )}

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={styles.fieldLabel}>Full name</label><input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Verma" /></div>
          <div><label style={styles.fieldLabel}>Email</label><input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          <div><label style={styles.fieldLabel}>Password</label><input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          {error && <div style={styles.formError}>{error}</div>}
          <button type="submit" style={styles.primaryBtn}>Sign in as {activeTab.label.toLowerCase()}</button>
        </form>

        <div style={styles.dividerRow}><div style={styles.dividerLine} /><span style={styles.dividerText}>or</span><div style={styles.dividerLine} /></div>
        <button type="button" style={styles.googleBtn} onClick={continueWithGoogle} disabled={googleBusy}>
          <GoogleGlyph />{googleBusy ? "Connecting to Google…" : `Continue with Google as ${activeTab.label.toLowerCase()}`}
        </button>
        <div style={styles.googleNote}><Lock size={11} style={{ flexShrink: 0, marginTop: 1 }} />Demo only — a live build exchanges a Google token with your server, which looks up the account's real role.</div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.5l6.6-6.6C35.3 2.5 30 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.7 6C12.1 13 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.8 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.2 19.2a14.5 14.5 0 0 0 0 9.2l-7.7 6a24 24 0 0 1 0-21.2l7.7 6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.2-8.6 2.2-6.4 0-11.9-3.5-13.8-9.5l-7.7 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function TopBar({ title, subtitle, auth, onLogout, right }) {
  return (
    <header style={styles.header}>
      <div style={styles.brandRow}>
        <div style={styles.brandMark}><RadioTower size={20} color={COLORS.amber} strokeWidth={2.2} /></div>
        <div><div style={styles.brandName}>{title}</div><div style={styles.brandSub}>{subtitle}</div></div>
        <div style={{ flex: 1 }} />
        {right}
        <div style={styles.profilePill}><span>{auth.name}</span><span style={styles.roleChip}>{auth.role}</span></div>
        <button style={styles.iconBtn} onClick={onLogout} title="Log out"><LogOut size={15} /></button>
      </div>
    </header>
  );
}

function SpecIcon({ specialization, size = 15, color }) {
  const Icon = SPECIALTIES[specialization]?.icon || Stethoscope;
  return <Icon size={size} color={color || COLORS.cyan} />;
}

// ---------------------------------------------------------------------------
// PATIENT shell — hospital → doctor → token, then live ticket stubs
// ---------------------------------------------------------------------------

function UserShell({ auth, onLogout, hospitals, myTokens, takeToken, dropToken }) {
  const [hospitalId, setHospitalId] = useState(null);
  const sorted = [...hospitals].sort((a, b) => a.distanceKm - b.distanceKm);
  const hospital = hospitals.find((h) => h.id === hospitalId);

  return (
    <div>
      <TopBar title="MyTurn" subtitle="find a hospital · book a doctor" auth={auth} onLogout={onLogout} />
      <main style={styles.main}>
        <div style={styles.grid2}>
          <div style={styles.panel}>
            {!hospital ? (
              <>
                <PanelLabel>Hospitals near you</PanelLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                  {sorted.map((h) => {
                    const stats = hospitalStats(h);
                    return (
                      <button key={h.id} style={styles.hospitalRow} onClick={() => setHospitalId(h.id)}>
                        <div style={styles.nearbyIcon}><Building2 size={15} color={COLORS.cyan} /></div>
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={styles.centerRowName}>{h.name}</div>
                          <div style={styles.centerRowMeta}>{h.type} · {h.distanceKm} km · {h.doctors.length} doctors · {stats.waiting} waiting</div>
                        </div>
                        <div style={{ ...styles.crowdBadge, color: toneColor(stats.crowd.tone), borderColor: toneColor(stats.crowd.tone) }}>
                          <span style={{ ...styles.crowdDot, background: toneColor(stats.crowd.tone) }} />{stats.crowd.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <button style={styles.backBtn} onClick={() => setHospitalId(null)}><ArrowLeft size={13} /> All hospitals</button>
                <PanelLabel style={{ marginTop: 12 }}>{hospital.name} — available doctors</PanelLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                  {hospital.doctors.map((d) => {
                    const queueLen = Math.max(0, d.lastIssued - d.nowServing);
                    const wait = estimateWaitMinutes(d, queueLen);
                    return (
                      <div key={d.id} style={styles.doctorRow}>
                        <div style={styles.nearbyIcon}><SpecIcon specialization={d.specialization} /></div>
                        <div style={{ flex: 1 }}>
                          <div style={styles.centerRowName}>{d.name}</div>
                          <div style={styles.centerRowMeta}>{d.specialization} · {d.room}</div>
                          <div style={styles.doctorQueueLine}>
                            <Users size={12} /> {queueLen} waiting <span style={{ margin: "0 6px" }}>·</span> <Clock size={12} /> ~{fmtMin(wait)}
                            {!d.onDuty && <span style={styles.offDutyTag}>Off duty</span>}
                          </div>
                        </div>
                        <button style={styles.smallBtn} disabled={!d.onDuty} onClick={() => takeToken(hospital.id, d.id)}>
                          {d.onDuty ? "Take token" : "Unavailable"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={styles.panel}>
            <PanelLabel>Your tokens</PanelLabel>
            {myTokens.length === 0 && <EmptyState icon={Ticket} text="No tokens yet. Pick a hospital, choose a doctor, and take a token — your live position and wait estimate will show up here." />}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {myTokens.map((t) => {
                const h = hospitals.find((x) => x.id === t.hospitalId);
                const d = h?.doctors.find((x) => x.id === t.doctorId);
                if (!d) return null;
                const ahead = Math.max(0, t.tokenNo - d.nowServing - 1);
                const beingServed = t.tokenNo <= d.nowServing;
                const wait = estimateWaitMinutes(d, ahead);
                return (
                  <TicketStub key={`${t.hospitalId}-${t.doctorId}-${t.tokenNo}`} hospital={h} doctor={d} tokenNo={t.tokenNo}
                    ahead={ahead} wait={wait} beingServed={beingServed} onDismiss={() => dropToken(t.hospitalId, t.doctorId, t.tokenNo)} />
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function TicketStub({ hospital, doctor, tokenNo, ahead, wait, beingServed, onDismiss }) {
  return (
    <div style={styles.stub(beingServed)}>
      <div style={styles.stubPerf} />
      <div style={{ flex: 1, padding: "14px 16px" }}>
        <div style={styles.stubTop}>
          <span style={styles.stubCenter}>{doctor.name} · {doctor.specialization} — {hospital.name}</span>
          <button style={styles.stubClose} onClick={onDismiss}><X size={13} /></button>
        </div>
        <div style={styles.stubMain}>
          <div style={styles.stubTokenNo}>{tokenCode(doctor, tokenNo)}</div>
          <div style={{ flex: 1 }}>
            {beingServed ? (
              <div style={styles.stubTurn}><CheckCircle2 size={15} color={COLORS.green} /> Your turn — please proceed to {doctor.room}</div>
            ) : (
              <>
                <div style={styles.stubRow}><Users size={13} /> {ahead} {ahead === 1 ? "person" : "people"} ahead</div>
                <div style={styles.stubRow}><Clock size={13} /> Estimated wait: {fmtMin(wait)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOCTOR shell — locked to their own queue
// ---------------------------------------------------------------------------

function DoctorShell({ auth, onLogout, hospitals, callNext, toggleDuty, patchDoctor, resetQueue }) {
  const hospital = hospitals.find((h) => h.id === auth.hospitalId);
  const doc = hospital?.doctors.find((d) => d.id === auth.doctorId);
  const [draftService, setDraftService] = useState(doc?.baseService ?? 6);
  const [draftCapacity, setDraftCapacity] = useState(doc?.capacity ?? 20);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!doc) return null;
  const queueLen = Math.max(0, doc.lastIssued - doc.nowServing);

  return (
    <div>
      <TopBar title={`${doc.name} — ${doc.specialization}`} subtitle={`${hospital.name} · ${doc.room}`} auth={auth} onLogout={onLogout}
        right={
          <button style={styles.toggleBtn(doc.onDuty)} onClick={() => toggleDuty(hospital.id, doc.id)}>
            {doc.onDuty ? <PlayCircle size={14} /> : <PauseCircle size={14} />} {doc.onDuty ? "On duty" : "Off duty"}
          </button>
        } />
      <main style={styles.main}>
        <div style={styles.grid2}>
          <div style={styles.panel}>
            <PanelLabel>Consultation queue</PanelLabel>
            <div style={styles.dispatchCard}>
              <div style={styles.boardLabel}>Now serving</div>
              <div style={styles.dispatchDigits}>{tokenCode(doc, doc.nowServing)}</div>
              <div style={styles.dispatchMeta}>{queueLen} waiting · last token {tokenCode(doc, doc.lastIssued)}</div>
            </div>
            <button style={styles.primaryBtn} disabled={queueLen === 0 || !doc.onDuty} onClick={() => callNext(hospital.id, doc.id)}>Call next patient</button>
            {!doc.onDuty && <div style={styles.mutedNote}>You're marked off duty — toggle on duty above to resume calling patients.</div>}
            {doc.onDuty && queueLen === 0 && <div style={styles.mutedNote}>No patients waiting right now.</div>}
            <div style={styles.statGrid}>
              <StatBox label="Patients seen today" value={doc.servedToday} />
              <StatBox label="Avg. consult time" value={`${learnedServiceTime(doc).toFixed(1)} min`} />
            </div>
          </div>

          <div style={styles.panel}>
            <PanelLabel>Manage this queue</PanelLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={styles.fieldLabel}>Typical consult time per patient (min)</label><input style={styles.input} type="number" min="1" value={draftService} onChange={(e) => setDraftService(e.target.value)} /></div>
              <div><label style={styles.fieldLabel}>Patients per day (capacity)</label><input style={styles.input} type="number" min="1" value={draftCapacity} onChange={(e) => setDraftCapacity(e.target.value)} /></div>
              <button style={styles.secondaryBtn} onClick={() => patchDoctor(hospital.id, doc.id, { baseService: Number(draftService) || doc.baseService, capacity: Number(draftCapacity) || doc.capacity })}>
                <Settings2 size={14} /> Save settings
              </button>
              <div style={{ height: 1, background: COLORS.gridLine, margin: "4px 0" }} />
              <button style={styles.dangerBtn} onClick={() => {
                if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; }
                resetQueue(hospital.id, doc.id); setConfirmReset(false);
              }}>
                <RotateCcw size={14} /> {confirmReset ? "Click again to confirm" : "Start a new day (reset queue)"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADMIN shell — register hospitals, register doctors/counters, directory
// ---------------------------------------------------------------------------

function AdminShell({ auth, onLogout, hospitals, addHospital, removeHospital, addDoctor, removeDoctor }) {
  const [tab, setTab] = useState("hospitals");
  const tabs = [
    { id: "hospitals", label: "Register hospital", icon: Building2 },
    { id: "doctors", label: "Doctors & counters", icon: Stethoscope },
    { id: "directory", label: "Directory", icon: ClipboardList },
  ];
  return (
    <div>
      <TopBar title="MyTurn" subtitle="admin · hospital network" auth={auth} onLogout={onLogout} />
      <nav style={styles.navRow2}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} style={styles.navBtn(tab === id)}><Icon size={15} />{label}</button>)}
      </nav>
      <main style={styles.main}>
        {tab === "hospitals" && <RegisterHospitalView hospitals={hospitals} addHospital={addHospital} removeHospital={removeHospital} />}
        {tab === "doctors" && <RegisterDoctorView hospitals={hospitals} addDoctor={addDoctor} removeDoctor={removeDoctor} />}
        {tab === "directory" && <DirectoryView hospitals={hospitals} />}
      </main>
    </div>
  );
}

function RegisterHospitalView({ hospitals, addHospital, removeHospital }) {
  const [form, setForm] = useState({ name: "", type: HOSPITAL_TYPES[0], distanceKm: "" });
  const [confirmId, setConfirmId] = useState(null);
  const submit = (e) => { e.preventDefault(); if (!form.name.trim()) return; addHospital(form); setForm({ name: "", type: HOSPITAL_TYPES[0], distanceKm: "" }); };
  return (
    <div>
      <div style={styles.panel}>
        <PanelLabel>Register a new hospital</PanelLabel>
        <form onSubmit={submit} style={styles.manageForm}>
          <input style={styles.input} placeholder="Hospital name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select style={styles.select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{HOSPITAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <input style={styles.input} type="number" placeholder="Distance (km)" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })} />
          <button type="submit" style={styles.secondaryBtn}><Plus size={14} /> Register hospital</button>
        </form>
      </div>
      <div style={styles.panel}>
        <PanelLabel>Registered hospitals</PanelLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hospitals.map((h) => (
            <div key={h.id} style={styles.manageRow}>
              <div style={{ flex: 1 }}><div style={styles.centerRowName}>{h.name}</div><div style={styles.centerRowMeta}>{h.type} · {h.distanceKm} km · {h.doctors.length} doctors registered</div></div>
              <button style={styles.dangerBtnSmall} onClick={() => {
                if (confirmId !== h.id) { setConfirmId(h.id); setTimeout(() => setConfirmId((id) => id === h.id ? null : id), 3000); return; }
                removeHospital(h.id); setConfirmId(null);
              }}><Trash2 size={13} /> {confirmId === h.id ? "Confirm remove" : "Remove"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RegisterDoctorView({ hospitals, addDoctor, removeDoctor }) {
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id || "");
  const [form, setForm] = useState({ name: "", specialization: SPEC_NAMES[0], room: "", baseService: "", capacity: "" });
  const [confirmId, setConfirmId] = useState(null);
  const hospital = hospitals.find((h) => h.id === hospitalId) || hospitals[0];

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !hospital) return;
    addDoctor(hospital.id, form);
    setForm({ name: "", specialization: SPEC_NAMES[0], room: "", baseService: "", capacity: "" });
  };

  if (!hospital) return <div style={styles.panel}><EmptyState icon={Building2} text="Register a hospital first, then add its doctors here." /></div>;

  return (
    <div>
      <div style={styles.panel}>
        <PanelLabel>Add a doctor / counter</PanelLabel>
        <label style={styles.fieldLabel}>Hospital</label>
        <select style={styles.select} value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        <form onSubmit={submit} style={styles.manageForm}>
          <input style={styles.input} placeholder="Doctor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select style={styles.select} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })}>{SPEC_NAMES.map((s) => <option key={s}>{s}</option>)}</select>
          <input style={styles.input} placeholder="Room / counter no." value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          <input style={styles.input} type="number" placeholder="Consult time (min)" value={form.baseService} onChange={(e) => setForm({ ...form, baseService: e.target.value })} />
          <input style={styles.input} type="number" placeholder="Patients/day capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <button type="submit" style={styles.secondaryBtn}><Plus size={14} /> Add doctor</button>
        </form>
      </div>
      <div style={styles.panel}>
        <PanelLabel>{hospital.name} — roster</PanelLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hospital.doctors.map((d) => (
            <div key={d.id} style={styles.manageRow}>
              <div style={styles.nearbyIcon}><SpecIcon specialization={d.specialization} /></div>
              <div style={{ flex: 1 }}><div style={styles.centerRowName}>{d.name}</div><div style={styles.centerRowMeta}>{d.specialization} · {d.room} · {d.baseService}m/patient · cap {d.capacity}</div></div>
              <button style={styles.dangerBtnSmall} onClick={() => {
                if (confirmId !== d.id) { setConfirmId(d.id); setTimeout(() => setConfirmId((id) => id === d.id ? null : id), 3000); return; }
                removeDoctor(hospital.id, d.id); setConfirmId(null);
              }}><Trash2 size={13} /> {confirmId === d.id ? "Confirm remove" : "Remove"}</button>
            </div>
          ))}
          {hospital.doctors.length === 0 && <EmptyState icon={Stethoscope} text="No doctors registered at this hospital yet." />}
        </div>
      </div>
    </div>
  );
}

function DirectoryView({ hospitals }) {
  return (
    <div>
      <div style={styles.statGrid4}>
        <StatBox label="Hospitals registered" value={hospitals.length} />
        <StatBox label="Doctors registered" value={hospitals.reduce((s, h) => s + h.doctors.length, 0)} />
        <StatBox label="Patients waiting now" value={hospitals.reduce((s, h) => s + hospitalStats(h).waiting, 0)} />
        <StatBox label="Patients seen today" value={hospitals.reduce((s, h) => s + hospitalStats(h).served, 0)} />
      </div>
      {hospitals.map((h) => {
        const stats = hospitalStats(h);
        return (
          <div key={h.id} style={styles.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{h.name}</div><div style={styles.centerRowMeta}>{h.type} · {h.distanceKm} km</div></div>
              <div style={{ ...styles.crowdBadge, color: toneColor(stats.crowd.tone), borderColor: toneColor(stats.crowd.tone) }}><span style={{ ...styles.crowdDot, background: toneColor(stats.crowd.tone) }} />{stats.crowd.label}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {h.doctors.map((d) => (
                <div key={d.id} style={styles.directoryDocRow}>
                  <SpecIcon specialization={d.specialization} size={13} />
                  <span style={{ flex: 1 }}>{d.name} · {d.specialization}</span>
                  <span style={{ color: COLORS.textMuted }}>{Math.max(0, d.lastIssued - d.nowServing)} waiting</span>
                  {!d.onDuty && <span style={styles.offDutyTag}>Off duty</span>}
                </div>
              ))}
              {h.doctors.length === 0 && <div style={{ fontSize: 12, color: COLORS.textMuted }}>No doctors registered yet.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function toneColor(tone) { return tone === "low" ? COLORS.green : tone === "mid" ? COLORS.amber : COLORS.red; }
function PanelLabel({ children, style }) { return <div style={{ ...styles.panelLabel, ...style }}>{children}</div>; }
function StatBox({ label, value, small }) { return <div style={styles.statBox}><div style={styles.statLabel}>{label}</div><div style={{ ...styles.statValue, fontSize: small ? 16 : 22 }}>{value}</div></div>; }
function EmptyState({ icon: Icon, text }) { return <div style={styles.emptyState}><Icon size={22} color={COLORS.textMuted} /><div>{text}</div></div>; }
function ToastStack({ toasts }) {
  return <div style={styles.toastStack}>{toasts.map((t) => <div key={t.id} style={styles.toast(t.kind)}><Bell size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{t.text}</span></div>)}</div>;
}
function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerInner}>
        <div style={styles.footerTitle}>© 2026 CodeMatrix | All Rights Reserved.</div>
        <div style={styles.footerSub}>Designed and Developed by Team CodeMatrix.</div>
        <div style={styles.footerNote}>
          All content, design, and intellectual property on this website are owned by Team CodeMatrix.
          Unauthorized reproduction or distribution is prohibited.
        </div>
        <div style={styles.footerContactHeading}>Contact Us:</div>
        <div style={styles.footerContactRow}>📧 Email: 26btcse012@shiats.edu.in</div>
        <div style={styles.footerContactRow}>📞 Phone: +91 9559425231, +91 9555628342, +91 8081332265</div>
        <div style={styles.footerContactRow}>📍 Location: Department of CSIT, Sam Higginbottom University of Agriculture Technology and Sciences - 211007, Uttar Pradesh, India</div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#10151C", panel: "#171E27", panelAlt: "#1D2530", gridLine: "#2A333F",
  amber: "#FFB300", cyan: "#5EEAD4", cyanDim: "#2F6E68", green: "#3FCF8E",
  red: "#FF6B6B", text: "#EFEAE0", textMuted: "#8A93A3", paper: "#F0E8D8", ink: "#20201B",
};
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');`;

const styles = {
  app: { fontFamily: "'Space Grotesk', sans-serif", background: COLORS.bg, color: COLORS.text, minHeight: "100%", padding: "0 0 40px" },
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loginCard: { width: 400, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.gridLine}`, borderRadius: 12, padding: 26 },
  loginBrandRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 22 },
  roleTabs: { display: "flex", background: COLORS.panelAlt, borderRadius: 8, padding: 3, gap: 3, marginBottom: 10 },
  roleTab: (active) => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "8px 4px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? COLORS.amber : "transparent", color: active ? "#20150A" : COLORS.textMuted }),
  roleBlurb: { fontSize: 12, color: COLORS.textMuted, marginBottom: 18, lineHeight: 1.5 },
  fieldLabel: { display: "block", fontSize: 11.5, color: COLORS.textMuted, marginBottom: 5 },
  input: { width: "100%", fontFamily: "inherit", fontSize: 13.5, padding: "10px 12px", borderRadius: 7, border: `1px solid ${COLORS.gridLine}`, background: COLORS.panelAlt, color: COLORS.text, boxSizing: "border-box" },
  formError: { fontSize: 12, color: COLORS.red, background: "rgba(255,107,107,0.08)", border: `1px solid rgba(255,107,107,0.3)`, borderRadius: 6, padding: "8px 10px" },
  dividerRow: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" },
  dividerLine: { flex: 1, height: 1, background: COLORS.gridLine },
  dividerText: { fontSize: 11.5, color: COLORS.textMuted },
  googleBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, padding: "11px 14px", borderRadius: 7, border: `1px solid ${COLORS.gridLine}`, background: "#fff", color: "#1f1f1f", cursor: "pointer" },
  googleNote: { display: "flex", gap: 6, fontSize: 11, color: COLORS.textMuted, marginTop: 10, lineHeight: 1.5 },
  header: { borderBottom: `1px solid ${COLORS.gridLine}`, padding: "16px 20px", position: "sticky", top: 0, background: COLORS.bg, zIndex: 5 },
  brandRow: { display: "flex", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 6, background: COLORS.panelAlt, border: `1px solid ${COLORS.gridLine}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandName: { fontWeight: 700, fontSize: 16, letterSpacing: 0.2 },
  brandSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: -2 },
  profilePill: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, background: COLORS.panelAlt, border: `1px solid ${COLORS.gridLine}`, borderRadius: 20, padding: "6px 6px 6px 12px", marginRight: 8 },
  roleChip: { fontSize: 10.5, textTransform: "capitalize", background: COLORS.bg, border: `1px solid ${COLORS.gridLine}`, borderRadius: 12, padding: "2px 8px", color: COLORS.cyan },
  iconBtn: { width: 30, height: 30, borderRadius: 6, border: `1px solid ${COLORS.gridLine}`, background: "transparent", color: COLORS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  toggleBtn: (on) => ({ display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12, padding: "7px 12px", borderRadius: 6, border: `1px solid ${on ? COLORS.green : COLORS.gridLine}`, background: on ? "rgba(63,207,142,0.1)" : "transparent", color: on ? COLORS.green : COLORS.textMuted, cursor: "pointer", marginRight: 8 }),
  navRow2: { display: "flex", gap: 4, borderBottom: `1px solid ${COLORS.gridLine}`, padding: "0 20px" },
  navBtn: (active) => ({ fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, fontSize: 13, padding: "10px 14px", background: "transparent", border: "none", borderBottom: `2px solid ${active ? COLORS.amber : "transparent"}`, color: active ? COLORS.text : COLORS.textMuted, cursor: "pointer", fontWeight: active ? 600 : 500 }),
  main: { maxWidth: 980, margin: "0 auto", padding: "24px 20px 0" },
  grid2: { display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 },
  panel: { background: COLORS.panel, border: `1px solid ${COLORS.gridLine}`, borderRadius: 10, padding: 18, marginBottom: 18 },
  panelLabel: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500, marginBottom: 10 },
  centerRowName: { fontSize: 13.5, color: COLORS.text, fontWeight: 500 },
  centerRowMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  select: { width: "100%", fontFamily: "inherit", fontSize: 13.5, padding: "10px 12px", borderRadius: 7, border: `1px solid ${COLORS.gridLine}`, background: COLORS.panelAlt, color: COLORS.text, marginBottom: 14, boxSizing: "border-box" },
  dispatchCard: { background: "#0C1015", border: `1px solid ${COLORS.gridLine}`, borderRadius: 8, padding: "20px 16px", textAlign: "center", marginBottom: 14 },
  dispatchDigits: { fontFamily: "'JetBrains Mono', monospace", fontSize: 38, fontWeight: 700, color: COLORS.amber, margin: "4px 0", letterSpacing: 2 },
  dispatchMeta: { fontSize: 12, color: COLORS.textMuted },
  boardLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 6 },
  mutedNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, textAlign: "center" },
  primaryBtn: { width: "100%", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "12px 16px", borderRadius: 7, border: "none", background: COLORS.amber, color: "#20150A", cursor: "pointer" },
  secondaryBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 7, border: `1px solid ${COLORS.cyan}`, background: "transparent", color: COLORS.cyan, cursor: "pointer" },
  dangerBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 7, border: `1px solid ${COLORS.red}`, background: "transparent", color: COLORS.red, cursor: "pointer" },
  dangerBtnSmall: { display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 11px", borderRadius: 6, border: `1px solid ${COLORS.red}`, background: "transparent", color: COLORS.red, cursor: "pointer", flexShrink: 0 },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 },
  statGrid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 },
  statBox: { background: COLORS.panel, border: `1px solid ${COLORS.gridLine}`, borderRadius: 8, padding: "12px 14px" },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 6 },
  statValue: { fontWeight: 700, color: COLORS.text },
  crowdBadge: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "4px 9px", borderRadius: 20, border: "1px solid", flexShrink: 0 },
  crowdDot: { width: 6, height: 6, borderRadius: "50%" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "30px 10px", color: COLORS.textMuted, fontSize: 13, textAlign: "center" },
  stub: (active) => ({ display: "flex", background: COLORS.paper, borderRadius: 8, overflow: "hidden", boxShadow: active ? `0 0 0 2px ${COLORS.green}` : "none" }),
  stubPerf: { width: 14, background: `repeating-linear-gradient(180deg, transparent 0 6px, ${COLORS.bg} 6px 12px)`, backgroundColor: COLORS.paper },
  stubTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 },
  stubCenter: { fontSize: 11, color: "#6b6555", fontWeight: 500 },
  stubClose: { border: "none", background: "transparent", cursor: "pointer", color: "#8c8570", padding: 2, flexShrink: 0 },
  stubMain: { display: "flex", alignItems: "center", gap: 14 },
  stubTokenNo: { fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: COLORS.ink },
  stubRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#3a3628", marginTop: 3 },
  stubTurn: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#1c6b45" },
  hospitalRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${COLORS.gridLine}`, borderRadius: 8, background: "transparent", cursor: "pointer", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  doctorRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${COLORS.gridLine}`, borderRadius: 8 },
  doctorQueueLine: { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: COLORS.textMuted, marginTop: 4 },
  offDutyTag: { marginLeft: 8, fontSize: 10.5, color: COLORS.red, border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "1px 7px" },
  backBtn: { display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12, color: COLORS.textMuted, background: "transparent", border: "none", cursor: "pointer", padding: 0 },
  nearbyIcon: { width: 28, height: 28, borderRadius: "50%", background: COLORS.panelAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  smallBtn: { fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 6, border: `1px solid ${COLORS.amber}`, background: "transparent", color: COLORS.amber, cursor: "pointer", flexShrink: 0 },
  manageForm: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  manageRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${COLORS.gridLine}`, borderRadius: 8 },
  directoryDocRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "6px 4px" },
  toastStack: { position: "fixed", bottom: 18, right: 18, display: "flex", flexDirection: "column", gap: 8, zIndex: 20, maxWidth: 320 },
  toast: (kind) => ({ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, padding: "10px 12px", borderRadius: 8, background: COLORS.panelAlt, border: `1px solid ${kind === "urgent" ? COLORS.green : kind === "warn" ? COLORS.amber : COLORS.gridLine}`, color: COLORS.text, boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }),
  footer: { borderTop: `1px solid ${COLORS.gridLine}`, marginTop: 32, padding: "22px 20px 26px", background: COLORS.panel },
  footerInner: { maxWidth: 980, margin: "0 auto", textAlign: "center" },
  footerTitle: { fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 4 },
  footerSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 10 },
  footerNote: { fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6, maxWidth: 640, margin: "0 auto 14px" },
  footerContactHeading: { fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 6 },
  footerContactRow: { fontSize: 11.5, color: COLORS.textMuted, lineHeight: 1.7 },
};
