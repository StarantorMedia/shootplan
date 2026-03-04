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
const GENRES = ["Action","Comedy","Drama","Horror","Romance","Thriller","Documentary","Commercial","Music Video","Other"];
const fmt = (d) => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtRange = (s, e) => { if (!s) return "—"; if (!e || s === e) return fmt(s); return `${fmt(s)} – ${fmt(e)}`; };

const S = {
  root: { fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#0A0A0F", color: "#E8E8F0", minHeight: "100vh", display: "flex" },
  sidebar: { width: 240, minHeight: "100vh", background: "#111118", borderRight: "1px solid #1E1E2E", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100, overflowY: "auto" },
  logo: { padding: "28px 24px 20px", borderBottom: "1px solid #1E1E2E" },
  logoMark: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 32, height: 32, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 },
  logoText: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", color: "#F0F0FA" },
  logoSub: { fontSize: 10, color: "#555570", letterSpacing: "0.8px", textTransform: "uppercase", marginTop: 2 },
  nav: { padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  navSection: { fontSize: 10, fontWeight: 600, color: "#444460", letterSpacing: "0.8px", textTransform: "uppercase", padding: "12px 12px 6px" },
  navItem: (a) => ({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: a ? "rgba(99,102,241,0.15)" : "transparent", color: a ? "#818CF8" : "#888899", fontSize: 14, fontWeight: a ? 600 : 400, border: a ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent" }),
  navIcon: { fontSize: 15, width: 20, textAlign: "center" },
  sidebarUser: { padding: "16px", borderTop: "1px solid #1E1E2E", display: "flex", alignItems: "center", gap: 10 },
  avatar: (sz = 32) => ({ width: sz, height: sz, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz * 0.38, fontWeight: 700, color: "white", flexShrink: 0 }),
  main: { marginLeft: 240, flex: 1, padding: "32px", maxWidth: "calc(100vw - 240px)", boxSizing: "border-box" },
  pageHeader: { marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "#F0F0FA", marginBottom: 4 },
  pageSub: { fontSize: 14, color: "#555570" },
  btn: (v = "primary") => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: v === "ghost" ? "7px 14px" : "9px 18px", borderRadius: 8, border: v === "outline" ? "1px solid #2A2A3E" : "none", background: v === "primary" ? "linear-gradient(135deg,#6366F1,#7C3AED)" : v === "danger" ? "rgba(239,68,68,0.15)" : v === "outline" ? "transparent" : "rgba(255,255,255,0.04)", color: v === "primary" ? "white" : v === "danger" ? "#EF4444" : v === "outline" ? "#888899" : "#818CF8", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }),
  card: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px" },
  cardHover: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px", cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  statCard: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px 24px" },
  statValue: { fontSize: 32, fontWeight: 700, letterSpacing: "-1px", color: "#F0F0FA" },
  statLabel: { fontSize: 12, color: "#555570", marginTop: 4, letterSpacing: "0.3px" },
  badge: (s) => { const c = STATUS_CONFIG[s] || { color: "#888", bg: "rgba(128,128,128,0.1)", dot: "#888" }; return { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg }; },
  attendBadge: (s) => { const c = ATTEND_CONFIG[s] || ATTEND_CONFIG.open; return { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg }; },
  input: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" },
  textarea: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80 },
  select: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer" },
  label: { fontSize: 12, fontWeight: 600, color: "#555570", marginBottom: 6, display: "block", letterSpacing: "0.4px", textTransform: "uppercase" },
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalBox: { background: "#111118", border: "1px solid #2A2A3E", borderRadius: 16, padding: "28px", width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 20 },
  tag: (color = "#6366F1") => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color, background: color + "22" }),
  toggle: (a) => ({ padding: "7px 16px", borderRadius: 7, border: "none", background: a ? "#1E1E2E" : "transparent", color: a ? "#E8E8F0" : "#555570", fontSize: 13, fontWeight: a ? 600 : 400, cursor: "pointer" }),
  err: { fontSize: 12, color: "#EF4444", padding: "10px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6, marginBottom: 14 },
  driveBtn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, border: "1px solid #2A2A3E", background: "rgba(99,102,241,0.08)", color: "#818CF8", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none" },
};

// ============================================================
// ICS EXPORT HELPER
// ============================================================
function exportToICS(shoots) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDt = (dateStr, timeStr) => {
    const d = new Date(dateStr + (timeStr ? "T" + timeStr : ""));
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ShootPlan//DE"];
  shoots.forEach(s => {
    const startDate = s.date_start || s.date;
    const endDate = s.date_end || s.date;
    const dtStart = fmtDt(startDate, s.start_time || "09:00");
    const dtEnd = fmtDt(endDate, s.end_time || "18:00");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:shoot-${s.id}@shootplan`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${s.title}`);
    lines.push(`LOCATION:${s.location || ""}`);
    lines.push(`DESCRIPTION:${(s.notes || "").replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "shootplan.ics"; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// LOGIN
// ============================================================
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!email || !password) { setError("Bitte E-Mail und Passwort eingeben"); return; }
    setLoading(true); setError("");
    try {
      const data = await db.signIn(email, password);
      db.setToken(data.access_token);
      const profiles = await db.select("users", `email=eq.${encodeURIComponent(email)}`);
      if (!profiles.length) throw new Error("Kein Benutzerprofil gefunden.");
      onLogin(profiles[0], data.access_token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 52, height: 52, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>🎬</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", color: "#F0F0FA" }}>ShootPlan</div>
          <div style={{ fontSize: 13, color: "#555570", marginTop: 6 }}>Professionelle Videoproduktions-Planung</div>
        </div>
        <div style={{ ...S.card, padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Anmelden</div>
          <div style={{ marginBottom: 16 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} /></div>
          <div style={{ marginBottom: 20 }}><label style={S.label}>Passwort</label><input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} /></div>
          {error && <div style={S.err}>{error}</div>}
          <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={handleSubmit} disabled={loading}>{loading ? "Anmelden..." : "Anmelden →"}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordPage({ user, onDone }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [error, setError] = useState("");
  const handleSave = async () => { if (pw.length < 8) { setError("Mindestens 8 Zeichen"); return; } if (pw !== pw2) { setError("Passwörter stimmen nicht überein"); return; } try { await db.update("users", { must_change_password: false }, `id=eq.${user.id}`); onDone(); } catch (e) { setError(e.message); } };
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}><div style={{ fontSize: 24, fontWeight: 800, color: "#F0F0FA" }}>Neues Passwort</div></div>
        <div style={{ ...S.card, padding: 28 }}>
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
// SIDEBAR
// ============================================================
function Sidebar({ page, setPage, user, onLogout }) {
  const adminNav = [
    { section: "Produktion" },
    { id: "dashboard", icon: "⬛", label: "Dashboard" },
    { id: "shoots", icon: "🎬", label: "Alle Shoots" },
    { id: "calendar", icon: "📅", label: "Kalender" },
    { section: "Datenbanken" },
    { id: "clients", icon: "🏢", label: "Kunden" },
    { id: "actors", icon: "🎭", label: "Schauspieler" },
    { section: "Verwaltung" },
    { id: "users", icon: "👥", label: "Benutzer" },
  ];
  const crewNav = [
    { section: "Produktion" },
    { id: "dashboard", icon: "⬛", label: "Dashboard" },
    { id: "shoots", icon: "🎬", label: "Meine Shoots" },
    { id: "calendar", icon: "📅", label: "Kalender" },
  ];
  const nav = user.is_admin ? adminNav : crewNav;
  return (
    <div style={S.sidebar}>
      <div style={S.logo}><div style={S.logoMark}><div style={S.logoIcon}>🎬</div><div><div style={S.logoText}>ShootPlan</div><div style={S.logoSub}>Production Suite</div></div></div></div>
      <div style={S.nav}>
        {nav.map((item, i) => item.section
          ? <div key={i} style={S.navSection}>{item.section}</div>
          : <div key={item.id} style={S.navItem(page === item.id || page.startsWith(item.id + "-"))} onClick={() => setPage(item.id)}><span style={S.navIcon}>{item.icon}</span><span>{item.label}</span></div>
        )}
      </div>
      <div style={S.sidebarUser}>
        <div style={S.avatar(34)}>{user.name?.[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div><div style={{ fontSize: 11, color: "#444460" }}>{user.is_admin ? "Admin" : "Crew"}</div></div>
        <button style={{ background: "none", border: "none", color: "#444460", cursor: "pointer", fontSize: 16 }} onClick={onLogout}>↩</button>
      </div>
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
  const upcoming = visible.filter(s => new Date(s.date_end || s.date_start || s.date) >= now && s.status !== "cancelled");
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Guten Tag, {user.name?.split(" ")[0]} 👋</div><div style={S.pageSub}>{now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div></div>
        {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neuer Shoot</button>}
      </div>
      <div style={{ ...S.grid3, marginBottom: 28 }}>
        <div style={S.statCard}><div style={S.statValue}>{upcoming.length}</div><div style={S.statLabel}>BEVORSTEHEND</div></div>
        <div style={S.statCard}><div style={S.statValue}>{visible.filter(s => s.status === "confirmed").length}</div><div style={S.statLabel}>BESTÄTIGT</div></div>
        <div style={S.statCard}><div style={S.statValue}>{visible.filter(s => { const d = new Date(s.date_start || s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length}</div><div style={S.statLabel}>DIESEN MONAT</div></div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#E8E8F0" }}>Nächste Shoots</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {upcoming.slice(0, 6).map(shoot => {
          const sp = participants.filter(p => p.shoot_id === shoot.id);
          const myP = sp.find(p => p.user_id === user.id);
          const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
          return (
            <div key={shoot.id} style={{ ...S.cardHover, display: "flex", alignItems: "center", gap: 16 }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
              <div style={{ width: 4, height: 48, borderRadius: 2, background: sc.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0", marginBottom: 3 }}>{shoot.title}</div><div style={{ fontSize: 12, color: "#555570" }}>{fmtRange(shoot.date_start || shoot.date, shoot.date_end)} · {shoot.location}</div></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                <span style={S.badge(shoot.status)}><span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} /> {sc.label}</span>
              </div>
            </div>
          );
        })}
        {upcoming.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#444460" }}><div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div><div>Keine bevorstehenden Shoots</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 16 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button>}</div>}
      </div>
    </div>
  );
}

// ============================================================
// CALENDAR VIEW
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
      const start = new Date(s.date_start || s.date);
      const end = new Date(s.date_end || s.date_start || s.date);
      return ds >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && ds <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#E8E8F0" }}>{date.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn("outline")} onClick={() => exportToICS(shoots)} title="Als .ics exportieren">📥 Kalender exportieren</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month-1, 1))}>‹</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date())}>Heute</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month+1, 1))}>›</button>
        </div>
      </div>
      <div style={{ ...S.card, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 8 }}>
          {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#444460", padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {cells.map((day, idx) => (
            <div key={idx} style={{ minHeight: 76, background: isToday(day) ? "rgba(99,102,241,0.1)" : "#0A0A0F", borderRadius: 8, padding: "6px 8px", border: isToday(day) ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent" }}>
              {day && (<>
                <div style={{ fontSize: 13, fontWeight: isToday(day) ? 800 : 400, color: isToday(day) ? "#818CF8" : "#555570", marginBottom: 4 }}>{day}</div>
                {getShootsForDay(day).map(s => { const c = STATUS_CONFIG[s.status] || STATUS_CONFIG.planned; return <div key={s.id} style={{ fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: c.color+"22", color: c.color, marginBottom: 2, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => { setSelectedShoot(s); setPage("shoot-detail"); }}>{s.title}</div>; })}
              </>)}
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
function ShootsList({ user, shoots, participants, setPage, setSelectedShoot }) {
  const [view, setView] = useState("list"); const [filter, setFilter] = useState("all"); const [search, setSearch] = useState("");
  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id));
  const filtered = (filter === "all" ? visible : visible.filter(s => s.status === filter)).filter(s => !search || s.title?.toLowerCase().includes(search.toLowerCase()) || s.location?.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => new Date(a.date_start || a.date) - new Date(b.date_start || b.date));
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>{user.is_admin ? "Alle Shoots" : "Meine Shoots"}</div><div style={S.pageSub}>{sorted.length} Produktionen</div></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...S.input, width: 200 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn("outline")} onClick={() => exportToICS(sorted)}>📥 Export</button>
          <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 3, display: "flex" }}>
            <button style={S.toggle(view === "list")} onClick={() => setView("list")}>☰ Liste</button>
            <button style={S.toggle(view === "calendar")} onClick={() => setView("calendar")}>📅 Kalender</button>
          </div>
          {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neu</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[["all","Alle"],["planned","Geplant"],["confirmed","Bestätigt"],["cancelled","Abgesagt"]].map(([val,lbl]) => (
          <button key={val} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: filter===val?"#6366F1":"#1E1E2E", background: filter===val?"rgba(99,102,241,0.15)":"transparent", color: filter===val?"#818CF8":"#555570", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setFilter(val)}>{lbl}</button>
        ))}
      </div>
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(shoot => {
            const sp = participants.filter(p => p.shoot_id === shoot.id);
            const myP = sp.find(p => p.user_id === user.id);
            const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
            const sick = sp.filter(p => p.attendance_status === "sick").length;
            const startDate = new Date(shoot.date_start || shoot.date);
            const isMultiDay = shoot.date_end && shoot.date_end !== shoot.date_start;
            return (
              <div key={shoot.id} style={{ ...S.cardHover, display: "flex", gap: 16, alignItems: "center" }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
                <div style={{ minWidth: 52, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#F0F0FA" }}>{startDate.getDate().toString().padStart(2,"0")}</div>
                  <div style={{ fontSize: 11, color: "#444460", textTransform: "uppercase" }}>{startDate.toLocaleString("de-DE",{month:"short"})}</div>
                  {isMultiDay && <div style={{ fontSize: 9, color: "#6366F1", fontWeight: 700 }}>MEHRERE TAGE</div>}
                </div>
                <div style={{ width: 1, height: 40, background: "#1E1E2E" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0", marginBottom: 3 }}>{shoot.title}</div>
                  <div style={{ fontSize: 12, color: "#555570" }}>📍 {shoot.location} · {fmtRange(shoot.date_start || shoot.date, shoot.date_end)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  {sick > 0 && <span style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4 }}>🤒 {sick}</span>}
                  {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                  <span style={S.badge(shoot.status)}><span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot, display: "inline-block" }} /> {sc.label}</span>
                  <div style={{ fontSize: 12, color: "#444460" }}>{sp.length} 👤</div>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 48, color: "#444460" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div><div style={{ fontSize: 16, fontWeight: 600 }}>Keine Shoots gefunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button>}</div>}
        </div>
      ) : <CalendarView shoots={sorted} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} />}
    </div>
  );
}

// ============================================================
// SHOOT DETAIL
// ============================================================
function ShootDetail({ shoot, setShoot, participants, setParticipants, shotlist, setShotlist, schedule, setSchedule, users, user, setPage, onDelete }) {
  const [tab, setTab] = useState("overview"); const [editMode, setEditMode] = useState(false); const [form, setForm] = useState({ ...shoot }); const [saving, setSaving] = useState(false);
  const [showAddP, setShowAddP] = useState(false); const [addUserId, setAddUserId] = useState(""); const [addRole, setAddRole] = useState("");
  const [showAddLink, setShowAddLink] = useState(false); const [linkForm, setLinkForm] = useState({ label: "", url: "", type: "drive" });

  const sp = participants.filter(p => p.shoot_id === shoot.id);
  const shots = shotlist.filter(s => s.shoot_id === shoot.id);
  const sched = [...schedule.filter(s => s.shoot_id === shoot.id)].sort((a,b) => a.time.localeCompare(b.time));
  const myP = sp.find(p => p.user_id === user.id);
  const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
  const links = (() => { try { return JSON.parse(shoot.shared_links || "[]"); } catch { return []; } })();

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.update("shoots", { title: form.title, location: form.location, date_start: form.date_start, date_end: form.date_end, start_time: form.start_time, end_time: form.end_time, budget: form.budget || null, notes: form.notes, status: form.status, shared_links: form.shared_links || "[]" }, `id=eq.${shoot.id}`);
      setShoot({ ...shoot, ...form }); setEditMode(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const handleAddLink = async () => {
    if (!linkForm.url) return;
    const updated = JSON.stringify([...links, { ...linkForm, id: Date.now() }]);
    try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); setShowAddLink(false); setLinkForm({ label: "", url: "", type: "drive" }); } catch (e) { alert(e.message); }
  };
  const handleRemoveLink = async (id) => {
    const updated = JSON.stringify(links.filter(l => l.id !== id));
    try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); } catch (e) { alert(e.message); }
  };

  const handleStatusChange = async (pId, val) => { try { await db.update("shoot_participants", { attendance_status: val }, `id=eq.${pId}`); setParticipants(prev => prev.map(p => p.id === pId ? { ...p, attendance_status: val } : p)); } catch (e) { alert(e.message); } };
  const handleAddP = async () => { if (!addUserId) return; try { const np = await db.insert("shoot_participants", { shoot_id: shoot.id, user_id: addUserId, role_on_shoot: addRole || "Crew", attendance_status: "open", absence_reason: "" }); setParticipants(prev => [...prev, np]); setShowAddP(false); setAddUserId(""); setAddRole(""); } catch (e) { alert(e.message); } };
  const handleRemoveP = async (pId) => { try { await db.remove("shoot_participants", `id=eq.${pId}`); setParticipants(prev => prev.filter(p => p.id !== pId)); } catch (e) { alert(e.message); } };
  const addShot = async () => { try { const s = await db.insert("shotlist", { shoot_id: shoot.id, title: "Neuer Shot", description: "", camera_setting: "", duration: "", status: "open" }); setShotlist(prev => [...prev, s]); } catch (e) { alert(e.message); } };
  const updateShot = async (id, field, val) => { setShotlist(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s)); try { await db.update("shotlist", { [field]: val }, `id=eq.${id}`); } catch (e) {} };
  const deleteShot = async (id) => { try { await db.remove("shotlist", `id=eq.${id}`); setShotlist(prev => prev.filter(s => s.id !== id)); } catch (e) { alert(e.message); } };
  const addSched = async () => { try { const e = await db.insert("schedule", { shoot_id: shoot.id, time: "09:00", title: "Neuer Eintrag", description: "" }); setSchedule(prev => [...prev, e]); } catch (e) { alert(e.message); } };
  const updateSched = async (id, field, val) => { setSchedule(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e)); try { await db.update("schedule", { [field]: val }, `id=eq.${id}`); } catch (e) {} };
  const deleteSched = async (id) => { try { await db.remove("schedule", `id=eq.${id}`); setSchedule(prev => prev.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };

  const linkIcon = (type) => type === "drive" ? "📁" : type === "onedrive" ? "☁️" : type === "dropbox" ? "📦" : "🔗";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <button style={{ ...S.btn("ghost"), padding: "6px 10px" }} onClick={() => setPage("shoots")}>← Zurück</button>
          <div>
            {editMode ? <input style={{ ...S.input, fontSize: 22, fontWeight: 700, padding: "4px 8px", width: 340, marginBottom: 6 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /> : <div style={{ fontSize: 22, fontWeight: 700, color: "#F0F0FA", marginBottom: 4 }}>{shoot.title}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={S.badge(shoot.status)}><span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot, display: "inline-block" }} /> {sc.label}</span>
              <span style={{ fontSize: 13, color: "#555570" }}>{fmtRange(shoot.date_start || shoot.date, shoot.date_end)}</span>
              {shoot.start_time && <span style={{ fontSize: 13, color: "#555570" }}>{shoot.start_time}–{shoot.end_time}</span>}
              <span style={{ fontSize: 13, color: "#555570" }}>📍 {shoot.location}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={S.btn("outline")} onClick={() => exportToICS([shoot])}>📥 .ics</button>
          {user.is_admin && !editMode && <button style={S.btn("outline")} onClick={() => setEditMode(true)}>✏️ Bearbeiten</button>}
          {editMode && <><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "..." : "Speichern"}</button><button style={S.btn("ghost")} onClick={() => { setEditMode(false); setForm({ ...shoot }); }}>Abbrechen</button></>}
          {user.is_admin && <button style={S.btn("danger")} onClick={() => onDelete(shoot.id)}>Löschen</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid #1E1E2E", flexWrap: "wrap" }}>
        {[["overview","Übersicht"],["documents","Dokumente"],["shotlist","Shotlist"],["schedule","Tagesplan"],["crew","Crew"]].map(([id,lbl]) => (
          <button key={id} style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: tab===id?700:400, color: tab===id?"#818CF8":"#555570", borderBottom: tab===id?"2px solid #6366F1":"2px solid transparent", marginBottom: -1 }} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={S.grid2}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={S.card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", marginBottom: 14, letterSpacing: "0.5px", textTransform: "uppercase" }}>Details</div>
              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div><label style={S.label}>Titel</label><input style={S.input} value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
                  <div><label style={S.label}>Location</label><input style={S.input} value={form.location||""} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
                  <div style={S.grid2}>
                    <div><label style={S.label}>Startdatum</label><input style={S.input} type="date" value={form.date_start||""} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
                    <div><label style={S.label}>Enddatum</label><input style={S.input} type="date" value={form.date_end||""} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
                  </div>
                  <div style={S.grid2}>
                    <div><label style={S.label}>Startzeit</label><input style={S.input} type="time" value={form.start_time||""} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
                    <div><label style={S.label}>Endzeit</label><input style={S.input} type="time" value={form.end_time||""} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
                  </div>
                  <div><label style={S.label}>Budget (€)</label><input style={S.input} type="number" value={form.budget||""} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
                  <div><label style={S.label}>Status</label><select style={S.select} value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["📅 Datum", fmtRange(shoot.date_start||shoot.date, shoot.date_end)], ["🕒 Zeit", shoot.start_time?`${shoot.start_time} – ${shoot.end_time}`:"—"], ["📍 Location", shoot.location||"—"], ["💶 Budget", shoot.budget?`€ ${Number(shoot.budget).toLocaleString("de-DE")}`:"—"]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#555570"}}>{k}</span><span style={{fontSize:13,color:"#E8E8F0",fontWeight:500}}>{v}</span></div>
                  ))}
                </div>
              )}
            </div>
            {myP && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", marginBottom: 14, letterSpacing: "0.5px", textTransform: "uppercase" }}>Mein Status</div>
                <div style={{ marginBottom: 12 }}><span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span><span style={{ marginLeft: 8, fontSize: 12, color: "#555570" }}>{myP.role_on_shoot}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(ATTEND_CONFIG).map(([k,v]) => (<button key={k} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${myP.attendance_status===k?v.color:"#2A2A3E"}`, background: myP.attendance_status===k?v.bg:"transparent", color: myP.attendance_status===k?v.color:"#555570", fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => handleStatusChange(myP.id, k)}>{v.label}</button>))}
                </div>
              </div>
            )}
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", marginBottom: 14, letterSpacing: "0.5px", textTransform: "uppercase" }}>Notizen</div>
            {editMode ? <textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={8}/> : <div style={{ fontSize: 14, color: "#888899", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{shoot.notes||"Keine Notizen"}</div>}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div><div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Dokumente & Links</div><div style={{ fontSize: 12, color: "#555570", marginTop: 2 }}>Google Drive, OneDrive, Dropbox oder andere Links</div></div>
            {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddLink(true)}>＋ Link hinzufügen</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map(link => (
              <div key={link.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>{linkIcon(link.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0", marginBottom: 2 }}>{link.label || "Dokument"}</div>
                  <div style={{ fontSize: 11, color: "#444460", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{link.url}</div>
                </div>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={S.driveBtn}>Öffnen →</a>
                {user.is_admin && <button style={S.btn("danger")} onClick={() => handleRemoveLink(link.id)}>✕</button>}
              </div>
            ))}
            {links.length === 0 && (
              <div style={{ ...S.card, textAlign: "center", padding: 48, color: "#444460" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Keine Dokumente</div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>Füge Google Drive, OneDrive oder andere Links hinzu</div>
                {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddLink(true)}>＋ Link hinzufügen</button>}
              </div>
            )}
          </div>
          {showAddLink && (
            <div style={S.modal}><div style={S.modalBox}>
              <div style={S.modalTitle}>Dokument-Link hinzufügen</div>
              <div style={{ marginBottom: 14 }}><label style={S.label}>Typ</label>
                <select style={S.select} value={linkForm.type} onChange={e=>setLinkForm(f=>({...f,type:e.target.value}))}>
                  <option value="drive">📁 Google Drive</option>
                  <option value="onedrive">☁️ OneDrive / SharePoint</option>
                  <option value="dropbox">📦 Dropbox</option>
                  <option value="other">🔗 Anderer Link</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}><label style={S.label}>Bezeichnung</label><input style={S.input} value={linkForm.label} onChange={e=>setLinkForm(f=>({...f,label:e.target.value}))} placeholder="z. B. Callsheets, Storyboard, Verträge..."/></div>
              <div style={{ marginBottom: 20 }}><label style={S.label}>Link (Shared URL)</label><input style={S.input} value={linkForm.url} onChange={e=>setLinkForm(f=>({...f,url:e.target.value}))} placeholder="https://drive.google.com/drive/folders/..."/></div>
              <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddLink}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddLink(false)}>Abbrechen</button></div>
            </div></div>
          )}
        </div>
      )}

      {tab === "crew" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Crew ({sp.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddP(true)}>＋ Hinzufügen</button>}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(ATTEND_CONFIG).map(([k,v]) => { const count = sp.filter(p=>p.attendance_status===k).length; if (!count) return null; return <span key={k} style={{...S.attendBadge(k),fontSize:12}}>{v.label}: {count}</span>; })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sp.map(p => { const u = users.find(u=>u.id===p.user_id)||{name:"Unbekannt",email:""}; return (
              <div key={p.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={S.avatar(36)}>{u.name?.[0]}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0" }}>{u.name}</div><div style={{ fontSize: 12, color: "#555570" }}>{u.email}</div></div>
                <span style={S.tag()}>{p.role_on_shoot}</span>
                <span style={S.attendBadge(p.attendance_status)}>{ATTEND_CONFIG[p.attendance_status]?.label}</span>
                {user.is_admin ? <div style={{ display: "flex", gap: 4 }}><select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><button style={S.btn("danger")} onClick={()=>handleRemoveP(p.id)}>✕</button></div>
                : p.user_id===user.id && <select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>}
              </div>
            ); })}
          </div>
          {showAddP && (<div style={S.modal}><div style={S.modalBox}>
            <div style={S.modalTitle}>Crew hinzufügen</div>
            <div style={{ marginBottom: 14 }}><label style={S.label}>Benutzer</label><select style={S.select} value={addUserId} onChange={e=>setAddUserId(e.target.value)}><option value="">Wählen...</option>{users.filter(u=>!sp.find(p=>p.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></div>
            <div style={{ marginBottom: 20 }}><label style={S.label}>Rolle</label><input style={S.input} value={addRole} onChange={e=>setAddRole(e.target.value)} placeholder="z. B. Director, Gaffer..."/></div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddP}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddP(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}

      {tab === "shotlist" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Shotlist ({shots.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addShot}>＋ Shot</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shots.map((shot, idx) => (
              <div key={shot.id} style={S.card}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", minWidth: 24 }}>#{idx+1}</div>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Titel</label><input style={S.input} value={shot.title||""} onChange={e=>updateShot(shot.id,"title",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Kamera</label><input style={S.input} value={shot.camera_setting||""} onChange={e=>updateShot(shot.id,"camera_setting",e.target.value)} placeholder="24mm f/2.8" readOnly={!user.is_admin}/></div>
                    <div style={{ gridColumn: "span 2" }}><label style={S.label}>Beschreibung</label><input style={S.input} value={shot.description||""} onChange={e=>updateShot(shot.id,"description",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Dauer</label><input style={S.input} value={shot.duration||""} onChange={e=>updateShot(shot.id,"duration",e.target.value)} placeholder="00:30" readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Status</label><select style={S.select} value={shot.status||"open"} onChange={e=>updateShot(shot.id,"status",e.target.value)}>{Object.entries(SHOT_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  </div>
                  <span style={{ ...S.tag(SHOT_STATUS[shot.status]?.color), alignSelf: "flex-start" }}>{SHOT_STATUS[shot.status]?.label}</span>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Tagesplan ({sched.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addSched}>＋ Eintrag</button>}
          </div>
          <div style={{ borderLeft: "2px solid #1E1E2E", paddingLeft: 20, marginLeft: 20 }}>
            {sched.map(entry => { const au = users.find(u=>u.id===entry.assigned_to); return (
              <div key={entry.id} style={{ position: "relative", paddingBottom: 20 }}>
                <div style={{ position: "absolute", left: -28, top: 4, width: 10, height: 10, borderRadius: "50%", background: "#6366F1", border: "2px solid #0A0A0F" }}/>
                {user.is_admin ? (
                  <div style={{ ...S.card, padding: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr auto", gap: 10, alignItems: "start" }}>
                      <div><label style={S.label}>Zeit</label><input style={S.input} type="time" value={entry.time||""} onChange={e=>updateSched(entry.id,"time",e.target.value)}/></div>
                      <div><label style={S.label}>Titel</label><input style={S.input} value={entry.title||""} onChange={e=>updateSched(entry.id,"title",e.target.value)}/></div>
                      <div><label style={S.label}>Beschreibung</label><input style={S.input} value={entry.description||""} onChange={e=>updateSched(entry.id,"description",e.target.value)}/></div>
                      <button style={{ ...S.btn("danger"), marginTop: 22 }} onClick={()=>deleteSched(entry.id)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ paddingBottom: 4, display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#818CF8", minWidth: 44 }}>{entry.time}</span>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0" }}>{entry.title}</div>{entry.description&&<div style={{ fontSize: 12, color: "#555570" }}>{entry.description}</div>}{au&&<div style={{ fontSize: 11, color: "#444460", marginTop: 2 }}>→ {au.name}</div>}</div>
                  </div>
                )}
              </div>
            ); })}
            {sched.length===0 && <div style={{ ...S.card, padding:32, textAlign:"center", color:"#444460" }}>Kein Tagesplan erstellt</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// NEW SHOOT PAGE
// ============================================================
function NewShootPage({ user, setPage, onSave }) {
  const [form, setForm] = useState({ title: "", location: "", date_start: "", date_end: "", start_time: "09:00", end_time: "18:00", budget: "", notes: "", status: "planned" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.title || !form.date_start) { setError("Titel und Startdatum sind Pflichtfelder"); return; }
    setSaving(true);
    try { const shoot = await db.insert("shoots", { ...form, budget: form.budget || null, created_by: user.id, shared_links: "[]" }); onSave(shoot); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Neuer Shoot</div><div style={S.pageSub}>Neue Produktion anlegen</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving ? "Wird erstellt..." : "Shoot erstellen"}</button><button style={S.btn("ghost")} onClick={() => setPage("shoots")}>Abbrechen</button></div>
      </div>
      {error && <div style={S.err}>{error}</div>}
      <div style={S.grid2}>
        <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={S.label}>Titel *</label><input style={S.input} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="z. B. Brand Film – Kunde AG"/></div>
          <div><label style={S.label}>Location</label><input style={S.input} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z. B. Berlin Studio B"/></div>
          <div style={S.grid2}>
            <div><label style={S.label}>Startdatum *</label><input style={S.input} type="date" value={form.date_start} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
            <div><label style={S.label}>Enddatum</label><input style={S.input} type="date" value={form.date_end} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
          </div>
          <div style={S.grid2}>
            <div><label style={S.label}>Startzeit</label><input style={S.input} type="time" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
            <div><label style={S.label}>Endzeit</label><input style={S.input} type="time" value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
          </div>
          <div><label style={S.label}>Budget (€)</label><input style={S.input} type="number" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} placeholder="8500"/></div>
          <div><label style={S.label}>Status</label><select style={S.select} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
        </div>
        <div style={S.card}><label style={S.label}>Notizen</label><textarea style={{ ...S.textarea, minHeight: 200 }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Besonderheiten, Equipment-Notizen..."/></div>
      </div>
    </div>
  );
}

// ============================================================
// CLIENTS PAGE
// ============================================================
function ClientsPage({ user }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [form, setForm] = useState({ company: "", contact_name: "", email: "", phone: "", website: "", address: "", notes: "" });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { db.select("clients").then(d => { setClients(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const openNew = () => { setEditClient(null); setForm({ company: "", contact_name: "", email: "", phone: "", website: "", address: "", notes: "" }); setShowModal(true); };
  const openEdit = (c) => { setEditClient(c); setForm({ ...c }); setShowModal(true); };
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editClient) { const updated = await db.update("clients", form, `id=eq.${editClient.id}`); setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...form } : c)); }
      else { const newC = await db.insert("clients", form); setClients(prev => [...prev, newC]); }
      setShowModal(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Kunden wirklich löschen?")) return; try { await db.remove("clients", `id=eq.${id}`); setClients(prev => prev.filter(c => c.id !== id)); } catch (e) { alert(e.message); } };

  const filtered = clients.filter(c => !search || c.company?.toLowerCase().includes(search.toLowerCase()) || c.contact_name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Kunden</div><div style={S.pageSub}>{clients.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...S.input, width: 220 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
          {user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neuer Kunde</button>}
        </div>
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#555570" }}>Lade...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ ...S.card, display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ ...S.avatar(44), borderRadius: 10, fontSize: 18 }}>🏢</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E8E8F0", marginBottom: 2 }}>{c.company}</div>
                <div style={{ fontSize: 13, color: "#888899" }}>{c.contact_name}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                  {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>✉ {c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>📞 {c.phone}</a>}
                  {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#6366F1", textDecoration: "none" }}>🌐 Website</a>}
                </div>
              </div>
              {user.is_admin && <div style={{ display: "flex", gap: 8 }}><button style={S.btn("outline")} onClick={() => openEdit(c)}>✏️</button><button style={S.btn("danger")} onClick={() => handleDelete(c.id)}>✕</button></div>}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 48, color: "#444460" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div><div style={{ fontSize: 16, fontWeight: 600 }}>Keine Kunden gefunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={openNew}>Ersten Kunden anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>{editClient ? "Kunde bearbeiten" : "Neuer Kunde"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Firma / Name</label><input style={S.input} value={form.company||""} onChange={e=>setForm(f=>({...f,company:e.target.value}))} placeholder="Firma GmbH"/></div>
          <div><label style={S.label}>Ansprechpartner</label><input style={S.input} value={form.contact_name||""} onChange={e=>setForm(f=>({...f,contact_name:e.target.value}))} placeholder="Max Mustermann"/></div>
          <div><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={S.label}>Telefon</label><input style={S.input} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={S.label}>Website</label><input style={S.input} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Adresse</label><input style={S.input} value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Notizen</label><textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// ACTORS PAGE
// ============================================================
function ActorsPage({ user }) {
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editActor, setEditActor] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", instagram: "", tiktok: "", website: "", genre: "", notes: "" });
  const [search, setSearch] = useState(""); const [genreFilter, setGenreFilter] = useState("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => { db.select("actors").then(d => { setActors(d); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const openNew = () => { setEditActor(null); setForm({ name: "", email: "", phone: "", instagram: "", tiktok: "", website: "", genre: "", notes: "" }); setShowModal(true); };
  const openEdit = (a) => { setEditActor(a); setForm({ ...a }); setShowModal(true); };
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editActor) { await db.update("actors", form, `id=eq.${editActor.id}`); setActors(prev => prev.map(a => a.id === editActor.id ? { ...a, ...form } : a)); }
      else { const newA = await db.insert("actors", form); setActors(prev => [...prev, newA]); }
      setShowModal(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Schauspieler wirklich löschen?")) return; try { await db.remove("actors", `id=eq.${id}`); setActors(prev => prev.filter(a => a.id !== id)); } catch (e) { alert(e.message); } };

  const filtered = actors.filter(a => {
    const matchSearch = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.genre?.toLowerCase().includes(search.toLowerCase());
    const matchGenre = genreFilter === "all" || a.genre === genreFilter;
    return matchSearch && matchGenre;
  });

  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Schauspieler</div><div style={S.pageSub}>{actors.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...S.input, width: 200 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
          {user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neuer Eintrag</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: genreFilter==="all"?"#6366F1":"#1E1E2E", background: genreFilter==="all"?"rgba(99,102,241,0.15)":"transparent", color: genreFilter==="all"?"#818CF8":"#555570", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setGenreFilter("all")}>Alle</button>
        {GENRES.map(g => <button key={g} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: genreFilter===g?"#6366F1":"#1E1E2E", background: genreFilter===g?"rgba(99,102,241,0.15)":"transparent", color: genreFilter===g?"#818CF8":"#555570", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setGenreFilter(g)}>{g}</button>)}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#555570" }}>Lade...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {filtered.map(a => (
            <div key={a.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={S.avatar(44)}>{a.name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#E8E8F0" }}>{a.name}</div>
                  {a.genre && <span style={S.tag("#8B5CF6")}>{a.genre}</span>}
                </div>
                {user.is_admin && <div style={{ display: "flex", gap: 6 }}><button style={{ ...S.btn("ghost"), padding: "4px 8px", fontSize: 12 }} onClick={() => openEdit(a)}>✏️</button><button style={{ ...S.btn("danger"), padding: "4px 8px", fontSize: 12 }} onClick={() => handleDelete(a.id)}>✕</button></div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {a.email && <a href={`mailto:${a.email}`} style={{ fontSize: 13, color: "#818CF8", textDecoration: "none", display: "flex", gap: 6, alignItems: "center" }}>✉️ {a.email}</a>}
                {a.phone && <a href={`tel:${a.phone}`} style={{ fontSize: 13, color: "#818CF8", textDecoration: "none", display: "flex", gap: 6, alignItems: "center" }}>📞 {a.phone}</a>}
                {a.instagram && <a href={`https://instagram.com/${a.instagram.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#E1306C", textDecoration: "none", display: "flex", gap: 6, alignItems: "center" }}>📸 @{a.instagram.replace("@","")}</a>}
                {a.tiktok && <a href={`https://tiktok.com/@${a.tiktok.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#69C9D0", textDecoration: "none", display: "flex", gap: 6, alignItems: "center" }}>🎵 @{a.tiktok.replace("@","")}</a>}
                {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#818CF8", textDecoration: "none", display: "flex", gap: 6, alignItems: "center" }}>🌐 Website</a>}
                {a.notes && <div style={{ fontSize: 12, color: "#555570", marginTop: 4, fontStyle: "italic" }}>{a.notes}</div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ ...S.card, textAlign: "center", padding: 48, color: "#444460", gridColumn: "span 3" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div><div style={{ fontSize: 16, fontWeight: 600 }}>Keine Schauspieler gefunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={openNew}>Ersten Eintrag anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>{editActor ? "Schauspieler bearbeiten" : "Neuer Schauspieler"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Name *</label><input style={S.input} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Vorname Nachname"/></div>
          <div><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={S.label}>Telefon</label><input style={S.input} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={S.label}>Instagram</label><input style={S.input} value={form.instagram||""} onChange={e=>setForm(f=>({...f,instagram:e.target.value}))} placeholder="@username"/></div>
          <div><label style={S.label}>TikTok</label><input style={S.input} value={form.tiktok||""} onChange={e=>setForm(f=>({...f,tiktok:e.target.value}))} placeholder="@username"/></div>
          <div><label style={S.label}>Website</label><input style={S.input} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div><label style={S.label}>Genre</label><select style={S.select} value={form.genre||""} onChange={e=>setForm(f=>({...f,genre:e.target.value}))}><option value="">Wählen...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Notizen</label><textarea style={S.textarea} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Erfahrungen, Besonderheiten..."/></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// USERS PAGE
// ============================================================
function UsersPage({ users, setUsers, user: currentUser }) {
  const [showModal, setShowModal] = useState(false); const [form, setForm] = useState({ name: "", email: "", is_admin: false }); const [saving, setSaving] = useState(false);
  const [tempPw] = useState(() => Math.random().toString(36).slice(-10));
  const handleCreate = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    try { const u = await db.insert("users", { name: form.name, email: form.email, is_admin: form.is_admin, must_change_password: true }); setUsers(prev => [...prev, u]); setShowModal(false); setForm({ name: "", email: "", is_admin: false }); alert(`Profil erstellt!\nJetzt in Supabase → Authentication → Add User:\nE-Mail: ${form.email}\nPasswort: ${tempPw}`); }
    catch (e) { alert("Fehler: " + e.message); }
    setSaving(false);
  };
  return (
    <div>
      <div style={S.pageHeader}><div><div style={S.pageTitle}>Benutzer</div><div style={S.pageSub}>{users.length} Personen</div></div><button style={S.btn("primary")} onClick={() => setShowModal(true)}>＋ Benutzer anlegen</button></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {users.map(u => (
          <div key={u.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={S.avatar(40)}>{u.name?.[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{u.name}{u.is_admin && <span style={S.tag("#F59E0B")}>Admin</span>}{u.must_change_password && <span style={S.tag("#EF4444")}>⚠ PW ändern</span>}</div><div style={{ fontSize: 12, color: "#555570" }}>{u.email}</div></div>
          </div>
        ))}
      </div>
      {showModal && (<div style={S.modal}><div style={S.modalBox}>
        <div style={S.modalTitle}>Neuer Benutzer</div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>Name</label><input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div style={{ marginBottom: 12 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" id="ia" checked={form.is_admin} onChange={e=>setForm(f=>({...f,is_admin:e.target.checked}))}/><label htmlFor="ia" style={{ fontSize: 13, color: "#888899", cursor: "pointer" }}>Admin-Rechte</label></div>
        <div style={{ ...S.card, padding: "10px 14px", marginBottom: 18, background: "rgba(99,102,241,0.06)" }}>
          <div style={{ fontSize: 11, color: "#555570", marginBottom: 4 }}>Temporäres Passwort (für Supabase Auth):</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#818CF8", letterSpacing: "1px" }}>{tempPw}</div>
          <div style={{ fontSize: 11, color: "#444460", marginTop: 4 }}>Separat in Supabase → Authentication → Add User eingeben.</div>
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [u, s, p, sl, sc] = await Promise.all([db.select("users"), db.select("shoots"), db.select("shoot_participants"), db.select("shotlist"), db.select("schedule")]);
      setUsers(u); setShoots(s); setParticipants(p); setShotlist(sl); setSchedule(sc);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLogin = (profile, token) => { db.setToken(token); setUser(profile); };
  const handleLogout = () => { db.clearToken(); setUser(null); setShoots([]); setParticipants([]); setShotlist([]); setSchedule([]); setUsers([]); setPage("dashboard"); };

  const handleSaveShoot = (shoot) => {
    setShoots(prev => prev.find(s => s.id === shoot.id) ? prev.map(s => s.id === shoot.id ? shoot : s) : [...prev, shoot]);
    setSelectedShoot(shoot); setPage("shoot-detail");
  };
  const handleDeleteShoot = async (id) => {
    try { await db.remove("shoots", `id=eq.${id}`); setShoots(prev => prev.filter(s => s.id !== id)); setParticipants(prev => prev.filter(p => p.shoot_id !== id)); setShotlist(prev => prev.filter(s => s.shoot_id !== id)); setSchedule(prev => prev.filter(s => s.shoot_id !== id)); setPage("shoots"); }
    catch (e) { alert("Fehler: " + e.message); }
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  if (user.must_change_password) return <ChangePasswordPage user={user} onDone={() => setUser(u => ({ ...u, must_change_password: false }))} />;

  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visibleShoots = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id));

  return (
    <div style={S.root}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } input:focus,textarea:focus,select:focus { border-color: #6366F1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0A0A0F; } ::-webkit-scrollbar-thumb { background: #2A2A3E; border-radius: 3px; } button:hover { opacity: 0.85; } a:hover { opacity: 0.8; }`}</style>
      <Sidebar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
      <div style={S.main}>
        {loading ? <div style={{ textAlign: "center", padding: 60, color: "#555570" }}>Lade Daten...</div> : <>
          {page === "dashboard" && <Dashboard user={user} shoots={visibleShoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
          {page === "shoots" && <ShootsList user={user} shoots={shoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
          {page === "calendar" && (<div><div style={S.pageHeader}><div><div style={S.pageTitle}>Kalender</div><div style={S.pageSub}>Alle Produktionen</div></div></div><CalendarView shoots={visibleShoots} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} /></div>)}
          {page === "clients" && <ClientsPage user={user} />}
          {page === "actors" && <ActorsPage user={user} />}
          {page === "users" && user.is_admin && <UsersPage users={users} setUsers={setUsers} user={user} />}
          {page === "new-shoot" && <NewShootPage user={user} setPage={setPage} onSave={handleSaveShoot} />}
          {page === "shoot-detail" && selectedShoot && <ShootDetail shoot={selectedShoot} setShoot={setSelectedShoot} participants={participants} setParticipants={setParticipants} shotlist={shotlist} setShotlist={setShotlist} schedule={schedule} setSchedule={setSchedule} users={users} user={user} setPage={setPage} onDelete={handleDeleteShoot} />}
        </>}
      </div>
    </div>
  );
}
