"use client";
import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xpgvsmtpcxommforzzed.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_f2-NADNc3LEg_Ga2KXkiXw_Zntc2xSN";

let _token = null;
const getHeaders = () => ({ "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${_token || SUPABASE_ANON_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" });
const db = {
  setToken(t) { _token = t; },
  clearToken() { _token = null; },
  async select(table, filter = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${filter ? "&" + filter : ""}`, { headers: getHeaders() });
    const d = await r.json(); if (!r.ok) throw new Error(d?.message || "Fehler"); return d;
  },
  async insert(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.message || "Fehler"); return Array.isArray(d) ? d[0] : d;
  },
  async update(table, body, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: getHeaders(), body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.message || "Fehler"); return Array.isArray(d) ? d[0] : d;
  },
  async remove(table, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: getHeaders() });
    if (!r.ok) { const d = await r.json(); throw new Error(d?.message || "Fehler"); }
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error_description || d?.message || "Login fehlgeschlagen"); return d;
  },
  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error_description || d?.message || "Registrierung fehlgeschlagen"); return d;
  },
};

const STATUS_CONFIG = {
  planned:   { label: "Geplant",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  confirmed: { label: "Bestätigt", color: "#10B981", bg: "rgba(16,185,129,0.12)", dot: "#10B981" },
  cancelled: { label: "Abgesagt",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",  dot: "#EF4444" },
};
const ATTEND_CONFIG = {
  confirmed: { label: "Bestätigt", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  open:      { label: "Offen",     color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  sick:      { label: "Krank",     color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  absent:    { label: "Abwesend",  color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
};
const SHOT_STATUS = { open: { label: "Offen", color: "#6B7280" }, in_progress: { label: "In Arbeit", color: "#F59E0B" }, done: { label: "Erledigt", color: "#10B981" } };
const ROLE_CONFIG = {
  admin:  { label: "Admin",        color: "#F59E0B" },
  crew:   { label: "Crew",         color: "#6366F1" },
  actor:  { label: "Schauspieler", color: "#10B981" },
};
const GENRES = ["Action","Comedy","Drama","Horror","Romance","Thriller","Documentary","Commercial","Music Video","Other"];
const fmt = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtRange = (s, e) => { if (!s) return "—"; if (!e || s === e) return fmt(s); return `${fmt(s)} – ${fmt(e)}`; };

// ICS Export
function exportToICS(shoots) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDt = (dateStr, timeStr) => { const d = new Date(dateStr + "T" + (timeStr || "09:00") + ":00"); return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ShootPlan//DE"];
  shoots.forEach(s => {
    lines.push("BEGIN:VEVENT", `UID:shoot-${s.id}@shootplan`, `DTSTART:${fmtDt(s.date_start||s.date, s.start_time)}`, `DTEND:${fmtDt(s.date_end||s.date_start||s.date, s.end_time)}`, `SUMMARY:${s.title}`, `LOCATION:${s.location||""}`, `DESCRIPTION:${(s.notes||"").replace(/\n/g,"\\n")}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" })); a.download = "shootplan.ics"; a.click();
}

// ============================================================
// DESIGN SYSTEM — Industrial/Utilitarian Professional
// Inspired by: Linear, Vercel, Figma — precise, structured, no decoration for its own sake
// ============================================================

// Color tokens
const C = {
  bg:        "#0D0D0D",   // near-black background
  surface:   "#141414",   // cards, sidebar
  surfaceHi: "#1A1A1A",   // elevated surfaces, hover
  border:    "#242424",   // default border
  borderHi:  "#333333",   // emphasized border
  accent:    "#E8FF47",   // electric lime — primary action, active states
  accentDim: "rgba(232,255,71,0.08)",
  text:      "#F0F0F0",   // primary text
  textMid:   "#8A8A8A",   // secondary text
  textDim:   "#4A4A4A",   // tertiary / labels
  danger:    "#FF4444",
  dangerDim: "rgba(255,68,68,0.1)",
  green:     "#22C55E",
  greenDim:  "rgba(34,197,94,0.12)",
  amber:     "#F59E0B",
  amberDim:  "rgba(245,158,11,0.12)",
  purple:    "#A78BFA",
  purpleDim: "rgba(167,139,250,0.12)",
};

const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;

const S = {
  root: { fontFamily: "'IBM Plex Mono','Fira Code','Courier New',monospace", background: C.bg, color: C.text, minHeight: "100vh" },

  // Sidebar — structured, utilitarian
  sidebar: (open) => ({ width: 220, minHeight: "100vh", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200, overflowY: "auto", transform: open ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.2s ease" }),
  sidebarDesktop: { width: 220, minHeight: "100vh", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200, overflowY: "auto" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150 },

  logo: { padding: "20px 16px 16px", borderBottom: `1px solid ${C.border}` },
  logoMark: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 28, height: 28, background: C.accent, borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
  logoText: { fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: C.text, textTransform: "uppercase" },
  logoSub: { fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 },

  nav: { padding: "8px", flex: 1, display: "flex", flexDirection: "column", gap: 1 },
  navSection: { fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", padding: "16px 8px 6px" },
  navItem: (a) => ({ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 3, cursor: "pointer", background: a ? C.accentDim : "transparent", color: a ? C.accent : C.textMid, fontSize: 12, fontWeight: a ? 600 : 400, borderLeft: a ? `2px solid ${C.accent}` : "2px solid transparent", transition: "all 0.1s", letterSpacing: "0.02em" }),
  navIcon: { fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 },

  sidebarUser: { padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 },
  avatar: (sz = 32) => ({ width: sz, height: sz, borderRadius: 2, background: C.accentDim, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(sz * 0.35, 10), fontWeight: 700, color: C.accent, flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace" }),

  topbar: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 },
  main: { flex: 1, padding: "24px 16px", maxWidth: "100%", boxSizing: "border-box" },
  mainDesktop: { marginLeft: 220, flex: 1, padding: "36px 40px", maxWidth: "calc(100vw - 220px)", boxSizing: "border-box" },

  pageHeader: { marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, paddingBottom: 20, borderBottom: `1px solid ${C.border}` },
  pageTitle: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.text, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" },
  pageSub: { fontSize: 11, color: C.textDim, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.05em" },

  btn: (v = "primary") => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: v === "ghost" ? "6px 12px" : "8px 16px",
    borderRadius: 2,
    border: v === "outline" ? `1px solid ${C.border}` : v === "primary" ? "none" : v === "danger" ? `1px solid ${C.danger}33` : `1px solid ${C.border}`,
    background: v === "primary" ? C.accent : v === "danger" ? C.dangerDim : v === "outline" ? "transparent" : C.surfaceHi,
    color: v === "primary" ? "#000" : v === "danger" ? C.danger : v === "outline" ? C.textMid : C.textMid,
    fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
    letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace",
  }),

  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "16px" },
  cardHover: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "16px", cursor: "pointer", transition: "border-color 0.1s, background 0.1s" },

  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 },

  statCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "20px 24px", position: "relative", overflow: "hidden" },
  statValue: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: C.text, fontFamily: "'IBM Plex Mono',monospace" },
  statLabel: { fontSize: 10, color: C.textDim, marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" },

  badge: (s) => {
    const map = { planned: { color: C.amber, bg: C.amberDim }, confirmed: { color: C.green, bg: C.greenDim }, cancelled: { color: C.textMid, bg: C.surfaceHi } };
    const c = map[s] || { color: C.textMid, bg: C.surfaceHi };
    return { display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" };
  },
  attendBadge: (s) => {
    const map = { confirmed: { color: C.green, bg: C.greenDim }, open: { color: C.textMid, bg: C.surfaceHi }, sick: { color: C.danger, bg: C.dangerDim }, absent: { color: C.purple, bg: C.purpleDim } };
    const c = map[s] || map.open;
    return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" };
  },
  roleBadge: (r) => {
    const map = { admin: { color: C.accent, bg: C.accentDim }, crew: { color: C.purple, bg: C.purpleDim }, actor: { color: C.green, bg: C.greenDim } };
    const c = map[r] || map.crew;
    return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" };
  },

  input: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, padding: "9px 12px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'IBM Plex Mono',monospace" },
  textarea: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, padding: "9px 12px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "'IBM Plex Mono',monospace" },
  select: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, padding: "9px 12px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" },
  label: { fontSize: 9, fontWeight: 700, color: C.textDim, marginBottom: 6, display: "block", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" },

  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, padding: 0 },
  modalBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px 4px 0 0", borderTop: `2px solid ${C.accent}`, padding: "24px 20px", width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontSize: 14, fontWeight: 700, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.08em" },

  tag: (color = C.accent) => ({ display: "inline-block", padding: "2px 7px", borderRadius: 2, fontSize: 10, fontWeight: 700, color, background: color + "18", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" }),
  toggle: (a) => ({ padding: "6px 14px", borderRadius: 2, border: "none", background: a ? C.surfaceHi : "transparent", color: a ? C.text : C.textDim, fontSize: 11, fontWeight: a ? 700 : 400, cursor: "pointer", letterSpacing: "0.04em", fontFamily: "'IBM Plex Mono',monospace" }),
  err: { fontSize: 11, color: C.danger, padding: "10px 12px", background: C.dangerDim, borderRadius: 2, marginBottom: 12, borderLeft: `2px solid ${C.danger}`, fontFamily: "'IBM Plex Mono',monospace" },
  driveBtn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 2, border: `1px solid ${C.border}`, background: C.surfaceHi, color: C.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "none", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" },
  divider: { height: 1, background: C.border, margin: "16px 0" },
  hamburger: { background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 20, padding: "4px", display: "flex", alignItems: "center" },
};

// ============================================================
// HOOKS
// ============================================================
function useWindowSize() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => { const h = () => setWidth(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return width;
}

// ============================================================
// AUTH PAGES
// ============================================================
function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("crew");
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError("Bitte E-Mail und Passwort eingeben"); return; }
    setLoading(true); setError("");
    try {
      const data = await db.signIn(email, password);
      db.setToken(data.access_token);
      const profiles = await db.select("users", `email=eq.${encodeURIComponent(email)}`);
      if (!profiles.length) throw new Error("Kein Benutzerprofil gefunden.");
      if (!profiles[0].is_approved) throw new Error("Dein Account wartet noch auf Freigabe durch einen Admin.");
      onLogin(profiles[0], data.access_token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name || !email || !password) { setError("Alle Felder sind Pflicht"); return; }
    if (password.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben"); return; }
    setLoading(true); setError("");
    try {
      await db.signUp(email, password);
      await db.insert("users", { name, email, role, is_admin: false, is_approved: false, must_change_password: false });
      setSuccess("Account erstellt! Du wirst benachrichtigt sobald ein Admin deinen Account freigibt.");
      setMode("login"); setName(""); setPassword("");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'IBM Plex Mono',monospace" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 32, height: 32, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎬</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: C.text, textTransform: "uppercase" }}>ShootPlan</div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>Production Suite</div>
            </div>
          </div>
          <div style={{ height: 1, background: C.border }} />
        </div>

        <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 4, display: "flex", marginBottom: 20 }}>
          <button style={{ ...S.toggle(mode === "login"), flex: 1, borderRadius: 6 }} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Anmelden</button>
          <button style={{ ...S.toggle(mode === "register"), flex: 1, borderRadius: 6 }} onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Registrieren</button>
        </div>

        <div style={{ ...S.card, padding: 24 }}>
          {success && <div style={{ fontSize: 13, color: "#10B981", padding: "10px 12px", background: "rgba(16,185,129,0.08)", borderRadius: 6, marginBottom: 14 }}>{success}</div>}
          {error && <div style={S.err}>{error}</div>}

          {mode === "login" ? (<>
            <div style={{ marginBottom: 14 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            <div style={{ marginBottom: 20 }}><label style={S.label}>Passwort</label><input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={handleLogin} disabled={loading}>{loading ? "Anmelden..." : "Anmelden →"}</button>
          </>) : (<>
            <div style={{ marginBottom: 14 }}><label style={S.label}>Name</label><input style={S.input} placeholder="Vorname Nachname" value={name} onChange={e => setName(e.target.value)} /></div>
            <div style={{ marginBottom: 14 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div style={{ marginBottom: 14 }}><label style={S.label}>Passwort</label><input style={S.input} type="password" placeholder="Min. 8 Zeichen" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Ich bin...</label>
              <select style={S.select} value={role} onChange={e => setRole(e.target.value)}>
                <option value="crew">Crew-Mitglied</option>
                <option value="actor">Schauspieler/in</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: "#555570", marginBottom: 16, padding: "10px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 6 }}>ℹ️ Dein Account wird nach der Registrierung von einem Admin freigeschaltet.</div>
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={handleRegister} disabled={loading}>{loading ? "Registrieren..." : "Account erstellen"}</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordPage({ user, onDone }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [error, setError] = useState("");
  const handleSave = async () => { if (pw.length < 8) { setError("Mindestens 8 Zeichen"); return; } if (pw !== pw2) { setError("Passwörter stimmen nicht überein"); return; } try { await db.update("users", { must_change_password: false }, `id=eq.${user.id}`); onDone(); } catch (e) { setError(e.message); } };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'IBM Plex Mono',monospace" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>ShootPlan</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Neues Passwort setzen</div>
        </div>
        <div style={{ ...S.card, padding: 24 }}>
          <div style={{ marginBottom: 14 }}><label style={S.label}>Neues Passwort</label><input style={S.input} type="password" value={pw} onChange={e => setPw(e.target.value)} /></div>
          <div style={{ marginBottom: 18 }}><label style={S.label}>Wiederholen</label><input style={S.input} type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
          {error && <div style={S.err}>{error}</div>}
          <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center" }} onClick={handleSave}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LAYOUT
// ============================================================
function Layout({ page, setPage, user, onLogout, children }) {
  const width = useWindowSize();
  const mobile = width < 768;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const adminNav = [
    { section: "Produktion" },
    { id: "dashboard", icon: "⬛", label: "Dashboard" },
    { id: "shoots", icon: "🎬", label: "Alle Shoots" },
    { id: "calendar", icon: "📅", label: "Kalender" },
    { section: "Netzwerk" },
    { id: "network", icon: "🌐", label: "Netzwerk" },
    { section: "Datenbanken" },
    { id: "clients", icon: "🏢", label: "Kunden" },
    { id: "actors", icon: "🎭", label: "Schauspieler" },
    { section: "Mein Konto" },
    { id: "my-equipment", icon: "🎥", label: "Mein Equipment" },
    { section: "Verwaltung" },
    { id: "users", icon: "👥", label: "Benutzer" },
  ];
  const crewNav = [
    { section: "Produktion" },
    { id: "dashboard", icon: "⬛", label: "Dashboard" },
    { id: "shoots", icon: "🎬", label: "Meine Shoots" },
    { id: "calendar", icon: "📅", label: "Kalender" },
    { section: "Netzwerk" },
    { id: "network", icon: "🌐", label: "Netzwerk" },
    { section: "Mein Konto" },
    { id: "my-equipment", icon: "🎥", label: "Mein Equipment" },
  ];
  const nav = user.is_admin ? adminNav : crewNav;

  const SidebarContent = () => (
    <>
      <div style={S.logo}>
        <div style={S.logoMark}>
          <div style={S.logoIcon}>🎬</div>
          <div><div style={S.logoText}>ShootPlan</div><div style={S.logoSub}>Production Suite</div></div>
        </div>
      </div>
      <div style={S.nav}>
        {nav.map((item, i) => item.section
          ? <div key={i} style={S.navSection}>{item.section}</div>
          : <div key={item.id} style={S.navItem(page === item.id || page.startsWith(item.id + "-"))} onClick={() => { setPage(item.id); setSidebarOpen(false); }}><span style={S.navIcon}>{item.icon}</span><span>{item.label}</span></div>
        )}
      </div>
      <div style={S.sidebarUser}>
        <div style={S.avatar(32)}>{user.name?.[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ fontSize: 11, color: "#444460" }}>{ROLE_CONFIG[user.role]?.label || (user.is_admin ? "Admin" : "Crew")}</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#444460", cursor: "pointer", fontSize: 18 }} onClick={onLogout}>↩</button>
      </div>
    </>
  );

  if (mobile) {
    return (
      <div style={S.root}>
        {sidebarOpen && <div style={S.overlay} onClick={() => setSidebarOpen(false)} />}
        <div style={S.sidebar(sidebarOpen)}><SidebarContent /></div>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <div style={S.topbar}>
            <button style={S.hamburger} onClick={() => setSidebarOpen(true)}>☰</button>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase" }}>ShootPlan</div></div>
            <div style={S.avatar(30)}>{user.name?.[0]}</div>
          </div>
          <div style={S.main}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.root, display: "flex" }}>
      <div style={S.sidebarDesktop}><SidebarContent /></div>
      <div style={S.mainDesktop}>{children}</div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ user, shoots, participants, setPage, setSelectedShoot }) {
  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id));
  const now = new Date();
  const upcoming = visible.filter(s => new Date((s.date_end || s.date_start) + "T23:59:59") >= now && s.status !== "cancelled");
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Guten Tag, {user.name?.split(" ")[0]} 👋</div><div style={S.pageSub}>{now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div></div>
        {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neuer Shoot</button>}
      </div>
      <div style={{ ...S.grid3, marginBottom: 24 }}>
        <div style={S.statCard}><div style={S.statValue}>{upcoming.length}</div><div style={S.statLabel}>Bevorstehend</div></div>
        <div style={S.statCard}><div style={S.statValue}>{visible.filter(s => s.status === "confirmed").length}</div><div style={S.statLabel}>Bestätigt</div></div>
        <div style={S.statCard}><div style={S.statValue}>{visible.filter(s => { const d = new Date(s.date_start); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length}</div><div style={S.statLabel}>Diesen Monat</div></div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#E8E8F0" }}>Nächste Shoots</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {upcoming.slice(0, 5).map(shoot => {
          const sp = participants.filter(p => p.shoot_id === shoot.id);
          const myP = sp.find(p => p.user_id === user.id);
          const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
          return (
            <div key={shoot.id} style={{ ...S.cardHover, display: "flex", alignItems: "center", gap: 12 }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
              <div style={{ width: 4, height: 44, borderRadius: 2, background: sc.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0", marginBottom: 2 }}>{shoot.title}</div>
                <div style={{ fontSize: 12, color: "#555570" }}>{fmtRange(shoot.date_start, shoot.date_end)} · {shoot.location}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                <span style={S.badge(shoot.status)}>{sc.label}</span>
              </div>
            </div>
          );
        })}
        {upcoming.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#444460" }}><div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div><div>Keine bevorstehenden Shoots</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 14 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button>}</div>}
      </div>
    </div>
  );
}

// ============================================================
// CALENDAR
// ============================================================
function CalendarView({ shoots, user, setSelectedShoot, setPage }) {
  const [date, setDate] = useState(new Date());
  const year = date.getFullYear(); const month = date.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = new Date();
  const isToday = (d) => d && today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
  const getShootsForDay = (d) => {
    if (!d) return [];
    const ds = new Date(year, month, d);
    return shoots.filter(s => {
      const start = new Date((s.date_start || s.date) + "T12:00:00");
      const end = new Date((s.date_end || s.date_start || s.date) + "T12:00:00");
      return ds >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && ds <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E8E8F0" }}>{date.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={S.btn("outline")} onClick={() => exportToICS(shoots)}>📥 Export</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month-1, 1))}>‹</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date())}>Heute</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month+1, 1))}>›</button>
        </div>
      </div>
      <div style={{ ...S.card, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 6 }}>
          {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#444460", padding: "3px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((day, idx) => (
            <div key={idx} style={{ minHeight: 64, background: isToday(day) ? "rgba(99,102,241,0.1)" : "#0A0A0F", borderRadius: 6, padding: "5px 6px", border: isToday(day) ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent" }}>
              {day && (<><div style={{ fontSize: 12, fontWeight: isToday(day) ? 800 : 400, color: isToday(day) ? "#818CF8" : "#555570", marginBottom: 3 }}>{day}</div>{getShootsForDay(day).map(s => { const c = STATUS_CONFIG[s.status]||STATUS_CONFIG.planned; return <div key={s.id} style={{ fontSize: 9, fontWeight: 600, padding: "1px 4px", borderRadius: 3, background: c.color+"22", color: c.color, marginBottom: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => { setSelectedShoot(s); setPage("shoot-detail"); }}>{s.title}</div>; })}</>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHOOTS LIST
// ============================================================
function ShootsList({ user, shoots, participants, clients, setPage, setSelectedShoot }) {
  const [view, setView] = useState("list"); const [filter, setFilter] = useState("all"); const [search, setSearch] = useState("");
  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id));
  const filtered = (filter === "all" ? visible : visible.filter(s => s.status === filter)).filter(s => !search || s.title?.toLowerCase().includes(search.toLowerCase()) || s.location?.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>{user.is_admin ? "Alle Shoots" : "Meine Shoots"}</div><div style={S.pageSub}>{sorted.length} Produktionen</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neu</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input style={{ ...S.input, maxWidth: 220 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.btn("outline")} onClick={() => exportToICS(sorted)}>📥 .ics</button>
        <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 3, display: "flex" }}>
          <button style={S.toggle(view === "list")} onClick={() => setView("list")}>☰</button>
          <button style={S.toggle(view === "calendar")} onClick={() => setView("calendar")}>📅</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","Alle"],["planned","Geplant"],["confirmed","Bestätigt"],["cancelled","Abgesagt"]].map(([val,lbl]) => (
          <button key={val} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: filter===val?"#6366F1":"#1E1E2E", background: filter===val?"rgba(99,102,241,0.15)":"transparent", color: filter===val?"#818CF8":"#555570", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setFilter(val)}>{lbl}</button>
        ))}
      </div>
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(shoot => {
            const sp = participants.filter(p => p.shoot_id === shoot.id);
            const myP = sp.find(p => p.user_id === user.id);
            const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
            const client = clients.find(c => c.id === shoot.client_id);
            const isMultiDay = shoot.date_end && shoot.date_end !== shoot.date_start;
            return (
              <div key={shoot.id} style={{ ...S.cardHover, display: "flex", gap: 12, alignItems: "center" }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
                <div style={{ minWidth: 44, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#F0F0FA" }}>{new Date(shoot.date_start + "T12:00:00").getDate().toString().padStart(2,"0")}</div>
                  <div style={{ fontSize: 10, color: "#444460", textTransform: "uppercase" }}>{new Date(shoot.date_start + "T12:00:00").toLocaleString("de-DE",{month:"short"})}</div>
                  {isMultiDay && <div style={{ fontSize: 9, color: "#6366F1", fontWeight: 700 }}>MULTI</div>}
                </div>
                <div style={{ width: 1, height: 36, background: "#1E1E2E", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0", marginBottom: 2 }}>{shoot.title}</div>
                  <div style={{ fontSize: 12, color: "#555570" }}>{shoot.location}{client ? ` · 🏢 ${client.company}` : ""}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                  <span style={S.badge(shoot.status)}>{sc.label}</span>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#444460" }}><div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div><div>Keine Shoots gefunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setPage("new-shoot")}>Erstellen</button>}</div>}
        </div>
      ) : <CalendarView shoots={sorted} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} />}
    </div>
  );
}

// ============================================================
// SHOOT DETAIL
// ============================================================
function ShootDetail({ shoot, setShoot, participants, setParticipants, shotlist, setShotlist, schedule, setSchedule, users, clients, user, setPage, onDelete, userEquipment }) {
  const [tab, setTab] = useState("overview"); const [editMode, setEditMode] = useState(false); const [form, setForm] = useState({ ...shoot }); const [saving, setSaving] = useState(false);
  const [showAddP, setShowAddP] = useState(false); const [addUserId, setAddUserId] = useState(""); const [addRole, setAddRole] = useState("");
  const [showAddLink, setShowAddLink] = useState(false); const [linkForm, setLinkForm] = useState({ label: "", url: "", type: "drive" });
  const [shootEquip, setShootEquip] = useState([]); const [rentalEquip, setRentalEquip] = useState([]); const [equipLoaded, setEquipLoaded] = useState(false);
  const [showAddRental, setShowAddRental] = useState(false); const [rentalForm, setRentalForm] = useState({ name: "", category: "", daily_rate: "", quantity: 1, notes: "" });
  const [showMyEquipPicker, setShowMyEquipPicker] = useState(false);

  useEffect(() => {
    if (tab === "equipment" && !equipLoaded) {
      Promise.all([db.select("shoot_equipment", `shoot_id=eq.${shoot.id}`), db.select("shoot_rental_equipment", `shoot_id=eq.${shoot.id}`)]).then(([se, re]) => { setShootEquip(se); setRentalEquip(re); setEquipLoaded(true); }).catch(console.error);
    }
  }, [tab, equipLoaded, shoot.id]);

  const shootDays = (() => { if (!shoot.date_start) return 1; const e = new Date((shoot.date_end || shoot.date_start) + "T12:00:00"); const s = new Date(shoot.date_start + "T12:00:00"); return Math.max(1, Math.round((e - s) / 86400000) + 1); })();
  const rentalTotal = rentalEquip.reduce((sum, r) => sum + (parseFloat(r.daily_rate)||0) * (parseInt(r.quantity)||1) * shootDays, 0);

  const syncBudget = async (newList) => {
    const total = newList.reduce((sum, r) => sum + (parseFloat(r.daily_rate)||0) * (parseInt(r.quantity)||1) * shootDays, 0);
    const base = parseFloat(shoot.budget_base ?? shoot.budget ?? 0);
    try { await db.update("shoots", { budget: base + total, budget_base: base }, `id=eq.${shoot.id}`); setShoot(p => ({ ...p, budget: base + total, budget_base: base })); } catch (e) {}
  };
  const addRentalEquip = async () => {
    if (!rentalForm.name) return;
    try { const item = await db.insert("shoot_rental_equipment", { ...rentalForm, shoot_id: shoot.id, daily_rate: parseFloat(rentalForm.daily_rate)||0, quantity: parseInt(rentalForm.quantity)||1 }); const nl = [...rentalEquip, item]; setRentalEquip(nl); await syncBudget(nl); setShowAddRental(false); setRentalForm({ name: "", category: "", daily_rate: "", quantity: 1, notes: "" }); } catch (e) { alert(e.message); }
  };
  const removeRentalEquip = async (id) => { try { await db.remove("shoot_rental_equipment", `id=eq.${id}`); const nl = rentalEquip.filter(r => r.id !== id); setRentalEquip(nl); await syncBudget(nl); } catch (e) { alert(e.message); } };
  const updateRentalField = async (id, field, val) => { const nl = rentalEquip.map(r => r.id === id ? { ...r, [field]: val } : r); setRentalEquip(nl); try { await db.update("shoot_rental_equipment", { [field]: val }, `id=eq.${id}`); await syncBudget(nl); } catch (e) {} };
  const myShootEquipIds = new Set(shootEquip.filter(e => e.user_id === user.id).map(e => e.user_equipment_id));
  const addMyEquipToShoot = async (eq) => { if (myShootEquipIds.has(eq.id)) return; try { const item = await db.insert("shoot_equipment", { shoot_id: shoot.id, user_id: user.id, user_equipment_id: eq.id, name: eq.name, category: eq.category, notes: eq.notes }); setShootEquip(p => [...p, item]); } catch (e) { alert(e.message); } };
  const removeMyEquipFromShoot = async (id) => { try { await db.remove("shoot_equipment", `id=eq.${id}`); setShootEquip(p => p.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };

  const sp = participants.filter(p => p.shoot_id === shoot.id);
  const shots = shotlist.filter(s => s.shoot_id === shoot.id);
  const sched = [...schedule.filter(s => s.shoot_id === shoot.id)].sort((a,b) => (a.time||"").localeCompare(b.time||""));
  const myP = sp.find(p => p.user_id === user.id);
  const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
  const shootClient = clients.find(c => c.id === shoot.client_id);
  const links = (() => { try { return JSON.parse(shoot.shared_links || "[]"); } catch { return []; } })();

  const handleSave = async () => {
    setSaving(true);
    try { await db.update("shoots", { title: form.title, location: form.location, date_start: form.date_start, date_end: form.date_end || form.date_start, start_time: form.start_time, end_time: form.end_time, budget: form.budget || null, notes: form.notes, status: form.status, client_id: form.client_id || null, shared_links: form.shared_links || "[]" }, `id=eq.${shoot.id}`); setShoot({ ...shoot, ...form }); setEditMode(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleAddLink = async () => { if (!linkForm.url) return; const updated = JSON.stringify([...links, { ...linkForm, id: Date.now() }]); try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); setShowAddLink(false); setLinkForm({ label: "", url: "", type: "drive" }); } catch (e) { alert(e.message); } };
  const handleRemoveLink = async (id) => { const updated = JSON.stringify(links.filter(l => l.id !== id)); try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); } catch (e) { alert(e.message); } };
  const handleStatusChange = async (pId, val) => { try { await db.update("shoot_participants", { attendance_status: val }, `id=eq.${pId}`); setParticipants(prev => prev.map(p => p.id === pId ? { ...p, attendance_status: val } : p)); } catch (e) { alert(e.message); } };
  const handleAddP = async () => { if (!addUserId) return; try { const np = await db.insert("shoot_participants", { shoot_id: shoot.id, user_id: addUserId, role_on_shoot: addRole || "Crew", attendance_status: "open" }); setParticipants(prev => [...prev, np]); setShowAddP(false); setAddUserId(""); setAddRole(""); } catch (e) { alert(e.message); } };
  const handleRemoveP = async (pId) => { try { await db.remove("shoot_participants", `id=eq.${pId}`); setParticipants(prev => prev.filter(p => p.id !== pId)); } catch (e) { alert(e.message); } };
  const addShot = async () => { try { const s = await db.insert("shotlist", { shoot_id: shoot.id, title: "Neuer Shot", description: "", camera_setting: "", duration: "", status: "open" }); setShotlist(prev => [...prev, s]); } catch (e) { alert(e.message); } };
  const updateShot = async (id, field, val) => { setShotlist(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s)); try { await db.update("shotlist", { [field]: val }, `id=eq.${id}`); } catch (e) {} };
  const deleteShot = async (id) => { try { await db.remove("shotlist", `id=eq.${id}`); setShotlist(prev => prev.filter(s => s.id !== id)); } catch (e) { alert(e.message); } };
  const addSched = async () => { try { const e = await db.insert("schedule", { shoot_id: shoot.id, time: "09:00", title: "Neuer Eintrag", description: "" }); setSchedule(prev => [...prev, e]); } catch (e) { alert(e.message); } };
  const updateSched = async (id, field, val) => { setSchedule(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e)); try { await db.update("schedule", { [field]: val }, `id=eq.${id}`); } catch (e) {} };
  const deleteSched = async (id) => { try { await db.remove("schedule", `id=eq.${id}`); setSchedule(prev => prev.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };
  const linkIcon = (type) => ({ drive: "📁", onedrive: "☁️", dropbox: "📦", other: "🔗" }[type] || "🔗");
  const tabs = [["overview","Übersicht"],["documents","Dokumente"],["equipment","Equipment"],["shotlist","Shotlist"],["schedule","Tagesplan"],["crew","Crew"]];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
        <button style={{ ...S.btn("ghost"), padding: "7px 10px" }} onClick={() => setPage("shoots")}>← Zurück</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          {editMode ? <input style={{ ...S.input, fontSize: 18, fontWeight: 700, marginBottom: 6 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            : <div style={{ fontSize: 20, fontWeight: 700, color: "#F0F0FA", marginBottom: 4 }}>{shoot.title}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={S.badge(shoot.status)}>{sc.label}</span>
            <span style={{ fontSize: 12, color: "#555570" }}>{fmtRange(shoot.date_start, shoot.date_end)}</span>
            {shoot.location && <span style={{ fontSize: 12, color: "#555570" }}>📍 {shoot.location}</span>}
            {shootClient && <span style={{ fontSize: 12, color: "#6366F1" }}>🏢 {shootClient.company}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={S.btn("outline")} onClick={() => exportToICS([shoot])}>📥</button>
          {user.is_admin && !editMode && <button style={S.btn("outline")} onClick={() => setEditMode(true)}>✏️</button>}
          {editMode && <><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={() => { setEditMode(false); setForm({ ...shoot }); }}>✕</button></>}
          {user.is_admin && <button style={S.btn("danger")} onClick={() => onDelete(shoot.id)}>🗑</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1E1E2E", overflowX: "auto" }}>
        {tabs.map(([id,lbl]) => (
          <button key={id} style={{ padding: "9px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab===id?700:400, color: tab===id?"#818CF8":"#555570", borderBottom: tab===id?"2px solid #6366F1":"2px solid transparent", marginBottom: -1, whiteSpace: "nowrap" }} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={S.grid2}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#444460", marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Details</div>
              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={S.label}>Titel</label><input style={S.input} value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
                  <div><label style={S.label}>Location</label><input style={S.input} value={form.location||""} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Startdatum</label><input style={S.input} type="date" value={form.date_start||""} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
                    <div><label style={S.label}>Enddatum</label><input style={S.input} type="date" value={form.date_end||""} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Startzeit</label><input style={S.input} type="time" value={form.start_time||""} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
                    <div><label style={S.label}>Endzeit</label><input style={S.input} type="time" value={form.end_time||""} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
                  </div>
                  <div><label style={S.label}>Kunde</label>
                    <select style={S.select} value={form.client_id||""} onChange={e=>setForm(f=>({...f,client_id:e.target.value||null}))}>
                      <option value="">Kein Kunde</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
                    </select>
                  </div>
                  <div><label style={S.label}>Budget (€)</label><input style={S.input} type="number" value={form.budget||""} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
                  <div><label style={S.label}>Status</label><select style={S.select} value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {[["📅", fmtRange(shoot.date_start, shoot.date_end)], ["🕒", shoot.start_time ? `${shoot.start_time} – ${shoot.end_time}` : "—"], ["📍", shoot.location||"—"], ["🏢", shootClient?.company||"—"], ["💶", shoot.budget ? `€ ${Number(shoot.budget).toLocaleString("de-DE")}` : "—"]].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 14 }}>{k}</span><span style={{ fontSize: 13, color: "#E8E8F0" }}>{v}</span></div>
                  ))}
                </div>
              )}
            </div>
            {myP && (
              <div style={S.card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#444460", marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Mein Status</div>
                <div style={{ marginBottom: 10 }}><span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(ATTEND_CONFIG).map(([k,v]) => (<button key={k} style={{ padding: "5px 11px", borderRadius: 20, border: `1px solid ${myP.attendance_status===k?v.color:"#2A2A3E"}`, background: myP.attendance_status===k?v.bg:"transparent", color: myP.attendance_status===k?v.color:"#555570", fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => handleStatusChange(myP.id, k)}>{v.label}</button>))}
                </div>
              </div>
            )}
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#444460", marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Notizen</div>
            {editMode ? <textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={8}/> : <div style={{ fontSize: 14, color: "#888899", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{shoot.notes||"Keine Notizen"}</div>}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0" }}>Dokumente ({links.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddLink(true)}>＋ Link</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map(link => (
              <div key={link.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>{linkIcon(link.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0" }}>{link.label || "Dokument"}</div>
                  <div style={{ fontSize: 11, color: "#444460", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                </div>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={S.driveBtn}>Öffnen →</a>
                {user.is_admin && <button style={S.btn("danger")} onClick={() => handleRemoveLink(link.id)}>✕</button>}
              </div>
            ))}
            {links.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#444460" }}><div style={{ fontSize: 36, marginBottom: 10 }}>📁</div><div>Keine Dokumente hinterlegt</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setShowAddLink(true)}>＋ Link hinzufügen</button>}</div>}
          </div>
          {showAddLink && (<div style={S.modal}><div style={S.modalBox}>
            <div style={S.modalTitle}>Dokument hinzufügen</div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>Typ</label><select style={S.select} value={linkForm.type} onChange={e=>setLinkForm(f=>({...f,type:e.target.value}))}><option value="drive">📁 Google Drive</option><option value="onedrive">☁️ OneDrive / SharePoint</option><option value="dropbox">📦 Dropbox</option><option value="other">🔗 Anderer Link</option></select></div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>Bezeichnung</label><input style={S.input} value={linkForm.label} onChange={e=>setLinkForm(f=>({...f,label:e.target.value}))} placeholder="z. B. Callsheet, Storyboard..."/></div>
            <div style={{ marginBottom: 18 }}><label style={S.label}>Shared Link URL</label><input style={S.input} value={linkForm.url} onChange={e=>setLinkForm(f=>({...f,url:e.target.value}))} placeholder="https://..."/></div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddLink}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddLink(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}

      {tab === "crew" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0" }}>Crew ({sp.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddP(true)}>＋</button>}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {Object.entries(ATTEND_CONFIG).map(([k,v]) => { const count = sp.filter(p=>p.attendance_status===k).length; if (!count) return null; return <span key={k} style={{...S.attendBadge(k),fontSize:11}}>{v.label}: {count}</span>; })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sp.map(p => { const u = users.find(u=>u.id===p.user_id)||{name:"Unbekannt",email:""}; return (
              <div key={p.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={S.avatar(34)}>{u.name?.[0]}</div>
                <div style={{ flex: 1, minWidth: 120 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0" }}>{u.name}</div><div style={{ fontSize: 11, color: "#555570" }}>{p.role_on_shoot}</div></div>
                <span style={S.attendBadge(p.attendance_status)}>{ATTEND_CONFIG[p.attendance_status]?.label}</span>
                {user.is_admin ? <div style={{ display: "flex", gap: 4 }}><select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><button style={S.btn("danger")} onClick={()=>handleRemoveP(p.id)}>✕</button></div>
                : p.user_id===user.id && <select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>}
              </div>
            ); })}
          </div>
          {showAddP && (<div style={S.modal}><div style={S.modalBox}>
            <div style={S.modalTitle}>Crew hinzufügen</div>
            <div style={{ marginBottom: 12 }}><label style={S.label}>Person</label><select style={S.select} value={addUserId} onChange={e=>setAddUserId(e.target.value)}><option value="">Wählen...</option>{users.filter(u=>!sp.find(p=>p.user_id===u.id)&&u.is_approved).map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></div>
            <div style={{ marginBottom: 18 }}><label style={S.label}>Rolle</label><input style={S.input} value={addRole} onChange={e=>setAddRole(e.target.value)} placeholder="z. B. Director, Gaffer, Schauspieler..."/></div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddP}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddP(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}

      {tab === "shotlist" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0" }}>Shotlist ({shots.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addShot}>＋ Shot</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shots.map((shot, idx) => (
              <div key={shot.id} style={S.card}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#444460", minWidth: 20 }}>#{idx+1}</div>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                    <div><label style={S.label}>Titel</label><input style={S.input} value={shot.title||""} onChange={e=>updateShot(shot.id,"title",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Kamera</label><input style={S.input} value={shot.camera_setting||""} onChange={e=>updateShot(shot.id,"camera_setting",e.target.value)} placeholder="24mm f/2.8" readOnly={!user.is_admin}/></div>
                    <div style={{ gridColumn: "span 2" }}><label style={S.label}>Beschreibung</label><input style={S.input} value={shot.description||""} onChange={e=>updateShot(shot.id,"description",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Dauer</label><input style={S.input} value={shot.duration||""} onChange={e=>updateShot(shot.id,"duration",e.target.value)} placeholder="00:30" readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Status</label><select style={S.select} value={shot.status||"open"} onChange={e=>updateShot(shot.id,"status",e.target.value)}>{Object.entries(SHOT_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  </div>
                  {user.is_admin && <button style={S.btn("danger")} onClick={()=>deleteShot(shot.id)}>✕</button>}
                </div>
              </div>
            ))}
            {shots.length===0 && <div style={{ ...S.card, textAlign:"center", padding:32, color:"#444460" }}>Noch keine Shots geplant</div>}
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Tagesplan ({sched.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addSched}>＋</button>}
          </div>
          <div style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 16, marginLeft: 8 }}>
            {sched.map(entry => (
              <div key={entry.id} style={{ position: "relative", paddingBottom: 16 }}>
                <div style={{ position: "absolute", left: -23, top: 4, width: 8, height: 8, borderRadius: 0, background: C.accent }}/>
                {user.is_admin ? (
                  <div style={{ ...S.card, padding: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr auto", gap: 8, alignItems: "start" }}>
                      <div><label style={S.label}>Zeit</label><input style={S.input} type="time" value={entry.time||""} onChange={e=>updateSched(entry.id,"time",e.target.value)}/></div>
                      <div><label style={S.label}>Titel</label><input style={S.input} value={entry.title||""} onChange={e=>updateSched(entry.id,"title",e.target.value)}/></div>
                      <div><label style={S.label}>Info</label><input style={S.input} value={entry.description||""} onChange={e=>updateSched(entry.id,"description",e.target.value)}/></div>
                      <button style={{ ...S.btn("danger"), marginTop: 20 }} onClick={()=>deleteSched(entry.id)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", paddingBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 44, fontFamily: "'IBM Plex Mono',monospace" }}>{entry.time}</span>
                    <div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{entry.title}</div>{entry.description && <div style={{ fontSize: 12, color: C.textMid }}>{entry.description}</div>}</div>
                  </div>
                )}
              </div>
            ))}
            {sched.length===0 && <div style={{ color: C.textDim, fontSize:12, padding:16 }}>Kein Tagesplan erstellt</div>}
          </div>
        </div>
      )}

      {tab === "equipment" && (
        <div>
          {/* Summary bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 20 }}>
            <div style={{ ...S.statCard, padding: "14px 18px" }}>
              <div style={S.statValue}>{shootEquip.length}</div>
              <div style={S.statLabel}>Crew Equipment</div>
            </div>
            <div style={{ ...S.statCard, padding: "14px 18px" }}>
              <div style={S.statValue}>{rentalEquip.length}</div>
              <div style={S.statLabel}>Mietequipment</div>
            </div>
            <div style={{ ...S.statCard, padding: "14px 18px", borderLeft: `2px solid ${C.accent}` }}>
              <div style={{ ...S.statValue, color: C.accent }}>€{rentalTotal.toLocaleString("de-DE", {minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div style={S.statLabel}>Mietkosten ({shootDays} Tag{shootDays!==1?"e":""})</div>
            </div>
          </div>

          {/* CREW EQUIPMENT SECTION */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>Crew Equipment</div>
                <div style={{ fontSize: 11, color: C.textDim }}>Equipment das Crew-Mitglieder mitbringen</div>
              </div>
              <button style={S.btn("primary")} onClick={() => setShowMyEquipPicker(true)}>＋ Mein Equipment</button>
            </div>
            {!equipLoaded ? <div style={{ color: C.textDim, fontSize: 12, padding: 16 }}>Lade...</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shootEquip.length === 0 && <div style={{ ...S.card, padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>Kein Crew-Equipment eingetragen</div>}
                {(() => {
                  const byUser = {};
                  shootEquip.forEach(e => { const u = users.find(u => u.id === e.user_id) || { name: "Unbekannt" }; if (!byUser[e.user_id]) byUser[e.user_id] = { user: u, items: [] }; byUser[e.user_id].items.push(e); });
                  return Object.values(byUser).map(({ user: u, items }) => (
                    <div key={u.id || u.name} style={S.card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ ...S.avatar(24), fontSize: 10 }}>{u.name?.[0]}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>{u.name}</div>
                        <div style={{ fontSize: 10, color: C.textDim }}>{items.length} Item{items.length !== 1 ? "s" : ""}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {items.map(item => (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: C.bg, borderRadius: 2, border: `1px solid ${C.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</div>
                              {item.category && <div style={{ fontSize: 10, color: C.textDim }}>{item.category}</div>}
                              {item.notes && <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic" }}>{item.notes}</div>}
                            </div>
                            {item.user_id === user.id && <button style={{ ...S.btn("danger"), padding: "3px 8px", fontSize: 10 }} onClick={() => removeMyEquipFromShoot(item.id)}>✕</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* RENTAL EQUIPMENT SECTION */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>Mietequipment</div>
                <div style={{ fontSize: 11, color: C.textDim }}>Tagesmiete × Anzahl × {shootDays} Tag{shootDays!==1?"e":""} → Budget</div>
              </div>
              {user.is_admin && <button style={S.btn("outline")} onClick={() => setShowAddRental(true)}>＋ Mietitem</button>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rentalEquip.length === 0 && <div style={{ ...S.card, padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>Kein Mietequipment</div>}
              {rentalEquip.map(r => (
                <div key={r.id} style={{ ...S.card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{r.name}</div>
                    {r.category && <div style={{ fontSize: 10, color: C.textDim }}>{r.category}</div>}
                  </div>
                  {user.is_admin ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <label style={{ ...S.label, marginBottom: 2 }}>CHF/Tag</label>
                        <input style={{ ...S.input, width: 90, padding: "5px 8px", fontSize: 12 }} type="number" value={r.daily_rate||""} onChange={e => updateRentalField(r.id, "daily_rate", e.target.value)} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <label style={{ ...S.label, marginBottom: 2 }}>Anz.</label>
                        <input style={{ ...S.input, width: 60, padding: "5px 8px", fontSize: 12 }} type="number" min="1" value={r.quantity||1} onChange={e => updateRentalField(r.id, "quantity", e.target.value)} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, minWidth: 80, textAlign: "right", fontFamily: "'IBM Plex Mono',monospace" }}>
                        CHF {((parseFloat(r.daily_rate)||0)*(parseInt(r.quantity)||1)*shootDays).toFixed(2)}
                      </div>
                      <button style={{ ...S.btn("danger"), padding: "4px 10px" }} onClick={() => removeRentalEquip(r.id)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: "'IBM Plex Mono',monospace" }}>
                      CHF {(parseFloat(r.daily_rate)||0).toFixed(2)}/Tag × {r.quantity||1} × {shootDays}d = CHF {((parseFloat(r.daily_rate)||0)*(parseInt(r.quantity)||1)*shootDays).toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
              {rentalEquip.length > 0 && (
                <div style={{ padding: "10px 14px", background: C.accentDim, border: `1px solid ${C.accent}33`, borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Mietkosten</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.accent, fontFamily: "'IBM Plex Mono',monospace" }}>CHF {rentalTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* MODALS */}
          {showMyEquipPicker && (<div style={S.modal}><div style={S.modalBox}>
            <div style={S.modalTitle}>Mein Equipment zum Shoot hinzufügen</div>
            {userEquipment.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 12, padding: "16px 0", marginBottom: 16 }}>Du hast noch kein Equipment in deinem Profil gespeichert. Gehe zu "Mein Equipment" in den Einstellungen.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {userEquipment.map(eq => {
                  const already = myShootEquipIds.has(eq.id);
                  return (
                    <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: already ? C.accentDim : C.bg, border: `1px solid ${already ? C.accent+"44" : C.border}`, borderRadius: 2 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{eq.name}</div>{eq.category && <div style={{ fontSize: 10, color: C.textDim }}>{eq.category}</div>}</div>
                      {already ? <span style={S.tag(C.accent)}>✓ Hinzugefügt</span> : <button style={S.btn("primary")} onClick={() => addMyEquipToShoot(eq)}>Hinzufügen</button>}
                    </div>
                  );
                })}
              </div>
            )}
            <button style={S.btn("ghost")} onClick={() => setShowMyEquipPicker(false)}>Schliessen</button>
          </div></div>)}

          {showAddRental && (<div style={S.modal}><div style={S.modalBox}>
            <div style={S.modalTitle}>Mietequipment hinzufügen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Bezeichnung *</label><input style={S.input} value={rentalForm.name} onChange={e=>setRentalForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Sony FX3, Aputure 300D..."/></div>
              <div><label style={S.label}>Kategorie</label><input style={S.input} value={rentalForm.category} onChange={e=>setRentalForm(f=>({...f,category:e.target.value}))} placeholder="Kamera, Licht, Ton..."/></div>
              <div><label style={S.label}>CHF / Tag</label><input style={S.input} type="number" value={rentalForm.daily_rate} onChange={e=>setRentalForm(f=>({...f,daily_rate:e.target.value}))} placeholder="0.00"/></div>
              <div><label style={S.label}>Anzahl</label><input style={S.input} type="number" min="1" value={rentalForm.quantity} onChange={e=>setRentalForm(f=>({...f,quantity:e.target.value}))}/></div>
              <div style={{ gridColumn: "1/-1" }}>
                {rentalForm.daily_rate && <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontFamily: "'IBM Plex Mono',monospace" }}>
                  CHF {(parseFloat(rentalForm.daily_rate)||0).toFixed(2)} × {parseInt(rentalForm.quantity)||1} × {shootDays} Tage = CHF {((parseFloat(rentalForm.daily_rate)||0)*(parseInt(rentalForm.quantity)||1)*shootDays).toFixed(2)}
                </div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={addRentalEquip}>Hinzufügen + Budget aktualisieren</button><button style={S.btn("ghost")} onClick={()=>setShowAddRental(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// NEW SHOOT
// ============================================================
// ============================================================
// MY EQUIPMENT PAGE
// ============================================================
function MyEquipmentPage({ user, userEquipment, setUserEquipment }) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", category: "", serial_number: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditItem(null); setForm({ name: "", category: "", serial_number: "", notes: "" }); setShowModal(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ ...item }); setShowModal(true); };
  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editItem) { await db.update("user_equipment", form, `id=eq.${editItem.id}`); setUserEquipment(prev => prev.map(e => e.id === editItem.id ? { ...e, ...form } : e)); }
      else { const item = await db.insert("user_equipment", { ...form, user_id: user.id }); setUserEquipment(prev => [...prev, item]); }
      setShowModal(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Löschen?")) return; try { await db.remove("user_equipment", `id=eq.${id}`); setUserEquipment(prev => prev.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };

  const byCategory = userEquipment.reduce((acc, e) => { const cat = e.category || "Sonstiges"; if (!acc[cat]) acc[cat] = []; acc[cat].push(e); return acc; }, {});

  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Mein Equipment</div><div style={S.pageSub}>{userEquipment.length} Items gespeichert — verfügbar bei jedem Shoot</div></div>
        <button style={S.btn("primary")} onClick={openNew}>＋ Equipment</button>
      </div>
      {userEquipment.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 48, color: C.textDim }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎥</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: C.text }}>Noch kein Equipment</div>
          <div style={{ fontSize: 11, marginBottom: 16 }}>Speichere dein Equipment einmalig und füge es bei jedem Shoot mit einem Klick hinzu.</div>
          <button style={S.btn("primary")} onClick={openNew}>Erstes Item hinzufügen</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {items.map(item => (
                  <div key={item.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.name}</div>
                      {item.serial_number && <div style={{ fontSize: 10, color: C.textDim, fontFamily: "'IBM Plex Mono',monospace" }}>S/N: {item.serial_number}</div>}
                      {item.notes && <div style={{ fontSize: 11, color: C.textMid, fontStyle: "italic" }}>{item.notes}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...S.btn("outline"), padding: "5px 10px" }} onClick={() => openEdit(item)}>✏️</button>
                      <button style={{ ...S.btn("danger"), padding: "5px 10px" }} onClick={() => handleDelete(item.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>{editItem ? "Equipment bearbeiten" : "Neues Equipment"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Bezeichnung *</label><input style={S.input} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Sony A7 IV, DJI RS3..."/></div>
          <div><label style={S.label}>Kategorie</label><input style={S.input} value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="Kamera, Licht, Ton, Grip..."/></div>
          <div><label style={S.label}>Seriennummer</label><input style={S.input} value={form.serial_number||""} onChange={e=>setForm(f=>({...f,serial_number:e.target.value}))}/></div>
          <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Notizen</label><textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Zubehör, Besonderheiten..."/></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

function NewShootPage({ user, clients, setPage, onSave }) {
  const [form, setForm] = useState({ title: "", location: "", date_start: "", date_end: "", start_time: "09:00", end_time: "18:00", budget: "", notes: "", status: "planned", client_id: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.title || !form.date_start) { setError("Titel und Startdatum sind Pflichtfelder"); return; }
    setSaving(true);
    try { const shoot = await db.insert("shoots", { ...form, date_end: form.date_end || form.date_start, budget: form.budget || null, client_id: form.client_id || null, created_by: user.id, shared_links: "[]" }); onSave(shoot); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Neuer Shoot</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"Erstellt...":"Shoot erstellen"}</button><button style={S.btn("ghost")} onClick={() => setPage("shoots")}>Abbrechen</button></div>
      </div>
      {error && <div style={S.err}>{error}</div>}
      <div style={S.grid2}>
        <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={S.label}>Titel *</label><input style={S.input} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="z. B. Brand Film – Kunde AG"/></div>
          <div><label style={S.label}>Location</label><input style={S.input} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z. B. Berlin Studio B"/></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={S.label}>Startdatum *</label><input style={S.input} type="date" value={form.date_start} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
            <div><label style={S.label}>Enddatum</label><input style={S.input} type="date" value={form.date_end} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={S.label}>Startzeit</label><input style={S.input} type="time" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
            <div><label style={S.label}>Endzeit</label><input style={S.input} type="time" value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
          </div>
          <div><label style={S.label}>Kunde</label>
            <select style={S.select} value={form.client_id} onChange={e=>setForm(f=>({...f,client_id:e.target.value}))}>
              <option value="">Kein Kunde</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </div>
          <div><label style={S.label}>Budget (€)</label><input style={S.input} type="number" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} placeholder="8500"/></div>
          <div><label style={S.label}>Status</label><select style={S.select} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
        </div>
        <div style={S.card}><label style={S.label}>Notizen</label><textarea style={{ ...S.textarea, minHeight: 200 }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Besonderheiten, Equipment..."/></div>
      </div>
    </div>
  );
}

// ============================================================
// CLIENTS
// ============================================================
function ClientsPage({ user }) {
  const [clients, setClients] = useState([]); const [loading, setLoading] = useState(true); const [showModal, setShowModal] = useState(false); const [editClient, setEditClient] = useState(null);
  const [form, setForm] = useState({ company: "", contact_name: "", email: "", phone: "", website: "", address: "", notes: "" }); const [search, setSearch] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { db.select("clients").then(d => { setClients(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const openNew = () => { setEditClient(null); setForm({ company: "", contact_name: "", email: "", phone: "", website: "", address: "", notes: "" }); setShowModal(true); };
  const openEdit = (c) => { setEditClient(c); setForm({ ...c }); setShowModal(true); };
  const handleSave = async () => {
    if (!form.company) return;
    setSaving(true);
    try { if (editClient) { await db.update("clients", form, `id=eq.${editClient.id}`); setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...form } : c)); } else { const nc = await db.insert("clients", form); setClients(prev => [...prev, nc]); } setShowModal(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Löschen?")) return; try { await db.remove("clients", `id=eq.${id}`); setClients(prev => prev.filter(c => c.id !== id)); } catch (e) { alert(e.message); } };
  const filtered = clients.filter(c => !search || c.company?.toLowerCase().includes(search.toLowerCase()) || c.contact_name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Kunden</div><div style={S.pageSub}>{clients.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 8 }}><input style={{ ...S.input, maxWidth: 200 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />{user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neu</button>}</div>
      </div>
      {loading ? <div style={{ textAlign:"center", padding:40, color:"#555570" }}>Lade...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(c => (
            <div key={c.id} style={S.card}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ ...S.avatar(40), borderRadius: 10, fontSize: 18, background: "rgba(99,102,241,0.15)" }}>🏢</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E8E8F0" }}>{c.company}</div>
                  {c.contact_name && <div style={{ fontSize: 13, color: "#888899" }}>{c.contact_name}</div>}
                  <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>✉ {c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>📞 {c.phone}</a>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>🌐 Website</a>}
                  </div>
                </div>
                {user.is_admin && <div style={{ display: "flex", gap: 6 }}><button style={S.btn("outline")} onClick={() => openEdit(c)}>✏️</button><button style={S.btn("danger")} onClick={() => handleDelete(c.id)}>✕</button></div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ ...S.card, textAlign:"center", padding:40, color:"#444460" }}><div style={{ fontSize:36, marginBottom:10 }}>🏢</div><div>Keine Kunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop:12 }} onClick={openNew}>Ersten Kunden anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>{editClient ? "Kunde bearbeiten" : "Neuer Kunde"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={S.label}>Firma *</label><input style={S.input} value={form.company||""} onChange={e=>setForm(f=>({...f,company:e.target.value}))}/></div>
          <div><label style={S.label}>Ansprechpartner</label><input style={S.input} value={form.contact_name||""} onChange={e=>setForm(f=>({...f,contact_name:e.target.value}))}/></div>
          <div><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={S.label}>Telefon</label><input style={S.input} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={S.label}>Website</label><input style={S.input} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={S.label}>Adresse</label><input style={S.input} value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={S.label}>Notizen</label><textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// ACTORS
// ============================================================
function ActorsPage({ user }) {
  const [actors, setActors] = useState([]); const [loading, setLoading] = useState(true); const [showModal, setShowModal] = useState(false); const [editActor, setEditActor] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", instagram: "", tiktok: "", website: "", genre: "", notes: "" }); const [search, setSearch] = useState(""); const [genreFilter, setGenreFilter] = useState("all"); const [saving, setSaving] = useState(false);
  useEffect(() => { db.select("actors").then(d => { setActors(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const openNew = () => { setEditActor(null); setForm({ name: "", email: "", phone: "", instagram: "", tiktok: "", website: "", genre: "", notes: "" }); setShowModal(true); };
  const openEdit = (a) => { setEditActor(a); setForm({ ...a }); setShowModal(true); };
  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try { if (editActor) { await db.update("actors", form, `id=eq.${editActor.id}`); setActors(prev => prev.map(a => a.id === editActor.id ? { ...a, ...form } : a)); } else { const na = await db.insert("actors", form); setActors(prev => [...prev, na]); } setShowModal(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Löschen?")) return; try { await db.remove("actors", `id=eq.${id}`); setActors(prev => prev.filter(a => a.id !== id)); } catch (e) { alert(e.message); } };
  const filtered = actors.filter(a => { const ms = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.genre?.toLowerCase().includes(search.toLowerCase()); const mg = genreFilter === "all" || a.genre === genreFilter; return ms && mg; });
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Schauspieler</div><div style={S.pageSub}>{actors.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 8 }}><input style={{ ...S.input, maxWidth: 180 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />{user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neu</button>}</div>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","Alle"], ...GENRES.map(g => [g,g])].map(([val,lbl]) => <button key={val} style={{ padding: "5px 11px", borderRadius: 20, border: "1px solid", borderColor: genreFilter===val?"#6366F1":"#1E1E2E", background: genreFilter===val?"rgba(99,102,241,0.15)":"transparent", color: genreFilter===val?"#818CF8":"#555570", fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => setGenreFilter(val)}>{lbl}</button>)}
      </div>
      {loading ? <div style={{ textAlign:"center", padding:40, color:"#555570" }}>Lade...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(a => (
            <div key={a.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={S.avatar(40)}>{a.name?.[0]}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700, color: "#E8E8F0" }}>{a.name}</div>{a.genre && <span style={S.tag("#8B5CF6")}>{a.genre}</span>}</div>
                {user.is_admin && <div style={{ display: "flex", gap: 4 }}><button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => openEdit(a)}>✏️</button><button style={{ ...S.btn("danger"), padding: "4px 8px" }} onClick={() => handleDelete(a.id)}>✕</button></div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {a.email && <a href={`mailto:${a.email}`} style={{ fontSize: 12, color: "#818CF8", textDecoration: "none" }}>✉️ {a.email}</a>}
                {a.phone && <a href={`tel:${a.phone}`} style={{ fontSize: 12, color: "#818CF8", textDecoration: "none" }}>📞 {a.phone}</a>}
                {a.instagram && <a href={`https://instagram.com/${a.instagram.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#E1306C", textDecoration: "none" }}>📸 @{a.instagram.replace("@","")}</a>}
                {a.tiktok && <a href={`https://tiktok.com/@${a.tiktok.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#69C9D0", textDecoration: "none" }}>🎵 @{a.tiktok.replace("@","")}</a>}
                {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#818CF8", textDecoration: "none" }}>🌐 Website</a>}
                {a.notes && <div style={{ fontSize: 11, color: "#555570", fontStyle: "italic", marginTop: 2 }}>{a.notes}</div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ ...S.card, textAlign:"center", padding:40, color:"#444460", gridColumn:"1/-1" }}><div style={{ fontSize:36, marginBottom:10 }}>🎭</div><div>Keine Einträge</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop:12 }} onClick={openNew}>Ersten Schauspieler anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>{editActor ? "Bearbeiten" : "Neuer Schauspieler"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={S.label}>Name *</label><input style={S.input} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={S.label}>Telefon</label><input style={S.input} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={S.label}>Instagram</label><input style={S.input} value={form.instagram||""} onChange={e=>setForm(f=>({...f,instagram:e.target.value}))} placeholder="@username"/></div>
          <div><label style={S.label}>TikTok</label><input style={S.input} value={form.tiktok||""} onChange={e=>setForm(f=>({...f,tiktok:e.target.value}))} placeholder="@username"/></div>
          <div><label style={S.label}>Website</label><input style={S.input} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div><label style={S.label}>Genre</label><select style={S.select} value={form.genre||""} onChange={e=>setForm(f=>({...f,genre:e.target.value}))}><option value="">Wählen...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={S.label}>Notizen</label><textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// USERS / APPROVAL
// ============================================================
function UsersPage({ users, setUsers, user: currentUser }) {
  const [showModal, setShowModal] = useState(false); const [form, setForm] = useState({ name: "", email: "", role: "crew", is_admin: false }); const [saving, setSaving] = useState(false);
  const [tempPw] = useState(() => Math.random().toString(36).slice(-10));
  const pending = users.filter(u => !u.is_approved);
  const approved = users.filter(u => u.is_approved);

  const handleApprove = async (u) => {
    try { await db.update("users", { is_approved: true }, `id=eq.${u.id}`); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_approved: true } : x)); } catch (e) { alert(e.message); }
  };
  const handleReject = async (u) => {
    if (!confirm(`${u.name} ablehnen und löschen?`)) return;
    try { await db.remove("users", `id=eq.${u.id}`); setUsers(prev => prev.filter(x => x.id !== u.id)); } catch (e) { alert(e.message); }
  };
  const handleToggleAdmin = async (u) => { try { await db.update("users", { is_admin: !u.is_admin }, `id=eq.${u.id}`); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: !u.is_admin } : x)); } catch (e) { alert(e.message); } };
  const handleCreate = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    try { const u = await db.insert("users", { name: form.name, email: form.email, role: form.role, is_admin: form.is_admin, is_approved: true, must_change_password: true }); setUsers(prev => [...prev, u]); setShowModal(false); alert(`Profil erstellt!\nIn Supabase → Authentication → Add User:\nE-Mail: ${form.email}\nPasswort: ${tempPw}`); } catch (e) { alert("Fehler: " + e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={S.pageHeader}><div><div style={S.pageTitle}>Benutzer</div><div style={S.pageSub}>{approved.length} aktiv · {pending.length} ausstehend</div></div><button style={S.btn("primary")} onClick={() => setShowModal(true)}>＋ Manuell anlegen</button></div>

      {pending.length > 0 && (<>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>⏳ Ausstehende Anfragen ({pending.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {pending.map(u => (
            <div key={u.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.05)" }}>
              <div style={S.avatar(36)}>{u.name?.[0]}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0" }}>{u.name}</div><div style={{ fontSize: 11, color: "#555570" }}>{u.email} · <span style={S.roleBadge(u.role)}>{ROLE_CONFIG[u.role]?.label || u.role}</span></div></div>
              <button style={S.btn("primary")} onClick={() => handleApprove(u)}>✓ Freigeben</button>
              <button style={S.btn("danger")} onClick={() => handleReject(u)}>✕ Ablehnen</button>
            </div>
          ))}
        </div>
      </>)}

      <div style={{ fontSize: 13, fontWeight: 700, color: "#555570", marginBottom: 10 }}>Aktive Benutzer</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {approved.map(u => (
          <div key={u.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={S.avatar(36)}>{u.name?.[0]}</div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{u.name}<span style={S.roleBadge(u.role || (u.is_admin ? "admin" : "crew"))}>{ROLE_CONFIG[u.role]?.label || (u.is_admin ? "Admin" : "Crew")}</span>{u.must_change_password && <span style={S.tag("#EF4444")}>⚠ PW ändern</span>}</div>
              <div style={{ fontSize: 11, color: "#555570" }}>{u.email}</div>
            </div>
            {u.id !== currentUser.id && <button style={S.btn("outline")} onClick={() => handleToggleAdmin(u)}>{u.is_admin ? "→ Crew" : "→ Admin"}</button>}
          </div>
        ))}
      </div>

      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>Benutzer manuell anlegen</div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>Name</label><input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>Rolle</label><select style={S.select} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}><option value="crew">Crew</option><option value="actor">Schauspieler</option><option value="admin">Admin</option></select></div>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" id="ia" checked={form.is_admin} onChange={e=>setForm(f=>({...f,is_admin:e.target.checked}))}/><label htmlFor="ia" style={{ fontSize: 13, color: "#888899", cursor: "pointer" }}>Admin-Rechte</label></div>
        <div style={{ ...S.card, padding: "10px 14px", marginBottom: 18, background: "rgba(99,102,241,0.06)" }}>
          <div style={{ fontSize: 11, color: "#555570", marginBottom: 4 }}>Temporäres Passwort:</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#818CF8", letterSpacing: "1px" }}>{tempPw}</div>
          <div style={{ fontSize: 11, color: "#444460", marginTop: 4 }}>In Supabase → Authentication → Add User eingeben.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleCreate} disabled={saving}>{saving?"...":"Erstellen"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [selectedShoot, setSelectedShoot] = useState(null);
  const [shoots, setShoots] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [shotlist, setShotlist] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [userEquipment, setUserEquipment] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [u, s, p, sl, sc, cl, ue] = await Promise.all([db.select("users"), db.select("shoots"), db.select("shoot_participants"), db.select("shotlist"), db.select("schedule"), db.select("clients"), db.select("user_equipment", `user_id=eq.${user.id}`)]);
      setUsers(u); setShoots(s); setParticipants(p); setShotlist(sl); setSchedule(sc); setClients(cl); setUserEquipment(ue);
      // Note: network data loads lazily in NetworkPage
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLogin = (profile, token) => { db.setToken(token); setUser(profile); };
  const handleLogout = () => { db.clearToken(); setUser(null); setShoots([]); setParticipants([]); setShotlist([]); setSchedule([]); setUsers([]); setClients([]); setUserEquipment([]); setPage("dashboard"); };

  const handleSaveShoot = (shoot) => {
    setShoots(prev => prev.find(s => s.id === shoot.id) ? prev.map(s => s.id === shoot.id ? shoot : s) : [...prev, shoot]);
    setSelectedShoot(shoot); setPage("shoot-detail");
  };
  const handleDeleteShoot = async (id) => {
    try { await db.remove("shoots", `id=eq.${id}`); setShoots(prev => prev.filter(s => s.id !== id)); setParticipants(prev => prev.filter(p => p.shoot_id !== id)); setShotlist(prev => prev.filter(s => s.shoot_id !== id)); setSchedule(prev => prev.filter(s => s.shoot_id !== id)); setPage("shoots"); }
    catch (e) { alert("Fehler: " + e.message); }
  };

  if (!user) return <AuthPage onLogin={handleLogin} />;
  if (user.must_change_password) return <ChangePasswordPage user={user} onDone={() => setUser(u => ({ ...u, must_change_password: false }))} />;

  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visibleShoots = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id));

  const content = loading ? (
    <div style={{ textAlign: "center", padding: 60, color: C.textDim, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>Loading...</div>
  ) : (
    <>
      {page === "dashboard" && <Dashboard user={user} shoots={visibleShoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
      {page === "shoots" && <ShootsList user={user} shoots={shoots} participants={participants} clients={clients} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
      {page === "calendar" && (<div><div style={S.pageHeader}><div><div style={S.pageTitle}>Kalender</div></div></div><CalendarView shoots={visibleShoots} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} /></div>)}
      {page === "clients" && <ClientsPage user={user} />}
      {page === "actors" && <ActorsPage user={user} />}
      {page === "my-equipment" && <MyEquipmentPage user={user} userEquipment={userEquipment} setUserEquipment={setUserEquipment} />}
      {page === "network" && <NetworkPage user={user} users={users} setPage={setPage} setSelectedShoot={setSelectedShoot} setShoots={setShoots} shoots={shoots} participants={participants} setParticipants={setParticipants} />}
      {page === "users" && user.is_admin && <UsersPage users={users} setUsers={setUsers} user={user} />}
      {page === "new-shoot" && <NewShootPage user={user} clients={clients} setPage={setPage} onSave={handleSaveShoot} />}
      {page === "shoot-detail" && selectedShoot && <ShootDetail shoot={selectedShoot} setShoot={setSelectedShoot} participants={participants} setParticipants={setParticipants} shotlist={shotlist} setShotlist={setShotlist} schedule={schedule} setSchedule={setSchedule} users={users} clients={clients} user={user} setPage={setPage} onDelete={handleDeleteShoot} userEquipment={userEquipment} />}
    </>
  );

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } body { margin: 0; background: #0D0D0D; font-family: 'IBM Plex Mono', monospace; } input:focus,textarea:focus,select:focus { border-color: #E8FF47 !important; box-shadow: 0 0 0 2px rgba(232,255,71,0.1); } ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-track { background: #0D0D0D; } ::-webkit-scrollbar-thumb { background: #333; } button:hover { opacity: 0.82; } a:hover { opacity: 0.75; } ::selection { background: #E8FF47; color: #000; }`}</style>
      <Layout page={page} setPage={setPage} user={user} onLogout={handleLogout}>{content}</Layout>
    </>
  );
}

// ============================================================
// NETWORK PAGE — Gruppen / Netzwerke
// ============================================================
function NetworkPage({ user, users, setPage, setSelectedShoot, setShoots, shoots, participants, setParticipants }) {
  const [networks, setNetworks] = useState([]);
  const [myMemberships, setMyMemberships] = useState([]);
  const [applications, setApplications] = useState([]);
  const [shootApplications, setShootApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(user.is_admin ? "manage" : "discover");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(null);
  const [networkForm, setNetworkForm] = useState({ name: "", description: "", is_public: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [nw, mem, apps, shootApps] = await Promise.all([
        db.select("networks"),
        db.select("network_members", `user_id=eq.${user.id}`),
        db.select("network_members"),
        db.select("shoot_applications", user.is_admin ? "" : `applicant_id=eq.${user.id}`)
      ]);
      setNetworks(nw);
      setMyMemberships(mem);
      setApplications(apps);
      setShootApplications(shootApps);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const myNetworkIds = new Set(myMemberships.filter(m => m.status === "active").map(m => m.network_id));
  const myNetworks = networks.filter(n => myNetworkIds.has(n.id));
  const publicNetworks = networks.filter(n => n.is_public && !myNetworkIds.has(n.id));

  // Shoots visible in my networks
  const networkShootLinks = applications.filter(a => [...myNetworkIds].includes(a.network_id));
  const networkShootIds = new Set(networkShootLinks.map(a => a.shoot_id).filter(Boolean));
  const networkShoots = shoots.filter(s => s.is_published && (networkShootIds.has(s.id) || user.is_admin));

  const handleCreateNetwork = async () => {
    if (!networkForm.name) return;
    setSaving(true);
    try {
      const nw = await db.insert("networks", { ...networkForm, created_by: user.id });
      await db.insert("network_members", { network_id: nw.id, user_id: user.id, role: "admin", status: "active" });
      setNetworks(prev => [...prev, nw]);
      setMyMemberships(prev => [...prev, { network_id: nw.id, user_id: user.id, role: "admin", status: "active" }]);
      setShowCreateModal(false); setNetworkForm({ name: "", description: "", is_public: true });
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const handleJoinNetwork = async (networkId) => {
    try {
      const mem = await db.insert("network_members", { network_id: networkId, user_id: user.id, role: "member", status: "pending" });
      setMyMemberships(prev => [...prev, mem]);
      alert("Beitrittsanfrage gesendet!");
    } catch (e) { alert(e.message); }
  };

  const handleApproveApplication = async (app) => {
    try {
      await db.update("shoot_applications", { status: "approved" }, `id=eq.${app.id}`);
      const np = await db.insert("shoot_participants", { shoot_id: app.shoot_id, user_id: app.applicant_id, role_on_shoot: app.proposed_role || "Crew", attendance_status: "confirmed" });
      setShootApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: "approved" } : a));
      setParticipants(prev => [...prev, np]);
    } catch (e) { alert(e.message); }
  };

  const handleRejectApplication = async (app) => {
    try {
      await db.update("shoot_applications", { status: "rejected" }, `id=eq.${app.id}`);
      setShootApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: "rejected" } : a));
    } catch (e) { alert(e.message); }
  };

  const handleApproveNetworkMember = async (mem) => {
    try {
      await db.update("network_members", { status: "active" }, `id=eq.${mem.id}`);
      setApplications(prev => prev.map(m => m.id === mem.id ? { ...m, status: "active" } : m));
    } catch (e) { alert(e.message); }
  };

  const handleApplyToShoot = async (shoot) => {
    const alreadyApplied = shootApplications.find(a => a.shoot_id === shoot.id && a.applicant_id === user.id);
    if (alreadyApplied) { alert("Anfrage bereits gesendet."); return; }
    const role = window.prompt("Welche Rolle möchtest du übernehmen?", "Crew");
    if (role === null) return;
    try {
      const app = await db.insert("shoot_applications", { shoot_id: shoot.id, applicant_id: user.id, proposed_role: role, status: "pending", message: "" });
      setShootApplications(prev => [...prev, app]);
      alert("Anfrage gesendet! Der Admin wird dich benachrichtigen.");
    } catch (e) { alert(e.message); }
  };

  const handleInviteUser = async (networkId, userId) => {
    try {
      await db.insert("network_members", { network_id: networkId, user_id: userId, role: "member", status: "active" });
      setApplications(prev => [...prev, { network_id: networkId, user_id: userId, role: "member", status: "active" }]);
      setShowInviteModal(null);
    } catch (e) { alert(e.message); }
  };

  const handlePublishShoot = async (shootId, networkId) => {
    try {
      await db.update("shoots", { is_published: true }, `id=eq.${shootId}`);
      await db.insert("shoot_network_links", { shoot_id: shootId, network_id: networkId });
      setShoots(prev => prev.map(s => s.id === shootId ? { ...s, is_published: true } : s));
      alert("Shoot im Netzwerk ausgeschrieben!");
    } catch (e) { alert(e.message); }
  };

  // Pending shoot applications for my shoots (admin view)
  const myShootIds = new Set(shoots.filter(s => s.created_by === user.id).map(s => s.id));
  const pendingShootApps = shootApplications.filter(a => myShootIds.has(a.shoot_id) && a.status === "pending");

  // Pending network member requests for my networks
  const myAdminNetworkIds = new Set(myMemberships.filter(m => m.role === "admin" && m.status === "active").map(m => m.network_id));
  const pendingNetworkMembers = applications.filter(a => myAdminNetworkIds.has(a.network_id) && a.status === "pending");

  const pendingTotal = pendingShootApps.length + pendingNetworkMembers.length;

  const tabs = user.is_admin
    ? [["manage","Meine Netzwerke"],["discover","Entdecken"],["shoots","Ausschreibungen"],["requests",`Anfragen${pendingTotal > 0 ? ` (${pendingTotal})` : ""}`]]
    : [["discover","Netzwerke"],["shoots","Shoot-Ausschreibungen"],["requests","Meine Anfragen"]];

  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Netzwerk</div><div style={S.pageSub}>{myNetworks.length} Netzwerke · {networkShoots.length} ausgeschriebene Shoots</div></div>
        {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowCreateModal(true)}>＋ Netzwerk</button>}
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {tabs.map(([id, lbl]) => (
          <button key={id} style={{ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 11, fontWeight: tab===id?700:400, color: tab===id?C.accent:C.textDim, borderBottom: tab===id?`2px solid ${C.accent}`:"2px solid transparent", marginBottom: -1, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" }} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {loading && <div style={{ color: C.textDim, fontSize: 12, padding: 20 }}>Lade...</div>}

      {/* MANAGE — My Networks */}
      {tab === "manage" && !loading && (
        <div>
          {myNetworks.length === 0 && (
            <div style={{ ...S.card, textAlign: "center", padding: 48, color: C.textDim }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🌐</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Noch kein Netzwerk</div>
              <div style={{ fontSize: 11, marginBottom: 16 }}>Erstelle ein Netzwerk und lade Schauspieler & Crew ein.</div>
              <button style={S.btn("primary")} onClick={() => setShowCreateModal(true)}>Netzwerk erstellen</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {myNetworks.map(nw => {
              const members = applications.filter(a => a.network_id === nw.id && a.status === "active");
              const isAdmin = myAdminNetworkIds.has(nw.id);
              return (
                <div key={nw.id} style={S.card}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{nw.name}</div>
                      {nw.description && <div style={{ fontSize: 12, color: C.textMid }}>{nw.description}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <span style={S.tag(C.accent)}>{members.length} Mitglieder</span>
                        {nw.is_public && <span style={S.tag(C.green)}>Öffentlich</span>}
                        {isAdmin && <span style={S.tag(C.amber)}>Admin</span>}
                      </div>
                    </div>
                    {isAdmin && <button style={S.btn("outline")} onClick={() => setShowInviteModal(nw)}>＋ Einladen</button>}
                  </div>
                  {isAdmin && user.is_admin && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Shoots im Netzwerk ausschreiben</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {shoots.filter(s => !s.is_published && s.created_by === user.id).slice(0,5).map(s => (
                          <button key={s.id} style={{ ...S.btn("ghost"), fontSize: 10 }} onClick={() => handlePublishShoot(s.id, nw.id)}>📢 {s.title}</button>
                        ))}
                        {shoots.filter(s => !s.is_published && s.created_by === user.id).length === 0 && <span style={{ fontSize: 11, color: C.textDim }}>Alle Shoots bereits ausgeschrieben</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DISCOVER */}
      {tab === "discover" && !loading && (
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>Öffentliche Netzwerke denen du beitreten kannst:</div>
          {publicNetworks.length === 0 && <div style={{ ...S.card, padding: 32, textAlign: "center", color: C.textDim, fontSize: 12 }}>Keine weiteren öffentlichen Netzwerke verfügbar.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {publicNetworks.map(nw => {
              const members = applications.filter(a => a.network_id === nw.id && a.status === "active");
              const pendingJoin = myMemberships.find(m => m.network_id === nw.id && m.status === "pending");
              return (
                <div key={nw.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{nw.name}</div>
                    {nw.description && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{nw.description}</div>}
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{members.length} Mitglieder</div>
                  </div>
                  {pendingJoin
                    ? <span style={S.tag(C.amber)}>⏳ Ausstehend</span>
                    : <button style={S.btn("primary")} onClick={() => handleJoinNetwork(nw.id)}>Beitreten</button>
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SHOOT AUSSCHREIBUNGEN */}
      {tab === "shoots" && !loading && (
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>Offene Shoots in deinen Netzwerken:</div>
          {networkShoots.length === 0 && (
            <div style={{ ...S.card, padding: 40, textAlign: "center", color: C.textDim }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 12 }}>Keine ausgeschriebenen Shoots in deinen Netzwerken.</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {networkShoots.map(shoot => {
              const alreadyApplied = shootApplications.find(a => a.shoot_id === shoot.id && a.applicant_id === user.id);
              const alreadyIn = participants.find(p => p.shoot_id === shoot.id && p.user_id === user.id);
              const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
              return (
                <div key={shoot.id} style={S.card}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{shoot.title}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <span style={S.badge(shoot.status)}>{sc.label}</span>
                        <span style={{ fontSize: 11, color: C.textMid }}>📅 {fmtRange(shoot.date_start, shoot.date_end)}</span>
                        {shoot.location && <span style={{ fontSize: 11, color: C.textMid }}>📍 {shoot.location}</span>}
                      </div>
                      {shoot.notes && <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>{shoot.notes.slice(0,120)}{shoot.notes.length > 120 ? "..." : ""}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {alreadyIn ? <span style={S.tag(C.green)}>✓ Dabei</span>
                        : alreadyApplied ? <span style={{ ...S.tag(C.amber), whiteSpace: "nowrap" }}>⏳ {alreadyApplied.status === "rejected" ? "Abgelehnt" : "Anfrage gesendet"}</span>
                        : <button style={S.btn("primary")} onClick={() => handleApplyToShoot(shoot)}>Anfragen</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ANFRAGEN */}
      {tab === "requests" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Pending shoot applications — admin sees incoming, user sees own */}
          {user.is_admin && pendingShootApps.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Shoot-Anfragen ({pendingShootApps.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingShootApps.map(app => {
                  const applicant = users.find(u => u.id === app.applicant_id) || { name: "Unbekannt" };
                  const shoot = shoots.find(s => s.id === app.shoot_id) || { title: "Unbekannt" };
                  return (
                    <div key={app.id} style={{ ...S.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: `2px solid ${C.accent}` }}>
                      <div style={S.avatar(32)}>{applicant.name?.[0]}</div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{applicant.name}</div>
                        <div style={{ fontSize: 11, color: C.textMid }}>möchte bei <strong style={{ color: C.text }}>{shoot.title}</strong> mitmachen</div>
                        {app.proposed_role && <div style={{ fontSize: 10, color: C.textDim }}>Rolle: {app.proposed_role}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={S.btn("primary")} onClick={() => handleApproveApplication(app)}>✓ Aufnehmen</button>
                        <button style={S.btn("danger")} onClick={() => handleRejectApplication(app)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending network member requests */}
          {pendingNetworkMembers.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.amber, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Netzwerk-Beitrittsanfragen ({pendingNetworkMembers.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingNetworkMembers.map(mem => {
                  const u = users.find(u => u.id === mem.user_id) || { name: "Unbekannt" };
                  const nw = networks.find(n => n.id === mem.network_id) || { name: "Unbekannt" };
                  return (
                    <div key={mem.id} style={{ ...S.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={S.avatar(32)}>{u.name?.[0]}</div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: C.textMid }}>möchte <strong style={{ color: C.text }}>{nw.name}</strong> beitreten</div>
                        <span style={S.roleBadge(u.role)}>{ROLE_CONFIG[u.role]?.label || u.role}</span>
                      </div>
                      <button style={S.btn("primary")} onClick={() => handleApproveNetworkMember(mem)}>✓ Aufnehmen</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User's own applications */}
          {!user.is_admin && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Meine Anfragen</div>
              {shootApplications.length === 0 && <div style={{ ...S.card, padding: 24, color: C.textDim, fontSize: 12, textAlign: "center" }}>Noch keine Anfragen gesendet.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shootApplications.map(app => {
                  const shoot = shoots.find(s => s.id === app.shoot_id) || { title: "Unbekannt" };
                  const statusMap = { pending: { label: "Ausstehend", color: C.amber }, approved: { label: "Angenommen", color: C.green }, rejected: { label: "Abgelehnt", color: C.danger } };
                  const st = statusMap[app.status] || statusMap.pending;
                  return (
                    <div key={app.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{shoot.title}</div>
                        <div style={{ fontSize: 11, color: C.textDim }}>Rolle: {app.proposed_role || "Crew"}</div>
                      </div>
                      <span style={{ ...S.tag(st.color) }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingTotal === 0 && user.is_admin && <div style={{ ...S.card, padding: 32, textAlign: "center", color: C.textDim, fontSize: 12 }}>Keine ausstehenden Anfragen.</div>}
        </div>
      )}

      {/* CREATE NETWORK MODAL */}
      {showCreateModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>Netzwerk erstellen</div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>Name *</label><input style={S.input} value={networkForm.name} onChange={e=>setNetworkForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Starantor Crew, Action-Team..."/></div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>Beschreibung</label><textarea style={S.textarea} value={networkForm.description} onChange={e=>setNetworkForm(f=>({...f,description:e.target.value}))} placeholder="Worum geht es in diesem Netzwerk?"/></div>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" id="pub" checked={networkForm.is_public} onChange={e=>setNetworkForm(f=>({...f,is_public:e.target.checked}))}/><label htmlFor="pub" style={{ fontSize: 12, color: C.textMid, cursor: "pointer" }}>Öffentlich (andere User können beitreten)</label></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleCreateNetwork} disabled={saving}>{saving?"...":"Erstellen"}</button><button style={S.btn("ghost")} onClick={()=>setShowCreateModal(false)}>Abbrechen</button></div>
      </div></div>)}

      {/* INVITE USER MODAL */}
      {showInviteModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>User einladen — {showInviteModal.name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {users.filter(u => u.is_approved && !applications.find(a => a.network_id === showInviteModal.id && a.user_id === u.id)).map(u => (
            <div key={u.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
              <div style={S.avatar(28)}>{u.name?.[0]}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{u.name}</div><div style={{ fontSize: 10, color: C.textDim }}>{u.email}</div></div>
              <button style={S.btn("primary")} onClick={() => handleInviteUser(showInviteModal.id, u.id)}>Einladen</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}><button style={S.btn("ghost")} onClick={()=>setShowInviteModal(null)}>Schliessen</button></div>
      </div></div>)}
    </div>
  );
}
