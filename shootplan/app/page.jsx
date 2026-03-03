"use client";
import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xpgvsmtpcxommforzzed.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_f2-NADNc3LEg_Ga2KXkiXw_Zntc2xSN";

const supabase = {
  _headers: {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  },
  _token: null,
  setToken(token) { this._token = token; this._headers["Authorization"] = `Bearer ${token}`; },
  clearToken() { this._token = null; this._headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`; },
  async from(table) {
    const base = `${SUPABASE_URL}/rest/v1/${table}`;
    const h = { ...this._headers };
    return {
      async select(cols = "*", opts = {}) {
        let url = `${base}?select=${cols}`;
        if (opts.filter) url += `&${opts.filter}`;
        const r = await fetch(url, { headers: h });
        const d = await r.json();
        return { data: r.ok ? d : null, error: r.ok ? null : d };
      },
      async insert(body) {
        const r = await fetch(base, { method: "POST", headers: h, body: JSON.stringify(body) });
        const d = await r.json();
        return { data: r.ok ? d : null, error: r.ok ? null : d };
      },
      async update(body, filter) {
        const r = await fetch(`${base}?${filter}`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
        const d = await r.json();
        return { data: r.ok ? d : null, error: r.ok ? null : d };
      },
      async delete(filter) {
        const r = await fetch(`${base}?${filter}`, { method: "DELETE", headers: h });
        return { error: r.ok ? null : await r.json() };
      },
    };
  },
  auth: {
    async signInWithPassword({ email, password }) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      return { data: r.ok ? d : null, error: r.ok ? null : d };
    },
    async signOut() {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${supabase._token}` },
      });
    },
  },
};

const DEMO_MODE = false;

const DEMO_DATA = {
  users: [
    { id: "1", name: "Admin User", email: "admin@shootplan.io", is_admin: true, must_change_password: false },
    { id: "2", name: "Lena Müller", email: "lena@crew.io", is_admin: false, must_change_password: false },
    { id: "3", name: "Tobias Kern", email: "tobias@crew.io", is_admin: false, must_change_password: false },
  ],
  shoots: [
    { id: "1", title: "Brand Film – Helvetica Studio", location: "Zürich Studio A", date: "2025-04-10", start_time: "08:00", end_time: "18:00", budget: 8500, notes: "Minimalistischer Look.", status: "confirmed", created_by: "1" },
    { id: "2", title: "Product Launch – Kinetic X", location: "Berlin Warehouse", date: "2025-04-18", start_time: "09:00", end_time: "20:00", budget: 12000, notes: "Drone-Shots genehmigt.", status: "planned", created_by: "1" },
  ],
  participants: [
    { id: "1", shoot_id: "1", user_id: "1", role_on_shoot: "Director", attendance_status: "confirmed", absence_reason: "" },
    { id: "2", shoot_id: "1", user_id: "2", role_on_shoot: "Camera Assistant", attendance_status: "confirmed", absence_reason: "" },
    { id: "3", shoot_id: "1", user_id: "3", role_on_shoot: "Gaffer", attendance_status: "sick", absence_reason: "Grippe" },
  ],
  shotlist: [
    { id: "1", shoot_id: "1", title: "Opening Wide Shot", description: "Studio-Totale", camera_setting: "24mm f/2.8", duration: "00:45", assigned_to: "2", status: "done" },
  ],
  schedule: [
    { id: "1", shoot_id: "1", time: "08:00", title: "Setup & Lichtaufbau", description: "Equipment aufbauen", assigned_to: "3" },
    { id: "2", shoot_id: "1", time: "10:00", title: "Shot Block 1", description: "Produktshots", assigned_to: null },
  ],
};

const STATUS_CONFIG = {
  planned:   { label: "Geplant",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  confirmed: { label: "Bestätigt", color: "#10B981", bg: "rgba(16,185,129,0.12)", dot: "#10B981" },
  cancelled: { label: "Abgesagt",  color: "#6B7280", bg: "rgba(107,114,128,0.12)", dot: "#6B7280" },
};
const ATTEND_CONFIG = {
  confirmed: { label: "Bestätigt", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  open:      { label: "Offen",     color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  sick:      { label: "Krank",     color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  absent:    { label: "Abwesend",  color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
};
const SHOT_STATUS = {
  open:        { label: "Offen",     color: "#6B7280" },
  in_progress: { label: "In Arbeit", color: "#F59E0B" },
  done:        { label: "Erledigt",  color: "#10B981" },
};

const fmt = (d) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });

const S = {
  root: { fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0A0A0F", color: "#E8E8F0", minHeight: "100vh", display: "flex" },
  sidebar: { width: 240, minHeight: "100vh", background: "#111118", borderRight: "1px solid #1E1E2E", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 },
  logo: { padding: "28px 24px 20px", borderBottom: "1px solid #1E1E2E" },
  logoMark: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 32, height: 32, background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 },
  logoText: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", color: "#F0F0FA" },
  logoSub: { fontSize: 10, color: "#555570", letterSpacing: "0.8px", textTransform: "uppercase", marginTop: 2 },
  nav: { padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  navSection: { fontSize: 10, fontWeight: 600, color: "#444460", letterSpacing: "0.8px", textTransform: "uppercase", padding: "12px 12px 6px" },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s", background: active ? "rgba(99,102,241,0.15)" : "transparent", color: active ? "#818CF8" : "#888899", fontSize: 14, fontWeight: active ? 600 : 400, border: active ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent" }),
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  sidebarUser: { padding: "16px", borderTop: "1px solid #1E1E2E", display: "flex", alignItems: "center", gap: 10 },
  avatar: (size = 32) => ({ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "white", flexShrink: 0 }),
  main: { marginLeft: 240, flex: 1, padding: "32px", maxWidth: "calc(100vw - 240px)", boxSizing: "border-box" },
  pageHeader: { marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "#F0F0FA", marginBottom: 4 },
  pageSub: { fontSize: 14, color: "#555570" },
  btn: (variant = "primary") => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: variant === "ghost" ? "7px 14px" : "9px 18px", borderRadius: 8, border: variant === "outline" ? "1px solid #2A2A3E" : "none", background: variant === "primary" ? "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)" : variant === "danger" ? "rgba(239,68,68,0.15)" : variant === "outline" ? "transparent" : variant === "ghost" ? "rgba(255,255,255,0.04)" : "rgba(99,102,241,0.15)", color: variant === "primary" ? "white" : variant === "danger" ? "#EF4444" : variant === "outline" ? "#888899" : "#818CF8", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }),
  card: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px" },
  cardHover: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px", cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  statCard: { background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "20px 24px" },
  statValue: { fontSize: 32, fontWeight: 700, letterSpacing: "-1px", color: "#F0F0FA" },
  statLabel: { fontSize: 12, color: "#555570", marginTop: 4, letterSpacing: "0.3px" },
  badge: (status) => { const cfg = STATUS_CONFIG[status] || { color: "#888", bg: "rgba(128,128,128,0.1)" }; return { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg }; },
  attendBadge: (status) => { const cfg = ATTEND_CONFIG[status] || ATTEND_CONFIG.open; return { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg }; },
  input: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" },
  textarea: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80 },
  select: { background: "#0A0A0F", border: "1px solid #2A2A3E", borderRadius: 8, padding: "10px 14px", color: "#E8E8F0", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer" },
  label: { fontSize: 12, fontWeight: 600, color: "#555570", marginBottom: 6, display: "block", letterSpacing: "0.4px", textTransform: "uppercase" },
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "#111118", border: "1px solid #2A2A3E", borderRadius: 16, padding: "28px", width: "90%", maxWidth: 540, maxHeight: "85vh", overflowY: "auto" },
  modalTitle: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 20 },
  tag: (color = "#6366F1") => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color, background: color + "22" }),
  toggle: (active) => ({ padding: "7px 16px", borderRadius: 7, border: "none", background: active ? "#1E1E2E" : "transparent", color: active ? "#E8E8F0" : "#555570", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer" }),
};

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true); setError("");
    if (DEMO_MODE) {
      const user = DEMO_DATA.users.find(u => u.email === email);
      if (user && password === "demo") { setTimeout(() => { onLogin(user); setLoading(false); }, 500); }
      else { setTimeout(() => { setError("Demo: admin@shootplan.io / demo"); setLoading(false); }, 500); }
      return;
    }
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message || "Login fehlgeschlagen"); setLoading(false); return; }
    supabase.setToken(data.access_token);
    const tbl = await supabase.from("users");
    const { data: profiles } = await tbl.select("*", { filter: `email=eq.${email}` });
    onLogin(profiles?.[0] || { id: data.user.id, email, name: email, is_admin: false, must_change_password: false });
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 52, height: 52, background: "linear-gradient(135deg, #6366F1, #8B5CF6)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>🎬</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", color: "#F0F0FA" }}>ShootPlan</div>
          <div style={{ fontSize: 13, color: "#555570", marginTop: 6 }}>Professionelle Videoproduktions-Planung</div>
        </div>
        <div style={{ ...S.card, padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Anmelden</div>
          <div style={{ marginBottom: 16 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} /></div>
          <div style={{ marginBottom: 20 }}><label style={S.label}>Passwort</label><input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} /></div>
          {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 14, padding: "10px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>{error}</div>}
          <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={handleSubmit} disabled={loading}>{loading ? "Anmelden..." : "Anmelden →"}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordPage({ user, onDone }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [error, setError] = useState("");
  const handleSave = () => { if (pw.length < 8) { setError("Mindestens 8 Zeichen"); return; } if (pw !== pw2) { setError("Passwörter stimmen nicht überein"); return; } onDone(); };
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#F0F0FA" }}>Neues Passwort</div>
          <div style={{ fontSize: 13, color: "#555570", marginTop: 6 }}>Bitte vergib ein neues Passwort, {user.name}.</div>
        </div>
        <div style={{ ...S.card, padding: 28 }}>
          <div style={{ marginBottom: 14 }}><label style={S.label}>Neues Passwort</label><input style={S.input} type="password" value={pw} onChange={e => setPw(e.target.value)} /></div>
          <div style={{ marginBottom: 18 }}><label style={S.label}>Wiederholen</label><input style={S.input} type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
          {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{error}</div>}
          <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center" }} onClick={handleSave}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ page, setPage, user, onLogout }) {
  const nav = user.is_admin
    ? [{ id: "dashboard", icon: "⬛", label: "Dashboard" }, { id: "shoots", icon: "🎬", label: "Alle Shoots" }, { id: "calendar", icon: "📅", label: "Kalender" }, { id: "users", icon: "👥", label: "Benutzer" }]
    : [{ id: "dashboard", icon: "⬛", label: "Dashboard" }, { id: "shoots", icon: "🎬", label: "Meine Shoots" }, { id: "calendar", icon: "📅", label: "Kalender" }];
  return (
    <div style={S.sidebar}>
      <div style={S.logo}><div style={S.logoMark}><div style={S.logoIcon}>🎬</div><div><div style={S.logoText}>ShootPlan</div><div style={S.logoSub}>Production Suite</div></div></div></div>
      <div style={S.nav}>
        <div style={S.navSection}>Navigation</div>
        {nav.map(item => (<div key={item.id} style={S.navItem(page === item.id)} onClick={() => setPage(item.id)}><span style={S.navIcon}>{item.icon}</span><span>{item.label}</span></div>))}
      </div>
      <div style={S.sidebarUser}>
        <div style={S.avatar(34)}>{user.name?.[0] || user.email?.[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ fontSize: 11, color: "#444460" }}>{user.is_admin ? "Admin" : "Crew"}</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#444460", cursor: "pointer", fontSize: 16 }} onClick={onLogout} title="Abmelden">↩</button>
      </div>
    </div>
  );
}

function Dashboard({ user, shoots, participants, setPage, setSelectedShoot }) {
  const myShootIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myShootIds.includes(s.id));
  const now = new Date();
  const upcoming = visible.filter(s => new Date(s.date) >= now && s.status !== "cancelled");
  const confirmed = visible.filter(s => s.status === "confirmed");
  const thisMonth = visible.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Guten Tag, {user.name?.split(" ")[0]} 👋</div><div style={S.pageSub}>{now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div></div>
        {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neuer Shoot</button>}
      </div>
      <div style={{ ...S.grid3, marginBottom: 28 }}>
        <div style={S.statCard}><div style={S.statValue}>{upcoming.length}</div><div style={S.statLabel}>BEVORSTEHEND</div></div>
        <div style={S.statCard}><div style={S.statValue}>{confirmed.length}</div><div style={S.statLabel}>BESTÄTIGT</div></div>
        <div style={S.statCard}><div style={S.statValue}>{thisMonth.length}</div><div style={S.statLabel}>DIESEN MONAT</div></div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#E8E8F0" }}>Nächste Shoots</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {upcoming.slice(0, 5).map(shoot => {
          const sp = participants.filter(p => p.shoot_id === shoot.id);
          const myP = sp.find(p => p.user_id === user.id);
          const s = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
          return (
            <div key={shoot.id} style={{ ...S.cardHover, display: "flex", alignItems: "center", gap: 16 }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
              <div style={{ width: 4, height: 48, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0", marginBottom: 3 }}>{shoot.title}</div>
                <div style={{ fontSize: 12, color: "#555570" }}>{fmt(shoot.date)} · {shoot.start_time}–{shoot.end_time} · {shoot.location}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                <span style={S.badge(shoot.status)}><span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} /> {s.label}</span>
                <div style={{ fontSize: 12, color: "#444460" }}>{sp.length} Crew</div>
              </div>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#444460" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div>
            <div>Keine bevorstehenden Shoots</div>
            {user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 16 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarView({ shoots, participants, user, setSelectedShoot, setPage }) {
  const [date, setDate] = useState(new Date());
  const year = date.getFullYear(); const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const today = new Date();
  const isToday = (day) => day && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  const getShootsForDay = (day) => { if (!day) return []; const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; return shoots.filter(s => s.date === ds); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#E8E8F0" }}>{date.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month-1, 1))}>‹</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date())}>Heute</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month+1, 1))}>›</button>
        </div>
      </div>
      <div style={{ ...S.card, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 8 }}>
          {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#444460", padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {cells.map((day, idx) => {
            const dayShots = getShootsForDay(day);
            return (
              <div key={idx} style={{ minHeight: 80, background: isToday(day) ? "rgba(99,102,241,0.1)" : "#0A0A0F", borderRadius: 8, padding: "6px 8px", border: isToday(day) ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent" }}>
                {day && (<>
                  <div style={{ fontSize: 13, fontWeight: isToday(day) ? 800 : 400, color: isToday(day) ? "#818CF8" : "#555570", marginBottom: 4 }}>{day}</div>
                  {dayShots.map(s => { const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.planned; return <div key={s.id} style={{ fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: cfg.color+"22", color: cfg.color, marginBottom: 2, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => { setSelectedShoot(s); setPage("shoot-detail"); }}>{s.title}</div>; })}
                </>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShootsList({ user, shoots, participants, setPage, setSelectedShoot }) {
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("all");
  const myShootIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myShootIds.includes(s.id));
  const filtered = filter === "all" ? visible : visible.filter(s => s.status === filter);
  const sorted = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>{user.is_admin ? "Alle Shoots" : "Meine Shoots"}</div><div style={S.pageSub}>{sorted.length} Produktionen</div></div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 3, display: "flex" }}>
            <button style={S.toggle(view === "list")} onClick={() => setView("list")}>☰ Liste</button>
            <button style={S.toggle(view === "calendar")} onClick={() => setView("calendar")}>📅 Kalender</button>
          </div>
          {user.is_admin && <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neu</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["all","Alle"],["planned","Geplant"],["confirmed","Bestätigt"],["cancelled","Abgesagt"]].map(([val,lbl]) => (
          <button key={val} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: filter===val?"#6366F1":"#1E1E2E", background: filter===val?"rgba(99,102,241,0.15)":"transparent", color: filter===val?"#818CF8":"#555570", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setFilter(val)}>{lbl}</button>
        ))}
      </div>
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(shoot => {
            const sp = participants.filter(p => p.shoot_id === shoot.id);
            const myP = sp.find(p => p.user_id === user.id);
            const s = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
            const sick = sp.filter(p => p.attendance_status === "sick").length;
            return (
              <div key={shoot.id} style={{ ...S.cardHover, display: "flex", gap: 16, alignItems: "center" }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
                <div style={{ minWidth: 52, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#F0F0FA" }}>{new Date(shoot.date).getDate().toString().padStart(2,"0")}</div>
                  <div style={{ fontSize: 11, color: "#444460", textTransform: "uppercase" }}>{new Date(shoot.date).toLocaleString("de-DE",{month:"short"})}</div>
                </div>
                <div style={{ width: 1, height: 40, background: "#1E1E2E" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E8F0", marginBottom: 3 }}>{shoot.title}</div>
                  <div style={{ fontSize: 12, color: "#555570" }}>📍 {shoot.location} · {shoot.start_time}–{shoot.end_time}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  {sick > 0 && <span style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4 }}>🤒 {sick}</span>}
                  {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                  <span style={S.badge(shoot.status)}><span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} /> {s.label}</span>
                  <div style={{ fontSize: 12, color: "#444460" }}>{sp.length} 👤</div>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div style={{ ...S.card, textAlign: "center", padding: 48, color: "#444460" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Keine Shoots gefunden</div>
              {user.is_admin && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button>}
            </div>
          )}
        </div>
      ) : (
        <CalendarView shoots={sorted} participants={participants} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} />
      )}
    </div>
  );
}

function ShootDetail({ shoot, participants, setParticipants, shotlist, setShotlist, schedule, setSchedule, users, user, setPage, onSave, onDelete }) {
  const [tab, setTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...shoot });
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("");
  const shootParticipants = participants.filter(p => p.shoot_id === shoot.id);
  const shootShots = shotlist.filter(s => s.shoot_id === shoot.id);
  const shootSchedule = [...schedule.filter(s => s.shoot_id === shoot.id)].sort((a,b) => a.time.localeCompare(b.time));
  const myParticipation = shootParticipants.find(p => p.user_id === user.id);
  const s = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
  const handleSave = () => { onSave({ ...form }); setEditMode(false); };
  const handleAddP = () => { if (!addUserId) return; setParticipants(prev => [...prev, { id: Date.now().toString(), shoot_id: shoot.id, user_id: addUserId, role_on_shoot: addRole||"Crew", attendance_status: "open", absence_reason: "" }]); setShowAddParticipant(false); setAddUserId(""); setAddRole(""); };
  const handleStatusChange = (pId, val) => setParticipants(prev => prev.map(p => p.id===pId?{...p,attendance_status:val}:p));
  const addShot = () => setShotlist(prev => [...prev, { id: Date.now().toString(), shoot_id: shoot.id, title: "", description: "", camera_setting: "", duration: "", assigned_to: "", status: "open" }]);
  const updateShot = (id, field, val) => setShotlist(prev => prev.map(s => s.id===id?{...s,[field]:val}:s));
  const addScheduleEntry = () => setSchedule(prev => [...prev, { id: Date.now().toString(), shoot_id: shoot.id, time: "09:00", title: "", description: "", assigned_to: "" }]);
  const updateSchedule = (id, field, val) => setSchedule(prev => prev.map(e => e.id===id?{...e,[field]:val}:e));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <button style={{ ...S.btn("ghost"), padding: "6px 10px" }} onClick={() => setPage("shoots")}>← Zurück</button>
          <div>
            {editMode ? <input style={{ ...S.input, fontSize: 22, fontWeight: 700, padding: "4px 8px", width: 360, marginBottom: 6 }} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /> : <div style={{ fontSize: 22, fontWeight: 700, color: "#F0F0FA", marginBottom: 4 }}>{shoot.title}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={S.badge(shoot.status)}><span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} /> {s.label}</span>
              <span style={{ fontSize: 13, color: "#555570" }}>{fmt(shoot.date)} · {shoot.start_time}–{shoot.end_time}</span>
              <span style={{ fontSize: 13, color: "#555570" }}>📍 {shoot.location}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {user.is_admin && !editMode && <button style={S.btn("outline")} onClick={() => setEditMode(true)}>✏️ Bearbeiten</button>}
          {editMode && <><button style={S.btn("primary")} onClick={handleSave}>Speichern</button><button style={S.btn("ghost")} onClick={() => { setEditMode(false); setForm({...shoot}); }}>Abbrechen</button></>}
          {user.is_admin && <button style={S.btn("danger")} onClick={() => onDelete(shoot.id)}>Löschen</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid #1E1E2E" }}>
        {[["overview","Übersicht"],["shotlist","Shotlist"],["schedule","Tagesplan"],["crew","Crew"]].map(([id,lbl]) => (
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
                  {[["title","Titel"],["location","Location"],["date","Datum"],["start_time","Startzeit"],["end_time","Endzeit"]].map(([k,lbl]) => (
                    <div key={k}><label style={S.label}>{lbl}</label><input style={S.input} type={k==="date"?"date":k.includes("time")?"time":"text"} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></div>
                  ))}
                  <div><label style={S.label}>Budget (€)</label><input style={S.input} type="number" value={form.budget||""} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
                  <div><label style={S.label}>Status</label><select style={S.select} value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["📅 Datum",fmt(shoot.date)],["🕒 Zeit",`${shoot.start_time} – ${shoot.end_time}`],["📍 Location",shoot.location],["💶 Budget",shoot.budget?`€ ${Number(shoot.budget).toLocaleString("de-DE")}`:"—"]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#555570"}}>{k}</span><span style={{fontSize:13,color:"#E8E8F0",fontWeight:500}}>{v}</span></div>
                  ))}
                </div>
              )}
            </div>
            {myParticipation && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", marginBottom: 14, letterSpacing: "0.5px", textTransform: "uppercase" }}>Mein Status</div>
                <div style={{ marginBottom: 12 }}><span style={S.attendBadge(myParticipation.attendance_status)}>{ATTEND_CONFIG[myParticipation.attendance_status]?.label}</span><span style={{ marginLeft: 8, fontSize: 12, color: "#555570" }}>{myParticipation.role_on_shoot}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(ATTEND_CONFIG).map(([k,v]) => (
                    <button key={k} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${myParticipation.attendance_status===k?v.color:"#2A2A3E"}`, background: myParticipation.attendance_status===k?v.bg:"transparent", color: myParticipation.attendance_status===k?v.color:"#555570", fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => handleStatusChange(myParticipation.id, k)}>{v.label}</button>
                  ))}
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
      {tab === "crew" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Crew ({shootParticipants.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={() => setShowAddParticipant(true)}>＋ Hinzufügen</button>}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {Object.entries(ATTEND_CONFIG).map(([k,v]) => { const count = shootParticipants.filter(p=>p.attendance_status===k).length; if (!count) return null; return <span key={k} style={{...S.attendBadge(k),fontSize:12}}>{v.label}: {count}</span>; })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shootParticipants.map(p => {
              const u = users.find(u=>u.id===p.user_id)||{name:"Unbekannt",email:""};
              return (
                <div key={p.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={S.avatar(36)}>{u.name?.[0]}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0" }}>{u.name}</div><div style={{ fontSize: 12, color: "#555570" }}>{u.email}</div></div>
                  <span style={S.tag()}>{p.role_on_shoot}</span>
                  <span style={S.attendBadge(p.attendance_status)}>{ATTEND_CONFIG[p.attendance_status]?.label}</span>
                  {p.absence_reason && <span style={{ fontSize: 11, color: "#555570", fontStyle: "italic" }}>"{p.absence_reason}"</span>}
                  {user.is_admin && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
                      <button style={S.btn("danger")} onClick={() => setParticipants(prev=>prev.filter(x=>x.id!==p.id))}>✕</button>
                    </div>
                  )}
                  {!user.is_admin && p.user_id===user.id && <select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>}
                </div>
              );
            })}
          </div>
          {showAddParticipant && (
            <div style={S.modal}><div style={S.modalBox}>
              <div style={S.modalTitle}>Crew-Mitglied hinzufügen</div>
              <div style={{ marginBottom: 14 }}><label style={S.label}>Benutzer</label><select style={S.select} value={addUserId} onChange={e=>setAddUserId(e.target.value)}><option value="">Wählen...</option>{users.filter(u=>!shootParticipants.find(p=>p.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></div>
              <div style={{ marginBottom: 20 }}><label style={S.label}>Rolle</label><input style={S.input} value={addRole} onChange={e=>setAddRole(e.target.value)} placeholder="z. B. Director, Gaffer, BTS..."/></div>
              <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddP}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddParticipant(false)}>Abbrechen</button></div>
            </div></div>
          )}
        </div>
      )}
      {tab === "shotlist" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Shotlist ({shootShots.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addShot}>＋ Shot</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shootShots.map((shot, idx) => (
              <div key={shot.id} style={S.card}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#444460", minWidth: 24 }}>#{idx+1}</div>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Titel</label><input style={S.input} value={shot.title} onChange={e=>updateShot(shot.id,"title",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Kamera</label><input style={S.input} value={shot.camera_setting} onChange={e=>updateShot(shot.id,"camera_setting",e.target.value)} placeholder="z. B. 24mm f/2.8" readOnly={!user.is_admin}/></div>
                    <div style={{ gridColumn: "span 2" }}><label style={S.label}>Beschreibung</label><input style={S.input} value={shot.description} onChange={e=>updateShot(shot.id,"description",e.target.value)} readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Dauer</label><input style={S.input} value={shot.duration} onChange={e=>updateShot(shot.id,"duration",e.target.value)} placeholder="00:30" readOnly={!user.is_admin}/></div>
                    <div><label style={S.label}>Status</label><select style={S.select} value={shot.status} onChange={e=>updateShot(shot.id,"status",e.target.value)}>{Object.entries(SHOT_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  </div>
                  <span style={{ ...S.tag(SHOT_STATUS[shot.status]?.color), alignSelf: "flex-start" }}>{SHOT_STATUS[shot.status]?.label}</span>
                  {user.is_admin && <button style={S.btn("danger")} onClick={()=>setShotlist(prev=>prev.filter(s=>s.id!==shot.id))}>✕</button>}
                </div>
              </div>
            ))}
            {shootShots.length===0 && <div style={{ ...S.card, textAlign:"center", padding:32, color:"#444460" }}>Noch keine Shots geplant</div>}
          </div>
        </div>
      )}
      {tab === "schedule" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8F0" }}>Tagesplan ({shootSchedule.length})</div>
            {user.is_admin && <button style={S.btn("primary")} onClick={addScheduleEntry}>＋ Eintrag</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, borderLeft: "2px solid #1E1E2E", paddingLeft: 20, marginLeft: 20 }}>
            {shootSchedule.map(entry => {
              const assignedUser = users.find(u=>u.id===entry.assigned_to);
              return (
                <div key={entry.id} style={{ position: "relative", paddingBottom: 20 }}>
                  <div style={{ position: "absolute", left: -28, top: 4, width: 10, height: 10, borderRadius: "50%", background: "#6366F1", border: "2px solid #0A0A0F" }} />
                  {user.is_admin ? (
                    <div style={{ ...S.card, padding: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr auto", gap: 10, alignItems: "start" }}>
                        <div><label style={S.label}>Zeit</label><input style={S.input} type="time" value={entry.time} onChange={e=>updateSchedule(entry.id,"time",e.target.value)}/></div>
                        <div><label style={S.label}>Titel</label><input style={S.input} value={entry.title} onChange={e=>updateSchedule(entry.id,"title",e.target.value)}/></div>
                        <div><label style={S.label}>Beschreibung</label><input style={S.input} value={entry.description} onChange={e=>updateSchedule(entry.id,"description",e.target.value)}/></div>
                        <button style={{ ...S.btn("danger"), marginTop: 22 }} onClick={()=>setSchedule(prev=>prev.filter(e=>e.id!==entry.id))}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#818CF8", minWidth: 44 }}>{entry.time}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0" }}>{entry.title}</div>
                          {entry.description && <div style={{ fontSize: 12, color: "#555570" }}>{entry.description}</div>}
                          {assignedUser && <div style={{ fontSize: 11, color: "#444460", marginTop: 2 }}>→ {assignedUser.name}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {shootSchedule.length===0 && <div style={{ ...S.card, padding:32, textAlign:"center", color:"#444460" }}>Kein Tagesplan erstellt</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function NewShootPage({ user, setPage, onSave }) {
  const [form, setForm] = useState({ title: "", location: "", date: "", start_time: "09:00", end_time: "18:00", budget: "", notes: "", status: "planned" });
  const [error, setError] = useState("");
  const handleSave = () => { if (!form.title||!form.date) { setError("Titel und Datum sind Pflichtfelder"); return; } onSave({ ...form, id: Date.now().toString(), created_by: user.id }); };
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Neuer Shoot</div><div style={S.pageSub}>Neue Produktion anlegen</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSave}>Erstellen</button><button style={S.btn("ghost")} onClick={()=>setPage("shoots")}>Abbrechen</button></div>
      </div>
      {error && <div style={{ fontSize: 13, color: "#EF4444", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      <div style={S.grid2}>
        <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={S.label}>Titel *</label><input style={S.input} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="z. B. Brand Film – Kunde AG"/></div>
          <div><label style={S.label}>Location</label><input style={S.input} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z. B. Berlin Studio B"/></div>
          <div><label style={S.label}>Datum *</label><input style={S.input} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
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

function UsersPage({ users, setUsers, user: currentUser }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", is_admin: false });
  const [tempPw] = useState(() => Math.random().toString(36).slice(-8));
  const handleCreate = () => { setUsers(prev => [...prev, { id: Date.now().toString(), ...form, must_change_password: true }]); setShowModal(false); setForm({ name: "", email: "", is_admin: false }); };
  return (
    <div>
      <div style={S.pageHeader}>
        <div><div style={S.pageTitle}>Benutzer</div><div style={S.pageSub}>{users.length} Personen</div></div>
        <button style={S.btn("primary")} onClick={()=>setShowModal(true)}>＋ Benutzer anlegen</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {users.map(u => (
          <div key={u.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={S.avatar(40)}>{u.name?.[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E8F0", display: "flex", gap: 8, alignItems: "center" }}>
                {u.name}{u.is_admin&&<span style={S.tag("#F59E0B")}>Admin</span>}{u.must_change_password&&<span style={S.tag("#EF4444")}>⚠ Passwort ändern</span>}
              </div>
              <div style={{ fontSize: 12, color: "#555570" }}>{u.email}</div>
            </div>
            {u.id!==currentUser.id && <button style={S.btn("danger")} onClick={()=>setUsers(prev=>prev.filter(x=>x.id!==u.id))}>Entfernen</button>}
          </div>
        ))}
      </div>
      {showModal && (
        <div style={S.modal}><div style={S.modalBox}>
          <div style={S.modalTitle}>Neuer Benutzer</div>
          <div style={{ marginBottom: 12 }}><label style={S.label}>Name</label><input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div style={{ marginBottom: 12 }}><label style={S.label}>E-Mail</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" id="isAdmin" checked={form.is_admin} onChange={e=>setForm(f=>({...f,is_admin:e.target.checked}))}/><label htmlFor="isAdmin" style={{ fontSize: 13, color: "#888899", cursor: "pointer" }}>Admin-Rechte</label></div>
          <div style={{ ...S.card, padding: "10px 14px", marginBottom: 18, background: "rgba(99,102,241,0.06)" }}>
            <div style={{ fontSize: 11, color: "#555570", marginBottom: 4 }}>Temporäres Passwort:</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#818CF8", letterSpacing: "1px" }}>{tempPw}</div>
            <div style={{ fontSize: 11, color: "#444460", marginTop: 4 }}>Benutzer wird beim ersten Login zur Änderung aufgefordert.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleCreate}>Erstellen</button><button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button></div>
        </div></div>
      )}
    </div>
  );
}

function CalendarPage({ user, shoots, participants, setSelectedShoot, setPage }) {
  const myShootIds = participants.filter(p=>p.user_id===user.id).map(p=>p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s=>myShootIds.includes(s.id));
  return (
    <div>
      <div style={S.pageHeader}><div><div style={S.pageTitle}>Kalender</div><div style={S.pageSub}>Alle Produktionen im Überblick</div></div></div>
      <CalendarView shoots={visible} participants={participants} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [selectedShoot, setSelectedShoot] = useState(null);
  const [shoots, setShoots] = useState(DEMO_MODE ? DEMO_DATA.shoots : []);
  const [participants, setParticipants] = useState(DEMO_MODE ? DEMO_DATA.participants : []);
  const [shotlist, setShotlist] = useState(DEMO_MODE ? DEMO_DATA.shotlist : []);
  const [schedule, setSchedule] = useState(DEMO_MODE ? DEMO_DATA.schedule : []);
  const [users, setUsers] = useState(DEMO_MODE ? DEMO_DATA.users : []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const loadData = useCallback(async () => {
    if (DEMO_MODE || !user) return;
    setLoading(true);
    try {
      const [uTbl, sTbl, pTbl, slTbl, scTbl] = await Promise.all([supabase.from("users"), supabase.from("shoots"), supabase.from("shoot_participants"), supabase.from("shotlist"), supabase.from("schedule")]);
      const [u, s, p, sl, sc] = await Promise.all([uTbl.select("*"), sTbl.select("*"), pTbl.select("*"), slTbl.select("*"), scTbl.select("*")]);
      if (u.data) setUsers(u.data);
      if (s.data) setShoots(s.data);
      if (p.data) setParticipants(p.data);
      if (sl.data) setShotlist(sl.data);
      if (sc.data) setSchedule(sc.data);
    } catch (e) { console.error("Load error:", e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!user) return <LoginPage onLogin={setUser} />;
  if (user.must_change_password) return <ChangePasswordPage user={user} onDone={() => setUser(u => ({ ...u, must_change_password: false }))} />;

  const handleSaveShoot = (shoot) => {
    if (shoots.find(s => s.id === shoot.id)) { setShoots(prev => prev.map(s => s.id===shoot.id ? shoot : s)); }
    else { setShoots(prev => [...prev, shoot]); }
    setSelectedShoot(shoot); setPage("shoot-detail");
  };
  const handleDeleteShoot = (id) => {
    setShoots(prev => prev.filter(s => s.id!==id));
    setParticipants(prev => prev.filter(p => p.shoot_id!==id));
    setShotlist(prev => prev.filter(s => s.shoot_id!==id));
    setSchedule(prev => prev.filter(s => s.shoot_id!==id));
    setPage("shoots");
  };

  return (
    <div style={S.root}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } input:focus, textarea:focus, select:focus { border-color: #6366F1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0A0A0F; } ::-webkit-scrollbar-thumb { background: #2A2A3E; border-radius: 3px; } button:hover { opacity: 0.85; }`}</style>
      <Sidebar page={page} setPage={setPage} user={user} onLogout={() => { setUser(null); setPage("dashboard"); }} />
      <div style={S.main}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#555570" }}>Lade Daten...</div>}
        {!loading && page==="dashboard" && <Dashboard user={user} shoots={shoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
        {!loading && page==="shoots" && <ShootsList user={user} shoots={shoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
        {!loading && page==="calendar" && <CalendarPage user={user} shoots={shoots} participants={participants} setSelectedShoot={setSelectedShoot} setPage={setPage} />}
        {!loading && page==="users" && user.is_admin && <UsersPage users={users} setUsers={setUsers} user={user} />}
        {!loading && page==="new-shoot" && <NewShootPage user={user} setPage={setPage} onSave={handleSaveShoot} />}
        {!loading && page==="shoot-detail" && selectedShoot && <ShootDetail shoot={selectedShoot} participants={participants} setParticipants={setParticipants} shotlist={shotlist} setShotlist={setShotlist} schedule={schedule} setSchedule={setSchedule} users={users} user={user} setPage={setPage} onSave={handleSaveShoot} onDelete={handleDeleteShoot} />}
      </div>
    </div>
  );
}
