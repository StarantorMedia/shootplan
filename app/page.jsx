"use client";
import { useState, useEffect, useCallback } from "react";

// ── Environment variables — never hardcode secrets as fallbacks ────────────
// These must be set in Vercel Dashboard → Settings → Environment Variables
// NEXT_PUBLIC_ prefix = safe for browser (anon key is intentionally public)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  if (typeof window === "undefined") {
    // Server-side: fail loudly during build if env vars are missing
    console.error("[ShootPlan] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

let _token = null;
const SESSION_KEY = "sp_session";

// ─── Notification helper — fire-and-forget, never breaks app flow ────────────
async function notify(type, to, data) {
  if (!to) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.warn("Notification skipped:", e.message);
  }
}
const getHeaders = () => ({ "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${_token || SUPABASE_ANON_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" });
const db = {
  setToken(t) { _token = t; },
  clearToken() { _token = null; try { localStorage.removeItem(SESSION_KEY); } catch(e){} },
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
  async refreshToken(refreshToken) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error_description || d?.message || "Token refresh fehlgeschlagen");
    return d; // { access_token, refresh_token, expires_in }
  },
};

// ══════════════════════════════════════════════════════════════
// SECURITY — Input validation, sanitization, rate limiting
// ══════════════════════════════════════════════════════════════

// ── Sanitization ─────────────────────────────────────────────
// Strips HTML tags and trims. Prevents XSS in text rendered via dangerouslySetInnerHTML.
// Note: React's JSX renderer escapes by default — this is defense-in-depth.
function sanitize(val) {
  if (typeof val !== "string") return "";
  return val.replace(/<[^>]*>/g, "").trim().slice(0, 2000);
}

// Sanitize an object's string values (used before db.insert / db.update)
function sanitizeObj(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" ? sanitize(v) : v;
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────
const V = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v||"").trim()),
  password: (v) => typeof v === "string" && v.length >= 8 && v.length <= 128,
  name: (v) => typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 80,
  text: (v, max=500) => typeof v === "string" && v.trim().length > 0 && v.length <= max,
  textOpt: (v, max=500) => !v || (typeof v === "string" && v.length <= max),
  number: (v, min=0, max=999999) => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= min && n <= max;
  },
  date: (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
  uuid: (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  url: (v) => {
    if (!v) return true; // optional
    try { const u = new URL(v); return ["https:","http:"].includes(u.protocol); }
    catch { return false; }
  },
  // Returns first failing field name or null if all OK
  check: (rules) => {
    for (const [field, ok, msg] of rules) {
      if (!ok) return msg || `Ungültiges Feld: ${field}`;
    }
    return null;
  },
};

// ── Client-side rate limiting ─────────────────────────────────
// Prevents rapid repeated submissions (e.g. login brute-force, spam)
// Uses in-memory map — resets on page reload (not a server-side defense,
// but provides UX-layer protection and reduces load on Supabase).
var _rateLimits = {};
function rateLimit(key, maxCalls, windowMs) {
  const now = Date.now();
  if (!_rateLimits[key]) _rateLimits[key] = [];
  // Remove entries outside the window
  _rateLimits[key] = _rateLimits[key].filter(t => now - t < windowMs);
  if (_rateLimits[key].length >= maxCalls) {
    const waitSec = Math.ceil((windowMs - (now - _rateLimits[key][0])) / 1000);
    return `Zu viele Versuche. Bitte ${waitSec}s warten.`;
  }
  _rateLimits[key].push(now);
  return null; // OK
}

// Convenience wrappers for common limits
var RL = {
  login:    () => rateLimit("login",    5,  60000),  // 5 attempts / 60s
  register: () => rateLimit("register", 3,  300000), // 3 attempts / 5min
  form:     (k) => rateLimit("form_"+k, 10, 60000),  // 10 submits / 60s
  notify:   (k) => rateLimit("notif_"+k, 20, 60000), // 20 notifications / 60s
};


const STATUS_CONFIG = {
  planned:   { label: "Geplant",   color: "#FF9F0A", bg: "rgba(255,159,10,0.15)",  dot: "#FF9F0A" },
  confirmed: { label: "Bestätigt", color: "#30D158", bg: "rgba(48,209,88,0.15)", dot: "#30D158" },
  cancelled: { label: "Abgesagt",  color: "#FF453A", bg: "rgba(255,69,58,0.15)",  dot: "#FF453A" },
};
const ATTEND_CONFIG = {
  confirmed: { label: "Bestätigt", color: "#30D158", bg: "rgba(48,209,88,0.15)" },
  open:      { label: "Offen",     color: "#8E8E93", bg: "rgba(142,142,147,0.15)" },
  sick:      { label: "Krank",     color: "#FF453A", bg: "rgba(255,69,58,0.15)" },
  absent:    { label: "Abwesend",  color: "#BF5AF2", bg: "rgba(191,90,242,0.15)" },
};
const SHOT_STATUS = { open: { label: "Offen", color: "#6B7280" }, in_progress: { label: "In Arbeit", color: "#FF9F0A" }, done: { label: "Erledigt", color: "#30D158" } };
const ROLE_CONFIG = {
  admin:  { label: "Admin",        color: "#FF9F0A" },
  crew:   { label: "Crew",         color: "#0A84FF" },
  actor:  { label: "Schauspieler", color: "#30D158" },
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

// ── Apple-style Design System with Dark/Light mode ──────────
var THEMES = {
  dark: {
    bg:"#000000", surface:"#1C1C1E", surfaceHi:"#2C2C2E", border:"#38383A", borderHi:"#48484A",
    accent:"#0A84FF", accentDim:"rgba(10,132,255,0.12)",
    text:"#FFFFFF", textMid:"rgba(235,235,245,0.8)", textDim:"rgba(235,235,245,0.45)",
    danger:"#FF453A", dangerDim:"rgba(255,69,58,0.15)",
    green:"#30D158", greenDim:"rgba(48,209,88,0.15)",
    amber:"#FF9F0A", amberDim:"rgba(255,159,10,0.15)",
    purple:"#BF5AF2", purpleDim:"rgba(191,90,242,0.15)",
    shadow:"0 1px 3px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.25)",
  },
  light: {
    bg:"#F2F2F7", surface:"#FFFFFF", surfaceHi:"#F2F2F7", border:"#E5E5EA", borderHi:"#C7C7CC",
    accent:"#007AFF", accentDim:"rgba(0,122,255,0.10)",
    text:"#000000", textMid:"rgba(60,60,67,0.6)", textDim:"rgba(60,60,67,0.65)",
    danger:"#FF3B30", dangerDim:"rgba(255,59,48,0.12)",
    green:"#34C759", greenDim:"rgba(52,199,89,0.12)",
    amber:"#FF9500", amberDim:"rgba(255,149,0,0.12)",
    purple:"#AF52DE", purpleDim:"rgba(175,82,222,0.12)",
    shadow:"0 1px 2px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.08)",
  }
};
// Use a proxy-like object so S can reference C properties dynamically
// even before C values are set (avoids TDZ in production bundles)
var _themeDefaults = THEMES.dark;
// eslint-disable-next-line prefer-const
var _themeMode = "dark";
// SSR-safe localStorage read
if (typeof window !== "undefined") {
  try { const saved = localStorage.getItem("sp_theme"); if (saved) _themeMode = saved; } catch(e) {}
}
// C is a plain object — reassigned on theme change via Object.assign
var C = Object.assign({}, THEMES[_themeMode]);
if (typeof window !== 'undefined') { try { document.documentElement.setAttribute('data-theme', _themeMode); } catch(e) {} }
var getC = function() { return C; };

var isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;

// Helper: re-evaluates styles with current C (needed after theme switch)
var mk = (fn) => fn();

// S — only function-based helpers that read C at call time (SSR-safe)
var S = {
  // Functions that read C dynamically at call time — safe for SSR
  sidebar: (open) => ({ width: 240, minHeight: "100vh", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200, overflowY: "auto", transform: open ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)" }),
  navItem: (a) => ({ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: a ? C.accentDim : "transparent", color: a ? C.accent : C.textMid, fontSize: 13, fontWeight: a ? 600 : 400, transition: "background 0.12s", border: "none", width: "100%", textAlign: "left", fontFamily: "inherit" }),
  avatar: (sz = 32) => ({ width: sz, height: sz, borderRadius: "50%", background: C.accentDim, border: `2px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(sz * 0.38, 10), fontWeight: 700, color: C.accent, flexShrink: 0 }),
  btn: (v = "primary") => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "9px 16px", borderRadius: 10,
    background: v === "primary" ? C.accent : v === "danger" ? C.dangerDim : v === "outline" ? "transparent" : v === "ghost" ? "transparent" : C.surfaceHi,
    color:      v === "primary" ? "#fff"   : v === "danger" ? C.danger   : C.textMid,
    border:     v === "outline" ? `1px solid ${C.border}` : v === "danger" ? `1px solid ${C.danger}44` : "1px solid transparent",
    fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit",
    boxShadow: v === "primary" ? `0 1px 3px ${C.accent}55` : "none",
  }),
  badge: (s) => {
    const map = { planned:{color:C.amber,bg:C.amberDim}, confirmed:{color:C.green,bg:C.greenDim}, cancelled:{color:C.textMid,bg:C.surfaceHi} };
    const t = map[s] || map.cancelled;
    return { display:"inline-flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:600, color:t.color, background:t.bg };
  },
  attendBadge: (s) => {
    const map = { confirmed:{color:C.green,bg:C.greenDim}, open:{color:C.textMid,bg:C.surfaceHi}, sick:{color:C.danger,bg:C.dangerDim}, absent:{color:C.purple,bg:C.purpleDim} };
    const t = map[s] || map.open;
    return { display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:600, color:t.color, background:t.bg };
  },
  roleBadge: (r) => {
    const map = { admin:{color:C.accent,bg:C.accentDim}, crew:{color:C.purple,bg:C.purpleDim}, actor:{color:C.green,bg:C.greenDim} };
    const t = map[r] || map.crew;
    return { display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:600, color:t.color, background:t.bg };
  },
  tag: (color) => ({ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:(color||C.accent)+"1E", color:(color||C.accent) }),
  toggle: (a) => ({ padding:"7px 14px", borderRadius:8, border:"none", background:a?C.surfaceHi:"transparent", color:a?C.text:C.textDim, fontSize:12, fontWeight:a?600:400, cursor:"pointer", fontFamily:"inherit" }),
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
// ─── Swiss-standard legal documents ─────────────────────────────────────────
function TermsContent() {
  const s = { h: { fontSize:14, fontWeight:700, color:C.text, marginTop:20, marginBottom:6 }, p: { fontSize:13, color:C.textMid, lineHeight:1.7, marginBottom:8 } };
  return (
    <div>
      <p style={{ color:C.text, fontWeight:700, fontSize:15, marginBottom:4 }}>Nutzungsbedingungen — ShootPlan Production Suite</p>
      <p style={{ color:C.textDim, fontSize:11, marginBottom:20 }}>Version 1.0 · Stand: Januar 2025 · Anbieter: Starantor Media, Schweiz</p>
      <p style={s.h}>1. Geltungsbereich</p>
      <p style={s.p}>Diese Nutzungsbedingungen regeln die Nutzung der ShootPlan Production Suite durch registrierte Benutzer. Mit der Registrierung akzeptierst du diese Bedingungen vollumfänglich.</p>
      <p style={s.h}>2. Leistungsumfang</p>
      <p style={s.p}>ShootPlan stellt eine webbasierte Plattform zur Organisation von Film- und Fotoproduktionen bereit, einschliesslich Shoot-Verwaltung, Shotlisten, Equipment-Tracking, Netzwerkfunktionen und E-Mail-Benachrichtigungen.</p>
      <p style={s.h}>3. Registrierung & Zugangsdaten</p>
      <p style={s.p}>Du bist verpflichtet, bei der Registrierung wahrheitsgemässe Angaben zu machen. Deine Zugangsdaten sind vertraulich zu halten. Du bist für alle Aktivitäten unter deinem Account verantwortlich.</p>
      <p style={s.h}>4. Nutzungsregeln</p>
      <p style={s.p}>Die Plattform darf ausschliesslich für legale Zwecke genutzt werden. Verboten sind insbesondere das Einbringen rechtswidriger Inhalte, Missbrauch der Infrastruktur, unbefugter Zugriff auf fremde Daten sowie jede Form von Systemmanipulation.</p>
      <p style={s.h}>5. Inhalte & Eigentum</p>
      <p style={s.p}>Du behältst das Eigentum an deinen Inhalten. Du räumst Starantor Media das nicht-exklusive Recht ein, diese zur Bereitstellung des Dienstes zu verarbeiten und zu speichern.</p>
      <p style={s.h}>6. Haftungsbeschränkung</p>
      <p style={s.p}>Die Haftung von Starantor Media ist auf Vorsatz und grobe Fahrlässigkeit beschränkt. Für mittelbare Schäden, entgangenen Gewinn oder Datenverlust wird keine Haftung übernommen, soweit gesetzlich zulässig.</p>
      <p style={s.h}>7. Änderungen</p>
      <p style={s.p}>Wesentliche Änderungen dieser Bedingungen werden per E-Mail oder beim nächsten Login mitgeteilt. Die weitere Nutzung gilt als Zustimmung.</p>
      <p style={s.h}>8. Anwendbares Recht & Gerichtsstand</p>
      <p style={s.p}>Es gilt Schweizer Recht. Gerichtsstand ist der Sitz von Starantor Media in der Schweiz. Die Anwendung des UN-Kaufrechts (CISG) ist ausgeschlossen.</p>
      <p style={s.h}>9. Kontakt</p>
      <p style={s.p}>Starantor Media · Schweiz · info@starantor.com</p>
    </div>
  );
}

function PrivacyContent() {
  const s = { h: { fontSize:14, fontWeight:700, color:C.text, marginTop:20, marginBottom:6 }, p: { fontSize:13, color:C.textMid, lineHeight:1.7, marginBottom:8 } };
  return (
    <div>
      <p style={{ color:C.text, fontWeight:700, fontSize:15, marginBottom:4 }}>Datenschutzerklärung — ShootPlan Production Suite</p>
      <p style={{ color:C.textDim, fontSize:11, marginBottom:20 }}>Version 1.0 · Stand: Januar 2025 · gemäss Schweizer nDSG & DSGVO</p>
      <p style={s.h}>1. Verantwortliche Stelle</p>
      <p style={s.p}>Starantor Media · Schweiz · info@starantor.com · shootplan.starantor.com</p>
      <p style={s.h}>2. Erhobene Daten</p>
      <p style={s.p}>Wir erheben Name, E-Mail-Adresse, Rolle (Registrierung); von dir erstellte Inhalte (Shoots, Shotlisten, Equipment, Netzwerke); technische Zugriffsdaten (IP, Browser, Zeitstempel).</p>
      <p style={s.h}>3. Zweck der Verarbeitung</p>
      <p style={s.p}>Deine Daten werden ausschliesslich zur Bereitstellung der Plattformfunktionen, Kontoverwaltung, Versendung von Benachrichtigungen sowie zur Sicherstellung des Betriebs verwendet.</p>
      <p style={s.h}>4. Rechtsgrundlage</p>
      <p style={s.p}>Die Verarbeitung erfolgt auf Basis deiner Einwilligung (Registrierung), zur Vertragserfüllung sowie auf Grundlage berechtigter Interessen. Es gilt das Schweizer nDSG sowie ergänzend die DSGVO für EU-Nutzende.</p>
      <p style={s.h}>5. Drittanbieter & Auftragsverarbeiter</p>
      <p style={s.p}><strong style={{color:C.text}}>Supabase</strong> (Datenbankhosting, EU – SCC); <strong style={{color:C.text}}>Vercel</strong> (Hosting, USA – SCC); <strong style={{color:C.text}}>Resend</strong> (E-Mail-Versand). Mit allen Auftragsverarbeitern bestehen Verträge zur Auftragsverarbeitung.</p>
      <p style={s.h}>6. Datenspeicherung & Löschung</p>
      <p style={s.p}>Deine Daten werden für die Dauer der aktiven Nutzung gespeichert. Nach Account-Löschung werden personenbezogene Daten innerhalb von 30 Tagen gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.</p>
      <p style={s.h}>7. Deine Rechte (nDSG & DSGVO)</p>
      <p style={s.p}>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenportabilität und Widerspruch. Anfragen an: info@starantor.com</p>
      <p style={s.h}>8. Cookies & Lokaler Speicher</p>
      <p style={s.p}>Wir verwenden ausschliesslich technisch notwendige Browserdaten (localStorage) zur Sitzungsverwaltung. Keine Tracking-Cookies, keine Analyse-Tools.</p>
      <p style={s.h}>9. Beschwerderecht</p>
      <p style={s.p}>Du kannst Beschwerde beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) einreichen: edoeb.admin.ch</p>
    </div>
  );
}

// TermsAcceptanceModal — shown after login for users who haven't accepted yet
function TermsAcceptanceModal({ user, onAccept }) {
  const [tab, setTab] = useState("terms");
  const [readTerms, setReadTerms] = useState(false);
  const [readPrivacy, setReadPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const canAccept = readTerms && readPrivacy;

  const markRead = (e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 80) {
      if (tab === "terms") setReadTerms(true);
      else setReadPrivacy(true);
    }
  };

  const handleAccept = async () => {
    setSaving(true);
    try {
      await db.update("users", { terms_accepted_at: new Date().toISOString() }, `id=eq.${user.id}`);
      onAccept();
    } catch(e) { alert("Fehler: " + e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:`rgba(0,0,0,${_themeMode==="dark"?0.88:0.55})`, display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000, padding:20, backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:28, width:"100%", maxWidth:640, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:`0 40px 100px rgba(0,0,0,${_themeMode==="dark"?0.7:0.2})` }}>
        {/* Header */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:4 }}>Nutzungsbedingungen & Datenschutz</div>
          <div style={{ fontSize:13, color:C.textDim }}>Bitte lies und akzeptiere beide Dokumente um ShootPlan zu verwenden.</div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:14, background:C.surfaceHi, borderRadius:10, padding:4 }}>
          {[{k:"terms",l:"📋 Nutzungsbedingungen",r:readTerms},{k:"privacy",l:"🔒 Datenschutz",r:readPrivacy}].map(t => (
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:12,
                background:tab===t.k ? C.surface : "transparent",
                color:tab===t.k ? C.text : C.textDim,
                boxShadow:tab===t.k ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {t.r && <span style={{ color:C.green, fontSize:14 }}>✓</span>}
              {t.l}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div onScroll={markRead} style={{ flex:1, overflowY:"auto", marginBottom:16, paddingRight:4 }}>
          {tab==="terms" ? <TermsContent /> : <PrivacyContent />}
          <div style={{ textAlign:"center", padding:"20px 0 8px", fontSize:11, color:C.textDim }}>
            {(tab==="terms" ? readTerms : readPrivacy) ? <span style={{color:C.green}}>✓ Gelesen</span> : "↓ Bis zum Ende scrollen"}
          </div>
        </div>

        {/* Progress indicators */}
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          {[{r:readTerms,l:"Nutzungsbedingungen"},{r:readPrivacy,l:"Datenschutz"}].map((item,i) => (
            <div key={i} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10,
              background:item.r ? "rgba(48,209,88,0.08)" : C.surfaceHi,
              border:`1px solid ${item.r ? "#30D15844" : C.border}` }}>
              <span style={{ fontSize:15 }}>{item.r ? "✅" : "○"}</span>
              <span style={{ fontSize:12, color:item.r ? C.green : C.textDim }}>{item.l}</span>
            </div>
          ))}
        </div>

        <button
          style={{ ...S.btn(canAccept?"primary":"outline"), justifyContent:"center", padding:"13px", opacity:canAccept?1:0.5 }}
          onClick={handleAccept} disabled={!canAccept||saving}>
          {saving ? "Wird gespeichert..." : canAccept ? "✅ Beide Dokumente akzeptieren & fortfahren" : "Bitte beide Dokumente lesen"}
        </button>
      </div>
    </div>
  );
}


function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("crew");
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false); // "terms" | "privacy" | false

  const handleLogin = async () => {
    const rlErr = RL.login();
    if (rlErr) { setError(rlErr); return; }
    const valErr = V.check([
      ["E-Mail",   V.email(email),          "Ungültige E-Mail-Adresse"],
      ["Passwort", V.password(password),    "Passwort muss 8–128 Zeichen haben"],
    ]);
    if (valErr) { setError(valErr); return; }
    setLoading(true); setError("");
    try {
      const data = await db.signIn(email.trim().toLowerCase(), password);
      db.setToken(data.access_token);
      // Supabase Auth UUID — this is the canonical user ID used in all FK references
      const authId = data.user?.id;
      const profiles = await db.select("users", `email=eq.${encodeURIComponent(email.trim().toLowerCase())}`);
      if (!profiles.length) throw new Error("Kein Benutzerprofil gefunden.");
      if (!profiles[0].is_approved) throw new Error("Dein Account wartet noch auf Freigabe durch einen Admin.");
      // If users.id does not match auth UUID, patch it once so all FK references are consistent
      let profile = profiles[0];
      if (authId && profile.id !== authId) {
        try {
          await db.update("users", { id: authId }, `email=eq.${encodeURIComponent(email.trim().toLowerCase())}`);
          profile = { ...profile, id: authId };
        } catch(e) { /* id may be PK — cannot update, use as-is */ }
      }
      onLogin(profile, data.access_token, data.refresh_token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    const rlErr = RL.register();
    if (rlErr) { setError(rlErr); return; }
    const valErr = V.check([
      ["Name",     V.name(name),           "Name muss 2–80 Zeichen haben"],
      ["E-Mail",   V.email(email),         "Ungültige E-Mail-Adresse"],
      ["Passwort", V.password(password),   "Passwort muss 8–128 Zeichen haben"],
      ["AGB",      termsAccepted,          "Bitte akzeptiere die Nutzungsbedingungen und Datenschutzerklärung"],
    ]);
    if (valErr) { setError(valErr); return; }
    setLoading(true); setError("");
    try {
      const signUpData = await db.signUp(email.trim().toLowerCase(), password);
      const authId = signUpData.user?.id;
      await db.insert("users", sanitizeObj({ id: authId || undefined, name: name.trim(), email: email.trim().toLowerCase(), role, is_admin: false, is_approved: false, must_change_password: false, terms_accepted_at: new Date().toISOString() }));
      try { const admins = await db.select("users", "is_admin=eq.true&is_approved=eq.true"); for (const adm of admins) { notify("new_user_registration", adm.email, { user_name: name, user_email: email, user_role: role }); } } catch(e) {}
      setSuccess("Account erstellt! Du wirst benachrichtigt sobald ein Admin deinen Account freigibt.");
      setMode("login"); setName(""); setPassword("");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <>
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, background: C.accent, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: `0 4px 16px ${C.accent}44` }}>🎬</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.text }}>ShootPlan</div>
              <div style={{ fontSize: 11, color: C.textDim }}>Production Suite</div>
            </div>
          </div>
          <div style={{ height: 1, background: C.border }} />
        </div>

        <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 4, display: "flex", marginBottom: 20 }}>
          <button style={{ ...S.toggle(mode === "login"), flex: 1, borderRadius: 6 }} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Anmelden</button>
          <button style={{ ...S.toggle(mode === "register"), flex: 1, borderRadius: 6 }} onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Registrieren</button>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24 }}>
          {success && <div style={{ fontSize: 13, color: C.green, padding: "10px 12px", background: C.greenDim, borderRadius: 6, marginBottom: 14 }}>{success}</div>}
          {error && <div style={{ fontSize: 12, color: C.danger, padding: "10px 13px", background: C.dangerDim, borderRadius: 10, marginBottom: 12, borderLeft: `3px solid ${C.danger}` }}>{error}</div>}

          {mode === "login" ? (<>
            <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>E-Mail</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            <div style={{ marginBottom: 20 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Passwort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={handleLogin} disabled={loading}>{loading ? "Anmelden..." : "Anmelden →"}</button>
          </>) : (<>
            <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Name</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} placeholder="Vorname Nachname" value={name} onChange={e => setName(e.target.value)} /></div>
            <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>E-Mail</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Passwort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" placeholder="Min. 8 Zeichen" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Ich bin...</label>
              <select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={role} onChange={e => setRole(e.target.value)}>
                <option value="crew">Crew-Mitglied</option>
                <option value="actor">Schauspieler/in</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16, padding: "10px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 6 }}>ℹ️ Dein Account wird nach der Registrierung von einem Admin freigeschaltet.</div>
            {/* Terms acceptance checkbox */}
            <div style={{ marginBottom:16, padding:"12px 14px", background:C.surfaceHi, borderRadius:10, border:`1px solid ${termsAccepted ? C.green+"55" : C.border}`, transition:"border-color 0.15s" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <input type="checkbox" id="cb_terms" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}
                  style={{ marginTop:2, flexShrink:0, accentColor:C.accent, width:15, height:15, cursor:"pointer" }} />
                <label htmlFor="cb_terms" style={{ fontSize:12, color:C.textMid, cursor:"pointer", lineHeight:1.6, userSelect:"none" }}>
                  Ich akzeptiere die{" "}
                  <span style={{ color:C.accent, textDecoration:"underline", cursor:"pointer" }} onClick={e=>{e.preventDefault();e.stopPropagation();setShowTerms("terms");}}>Nutzungsbedingungen</span>
                  {" "}und die{" "}
                  <span style={{ color:C.accent, textDecoration:"underline", cursor:"pointer" }} onClick={e=>{e.preventDefault();e.stopPropagation();setShowTerms("privacy");}}>Datenschutzerklärung</span>
                  {" "}der ShootPlan Production Suite.
                </label>
              </div>
            </div>
            <button style={{ ...S.btn(termsAccepted?"primary":"outline"), width:"100%", justifyContent:"center", padding:"12px", opacity:termsAccepted?1:0.55 }}
              onClick={handleRegister} disabled={loading||!termsAccepted}>
              {loading ? "Registrieren..." : "Account erstellen"}
            </button>
          </>)}
        </div>
      </div>
    </div>

    {/* Terms / Privacy Modal — rendered outside main div so it overlays correctly */}
    {showTerms && (
      <div style={{ position:"fixed", inset:0, background:`rgba(0,0,0,${_themeMode==="dark"?0.8:0.5})`, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:20, backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)" }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:28, width:"100%", maxWidth:620, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:`0 32px 80px rgba(0,0,0,${_themeMode==="dark"?0.6:0.18})` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{showTerms==="terms" ? "📋 Nutzungsbedingungen" : "🔒 Datenschutzerklärung"}</div>
            <button style={{ background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:22, lineHeight:1 }} onClick={()=>setShowTerms(false)}>✕</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", marginBottom:20 }}>
            {showTerms==="terms" ? <TermsContent /> : <PrivacyContent />}
          </div>
          <button style={{ ...S.btn("primary"), justifyContent:"center" }} onClick={()=>{ setTermsAccepted(true); setShowTerms(false); }}>
            ✅ Gelesen & Akzeptiert
          </button>
        </div>
      </div>
    )}
    </>
  );
}

function ChangePasswordPage({ user, onDone }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [error, setError] = useState("");
  const handleSave = async () => { const cpwErr = V.check([["Passwort", V.password(pw), "Passwort muss 8–128 Zeichen haben"], ["Wiederholung", pw === pw2, "Passwörter stimmen nicht überein"]]); if (cpwErr) { setError(cpwErr); return; } try { await db.update("users", { must_change_password: false }, `id=eq.${user.id}`); onDone(); } catch (e) { setError(e.message); } };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "inherit" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>ShootPlan</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Neues Passwort setzen</div>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24 }}>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Neues Passwort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" value={pw} onChange={e => setPw(e.target.value)} /></div>
          <div style={{ marginBottom: 18 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Wiederholen</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
          {error && <div style={{ fontSize: 12, color: C.danger, padding: "10px 13px", background: C.dangerDim, borderRadius: 10, marginBottom: 12, borderLeft: `3px solid ${C.danger}` }}>{error}</div>}
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
  const [theme, setTheme] = useState(_themeMode);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    _themeMode = next;
    Object.assign(C, THEMES[next]);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sp_theme', next); } catch(e) {}
      document.documentElement.setAttribute('data-theme', next);
    }
    setTheme(next);
  };
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
    { id: "marketplace", icon: "📦", label: "Marktplatz" },
    { section: "Datenbanken" },
    { id: "clients", icon: "🏢", label: "Kunden" },
    { id: "actors", icon: "🎭", label: "Schauspieler" },
    { section: "Mein Konto" },
    { id: "my-equipment", icon: "🎥", label: "Mein Equipment" },
    { id: "profile", icon: "👤", label: "Profil & Passwort" },
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
    { id: "marketplace", icon: "📦", label: "Marktplatz" },
    { section: "Mein Konto" },
    { id: "my-equipment", icon: "🎥", label: "Mein Equipment" },
    { id: "profile", icon: "👤", label: "Profil & Passwort" },
  ];
  const nav = user.is_admin ? adminNav : crewNav;

  const SidebarContent = () => (
    <>
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: C.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🎬</div>
          <div><div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>ShootPlan</div><div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>Production Suite</div></div>
        </div>
      </div>
      <div style={{ padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.map((item, i) => item.section
          ? <div key={i} style={{ fontSize: 10, fontWeight: 600, color: C.textDim, letterSpacing: "0.05em", textTransform: "uppercase", padding: "14px 8px 4px" }}>{item.section}</div>
          : <div key={item.id} style={S.navItem(page === item.id || page.startsWith(item.id + "-"))} onClick={() => { setPage(item.id); setSidebarOpen(false); }}><span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span><span>{item.label}</span></div>
        )}
      </div>
      <div style={{padding:"12px 16px", borderTop:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, flexDirection:"column", gap:10, padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,width:"100%"}}>
          <div style={S.avatar(32)}>{user.name?.[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: C.textDim }}>{ROLE_CONFIG[user.role]?.label || (user.is_admin ? "Admin" : "Crew")}</div>
          </div>
          <button style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, padding:"4px", borderRadius:6 }} onClick={onLogout} title="Abmelden">↩</button>
        </div>
        <button onClick={toggleTheme} style={{ width:"100%", padding:"7px 12px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surfaceHi, color:C.textMid, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>
    </>
  );

  if (mobile) {
    return (
      <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh", transition: "background 0.25s,color 0.25s" }}>
        {sidebarOpen && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 150, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => setSidebarOpen(false)} />}
        <div style={S.sidebar(sidebarOpen)}><SidebarContent /></div>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
            <button style={{ background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 20, padding: "4px", display: "flex", alignItems: "center" }} onClick={() => setSidebarOpen(true)}>☰</button>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase" }}>ShootPlan</div></div>
            <div style={S.avatar(30)}>{user.name?.[0]}</div>
          </div>
          <div style={{ flex: 1, padding: "20px 16px", maxWidth: "100%", boxSizing: "border-box" }}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh", transition: "background 0.25s,color 0.25s", display: "flex" }}>
      <div style={{ width: 240, minHeight: "100vh", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200, overflowY: "auto" }}><SidebarContent /></div>
      <div style={{ marginLeft: 240, flex: 1, padding: "32px 36px", maxWidth: "calc(100vw - 240px)", boxSizing: "border-box" }}>{children}</div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ user, shoots, participants, setPage, setSelectedShoot }) {
  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visible = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id) || s.created_by === user.id);
  const now = new Date();
  const upcoming = visible.filter(s => new Date((s.date_end || s.date_start) + "T23:59:59") >= now && s.status !== "cancelled");
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Guten Tag, {user.name?.split(" ")[0]} 👋</div><div style={{ fontSize: 12, color: C.textDim }}>{now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div></div>
        <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neuer Shoot</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom: 24 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>{upcoming.length}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Bevorstehend</div></div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>{visible.filter(s => s.status === "confirmed").length}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Bestätigt</div></div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>{visible.filter(s => { const d = new Date(s.date_start); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Diesen Monat</div></div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.text }}>Nächste Shoots</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {upcoming.slice(0, 5).map(shoot => {
          const sp = participants.filter(p => p.shoot_id === shoot.id);
          const myP = sp.find(p => p.user_id === user.id);
          const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
          return (
            <div key={shoot.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px 18px", cursor:"pointer", transition:"background 0.12s", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 12 }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
              <div style={{ width: 4, height: 44, borderRadius: 2, background: sc.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{shoot.title}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{fmtRange(shoot.date_start, shoot.date_end)} · {shoot.location}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                <span style={S.badge(shoot.status)}>{sc.label}</span>
              </div>
            </div>
          );
        })}
        {upcoming.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 40, color: C.textDim }}><div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div><div>Keine bevorstehenden Shoots</div><button style={{ ...S.btn("primary"), marginTop: 14 }} onClick={() => setPage("new-shoot")}>Ersten Shoot erstellen</button></div>}
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
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{date.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={S.btn("outline")} onClick={() => exportToICS(shoots)}>📥 Export</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month-1, 1))}>‹</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date())}>Heute</button>
          <button style={S.btn("outline")} onClick={() => setDate(new Date(year, month+1, 1))}>›</button>
        </div>
      </div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 6 }}>
          {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.textDim, padding: "3px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((day, idx) => (
            <div key={idx} style={{ minHeight: 64, background: isToday(day) ? "rgba(99,102,241,0.1)" : "#0A0A0F", borderRadius: 6, padding: "5px 6px", border: isToday(day) ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent" }}>
              {day && (<><div style={{ fontSize: 12, fontWeight: isToday(day) ? 800 : 400, color: isToday(day) ? C.accent : C.textDim, marginBottom: 3 }}>{day}</div>{getShootsForDay(day).map(s => { const c = STATUS_CONFIG[s.status]||STATUS_CONFIG.planned; return <div key={s.id} style={{ fontSize: 9, fontWeight: 600, padding: "1px 4px", borderRadius: 3, background: c.color+"22", color: c.color, marginBottom: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => { setSelectedShoot(s); setPage("shoot-detail"); }}>{s.title}</div>; })}</>)}
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
  const visible = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id) || s.created_by === user.id);
  const filtered = (filter === "all" ? visible : visible.filter(s => s.status === filter)).filter(s => !search || s.title?.toLowerCase().includes(search.toLowerCase()) || s.location?.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>{user.is_admin ? "Alle Shoots" : "Meine Shoots"}</div><div style={{ fontSize: 12, color: C.textDim }}>{sorted.length} Produktionen</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={S.btn("primary")} onClick={() => setPage("new-shoot")}>＋ Neu</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", maxWidth: 220 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.btn("outline")} onClick={() => exportToICS(sorted)}>📥 .ics</button>
        <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8, padding: 3, display: "flex" }}>
          <button style={S.toggle(view === "list")} onClick={() => setView("list")}>☰</button>
          <button style={S.toggle(view === "calendar")} onClick={() => setView("calendar")}>📅</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","Alle"],["planned","Geplant"],["confirmed","Bestätigt"],["cancelled","Abgesagt"]].map(([val,lbl]) => (
          <button key={val} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: filter===val?C.accent:C.border, background: filter===val?"rgba(99,102,241,0.15)":"transparent", color: filter===val?C.accent:C.textDim, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setFilter(val)}>{lbl}</button>
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
              <div key={shoot.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px 18px", cursor:"pointer", transition:"background 0.12s", boxShadow:C.shadow, display: "flex", gap: 12, alignItems: "center" }} onClick={() => { setSelectedShoot(shoot); setPage("shoot-detail"); }}>
                <div style={{ minWidth: 44, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{new Date(shoot.date_start + "T12:00:00").getDate().toString().padStart(2,"0")}</div>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>{new Date(shoot.date_start + "T12:00:00").toLocaleString("de-DE",{month:"short"})}</div>
                  {isMultiDay && <div style={{ fontSize: 9, color: C.accent, fontWeight: 700 }}>MULTI</div>}
                </div>
                <div style={{ width: 1, height: 36, background: C.border, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{shoot.title}</div>
                  <div style={{ fontSize: 12, color: C.textDim }}>{shoot.location}{client ? ` · 🏢 ${client.company}` : ""}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {myP && <span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span>}
                  <span style={S.badge(shoot.status)}>{sc.label}</span>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 40, color: C.textDim }}><div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div><div>Keine Shoots gefunden</div><button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setPage("new-shoot")}>Erstellen</button></div>}
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
    try { const item = await db.insert("shoot_rental_equipment", sanitizeObj({ ...rentalForm, shoot_id: shoot.id, daily_rate: parseFloat(rentalForm.daily_rate)||0, quantity: parseInt(rentalForm.quantity)||1 })); const nl = [...rentalEquip, item]; setRentalEquip(nl); await syncBudget(nl); setShowAddRental(false); setRentalForm({ name: "", category: "", daily_rate: "", quantity: 1, notes: "" }); } catch (e) { alert(e.message); }
  };
  const removeRentalEquip = async (id) => { try { await db.remove("shoot_rental_equipment", `id=eq.${id}`); const nl = rentalEquip.filter(r => r.id !== id); setRentalEquip(nl); await syncBudget(nl); } catch (e) { alert(e.message); } };
  const updateRentalField = async (id, field, val) => { const nl = rentalEquip.map(r => r.id === id ? { ...r, [field]: val } : r); setRentalEquip(nl); try { await db.update("shoot_rental_equipment", { [field]: val }, `id=eq.${id}`); await syncBudget(nl); } catch (e) {} };
  const myShootEquipIds = new Set(shootEquip.filter(e => e.user_id === user.id).map(e => e.user_equipment_id));
  const addMyEquipToShoot = async (eq) => { if (myShootEquipIds.has(eq.id)) return; try { const item = await db.insert("shoot_equipment", sanitizeObj({ shoot_id: shoot.id, user_id: user.id, user_equipment_id: eq.id, name: eq.name, category: eq.category, notes: eq.notes })); setShootEquip(p => [...p, item]); } catch (e) { alert(e.message); } };
  const removeMyEquipFromShoot = async (id) => { try { await db.remove("shoot_equipment", `id=eq.${id}`); setShootEquip(p => p.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };

  const sp = participants.filter(p => p.shoot_id === shoot.id);
  const shots = shotlist.filter(s => s.shoot_id === shoot.id);
  const sched = [...schedule.filter(s => s.shoot_id === shoot.id)].sort((a,b) => (a.time||"").localeCompare(b.time||""));
  const myP = sp.find(p => p.user_id === user.id);
  const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
  const canEditShoot = user.is_admin || shoot.created_by === user.id;
  const shootClient = clients.find(c => c.id === shoot.client_id);
  const links = (() => { try { return JSON.parse(shoot.shared_links || "[]"); } catch { return []; } })();

  const handleSave = async () => {
    if (!canEditShoot) return;
    setSaving(true);
    try { await db.update("shoots", sanitizeObj({ title: form.title, location: form.location, date_start: form.date_start, date_end: form.date_end || form.date_start, start_time: form.start_time, end_time: form.end_time, budget: form.budget || null, notes: form.notes, status: form.status, client_id: form.client_id || null, shared_links: form.shared_links || "[]" }), `id=eq.${shoot.id}`); setShoot({ ...shoot, ...form }); setEditMode(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleAddLink = async () => { if (!linkForm.url) return; if (!V.url(linkForm.url)) { alert("Bitte eine gültige URL eingeben (https://...)"); return; } const updated = JSON.stringify([...links, { ...linkForm, id: Date.now() }]); try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); setShowAddLink(false); setLinkForm({ label: "", url: "", type: "drive" }); } catch (e) { alert(e.message); } };
  const handleRemoveLink = async (id) => { if (!canEditShoot) return; const updated = JSON.stringify(links.filter(l => l.id !== id)); try { await db.update("shoots", { shared_links: updated }, `id=eq.${shoot.id}`); setShoot({ ...shoot, shared_links: updated }); setForm(f => ({ ...f, shared_links: updated })); } catch (e) { alert(e.message); } };
  const handleStatusChange = async (pId, val) => { try { await db.update("shoot_participants", { attendance_status: val }, `id=eq.${pId}`); setParticipants(prev => prev.map(p => p.id === pId ? { ...p, attendance_status: val } : p)); } catch (e) { alert(e.message); } };
  const handleAddP = async () => { if (!addUserId || !canEditShoot) return; try { const np = await db.insert("shoot_participants", { shoot_id: shoot.id, user_id: addUserId, role_on_shoot: addRole || "Crew", attendance_status: "open" }); setParticipants(prev => [...prev, np]); setShowAddP(false); setAddUserId(""); setAddRole(""); } catch (e) { alert(e.message); } };
  const handleRemoveP = async (pId) => { if (!canEditShoot) return; try { await db.remove("shoot_participants", `id=eq.${pId}`); setParticipants(prev => prev.filter(p => p.id !== pId)); } catch (e) { alert(e.message); } };
  // next part/scene/shot numbers
  const nextPartNum = () => { const nums = shots.map(s => parseInt(s.part_num)||1); return shots.length ? Math.max(...nums) : 1; };
  const nextSceneNum = (part) => { const nums = shots.filter(s => s.part_num===part).map(s => parseInt(s.scene_num)||1); return nums.length ? Math.max(...nums) : 1; };
  const nextShotNum = (part, scene) => { const nums = shots.filter(s => s.part_num===part && s.scene_num===scene).map(s => parseInt(s.shot_num)||1); return nums.length ? Math.max(...nums)+1 : 1; };
  const addShot = async (partNum=1, sceneNum=1) => {
    const shotNum = nextShotNum(partNum, sceneNum);
    try { const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: sceneNum, shot_num: shotNum, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" })); setShotlist(prev => [...prev, s]); } catch (e) { alert(e.message); }
  };
  const addScene = async (partNum=1) => {
    const sceneNum = nextSceneNum(partNum) + (shots.filter(s=>s.part_num===partNum).length ? 1 : 0);
    try { const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: sceneNum, shot_num: 1, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" })); setShotlist(prev => [...prev, s]); } catch (e) { alert(e.message); }
  };
  const addPart = async () => {
    const partNum = nextPartNum() + (shots.length ? 1 : 0);
    try { const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: 1, shot_num: 1, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" })); setShotlist(prev => [...prev, s]); } catch (e) { alert(e.message); }
  };
  const updateShot = async (id, field, val) => { setShotlist(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s)); try { await db.update("shotlist", { [field]: val }, `id=eq.${id}`); } catch (e) {} };
  const deleteShot = async (id) => { try { await db.remove("shotlist", `id=eq.${id}`); setShotlist(prev => prev.filter(s => s.id !== id)); } catch (e) { alert(e.message); } };
  const uploadShotImage = async (shotId, file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result;
      // Store base64 image as data URL in image_url field (works without storage bucket)
      updateShot(shotId, "image_url", b64);
    };
    reader.readAsDataURL(file);
  };
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
          {editMode ? <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", fontSize: 18, fontWeight: 700, marginBottom: 6 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            : <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>{shoot.title}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={S.badge(shoot.status)}>{sc.label}</span>
            <span style={{ fontSize: 12, color: C.textDim }}>{fmtRange(shoot.date_start, shoot.date_end)}</span>
            {shoot.location && <span style={{ fontSize: 12, color: C.textDim }}>📍 {shoot.location}</span>}
            {shootClient && <span style={{ fontSize: 12, color: C.accent }}>🏢 {shootClient.company}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={S.btn("outline")} onClick={() => exportToICS([shoot])}>📥</button>
          {canEditShoot && !editMode && <button style={S.btn("outline")} onClick={() => setEditMode(true)}>✏️</button>}
          {editMode && <><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"...":"Speichern"}</button><button style={S.btn("ghost")} onClick={() => { setEditMode(false); setForm({ ...shoot }); }}>✕</button></>}
          {canEditShoot && <button style={S.btn("danger")} onClick={() => onDelete(shoot.id)}>🗑</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1E1E2E", overflowX: "auto" }}>
        {tabs.map(([id,lbl]) => (
          <button key={id} style={{ padding: "9px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab===id?700:400, color: tab===id?C.accent:C.textDim, borderBottom: tab===id?"2px solid #6366F1":"2px solid transparent", marginBottom: -1, whiteSpace: "nowrap" }} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Details</div>
              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Titel</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
                  <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Location</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.location||""} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Startdatum</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={form.date_start||""} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Enddatum</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={form.date_end||""} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Startzeit</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="time" value={form.start_time||""} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
                    <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Endzeit</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="time" value={form.end_time||""} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
                  </div>
                  <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kunde</label>
                    <select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={form.client_id||""} onChange={e=>setForm(f=>({...f,client_id:e.target.value||null}))}>
                      <option value="">Kein Kunde</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
                    </select>
                  </div>
                  <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Budget (€)</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" value={form.budget||""} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
                  <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Status</label><select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {[["📅", fmtRange(shoot.date_start, shoot.date_end)], ["🕒", shoot.start_time ? `${shoot.start_time} – ${shoot.end_time}` : "—"], ["📍", shoot.location||"—"], ["🏢", shootClient?.company||"—"], ["💶", shoot.budget ? `€ ${Number(shoot.budget).toLocaleString("de-DE")}` : "—"]].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 14 }}>{k}</span><span style={{ fontSize: 13, color: C.text }}>{v}</span></div>
                  ))}
                </div>
              )}
            </div>
            {myP && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Mein Status</div>
                <div style={{ marginBottom: 10 }}><span style={S.attendBadge(myP.attendance_status)}>{ATTEND_CONFIG[myP.attendance_status]?.label}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(ATTEND_CONFIG).map(([k,v]) => (<button key={k} style={{ padding: "5px 11px", borderRadius: 20, border: `1px solid ${myP.attendance_status===k?v.color:C.border}`, background: myP.attendance_status===k?v.bg:"transparent", color: myP.attendance_status===k?v.color:C.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => handleStatusChange(myP.id, k)}>{v.label}</button>))}
                </div>
              </div>
            )}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 12, letterSpacing: "0.5px", textTransform: "uppercase" }}>Notizen</div>
            {editMode ? <textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={8}/> : <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{shoot.notes||"Keine Notizen"}</div>}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Dokumente ({links.length})</div>
            {canEditShoot && <button style={S.btn("primary")} onClick={() => setShowAddLink(true)}>＋ Link</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map(link => (
              <div key={link.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>{linkIcon(link.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{link.label || "Dokument"}</div>
                  <div style={{ fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                </div>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surfaceHi, color: C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>Öffnen →</a>
                {canEditShoot && <button style={S.btn("danger")} onClick={() => handleRemoveLink(link.id)}>✕</button>}
              </div>
            ))}
            {links.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 40, color: C.textDim }}><div style={{ fontSize: 36, marginBottom: 10 }}>📁</div><div>Keine Dokumente hinterlegt</div>{canEditShoot && <button style={{ ...S.btn("primary"), marginTop: 12 }} onClick={() => setShowAddLink(true)}>＋ Link hinzufügen</button>}</div>}
          </div>
          {showAddLink && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Dokument hinzufügen</div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Typ</label><select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={linkForm.type} onChange={e=>setLinkForm(f=>({...f,type:e.target.value}))}><option value="drive">📁 Google Drive</option><option value="onedrive">☁️ OneDrive / SharePoint</option><option value="dropbox">📦 Dropbox</option><option value="other">🔗 Anderer Link</option></select></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Bezeichnung</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={linkForm.label} onChange={e=>setLinkForm(f=>({...f,label:e.target.value}))} placeholder="z. B. Callsheet, Storyboard..."/></div>
            <div style={{ marginBottom: 18 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Shared Link URL</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={linkForm.url} onChange={e=>setLinkForm(f=>({...f,url:e.target.value}))} placeholder="https://..."/></div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddLink}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddLink(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}

      {tab === "crew" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Crew ({sp.length})</div>
            {canEditShoot && <button style={S.btn("primary")} onClick={() => setShowAddP(true)}>＋</button>}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {Object.entries(ATTEND_CONFIG).map(([k,v]) => { const count = sp.filter(p=>p.attendance_status===k).length; if (!count) return null; return <span key={k} style={{...S.attendBadge(k),fontSize:11}}>{v.label}: {count}</span>; })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sp.map(p => { const u = users.find(u=>u.id===p.user_id)||{name:"Unbekannt",email:""}; return (
              <div key={p.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={S.avatar(34)}>{u.name?.[0]}</div>
                <div style={{ flex: 1, minWidth: 120 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}</div><div style={{ fontSize: 11, color: C.textDim }}>{p.role_on_shoot}</div></div>
                <span style={S.attendBadge(p.attendance_status)}>{ATTEND_CONFIG[p.attendance_status]?.label}</span>
                {canEditShoot ? <div style={{ display: "flex", gap: 4 }}><select style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", cursor:"pointer", fontFamily:"inherit", width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><button style={S.btn("danger")} onClick={()=>handleRemoveP(p.id)}>✕</button></div>
                : p.user_id===user.id && <select style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", cursor:"pointer", fontFamily:"inherit", width: "auto", padding: "4px 8px", fontSize: 12 }} value={p.attendance_status} onChange={e=>handleStatusChange(p.id,e.target.value)}>{Object.entries(ATTEND_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>}
              </div>
            ); })}
          </div>
          {showAddP && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Crew hinzufügen</div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Person</label><select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={addUserId} onChange={e=>setAddUserId(e.target.value)}><option value="">Wählen...</option>{users.filter(u=>!sp.find(p=>p.user_id===u.id)&&u.is_approved).map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></div>
            <div style={{ marginBottom: 18 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Rolle</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={addRole} onChange={e=>setAddRole(e.target.value)} placeholder="z. B. Director, Gaffer, Schauspieler..."/></div>
            <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddP}>Hinzufügen</button><button style={S.btn("ghost")} onClick={()=>setShowAddP(false)}>Abbrechen</button></div>
          </div></div>)}
        </div>
      )}

      {tab === "shotlist" && (
        <ShotlistTab shots={shots} shoot={shoot} user={user} canEdit={canEditShoot} updateShot={updateShot} deleteShot={deleteShot} setShotlist={setShotlist} />
      )}

      {tab === "schedule" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Tagesplan ({sched.length})</div>
            {canEditShoot && <button style={S.btn("primary")} onClick={addSched}>＋</button>}
          </div>
          <div style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 16, marginLeft: 8 }}>
            {sched.map(entry => (
              <div key={entry.id} style={{ position: "relative", paddingBottom: 16 }}>
                <div style={{ position: "absolute", left: -23, top: 4, width: 8, height: 8, borderRadius: 0, background: C.accent }}/>
                {canEditShoot ? (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr auto", gap: 8, alignItems: "start" }}>
                      <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Zeit</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="time" value={entry.time||""} onChange={e=>updateSched(entry.id,"time",e.target.value)}/></div>
                      <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Titel</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={entry.title||""} onChange={e=>updateSched(entry.id,"title",e.target.value)}/></div>
                      <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Info</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={entry.description||""} onChange={e=>updateSched(entry.id,"description",e.target.value)}/></div>
                      <button style={{ ...S.btn("danger"), marginTop: 20 }} onClick={()=>deleteSched(entry.id)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", paddingBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 44, fontFamily: "inherit" }}>{entry.time}</span>
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
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow, padding: "14px 18px" }}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>{shootEquip.length}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Crew Equipment</div>
            </div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow, padding: "14px 18px" }}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>{rentalEquip.length}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Mietequipment</div>
            </div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow, padding: "14px 18px", borderLeft: `2px solid ${C.accent}` }}>
              <div style={{ fontSize:30, fontWeight:700, letterSpacing:"-0.02em", color:C.text, color: C.accent }}>€{rentalTotal.toLocaleString("de-DE", {minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Mietkosten ({shootDays} Tag{shootDays!==1?"e":""})</div>
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
                {shootEquip.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>Kein Crew-Equipment eingetragen</div>}
                {(() => {
                  const byUser = {};
                  shootEquip.forEach(e => { const u = users.find(u => u.id === e.user_id) || { name: "Unbekannt" }; if (!byUser[e.user_id]) byUser[e.user_id] = { user: u, items: [] }; byUser[e.user_id].items.push(e); });
                  return Object.values(byUser).map(({ user: u, items }) => (
                    <div key={u.id || u.name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
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
              {canEditShoot && <button style={S.btn("outline")} onClick={() => setShowAddRental(true)}>＋ Mietitem</button>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rentalEquip.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>Kein Mietequipment</div>}
              {rentalEquip.map(r => (
                <div key={r.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{r.name}</div>
                    {r.category && <div style={{ fontSize: 10, color: C.textDim }}>{r.category}</div>}
                  </div>
                  {canEditShoot ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:5, display:"block", marginBottom: 2 }}>CHF/Tag</label>
                        <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", width: 90, padding: "5px 8px", fontSize: 12 }} type="number" value={r.daily_rate||""} onChange={e => updateRentalField(r.id, "daily_rate", e.target.value)} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <label style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:5, display:"block", marginBottom: 2 }}>Anz.</label>
                        <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", width: 60, padding: "5px 8px", fontSize: 12 }} type="number" min="1" value={r.quantity||1} onChange={e => updateRentalField(r.id, "quantity", e.target.value)} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, minWidth: 80, textAlign: "right", fontFamily: "inherit" }}>
                        CHF {((parseFloat(r.daily_rate)||0)*(parseInt(r.quantity)||1)*shootDays).toFixed(2)}
                      </div>
                      <button style={{ ...S.btn("danger"), padding: "4px 10px" }} onClick={() => removeRentalEquip(r.id)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>
                      CHF {(parseFloat(r.daily_rate)||0).toFixed(2)}/Tag × {r.quantity||1} × {shootDays}d = CHF {((parseFloat(r.daily_rate)||0)*(parseInt(r.quantity)||1)*shootDays).toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
              {rentalEquip.length > 0 && (
                <div style={{ padding: "10px 14px", background: C.accentDim, border: `1px solid ${C.accent}33`, borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Mietkosten</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>CHF {rentalTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* MODALS */}
          {showMyEquipPicker && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Mein Equipment zum Shoot hinzufügen</div>
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

          {showAddRental && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Mietequipment hinzufügen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Bezeichnung *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={rentalForm.name} onChange={e=>setRentalForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Sony FX3, Aputure 300D..."/></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kategorie</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={rentalForm.category} onChange={e=>setRentalForm(f=>({...f,category:e.target.value}))} placeholder="Kamera, Licht, Ton..."/></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>CHF / Tag</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" value={rentalForm.daily_rate} onChange={e=>setRentalForm(f=>({...f,daily_rate:e.target.value}))} placeholder="0.00"/></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Anzahl</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" min="1" value={rentalForm.quantity} onChange={e=>setRentalForm(f=>({...f,quantity:e.target.value}))}/></div>
              <div style={{ gridColumn: "1/-1" }}>
                {rentalForm.daily_rate && <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontFamily: "inherit" }}>
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
// ============================================================
// SHOTLIST TAB — Teil.Szene.Shot Struktur + Bildupload
// ============================================================
function ShotlistTab({ shots, shoot, user, canEdit, updateShot, deleteShot, setShotlist }) {
  const [expandedShots, setExpandedShots] = useState({});
  const [addModal, setAddModal] = useState(null); // { partNum, sceneNum } or "part"
  const [newPartNum, setNewPartNum]   = useState(1);
  const [newSceneNum, setNewSceneNum] = useState(1);
  const [imageViewer, setImageViewer] = useState(null); // url string

  const toggleExpand = (id) => setExpandedShots(p => ({ ...p, [id]: !p[id] }));

  // Sort shots by part → scene → shot (handle missing columns gracefully)
  const toN = (v) => (v === null || v === undefined || isNaN(parseInt(v))) ? 1 : parseInt(v);
  const sorted = [...shots].sort((a, b) => {
    if (toN(a.part_num) !== toN(b.part_num)) return toN(a.part_num) - toN(b.part_num);
    if (toN(a.scene_num) !== toN(b.scene_num)) return toN(a.scene_num) - toN(b.scene_num);
    return toN(a.shot_num) - toN(b.shot_num);
  });

  // Group by part → scene
  const grouped = {};
  sorted.forEach(s => {
    const p = toN(s.part_num);
    const sc = toN(s.scene_num);
    if (!grouped[p]) grouped[p] = {};
    if (!grouped[p][sc]) grouped[p][sc] = [];
    grouped[p][sc].push(s);
  });

  const safeMax = (arr) => arr.length ? Math.max(...arr) : 0;
  const nextPartNum = () => safeMax(Object.keys(grouped).map(Number)) + 1;
  const nextSceneNum = (partNum) => safeMax(grouped[partNum] ? Object.keys(grouped[partNum]).map(Number) : []) + 1;
  const nextShotNum = (partNum, sceneNum) => safeMax((grouped[partNum]?.[sceneNum] || []).map(s => toN(s.shot_num))) + 1;

  const addShotToScene = async (partNum, sceneNum) => {
    const shotNum = nextShotNum(partNum, sceneNum);
    try {
      const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: sceneNum, shot_num: shotNum, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" }));
      setShotlist(prev => [...prev, s]);
    } catch(e) { alert(e.message); }
  };
  const addSceneToPart = async (partNum) => {
    const sceneNum = nextSceneNum(partNum);
    try {
      const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: sceneNum, shot_num: 1, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" }));
      setShotlist(prev => [...prev, s]);
    } catch(e) { alert(e.message); }
  };
  const addNewPart = async () => {
    const partNum = nextPartNum();
    try {
      const s = await db.insert("shotlist", sanitizeObj({ shoot_id: shoot.id, part_num: partNum, scene_num: 1, shot_num: 1, title: "", description: "", camera_setting: "", duration: "", status: "open", image_url: "" }));
      setShotlist(prev => [...prev, s]);
    } catch(e) { alert(e.message); }
  };

  const handleImageUpload = (shotId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => updateShot(shotId, "image_url", e.target.result);
    reader.readAsDataURL(file);
  };

  const shotStatusColor = { open: C.textDim, in_progress: C.amber, done: C.green };
  const totalDone = shots.filter(s => s.status === "done").length;
  const totalShots = shots.length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{totalShots} Shots</div>
          <div style={{ fontSize: 10, color: C.textDim }}>{totalDone}/{totalShots} erledigt</div>
        </div>
        {/* Progress bar */}
        <div style={{ flex: 1, margin: "0 20px", height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalShots > 0 ? (totalDone/totalShots)*100 : 0}%`, background: C.accent, transition: "width 0.3s" }}/>
        </div>
        {canEdit && <button style={S.btn("primary")} onClick={addNewPart}>＋ Teil</button>}
      </div>

      {totalShots === 0 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 48, color: C.textDim }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎬</div>
          <div style={{ fontSize: 12 }}>Noch keine Shots geplant.</div>
          {canEdit && <button style={{ ...S.btn("primary"), marginTop: 14 }} onClick={addNewPart}>Ersten Teil erstellen</button>}
        </div>
      )}

      {/* Grouped by Part → Scene */}
      {Object.entries(grouped).map(([partNum, scenes]) => (
        <div key={partNum} style={{ marginBottom: 20 }}>
          {/* Part header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: "inherit", letterSpacing: "0.08em" }}>TEIL {partNum}</span>
            <span style={{ fontSize: 10, color: C.textDim }}>{Object.values(scenes).flat().length} Shots</span>
            <div style={{ flex: 1 }}/>
            {canEdit && <button style={{ ...S.btn("ghost"), padding: "3px 10px", fontSize: 10 }} onClick={() => addSceneToPart(parseInt(partNum))}>＋ Szene</button>}
          </div>

          {/* Scenes */}
          {Object.entries(scenes).map(([sceneNum, shotList]) => (
            <div key={sceneNum} style={{ marginBottom: 12, marginLeft: 12 }}>
              {/* Scene header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "5px 10px", background: C.surface, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.purple}`, borderRadius: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.purple, fontFamily: "inherit" }}>{partNum}.{sceneNum}</span>
                <span style={{ fontSize: 10, color: C.textDim }}>{shotList.length} Shots</span>
                <div style={{ flex: 1 }}/>
                {canEdit && <button style={{ ...S.btn("ghost"), padding: "2px 8px", fontSize: 10 }} onClick={() => addShotToScene(parseInt(partNum), parseInt(sceneNum))}>＋ Shot</button>}
              </div>

              {/* Shots */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginLeft: 12 }}>
                {shotList.map(shot => {
                  const pn=toN(shot.part_num), sn=toN(shot.scene_num), hn=toN(shot.shot_num); const code = `${pn}.${sn}.${hn}`;
                  const isOpen = expandedShots[shot.id];
                  const stColor = shotStatusColor[shot.status] || C.textDim;
                  return (
                    <div key={shot.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: "10px 12px", borderLeft: `2px solid ${stColor}` }}>
                      {/* Collapsed row */}
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: stColor, fontFamily: "inherit", minWidth: 44, flexShrink: 0 }}>{code}</span>
                        {canEdit
                          ? <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", flex: 1, padding: "4px 8px", fontSize: 12 }} value={shot.title||""} onChange={e=>updateShot(shot.id,"title",e.target.value)} placeholder="Shot-Titel..."/>
                          : <span style={{ flex: 1, fontSize: 12, color: C.text }}>{shot.title || "—"}</span>}
                        <select style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", cursor:"pointer", fontFamily:"inherit", width: "auto", padding: "4px 8px", fontSize: 10, flexShrink: 0 }} value={shot.status||"open"} onChange={e=>updateShot(shot.id,"status",e.target.value)}>
                          {Object.entries(SHOT_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14, padding: "2px 4px" }} onClick={() => toggleExpand(shot.id)}>
                          {isOpen ? "▲" : "▼"}
                        </button>
                        {canEdit && <button style={{ ...S.btn("danger"), padding: "3px 8px", fontSize: 10 }} onClick={()=>deleteShot(shot.id)}>✕</button>}
                      </div>

                      {/* Expanded details */}
                      {isOpen && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Beschreibung</label>{canEdit ? <textarea style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", resize:"vertical", minHeight:80, fontFamily:"inherit", minHeight: 52 }} value={shot.description||""} onChange={e=>updateShot(shot.id,"description",e.target.value)}/> : <div style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", minHeight: 52, color: C.textMid, paddingTop: 8 }}>{shot.description||"—"}</div>}</div>
                          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kamera / Optik</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={shot.camera_setting||""} onChange={e=>updateShot(shot.id,"camera_setting",e.target.value)} placeholder="24mm f/2.8" readOnly={!canEdit}/></div>
                          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Dauer (hh:mm)</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={shot.duration||""} onChange={e=>updateShot(shot.id,"duration",e.target.value)} placeholder="00:30" readOnly={!canEdit}/></div>

                          {/* Reference image */}
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Referenzbild</label>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              {shot.image_url ? (
                                <div style={{ position: "relative" }}>
                                  <img src={shot.image_url} alt="ref" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 2, border: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setImageViewer(shot.image_url)}/>
                                  {canEdit && <button style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", border: "none", color: "white", borderRadius: 2, cursor: "pointer", fontSize: 10, padding: "1px 5px" }} onClick={() => updateShot(shot.id, "image_url", "")}>✕</button>}
                                </div>
                              ) : (
                                <div style={{ width: 120, height: 80, background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.textDim }}>kein Bild</div>
                              )}
                              {canEdit && (
                                <label style={{ ...S.btn("outline"), cursor: "pointer", padding: "6px 12px" }}>
                                  📷 {shot.image_url ? "Ersetzen" : "Bild hinzufügen"}
                                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && handleImageUpload(shot.id, e.target.files[0])}/>
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Image Lightbox */}
      {imageViewer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setImageViewer(null)}>
          <img src={imageViewer} alt="ref" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 3, border: `1px solid ${C.border}` }}/>
          <button style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "white", fontSize: 28, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}


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
  const handleDelete = async (id) => {
    const eq = userEquipment.find(e => e.id === id);
    if (!eq || eq.user_id !== user.id) { alert("Du kannst nur dein eigenes Equipment löschen."); return; }
    if (!confirm("Equipment löschen?")) return;
    try { await db.remove("user_equipment", `id=eq.${id}`); setUserEquipment(prev => prev.filter(e => e.id !== id)); } catch (e) { alert(e.message); } };

  const byCategory = userEquipment.reduce((acc, e) => { const cat = e.category || "Sonstiges"; if (!acc[cat]) acc[cat] = []; acc[cat].push(e); return acc; }, {});

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Mein Equipment</div><div style={{ fontSize: 12, color: C.textDim }}>{userEquipment.length} Items gespeichert — verfügbar bei jedem Shoot</div></div>
        <button style={S.btn("primary")} onClick={openNew}>＋ Equipment</button>
      </div>
      {userEquipment.length === 0 ? (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 48, color: C.textDim }}>
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
                  <div key={item.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.name}</div>
                      {item.serial_number && <div style={{ fontSize: 10, color: C.textDim, fontFamily: "inherit" }}>S/N: {item.serial_number}</div>}
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
      {showModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>{editItem ? "Equipment bearbeiten" : "Neues Equipment"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Bezeichnung *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Sony A7 IV, DJI RS3..."/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kategorie</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="Kamera, Licht, Ton, Grip..."/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Seriennummer</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.serial_number||""} onChange={e=>setForm(f=>({...f,serial_number:e.target.value}))}/></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Notizen</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Zubehör, Besonderheiten..."/></div>
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
    const rlErr = RL.form("new_shoot");
    if (rlErr) { setError(rlErr); return; }
    const shootErr = V.check([
      ["Titel",      V.text(form.title, 120),          "Titel ist Pflicht (max. 120 Zeichen)"],
      ["Startdatum", V.date(form.date_start) && form.date_start, "Startdatum ist Pflicht"],
      ["Enddatum",   !form.date_end || V.date(form.date_end), "Ungültiges Enddatum"],
      ["Budget",     !form.budget || V.number(form.budget, 0, 9999999), "Ungültiges Budget"],
      ["Notizen",    V.textOpt(form.notes, 2000),       "Notizen max. 2000 Zeichen"],
    ]);
    if (shootErr) { setError(shootErr); return; }
    setSaving(true);
    try { const shoot = await db.insert("shoots", sanitizeObj({ ...form, date_end: form.date_end || form.date_start, budget: form.budget || null, client_id: form.client_id || null, created_by: user.id, shared_links: "[]" })); onSave(shoot); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Neuer Shoot</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSave} disabled={saving}>{saving?"Erstellt...":"Shoot erstellen"}</button><button style={S.btn("ghost")} onClick={() => setPage("shoots")}>Abbrechen</button></div>
      </div>
      {error && <div style={{ fontSize: 12, color: C.danger, padding: "10px 13px", background: C.dangerDim, borderRadius: 10, marginBottom: 12, borderLeft: `3px solid ${C.danger}` }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Titel *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="z. B. Brand Film – Kunde AG"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Location</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z. B. Berlin Studio B"/></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Startdatum *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={form.date_start} onChange={e=>setForm(f=>({...f,date_start:e.target.value}))}/></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Enddatum</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={form.date_end} onChange={e=>setForm(f=>({...f,date_end:e.target.value}))}/></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Startzeit</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="time" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Endzeit</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="time" value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
          </div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kunde</label>
            <select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={form.client_id} onChange={e=>setForm(f=>({...f,client_id:e.target.value}))}>
              <option value="">Kein Kunde</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Budget (€)</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} placeholder="8500"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Status</label><select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="cancelled">Abgesagt</option></select></div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Notizen</label><textarea style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", resize:"vertical", minHeight:80, fontFamily:"inherit", minHeight: 200 }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Besonderheiten, Equipment..."/></div>
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
    const clientErr = V.check([["Firma", V.text(form.company, 100), "Firmenname ist Pflicht (max. 100 Zeichen)"]]);
    if (clientErr) { alert(clientErr); return; }
    const rlErr = RL.form("clients"); if (rlErr) { alert(rlErr); return; }
    setSaving(true);
    try { if (editClient) { await db.update("clients", sanitizeObj(form), `id=eq.${editClient.id}`); setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...form } : c)); } else { const nc = await db.insert("clients", sanitizeObj(form)); setClients(prev => [...prev, nc]); } setShowModal(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Löschen?")) return; try { await db.remove("clients", `id=eq.${id}`); setClients(prev => prev.filter(c => c.id !== id)); } catch (e) { alert(e.message); } };
  const filtered = clients.filter(c => !search || c.company?.toLowerCase().includes(search.toLowerCase()) || c.contact_name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Kunden</div><div style={{ fontSize: 12, color: C.textDim }}>{clients.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 8 }}><input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", maxWidth: 200 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />{user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neu</button>}</div>
      </div>
      {loading ? <div style={{ textAlign:"center", padding:40, color:C.textDim }}>Lade...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ ...S.avatar(40), borderRadius: 10, fontSize: 18, background: "rgba(99,102,241,0.15)" }}>🏢</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{c.company}</div>
                  {c.contact_name && <div style={{ fontSize: 13, color: C.textMid }}>{c.contact_name}</div>}
                  <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>✉ {c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>📞 {c.phone}</a>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>🌐 Website</a>}
                  </div>
                </div>
                {user.is_admin && <div style={{ display: "flex", gap: 6 }}><button style={S.btn("outline")} onClick={() => openEdit(c)}>✏️</button><button style={S.btn("danger")} onClick={() => handleDelete(c.id)}>✕</button></div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign:"center", padding:40, color:C.textDim }}><div style={{ fontSize:36, marginBottom:10 }}>🏢</div><div>Keine Kunden</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop:12 }} onClick={openNew}>Ersten Kunden anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>{editClient ? "Kunde bearbeiten" : "Neuer Kunde"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Firma *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.company||""} onChange={e=>setForm(f=>({...f,company:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Ansprechpartner</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.contact_name||""} onChange={e=>setForm(f=>({...f,contact_name:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>E-Mail</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Telefon</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Website</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Adresse</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Notizen</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
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
    const actorErr = V.check([["Name", V.name(form.name), "Name ist Pflicht (2–80 Zeichen)"]]);
    if (actorErr) { alert(actorErr); return; }
    setSaving(true);
    try { if (editActor) { await db.update("actors", sanitizeObj(form), `id=eq.${editActor.id}`); setActors(prev => prev.map(a => a.id === editActor.id ? { ...a, ...form } : a)); } else { const na = await db.insert("actors", sanitizeObj(form)); setActors(prev => [...prev, na]); } setShowModal(false); } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const handleDelete = async (id) => { if (!confirm("Löschen?")) return; try { await db.remove("actors", `id=eq.${id}`); setActors(prev => prev.filter(a => a.id !== id)); } catch (e) { alert(e.message); } };
  const filtered = actors.filter(a => { const ms = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.genre?.toLowerCase().includes(search.toLowerCase()); const mg = genreFilter === "all" || a.genre === genreFilter; return ms && mg; });
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Schauspieler</div><div style={{ fontSize: 12, color: C.textDim }}>{actors.length} Einträge</div></div>
        <div style={{ display: "flex", gap: 8 }}><input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", maxWidth: 180 }} placeholder="🔍 Suchen..." value={search} onChange={e => setSearch(e.target.value)} />{user.is_admin && <button style={S.btn("primary")} onClick={openNew}>＋ Neu</button>}</div>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","Alle"], ...GENRES.map(g => [g,g])].map(([val,lbl]) => <button key={val} style={{ padding: "5px 11px", borderRadius: 20, border: "1px solid", borderColor: genreFilter===val?C.accent:C.border, background: genreFilter===val?"rgba(99,102,241,0.15)":"transparent", color: genreFilter===val?C.accent:C.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => setGenreFilter(val)}>{lbl}</button>)}
      </div>
      {loading ? <div style={{ textAlign:"center", padding:40, color:C.textDim }}>Lade...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(a => (
            <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={S.avatar(40)}>{a.name?.[0]}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{a.name}</div>{a.genre && <span style={S.tag("#8B5CF6")}>{a.genre}</span>}</div>
                {user.is_admin && <div style={{ display: "flex", gap: 4 }}><button style={{ ...S.btn("ghost"), padding: "4px 8px" }} onClick={() => openEdit(a)}>✏️</button><button style={{ ...S.btn("danger"), padding: "4px 8px" }} onClick={() => handleDelete(a.id)}>✕</button></div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {a.email && <a href={`mailto:${a.email}`} style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>✉️ {a.email}</a>}
                {a.phone && <a href={`tel:${a.phone}`} style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>📞 {a.phone}</a>}
                {a.instagram && <a href={`https://instagram.com/${a.instagram.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#E1306C", textDecoration: "none" }}>📸 @{a.instagram.replace("@","")}</a>}
                {a.tiktok && <a href={`https://tiktok.com/@${a.tiktok.replace("@","")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#69C9D0", textDecoration: "none" }}>🎵 @{a.tiktok.replace("@","")}</a>}
                {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.accent, textDecoration: "none" }}>🌐 Website</a>}
                {a.notes && <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic", marginTop: 2 }}>{a.notes}</div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign:"center", padding:40, color:C.textDim, gridColumn:"1/-1" }}><div style={{ fontSize:36, marginBottom:10 }}>🎭</div><div>Keine Einträge</div>{user.is_admin && <button style={{ ...S.btn("primary"), marginTop:12 }} onClick={openNew}>Ersten Schauspieler anlegen</button>}</div>}
        </div>
      )}
      {showModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>{editActor ? "Bearbeiten" : "Neuer Schauspieler"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Name *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>E-Mail</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Telefon</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Instagram</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.instagram||""} onChange={e=>setForm(f=>({...f,instagram:e.target.value}))} placeholder="@username"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>TikTok</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.tiktok||""} onChange={e=>setForm(f=>({...f,tiktok:e.target.value}))} placeholder="@username"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Website</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.website||""} onChange={e=>setForm(f=>({...f,website:e.target.value}))} placeholder="https://..."/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Genre</label><select style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", cursor: "pointer", fontFamily: "inherit" }} value={form.genre||""} onChange={e=>setForm(f=>({...f,genre:e.target.value}))}><option value="">Wählen...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Notizen</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
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
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "crew", is_admin: false });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [tempPw] = useState(() => Math.random().toString(36).slice(-8) + "Aa1!");

  const pending  = users.filter(u => !u.is_approved);
  const approved = users.filter(u => u.is_approved);

  const handleApprove = async (u) => {
    try {
      await db.update("users", { is_approved: true }, `id=eq.${u.id}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_approved: true } : x));
    } catch(e) { alert(e.message); }
  };

  const handleReject = async (u) => {
    if (!confirm(`${u.name} ablehnen und Profil löschen?`)) return;
    try {
      await db.remove("users", `id=eq.${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch(e) { alert(e.message); }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({ role: u.role || "crew", is_admin: !!u.is_admin });
  };

  const handleSavePermissions = async (uid) => {
    try {
      await db.update("users", { role: editForm.role, is_admin: editForm.is_admin }, `id=eq.${uid}`);
      setUsers(prev => prev.map(x => x.id === uid ? { ...x, role: editForm.role, is_admin: editForm.is_admin } : x));
      setEditingId(null);
    } catch(e) { alert(e.message); }
  };

  const handleCreate = async () => {
    const err = V.check([
      ["Name",   V.name(form.name),   "Name muss 2–80 Zeichen haben"],
      ["E-Mail", V.email(form.email), "Ungültige E-Mail-Adresse"],
    ]);
    if (err) { alert(err); return; }
    setSaving(true);
    try {
      const u = await db.insert("users", sanitizeObj({
        name: form.name.trim(), email: form.email.trim().toLowerCase(),
        role: form.role, is_admin: form.is_admin,
        is_approved: true, must_change_password: true
      }));
      setUsers(prev => [...prev, u]);
      setShowModal(false);
      setForm({ name: "", email: "", role: "crew", is_admin: false });
      alert(`✅ Profil erstellt!\n\nNun in Supabase Dashboard:\nAuthentication → Users → "Add User"\n\nE-Mail: ${form.email}\nPasswort: ${tempPw}\n\nDer User muss das Passwort beim ersten Login ändern.`);
    } catch(e) { alert("Fehler: " + e.message); }
    setSaving(false);
  };

  const RoleButton = ({ value, label, desc, current, onChange }) => (
    <button onClick={() => onChange(value)} style={{
      flex:1, padding:"10px 12px", borderRadius:10, border:"none", cursor:"pointer",
      fontFamily:"inherit", textAlign:"left", transition:"all 0.12s",
      background: current===value ? C.accentDim : C.surfaceHi,
      outline: current===value ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize:13, fontWeight:600, color: current===value ? C.accent : C.textMid }}>{label}</div>
      <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{desc}</div>
    </button>
  );

  const AdminToggle = ({ value, onChange }) => (
    <div onClick={() => onChange(!value)} style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"12px 14px", borderRadius:10, cursor:"pointer", transition:"all 0.15s",
      background: value ? "rgba(10,132,255,0.08)" : C.surfaceHi,
      border:`1px solid ${value ? C.accent+"44" : C.border}`
    }}>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Admin-Rechte</div>
        <div style={{ fontSize:11, color:C.textDim, marginTop:2 }}>Vollzugriff auf alle Shoots, Benutzerverwaltung und sämtliche Daten</div>
      </div>
      <div style={{ width:46, height:26, borderRadius:13, flexShrink:0, marginLeft:12,
        background: value ? C.accent : C.surface, border:`1px solid ${value ? C.accent : C.border}`,
        position:"relative", transition:"background 0.2s" }}>
        <div style={{ position:"absolute", top:3, left: value ? 22 : 3, width:18, height:18,
          borderRadius:"50%", background:"#ffffff", transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }} />
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.02em", color:C.text, marginBottom:3 }}>Benutzerverwaltung</div>
          <div style={{ fontSize:12, color:C.textDim }}>{approved.length} aktiv · {pending.length} ausstehend</div>
        </div>
        <button style={S.btn("primary")} onClick={() => setShowModal(true)}>＋ Benutzer anlegen</button>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>
            ⏳ Freigabe ausstehend ({pending.length})
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {pending.map(u => (
              <div key={u.id} style={{ background:"rgba(255,159,10,0.06)", border:"1px solid rgba(255,159,10,0.25)", borderRadius:14, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <div style={{ ...S.avatar(38), background:"rgba(255,159,10,0.15)", color:C.amber }}>{(u.name||"?")[0].toUpperCase()}</div>
                <div style={{ flex:1, minWidth:140 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{u.name}</div>
                  <div style={{ fontSize:11, color:C.textDim, marginTop:2 }}>{u.email}</div>
                  <div style={{ marginTop:4 }}><span style={S.roleBadge(u.role)}>{ROLE_CONFIG[u.role]?.label || u.role}</span></div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={S.btn("primary")} onClick={() => handleApprove(u)}>✓ Freigeben</button>
                  <button style={S.btn("danger")} onClick={() => handleReject(u)}>✕ Ablehnen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active users */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:C.textDim, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>
          Aktive Benutzer ({approved.length})
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {approved.map(u => {
            const isEditing = editingId === u.id;
            const isSelf = u.id === currentUser.id;
            return (
              <div key={u.id} style={{ background:C.surface, border:`1px solid ${isEditing ? C.accent+"55" : C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, transition:"border-color 0.15s" }}>
                {/* Row */}
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ ...S.avatar(38), background: u.is_admin ? C.accentDim : C.surfaceHi, color: u.is_admin ? C.accent : C.textMid }}>
                    {(u.name||"?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:140 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                      {u.name}
                      {u.is_admin && <span style={{ fontSize:10, fontWeight:700, color:C.accent, background:C.accentDim, padding:"2px 8px", borderRadius:20 }}>ADMIN</span>}
                      {isSelf && <span style={{ fontSize:10, color:C.textDim, background:C.surfaceHi, padding:"2px 7px", borderRadius:20 }}>Du</span>}
                      {u.must_change_password && <span style={{ fontSize:10, color:C.danger, background:C.dangerDim, padding:"2px 7px", borderRadius:20 }}>⚠ PW ändern</span>}
                      {!u.terms_accepted_at && <span style={{ fontSize:10, color:C.amber, background:"rgba(255,159,10,0.12)", padding:"2px 7px", borderRadius:20 }}>AGB ausstehend</span>}
                    </div>
                    <div style={{ fontSize:11, color:C.textDim, marginTop:2 }}>{u.email} · <span style={S.roleBadge(u.role||"crew")}>{ROLE_CONFIG[u.role]?.label||"Crew"}</span></div>
                  </div>
                  {!isSelf && !isEditing && (
                    <button style={S.btn("outline")} onClick={() => startEdit(u)}>✏ Berechtigungen</button>
                  )}
                  {isEditing && (
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={S.btn("primary")} onClick={() => handleSavePermissions(u.id)}>✓ Speichern</button>
                      <button style={S.btn("ghost")} onClick={() => setEditingId(null)}>Abbrechen</button>
                    </div>
                  )}
                </div>

                {/* Inline permission editor */}
                {isEditing && (
                  <div style={{ marginTop:14, padding:"16px", background:C.surfaceHi, borderRadius:12, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textDim, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
                      Berechtigungen — {u.name}
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:8 }}>Rolle</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <RoleButton value="crew"  label="Crew"        desc="Zugewiesene Shoots & Shotlisten" current={editForm.role} onChange={r => setEditForm(f => ({...f, role:r}))} />
                        <RoleButton value="actor" label="Schauspieler" desc="Eigene Auftritte verwalten"      current={editForm.role} onChange={r => setEditForm(f => ({...f, role:r}))} />
                      </div>
                    </div>
                    <AdminToggle value={editForm.is_admin} onChange={v => setEditForm(f => ({...f, is_admin:v}))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create user modal */}
      {showModal && (
        <div style={{ position:"fixed", inset:0, background:`rgba(0,0,0,${_themeMode==="dark"?0.55:0.32})`, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20, backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)" }}>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:"24px", width:"100%", maxWidth:480, boxShadow:`0 20px 60px rgba(0,0,0,${_themeMode==="dark"?0.4:0.13})` }}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:18, color:C.text }}>Benutzer manuell anlegen</div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:5, display:"block" }}>Name</label>
              <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit" }}
                value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Vorname Nachname" />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:5, display:"block" }}>E-Mail</label>
              <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit" }}
                type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="user@example.com" />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.textMid, marginBottom:8 }}>Rolle</div>
              <div style={{ display:"flex", gap:8 }}>
                <RoleButton value="crew"  label="Crew"        desc="Standard-Mitglied"  current={form.role} onChange={r=>setForm(f=>({...f,role:r}))} />
                <RoleButton value="actor" label="Schauspieler" desc="Darsteller-Account" current={form.role} onChange={r=>setForm(f=>({...f,role:r}))} />
              </div>
            </div>
            <div style={{ marginBottom:18 }}>
              <AdminToggle value={form.is_admin} onChange={v=>setForm(f=>({...f,is_admin:v}))} />
            </div>
            <div style={{ padding:"12px 14px", marginBottom:18, background:"rgba(10,132,255,0.07)", borderRadius:10, border:`1px solid ${C.accent}22` }}>
              <div style={{ fontSize:11, color:C.textDim, marginBottom:4 }}>Temporäres Passwort für Supabase Auth:</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.accent, letterSpacing:"1px", fontFamily:"monospace" }}>{tempPw}</div>
              <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>Supabase → Authentication → Add User → dieses Passwort eingeben. Der User muss es beim ersten Login ändern.</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={S.btn("primary")} onClick={handleCreate} disabled={saving}>{saving?"Erstellt...":"Erstellen"}</button>
              <button style={S.btn("ghost")} onClick={()=>setShowModal(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function NetworkPage({ user, users, setShoots, shoots, participants, setParticipants }) {
  const [networks, setNetworks] = useState([]);
  const [allMembers, setAllMembers] = useState([]);       // alle network_members rows
  const [networkLinks, setNetworkLinks] = useState([]);   // shoot_network_links
  const [shootApps, setShootApps] = useState([]);         // shoot_applications
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("networks");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditNetModal, setShowEditNetModal] = useState(null); // network object to edit
  const [editNetForm, setEditNetForm] = useState({ name: "", description: "", is_public: true });
  const [showInviteModal, setShowInviteModal] = useState(null);   // network object
  const [showAssignModal, setShowAssignModal] = useState(null);   // network object
  const [showApplyModal, setShowApplyModal] = useState(null);     // shoot object
  const [networkForm, setNetworkForm] = useState({ name: "", description: "", is_public: true });
  const [applyRole, setApplyRole] = useState("");
  const [applyMsg, setApplyMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [nw, mem, lnk, apps] = await Promise.all([
        db.select("networks"),
        db.select("network_members"),
        db.select("shoot_network_links"),
        db.select("shoot_applications"),
      ]);
      setNetworks(nw);
      setAllMembers(mem);
      setNetworkLinks(lnk);
      setShootApps(apps);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ── derived ──────────────────────────────────────────────
  const myMemberships   = allMembers.filter(m => m.user_id === user.id);
  const myActiveNetIds  = new Set(myMemberships.filter(m => m.status === "active").map(m => m.network_id));
  const myAdminNetIds   = new Set(myMemberships.filter(m => m.role === "admin" && m.status === "active").map(m => m.network_id));
  const myPendingNetIds = new Set(myMemberships.filter(m => m.status === "pending").map(m => m.network_id));

  const myNetworks      = networks.filter(n => myActiveNetIds.has(n.id));
  const discoverNets    = networks.filter(n => n.is_public && !myActiveNetIds.has(n.id) && !myPendingNetIds.has(n.id));

  // Shoots that are published AND linked to at least one network I'm in
  const linkedShootIds  = new Set(networkLinks.filter(l => myActiveNetIds.has(l.network_id) || user.is_admin).map(l => l.shoot_id));
  const publishedShoots = shoots.filter(s => s.is_published && (linkedShootIds.has(s.id) || user.is_admin));

  // Pending items for admin
  const myAdminShootIds    = new Set(shoots.filter(s => s.created_by === user.id).map(s => s.id));
  const pendingShootApps   = shootApps.filter(a => myAdminShootIds.has(a.shoot_id) && a.status === "pending");
  const pendingNetMembers  = allMembers.filter(m => myAdminNetIds.has(m.network_id) && m.status === "pending");
  const myOwnApps          = shootApps.filter(a => a.applicant_id === user.id);
  const pendingTotal       = pendingShootApps.length + pendingNetMembers.length;

  // ── handlers ─────────────────────────────────────────────
  const handleCreateNetwork = async () => {
    if (!networkForm.name) return;
    setSaving(true);
    try {
      const netErr = V.check([
      ["Name", V.text(networkForm.name, 80), "Netzwerk-Name ist Pflicht (max. 80 Zeichen)"],
      ["Beschreibung", V.textOpt(networkForm.description, 300), "Beschreibung max. 300 Zeichen"],
    ]);
    if (netErr) { alert(netErr); setSaving(false); return; }
    const nw = await db.insert("networks", sanitizeObj({ ...networkForm, created_by: user.id }));
      const mem = await db.insert("network_members", { network_id: nw.id, user_id: user.id, role: "admin", status: "active" });
      setNetworks(p => [...p, nw]);
      setAllMembers(p => [...p, mem]);
      setShowCreateModal(false); setNetworkForm({ name: "", description: "", is_public: true });
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const handleEditNetwork = async () => {
    if (!showEditNetModal || !editNetForm.name) return;
    if (showEditNetModal.created_by !== user.id && !user.is_admin) { alert("Nur der Ersteller oder ein Admin kann dieses Netzwerk bearbeiten."); return; }
    const netErr = V.check([["Name", V.text(editNetForm.name, 80), "Name ist Pflicht (max. 80 Zeichen)"]]);
    if (netErr) { alert(netErr); return; }
    setSaving(true);
    try {
      await db.update("networks", sanitizeObj({ name: editNetForm.name, description: editNetForm.description, is_public: editNetForm.is_public }), `id=eq.${showEditNetModal.id}`);
      setNetworks(p => p.map(n => n.id === showEditNetModal.id ? { ...n, ...editNetForm } : n));
      setShowEditNetModal(null);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const handleDeleteNetwork = async (nw) => {
    if (nw.created_by !== user.id && !user.is_admin) { alert("Nur der Ersteller oder ein Admin kann dieses Netzwerk löschen."); return; }
    if (!confirm(`Netzwerk "${nw.name}" wirklich löschen? Alle Mitgliedschaften werden entfernt.`)) return;
    try {
      await db.remove("network_members", `network_id=eq.${nw.id}`);
      await db.remove("shoot_network_links", `network_id=eq.${nw.id}`);
      await db.remove("networks", `id=eq.${nw.id}`);
      setNetworks(p => p.filter(n => n.id !== nw.id));
      setAllMembers(p => p.filter(m => m.network_id !== nw.id));
      setNetworkLinks(p => p.filter(l => l.network_id !== nw.id));
    } catch(e) { alert(e.message); }
  };

  const handleJoin = async (networkId) => {
    try {
      const mem = await db.insert("network_members", { network_id: networkId, user_id: user.id, role: "member", status: "pending" });
      setAllMembers(p => [...p, mem]);
    } catch(e) { alert(e.message); }
  };

  const handleApproveMember = async (mem) => {
    try {
      await db.update("network_members", { status: "active" }, `id=eq.${mem.id}`);
      setAllMembers(p => p.map(m => m.id === mem.id ? { ...m, status: "active" } : m));
    } catch(e) { alert(e.message); }
  };
  const handleRejectMember = async (mem) => {
    try {
      await db.remove("network_members", `id=eq.${mem.id}`);
      setAllMembers(p => p.filter(m => m.id !== mem.id));
    } catch(e) { alert(e.message); }
  };

  const handleInvite = async (networkId, userId) => {
    if (allMembers.find(m => m.network_id === networkId && m.user_id === userId)) { alert("Bereits Mitglied"); return; }
    try {
      const mem = await db.insert("network_members", { network_id: networkId, user_id: userId, role: "member", status: "pending" });
      setAllMembers(p => [...p, mem]);
      // Notify invited user
      const invitedUser = users.find(u => u.id === userId);
      const network = networks.find(n => n.id === networkId);
      if (invitedUser?.email && network) {
        notify("network_invite", invitedUser.email, { network_name: network.name, inviter_name: user.name });
      }
    } catch(e) { alert(e.message); }
  };

  const handleAssignShoot = async (networkId, shootId) => {
    if (networkLinks.find(l => l.network_id === networkId && l.shoot_id === shootId)) { alert("Bereits zugewiesen"); return; }
    try {
      await db.update("shoots", { is_published: true }, `id=eq.${shootId}`);
      const lnk = await db.insert("shoot_network_links", { shoot_id: shootId, network_id: networkId });
      setNetworkLinks(p => [...p, lnk]);
      setShoots(p => p.map(s => s.id === shootId ? { ...s, is_published: true } : s));
      // Notify all active network members about new shoot
      const shoot = shoots.find(s => s.id === shootId);
      const nw = networks.find(n => n.id === networkId);
      if (shoot && nw) {
        const members = allMembers.filter(m => m.network_id === networkId && m.status === "active" && m.user_id !== user.id);
        members.forEach(m => {
          const member = users.find(u => u.id === m.user_id);
          if (member?.email) {
            notify("new_shoot_published", member.email, { shoot_title: shoot.title, network_name: nw.name, shoot_date: shoot.date_start || "", publisher_name: user.name });
          }
        });
      }
    } catch(e) { alert(e.message); }
  };

  const handleRemoveShootLink = async (linkId, shootId) => {
    try {
      await db.remove("shoot_network_links", `id=eq.${linkId}`);
      setNetworkLinks(p => p.filter(l => l.id !== linkId));
      // If no more links, un-publish
      const remaining = networkLinks.filter(l => l.id !== linkId && l.shoot_id === shootId);
      if (remaining.length === 0) {
        await db.update("shoots", { is_published: false }, `id=eq.${shootId}`);
        setShoots(p => p.map(s => s.id === shootId ? { ...s, is_published: false } : s));
      }
    } catch(e) { alert(e.message); }
  };

  const handleApply = async () => {
    if (!showApplyModal) return;
    try {
      const app = await db.insert("shoot_applications", { shoot_id: showApplyModal.id, applicant_id: user.id, proposed_role: applyRole || "Crew", message: applyMsg, status: "pending" });
      setShootApps(p => [...p, app]);
      // Notify shoot owner
      const shootOwner = users.find(u => u.id === showApplyModal.created_by);
      if (shootOwner?.email) {
        notify("shoot_application", shootOwner.email, { shoot_title: showApplyModal.title, applicant_name: user.name, proposed_role: applyRole || "Crew", message: applyMsg });
      }
      setShowApplyModal(null); setApplyRole(""); setApplyMsg("");
    } catch(e) { alert(e.message); }
  };

  const handleApproveApp = async (app) => {
    try {
      await db.update("shoot_applications", { status: "approved" }, `id=eq.${app.id}`);
      const np = await db.insert("shoot_participants", { shoot_id: app.shoot_id, user_id: app.applicant_id, role_on_shoot: app.proposed_role || "Crew", attendance_status: "confirmed" });
      setShootApps(p => p.map(a => a.id === app.id ? { ...a, status: "approved" } : a));
      setParticipants(p => [...p, np]);
    } catch(e) { alert(e.message); }
  };
  const handleRejectApp = async (app) => {
    try {
      await db.update("shoot_applications", { status: "rejected" }, `id=eq.${app.id}`);
      setShootApps(p => p.map(a => a.id === app.id ? { ...a, status: "rejected" } : a));
    } catch(e) { alert(e.message); }
  };

  // ── tabs ─────────────────────────────────────────────────
  const tabs = [
    ["networks",   "Meine Netzwerke"],
    ["discover",   "Entdecken"],
    ["shoots",     "Shoot-Ausschreibungen"],
    ["requests",   `Anfragen${pendingTotal > 0 ? ` (${pendingTotal})` : ""}`],
  ];

  const tabStyle = (id) => ({ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 11, fontWeight: tab===id?700:400, color: tab===id?C.accent:C.textDim, borderBottom: tab===id?`2px solid ${C.accent}`:"2px solid transparent", marginBottom: -1, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "inherit" });

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Netzwerk</div><div style={{ fontSize: 12, color: C.textDim }}>{myNetworks.length} Netzwerke · {publishedShoots.length} Ausschreibungen</div></div>
        <button style={S.btn("primary")} onClick={() => setShowCreateModal(true)}>＋ Netzwerk</button>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {tabs.map(([id, lbl]) => <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>{lbl}</button>)}
      </div>

      {loading && <div style={{ color: C.textDim, fontSize: 12, padding: 20 }}>Lade...</div>}

      {/* ── MEINE NETZWERKE ── */}
      {tab === "networks" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Pending invitations for this user */}
          {(() => {
            const pendingInvites = allMembers.filter(m => m.user_id === user.id && m.status === "pending");
            if (!pendingInvites.length) return null;
            return (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, borderLeft: `2px solid ${C.accent}`, background: C.accentDim }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>📬 Einladungen ({pendingInvites.length})</div>
                {pendingInvites.map(inv => {
                  const nw = networks.find(n => n.id === inv.network_id) || { name: "Unbekannt" };
                  return (
                    <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{nw.name}</div>
                      <button style={S.btn("primary")} onClick={() => handleApproveMember(inv)}>✓ Annehmen</button>
                      <button style={S.btn("danger")} onClick={() => handleRejectMember(inv)}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {myNetworks.length === 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, textAlign: "center", padding: 48, color: C.textDim }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🌐</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Noch kein Netzwerk</div>
              <div style={{ fontSize: 11, marginBottom: 16 }}>"Erstelle ein Netzwerk und lade Crew ein oder trete einem bestehenden bei."</div>
              <button style={S.btn("primary")} onClick={() => setShowCreateModal(true)}>Netzwerk erstellen</button>
            </div>
          )}

          {myNetworks.map(nw => {
            const members = allMembers.filter(m => m.network_id === nw.id && m.status === "active");
            const isNwAdmin = myAdminNetIds.has(nw.id);
            const assignedLinks = networkLinks.filter(l => l.network_id === nw.id);
            const assignedShoots = shoots.filter(s => assignedLinks.some(l => l.shoot_id === s.id));
            return (
              <div key={nw.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{nw.name}</div>
                    {nw.description && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>{nw.description}</div>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={S.tag(C.accent)}>{members.length} Mitglieder</span>
                      {nw.is_public && <span style={S.tag(C.green)}>Öffentlich</span>}
                      {isNwAdmin && <span style={S.tag(C.amber)}>Admin</span>}
                    </div>
                  </div>
                  {isNwAdmin && (
                    <div style={{ display: "flex", gap: 6, flexWrap:"wrap" }}>
                      <button style={S.btn("outline")} onClick={() => setShowInviteModal(nw)}>＋ Einladen</button>
                      <button style={S.btn("ghost")} onClick={() => setShowAssignModal(nw)}>📢 Shoot</button>
                      <button style={S.btn("ghost")} onClick={() => { setEditNetForm({ name: nw.name, description: nw.description||"", is_public: nw.is_public }); setShowEditNetModal(nw); }}>✏️</button>
                      {(nw.created_by === user.id || user.is_admin) && <button style={S.btn("danger")} onClick={() => handleDeleteNetwork(nw)}>🗑</button>}
                    </div>
                  )}
                </div>

                {/* Members list */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Mitglieder</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {members.map(m => { const u = users.find(u => u.id === m.user_id) || { name: "?" }; return <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 11 }}><div style={{ ...S.avatar(18), fontSize: 9 }}>{u.name?.[0]}</div><span style={{ color: C.text }}>{u.name}</span>{m.role === "admin" && <span style={S.tag(C.amber)}>Admin</span>}</div>; })}
                  </div>
                </div>

                {/* Assigned shoots */}
                {assignedShoots.length > 0 && (
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Ausgeschriebene Shoots</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {assignedShoots.map(s => {
                        const lnk = assignedLinks.find(l => l.shoot_id === s.id);
                        return (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 11 }}>
                            <span style={{ color: C.text }}>{s.title}</span>
                            <span style={S.badge(s.status)}>{STATUS_CONFIG[s.status]?.label}</span>
                            {isNwAdmin && <button style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 12, padding: "0 2px" }} onClick={() => handleRemoveShootLink(lnk.id, s.id)}>✕</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ENTDECKEN ── */}
      {tab === "discover" && !loading && (
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>Öffentliche Netzwerke:</div>
          {discoverNets.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 32, textAlign: "center", color: C.textDim, fontSize: 12 }}>Keine weiteren Netzwerke verfügbar.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {discoverNets.map(nw => {
              const members = allMembers.filter(m => m.network_id === nw.id && m.status === "active");
              return (
                <div key={nw.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{nw.name}</div>
                    {nw.description && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{nw.description}</div>}
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{members.length} Mitglieder</div>
                  </div>
                  <button style={S.btn("primary")} onClick={() => handleJoin(nw.id)}>Beitreten →</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SHOOT AUSSCHREIBUNGEN ── */}
      {tab === "shoots" && !loading && (
        <div>
          {publishedShoots.length === 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 40, textAlign: "center", color: C.textDim }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 12 }}>Keine ausgeschriebenen Shoots in deinen Netzwerken.</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {publishedShoots.map(shoot => {
              const alreadyIn  = participants.find(p => p.shoot_id === shoot.id && p.user_id === user.id);
              const myApp      = shootApps.find(a => a.shoot_id === shoot.id && a.applicant_id === user.id);
              const appCount   = shootApps.filter(a => a.shoot_id === shoot.id && a.status === "pending").length;
              const sc = STATUS_CONFIG[shoot.status] || STATUS_CONFIG.planned;
              return (
                <div key={shoot.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{shoot.title}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                        <span style={S.badge(shoot.status)}>{sc.label}</span>
                        <span style={{ fontSize: 11, color: C.textMid }}>📅 {fmtRange(shoot.date_start, shoot.date_end)}</span>
                        {shoot.location && <span style={{ fontSize: 11, color: C.textMid }}>📍 {shoot.location}</span>}
                      </div>
                      {shoot.notes && <div style={{ fontSize: 11, color: C.textDim }}>{shoot.notes.slice(0, 120)}{shoot.notes.length > 120 ? "…" : ""}</div>}
                      {user.is_admin && appCount > 0 && <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>⏳ {appCount} offene Anfrage{appCount !== 1 ? "n" : ""}</div>}
                    </div>
                    <div>
                      {alreadyIn    ? <span style={S.tag(C.green)}>✓ Dabei</span>
                       : myApp      ? <span style={S.tag(myApp.status === "rejected" ? C.danger : C.amber)}>{myApp.status === "rejected" ? "Abgelehnt" : "⏳ Ausstehend"}</span>
                       : user.id !== shoot.created_by && <button style={S.btn("primary")} onClick={() => { setApplyRole(""); setApplyMsg(""); setShowApplyModal(shoot); }}>Anfragen →</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ANFRAGEN ── */}
      {tab === "requests" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Admin: incoming shoot applications */}
          {pendingShootApps.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Shoot-Anfragen ({pendingShootApps.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingShootApps.map(app => {
                  const applicant = users.find(u => u.id === app.applicant_id) || { name: "?" };
                  const shoot = shoots.find(s => s.id === app.shoot_id) || { title: "?" };
                  return (
                    <div key={app.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderLeft: `2px solid ${C.accent}` }}>
                      <div style={S.avatar(32)}>{applicant.name?.[0]}</div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{applicant.name}</div>
                        <div style={{ fontSize: 11, color: C.textMid }}>für: <strong style={{ color: C.text }}>{shoot.title}</strong></div>
                        {app.proposed_role && <div style={{ fontSize: 10, color: C.textDim }}>Rolle: {app.proposed_role}</div>}
                        {app.message && <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic" }}>"{app.message}"</div>}
                      </div>
                      <button style={S.btn("primary")} onClick={() => handleApproveApp(app)}>✓ Aufnehmen</button>
                      <button style={S.btn("danger")} onClick={() => handleRejectApp(app)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Admin: pending network join requests */}
          {pendingNetMembers.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.amber, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Beitrittsanfragen ({pendingNetMembers.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingNetMembers.map(mem => {
                  const u = users.find(u => u.id === mem.user_id) || { name: "?" };
                  const nw = networks.find(n => n.id === mem.network_id) || { name: "?" };
                  return (
                    <div key={mem.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={S.avatar(32)}>{u.name?.[0]}</div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: C.textMid }}>→ {nw.name}</div>
                        <span style={S.roleBadge(u.role)}>{ROLE_CONFIG[u.role]?.label || u.role}</span>
                      </div>
                      <button style={S.btn("primary")} onClick={() => handleApproveMember(mem)}>✓ Aufnehmen</button>
                      <button style={S.btn("danger")} onClick={() => handleRejectMember(mem)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All users: own shoot applications */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Meine Anfragen ({myOwnApps.length})</div>
            {myOwnApps.length === 0
              ? <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24, color: C.textDim, fontSize: 12, textAlign: "center" }}>Noch keine Anfragen gesendet.</div>
              : myOwnApps.map(app => {
                  const shoot = shoots.find(s => s.id === app.shoot_id) || { title: "?" };
                  const stMap = { pending: { label: "Ausstehend", color: C.amber }, approved: { label: "Angenommen ✓", color: C.green }, rejected: { label: "Abgelehnt", color: C.danger } };
                  const st = stMap[app.status] || stMap.pending;
                  return (
                    <div key={app.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{shoot.title}</div><div style={{ fontSize: 11, color: C.textDim }}>Rolle: {app.proposed_role || "Crew"}</div></div>
                      <span style={S.tag(st.color)}>{st.label}</span>
                    </div>
                  );
                })
            }
          </div>

          {pendingTotal === 0 && myOwnApps.length === 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 32, textAlign: "center", color: C.textDim, fontSize: 12 }}>Keine Anfragen.</div>
          )}
        </div>
      )}

      {/* ── CREATE NETWORK MODAL ── */}
      {showCreateModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Netzwerk erstellen</div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Name *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={networkForm.name} onChange={e=>setNetworkForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Starantor Crew"/></div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Beschreibung</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={networkForm.description} onChange={e=>setNetworkForm(f=>({...f,description:e.target.value}))}/></div>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" id="pub" checked={networkForm.is_public} onChange={e=>setNetworkForm(f=>({...f,is_public:e.target.checked}))}/><label htmlFor="pub" style={{ fontSize: 12, color: C.textMid, cursor: "pointer" }}>Öffentlich sichtbar</label></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleCreateNetwork} disabled={saving}>{saving?"...":"Erstellen"}</button><button style={S.btn("ghost")} onClick={()=>setShowCreateModal(false)}>Abbrechen</button></div>
      </div></div>)}

      {/* ── INVITE MODAL ── */}
      {showEditNetModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Netzwerk bearbeiten</div>
        <div style={{ marginBottom:12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Name *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={editNetForm.name} onChange={e=>setEditNetForm(f=>({...f,name:e.target.value}))} /></div>
        <div style={{ marginBottom:12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Beschreibung</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={editNetForm.description} onChange={e=>setEditNetForm(f=>({...f,description:e.target.value}))} /></div>
        <div style={{ marginBottom:18, display:"flex", alignItems:"center", gap:10 }}>
          <input type="checkbox" checked={editNetForm.is_public} onChange={e=>setEditNetForm(f=>({...f,is_public:e.target.checked}))} id="editNetPublic" />
          <label htmlFor="editNetPublic" style={{ fontSize:13, color:C.text, cursor:"pointer" }}>Öffentlich (auffindbar für alle)</label>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={S.btn("primary")} onClick={handleEditNetwork} disabled={saving}>{saving?"...":"Speichern"}</button>
          <button style={S.btn("ghost")} onClick={()=>setShowEditNetModal(null)}>Abbrechen</button>
        </div>
      </div></div>)}

      {showInviteModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Einladen — {showInviteModal.name}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>Alle freigegebenen User:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
          {users.filter(u => u.is_approved).map(u => {
            const already = allMembers.find(m => m.network_id === showInviteModal.id && m.user_id === u.id);
            return (
              <div key={u.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: already ? C.accentDim : C.bg }}>
                <div style={S.avatar(26)}>{u.name?.[0]}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{u.name}</div><div style={{ fontSize: 10, color: C.textDim }}>{u.email}</div></div>
                {already ? <span style={S.tag(already.status === "active" ? C.green : C.amber)}>{already.status === "active" ? "✓ Dabei" : "⏳ Eingeladen"}</span>
                  : <button style={S.btn("primary")} onClick={() => handleInvite(showInviteModal.id, u.id)}>Einladen</button>}
              </div>
            );
          })}
        </div>
        <button style={S.btn("ghost")} onClick={() => setShowInviteModal(null)}>Schliessen</button>
      </div></div>)}

      {/* ── ASSIGN SHOOT MODAL ── */}
      {showAssignModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Shoot ausschreiben — {showAssignModal.name}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>Wähle einen Shoot zum Ausschreiben:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
          {shoots.filter(s => s.created_by === user.id || user.is_admin).map(s => {
            const alreadyLinked = networkLinks.find(l => l.network_id === showAssignModal.id && l.shoot_id === s.id);
            return (
              <div key={s.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: alreadyLinked ? C.accentDim : C.bg }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{fmtRange(s.date_start, s.date_end)} · {s.location || "kein Ort"}</div>
                </div>
                <span style={S.badge(s.status)}>{STATUS_CONFIG[s.status]?.label}</span>
                {alreadyLinked
                  ? <span style={S.tag(C.green)}>✓ Ausgeschrieben</span>
                  : <button style={S.btn("primary")} onClick={() => handleAssignShoot(showAssignModal.id, s.id)}>Ausschreiben</button>}
              </div>
            );
          })}
          {shoots.length === 0 && <div style={{ color: C.textDim, fontSize: 12, padding: 16, textAlign: "center" }}>Keine Shoots vorhanden.</div>}
        </div>
        <button style={S.btn("ghost")} onClick={() => setShowAssignModal(null)}>Schliessen</button>
      </div></div>)}

      {/* ── APPLY MODAL ── */}
      {showApplyModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Anfrage senden — {showApplyModal.title}</div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Gewünschte Rolle</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={applyRole} onChange={e=>setApplyRole(e.target.value)} placeholder="z. B. Kameramann, Schauspieler, Gaffer..."/></div>
        <div style={{ marginBottom: 18 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Nachricht (optional)</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={applyMsg} onChange={e=>setApplyMsg(e.target.value)} placeholder="Kurze Vorstellung, Erfahrung..."/></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleApply}>Anfrage senden</button><button style={S.btn("ghost")} onClick={()=>setShowApplyModal(null)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// PROFILE PAGE — PW + Name ändern
// ============================================================
function ProfilePage({ user, setUser }) {
  const [nameForm, setNameForm] = useState({ name: user.name || "" });
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [nameMsg, setNameMsg] = useState(""); const [pwMsg, setPwMsg] = useState(""); const [pwErr, setPwErr] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveName = async () => {
    const nameErr = V.check([["Name", V.name(nameForm.name), "Name muss 2–80 Zeichen haben"]]);
    if (nameErr) { setNameMsg(nameErr); return; }
    const rlErr = RL.form("profile");
    if (rlErr) { setNameMsg(rlErr); return; }
    setSaving(true); setNameMsg("");
    try {
      await db.update("users", sanitizeObj({ name: nameForm.name.trim() }), `id=eq.${user.id}`);
      setUser(u => {
        const updated = { ...u, name: nameForm.name.trim() };
        try { const s = localStorage.getItem(SESSION_KEY); if(s){ const d=JSON.parse(s); localStorage.setItem(SESSION_KEY, JSON.stringify({...d, profile: updated})); } } catch(e){}
        return updated;
      });
      setNameMsg("✓ Name gespeichert");
    } catch(e) { setNameMsg("Fehler: " + e.message); }
    setSaving(false);
  };

  const handleSavePw = async () => {
    setPwErr(""); setPwMsg("");
    const ppwErr = V.check([["Passwort", V.password(pwForm.newPw), "Passwort muss 8–128 Zeichen haben"], ["Wiederholung", pwForm.newPw===pwForm.confirm, "Passwörter stimmen nicht überein"]]); if (ppwErr) { setPwErr(ppwErr); return; }
    setSaving(true);
    try {
      // Re-auth with current password first
      const data = await db.signIn(user.email, pwForm.current);
      db.setToken(data.access_token);
      // Update password via Supabase Auth API
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${data.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwForm.newPw })
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Fehler"); }
      setPwMsg("✓ Passwort geändert");
      setPwForm({ current: "", newPw: "", confirm: "" });
    } catch(e) { setPwErr(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Mein Profil</div><div style={{ fontSize: 12, color: C.textDim }}>{user.email}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {/* Name */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>Benutzername ändern</div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Anzeigename</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={nameForm.name} onChange={e=>setNameForm(f=>({...f,name:e.target.value}))}/></div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>E-Mail</label><input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", color: C.textDim }} value={user.email} readOnly/></div>
          {nameMsg && <div style={{ fontSize: 11, color: C.green, marginBottom: 10 }}>{nameMsg}</div>}
          <button style={S.btn("primary")} onClick={handleSaveName} disabled={saving}>Speichern</button>
        </div>

        {/* Password */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>Passwort ändern</div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Aktuelles Passwort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" value={pwForm.current} onChange={e=>setPwForm(f=>({...f,current:e.target.value}))}/></div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Neues Passwort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" placeholder="Min. 8 Zeichen" value={pwForm.newPw} onChange={e=>setPwForm(f=>({...f,newPw:e.target.value}))}/></div>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Wiederholen</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="password" value={pwForm.confirm} onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))}/></div>
          {pwErr && <div style={{ fontSize: 12, color: C.danger, padding: "10px 13px", background: C.dangerDim, borderRadius: 10, marginBottom: 12, borderLeft: `3px solid ${C.danger}` }}>{pwErr}</div>}
          {pwMsg && <div style={{ fontSize: 11, color: C.green, marginBottom: 10 }}>{pwMsg}</div>}
          <button style={S.btn("primary")} onClick={handleSavePw} disabled={saving}>Passwort ändern</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EQUIPMENT MARKETPLACE — Öffentliche Vermietung
// ============================================================
function MarketplacePage({ user, users, userEquipment }) {
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("browse");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(null);
  const [showEquipPicker, setShowEquipPicker] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", description: "", daily_rate: "", weekly_rate: "", location: "", contact_info: "" });
  const prefillFromEquipment = (eq) => {
    setForm(f => ({ ...f, name: eq.name || "", category: eq.category || "", description: eq.notes || "" }));
    setShowEquipPicker(false);
    setShowAddModal(true);
  };
  const [reqForm, setReqForm] = useState({ message: "", date_from: "", date_to: "" });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [lst, reqs] = await Promise.all([
        db.select("equipment_listings"),
        db.select("equipment_rental_requests"),
      ]);
      setListings(lst);
      setMyListings(lst.filter(l => l.owner_id === user.id));
      setRequests(reqs);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const myIncomingRequests = requests.filter(r => {
    const listing = listings.find(l => l.id === r.listing_id);
    return listing && listing.owner_id === user.id && r.status === "pending";
  });
  const myOutgoingRequests = requests.filter(r => r.requester_id === user.id);

  const handleAddListing = async () => {
    setSaving(true);
    const eqErr = V.check([
      ["Name",       V.text(form.name, 100),         "Bezeichnung ist Pflicht (max. 100 Zeichen)"],
      ["CHF/Tag",    V.number(form.daily_rate, 0, 9999), "Ungültiger Tagespreis (0–9999)"],
      ["Beschreibung", V.textOpt(form.description, 500), "Beschreibung max. 500 Zeichen"],
      ["URL",        V.url(form.contact_info),        "Ungültige Kontakt-URL"],
    ]);
    if (eqErr) { alert(eqErr); setSaving(false); return; }
    try {
      const item = await db.insert("equipment_listings", sanitizeObj({ ...form, owner_id: user.id, daily_rate: parseFloat(form.daily_rate) || 0, weekly_rate: parseFloat(form.weekly_rate) || 0, is_available: true }));
      setListings(p => [...p, item]);
      setMyListings(p => [...p, item]);
      setShowAddModal(false); setForm({ name: "", category: "", description: "", daily_rate: "", weekly_rate: "", location: "", contact_info: "" });
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const handleToggleAvail = async (id, current) => {
    try {
      await db.update("equipment_listings", { is_available: !current }, `id=eq.${id}`);
      setListings(p => p.map(l => l.id === id ? { ...l, is_available: !current } : l));
      setMyListings(p => p.map(l => l.id === id ? { ...l, is_available: !current } : l));
    } catch(e) { alert(e.message); }
  };

  const handleDeleteListing = async (id) => {
    const listing = listings.find(l => l.id === id);
    if (!listing || (listing.owner_id !== user.id && !user.is_admin)) { alert("Du kannst nur deine eigenen Inserate löschen."); return; }
    if (!confirm("Inserat löschen?")) return;
    try {
      await db.remove("equipment_listings", `id=eq.${id}`);
      setListings(p => p.filter(l => l.id !== id));
      setMyListings(p => p.filter(l => l.id !== id));
    } catch(e) { alert(e.message); }
  };

  const handleSendRequest = async () => {
    if (!showRequestModal) return;
    const rlErr = RL.form("rental_request");
    if (rlErr) { alert(rlErr); return; }
    const reqErr = V.check([
      ["Von-Datum", V.date(reqForm.date_from) && reqForm.date_from, "Bitte Startdatum wählen"],
      ["Bis-Datum", V.date(reqForm.date_to),                        "Ungültiges Enddatum"],
      ["Nachricht", V.textOpt(reqForm.message, 500),                "Nachricht max. 500 Zeichen"],
    ]);
    if (reqErr) { alert(reqErr); return; }
    try {
      const req = await db.insert("equipment_rental_requests", { listing_id: showRequestModal.id, requester_id: user.id, message: reqForm.message, date_from: reqForm.date_from, date_to: reqForm.date_to || reqForm.date_from, status: "pending" });
      setRequests(p => [...p, req]);
      // Notify equipment owner
      const owner = users.find(u => u.id === showRequestModal.owner_id);
      if (owner?.email) {
        const days = reqForm.date_to ? Math.max(1, Math.round((new Date(reqForm.date_to) - new Date(reqForm.date_from)) / 86400000) + 1) : 1;
        const total = ((parseFloat(showRequestModal.daily_rate) || 0) * days).toFixed(0);
        notify("equipment_request", owner.email, { equipment_name: showRequestModal.name, requester_name: user.name, date_from: reqForm.date_from, date_to: reqForm.date_to || reqForm.date_from, total_cost: total, message: reqForm.message });
      }
      setShowRequestModal(null); setReqForm({ message: "", date_from: "", date_to: "" });
    } catch(e) { alert(e.message); }
  };

  const handleRespondRequest = async (reqId, status) => {
    try {
      await db.update("equipment_rental_requests", { status }, `id=eq.${reqId}`);
      setRequests(p => p.map(r => r.id === reqId ? { ...r, status } : r));
    } catch(e) { alert(e.message); }
  };

  const filtered = listings.filter(l => l.is_available && l.owner_id !== user.id && (!search || l.name?.toLowerCase().includes(search.toLowerCase()) || l.category?.toLowerCase().includes(search.toLowerCase())));

  const tabs = [["browse","Marktplatz"],["my-listings","Meine Inserate"],["requests",`Anfragen${myIncomingRequests.length > 0 ? ` (${myIncomingRequests.length})` : ""}`]];
  const tabStyle = (id) => ({ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 11, fontWeight: tab===id?700:400, color: tab===id?C.accent:C.textDim, borderBottom: tab===id?`2px solid ${C.accent}`:"2px solid transparent", marginBottom: -1, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "inherit" });

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Equipment-Marktplatz</div><div style={{ fontSize: 12, color: C.textDim }}>{listings.filter(l => l.is_available).length} verfügbare Inserate</div></div>
        <button style={S.btn("primary")} onClick={() => { setForm({ name: "", category: "", description: "", daily_rate: "", weekly_rate: "", location: "", contact_info: "" }); setShowAddModal(true); }}>＋ Equipment vermieten</button>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {tabs.map(([id, lbl]) => <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>{lbl}</button>)}
      </div>

      {loading && <div style={{ color: C.textDim, fontSize: 12, padding: 20 }}>Lade...</div>}

      {/* ── BROWSE ── */}
      {tab === "browse" && !loading && (
        <div>
          <input style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 13px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit", maxWidth: 260, marginBottom: 16 }} placeholder="🔍 Equipment suchen..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filtered.length === 0 && <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 40, textAlign: "center", color: C.textDim }}><div style={{ fontSize: 28, marginBottom: 10 }}>🎥</div><div style={{ fontSize: 12 }}>Kein Equipment gefunden.</div></div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filtered.map(lst => {
              const owner = users.find(u => u.id === lst.owner_id) || { name: "?" };
              const myReq = requests.find(r => r.listing_id === lst.id && r.requester_id === user.id);
              return (
                <div key={lst.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{lst.name}</div>
                      {lst.category && <span style={S.tag(C.purple)}>{lst.category}</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>CHF {(parseFloat(lst.daily_rate)||0).toFixed(0)}/Tag</div>
                      {lst.weekly_rate > 0 && <div style={{ fontSize: 10, color: C.textDim }}>CHF {(parseFloat(lst.weekly_rate)||0).toFixed(0)}/Woche</div>}
                    </div>
                  </div>
                  {lst.description && <div style={{ fontSize: 11, color: C.textMid, marginBottom: 8 }}>{lst.description}</div>}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    {lst.location && <span style={{ fontSize: 10, color: C.textDim }}>📍 {lst.location}</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ ...S.avatar(18), fontSize: 9 }}>{owner.name?.[0]}</div><span style={{ fontSize: 10, color: C.textDim }}>{owner.name}</span></div>
                  </div>
                  {lst.contact_info && <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10 }}>📞 {lst.contact_info}</div>}
                  {myReq
                    ? <span style={S.tag(myReq.status === "approved" ? C.green : myReq.status === "rejected" ? C.danger : C.amber)}>{myReq.status === "approved" ? "✓ Angenommen" : myReq.status === "rejected" ? "Abgelehnt" : "⏳ Anfrage gesendet"}</span>
                    : <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center" }} onClick={() => { setReqForm({ message: "", date_from: "", date_to: "" }); setShowRequestModal(lst); }}>Anfrage senden</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MY LISTINGS ── */}
      {tab === "my-listings" && !loading && (
        <div>
          {myListings.length === 0 && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 40, textAlign: "center", color: C.textDim }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📦</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Noch keine Inserate</div>
              <div style={{ fontSize: 11, marginBottom: 16 }}>Schalte Equipment-Inserate und verdiene mit deinem Equipment.</div>
              <button style={S.btn("primary")} onClick={() => setShowAddModal(true)}>Erstes Inserat erstellen</button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myListings.map(lst => {
              const reqCount = requests.filter(r => r.listing_id === lst.id && r.status === "pending").length;
              return (
                <div key={lst.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lst.name}</div>
                    <div style={{ fontSize: 11, color: C.textDim }}>CHF {(parseFloat(lst.daily_rate)||0).toFixed(0)}/Tag{lst.weekly_rate > 0 ? ` · CHF ${(parseFloat(lst.weekly_rate)||0).toFixed(0)}/Woche` : ""}</div>
                    {reqCount > 0 && <div style={{ fontSize: 10, color: C.accent }}>⏳ {reqCount} offene Anfrage{reqCount !== 1 ? "n" : ""}</div>}
                  </div>
                  <span style={S.tag(lst.is_available ? C.green : C.textDim)}>{lst.is_available ? "Verfügbar" : "Nicht verfügbar"}</span>
                  <button style={S.btn("outline")} onClick={() => handleToggleAvail(lst.id, lst.is_available)}>{lst.is_available ? "Deaktivieren" : "Aktivieren"}</button>
                  <button style={S.btn("danger")} onClick={() => handleDeleteListing(lst.id)}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── REQUESTS ── */}
      {tab === "requests" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {myIncomingRequests.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Eingehende Anfragen ({myIncomingRequests.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {myIncomingRequests.map(req => {
                  const lst = listings.find(l => l.id === req.listing_id) || { name: "?" };
                  const requester = users.find(u => u.id === req.requester_id) || { name: "?" };
                  const days = req.date_from && req.date_to ? Math.max(1, Math.round((new Date(req.date_to) - new Date(req.date_from)) / 86400000) + 1) : 1;
                  return (
                    <div key={req.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, borderLeft: `2px solid ${C.accent}` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={S.avatar(32)}>{requester.name?.[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{requester.name}</div>
                          <div style={{ fontSize: 11, color: C.textMid }}>für: <strong style={{ color: C.text }}>{lst.name}</strong></div>
                          <div style={{ fontSize: 10, color: C.textDim }}>{fmtRange(req.date_from, req.date_to)} · {days} Tag{days !== 1 ? "e" : ""} · CHF {((parseFloat(lst.daily_rate)||0) * days).toFixed(0)}</div>
                          {req.message && <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic", marginTop: 2 }}>"{req.message}"</div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={S.btn("primary")} onClick={() => handleRespondRequest(req.id, "approved")}>✓ Annehmen</button>
                        <button style={S.btn("danger")} onClick={() => handleRespondRequest(req.id, "rejected")}>✕ Ablehnen</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Meine Anfragen ({myOutgoingRequests.length})</div>
            {myOutgoingRequests.length === 0
              ? <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: 24, color: C.textDim, fontSize: 12, textAlign: "center" }}>Noch keine Anfragen gesendet.</div>
              : myOutgoingRequests.map(req => {
                  const lst = listings.find(l => l.id === req.listing_id) || { name: "?" };
                  const stMap = { pending: { label: "Ausstehend", color: C.amber }, approved: { label: "Angenommen ✓", color: C.green }, rejected: { label: "Abgelehnt", color: C.danger } };
                  const st = stMap[req.status] || stMap.pending;
                  return (
                    <div key={req.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lst.name}</div><div style={{ fontSize: 10, color: C.textDim }}>{fmtRange(req.date_from, req.date_to)}</div></div>
                      <span style={S.tag(st.color)}>{st.label}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* ── ADD LISTING MODAL ── */}
      {showAddModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Equipment vermieten</div>
        {userEquipment && userEquipment.length > 0 && !showEquipPicker && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Aus meinem Equipment übernehmen:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {userEquipment.map(eq => (
                <button key={eq.id} style={{ ...S.btn("ghost"), fontSize: 10 }} onClick={() => setForm(f => ({ ...f, name: eq.name, category: eq.category || f.category, description: eq.notes || f.description }))}>
                  {eq.name}
                </button>
              ))}
            </div>
            <div style={{ height: 1, background: C.border, margin: "12px 0" }}/>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Bezeichnung *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="z. B. Sony FX3, Aputure 600D..."/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kategorie</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="Kamera, Licht, Ton..."/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Standort</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="z. B. Zürich"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>CHF / Tag *</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" value={form.daily_rate} onChange={e=>setForm(f=>({...f,daily_rate:e.target.value}))} placeholder="0.00"/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>CHF / Woche</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="number" value={form.weekly_rate} onChange={e=>setForm(f=>({...f,weekly_rate:e.target.value}))} placeholder="0.00"/></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Beschreibung</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Zubehör, Zustand, Besonderheiten..."/></div>
          <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Kontakt (Tel / E-Mail)</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} value={form.contact_info} onChange={e=>setForm(f=>({...f,contact_info:e.target.value}))} placeholder="Wird nur bei Anfrage angezeigt"/></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleAddListing} disabled={saving}>{saving?"...":"Inserat erstellen"}</button><button style={S.btn("ghost")} onClick={()=>setShowAddModal(false)}>Abbrechen</button></div>
      </div></div>)}

      {/* ── REQUEST MODAL ── */}
      {showRequestModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}><div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, letterSpacing: "-0.01em", color: C.text }}>Anfrage — {showRequestModal.name}</div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:C.shadow, padding: "10px 14px", marginBottom: 16, background: C.accentDim, borderLeft: `2px solid ${C.accent}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>CHF {(parseFloat(showRequestModal.daily_rate)||0).toFixed(0)} / Tag</div>
          {showRequestModal.weekly_rate > 0 && <div style={{ fontSize: 11, color: C.textDim }}>CHF {(parseFloat(showRequestModal.weekly_rate)||0).toFixed(0)} / Woche</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Von</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={reqForm.date_from} onChange={e=>setReqForm(f=>({...f,date_from:e.target.value}))}/></div>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Bis</label><input style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} type="date" value={reqForm.date_to} onChange={e=>setReqForm(f=>({...f,date_to:e.target.value}))}/></div>
        </div>
        {reqForm.date_from && <div style={{ fontSize: 11, color: C.accent, fontFamily: "inherit", marginBottom: 10 }}>
          {(() => { const days = reqForm.date_to ? Math.max(1, Math.round((new Date(reqForm.date_to) - new Date(reqForm.date_from)) / 86400000) + 1) : 1; return `${days} Tag${days !== 1 ? "e" : ""} × CHF ${(parseFloat(showRequestModal.daily_rate)||0).toFixed(0)} = CHF ${((parseFloat(showRequestModal.daily_rate)||0) * days).toFixed(0)}`; })()}
        </div>}
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Nachricht (optional)</label><textarea style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={reqForm.message} onChange={e=>setReqForm(f=>({...f,message:e.target.value}))} placeholder="Kurze Beschreibung des Projekts..."/></div>
        <div style={{ display: "flex", gap: 8 }}><button style={S.btn("primary")} onClick={handleSendRequest}>Anfrage senden</button><button style={S.btn("ghost")} onClick={()=>setShowRequestModal(null)}>Abbrechen</button></div>
      </div></div>)}
    </div>
  );
}

// ============================================================
// NETWORK PAGE — vollständig neu mit allen Fixes
// ============================================================
// ── Password Reset Page (shown when user clicks email reset link) ─────────────
function ResetPasswordPage({ token, onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReset = async () => {
    const err = V.check([
      ["Passwort",     V.password(pw),  "Passwort muss 8–128 Zeichen haben"],
      ["Wiederholung", pw === pw2,      "Passwörter stimmen nicht überein"],
    ]);
    if (err) { setError(err); return; }
    setSaving(true); setError("");
    try {
      // Use the recovery token to authenticate this request
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message || d.error_description || "Fehler beim Zurücksetzen");
      }
      setSuccess(true);
      setTimeout(() => onDone(), 2000);
    } catch(e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔑</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>Neues Passwort</div>
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 6 }}>Bitte wähle ein neues Passwort</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 28, boxShadow: C.shadow }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.green }}>Passwort erfolgreich geändert!</div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>Du wirst zum Login weitergeleitet...</div>
            </div>
          ) : (
            <>
              {error && <div style={{ fontSize: 12, color: C.danger, padding: "10px 13px", background: C.dangerDim, borderRadius: 10, marginBottom: 16, borderLeft: `3px solid ${C.danger}` }}>{error}</div>}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Neues Passwort</label>
                <input
                  type="password"
                  style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
                  placeholder="Mindestens 8 Zeichen"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 5, display: "block" }}>Passwort bestätigen</label>
                <input
                  type="password"
                  style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 13px", color: C.text, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
                  placeholder="Passwort wiederholen"
                  value={pw2}
                  onChange={e => setPw2(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                />
              </div>
              <button
                style={{ ...S.btn("primary"), width: "100%", justifyContent: "center" }}
                onClick={handleReset}
                disabled={saving}
              >
                {saving ? "Wird gespeichert..." : "Passwort speichern"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const [user, setUser] = useState(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState(null); // password reset flow
  const [showTermsModal, setShowTermsModal] = useState(false);
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

  // Restore session from localStorage on mount
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);

    // ── Detect Supabase password-reset link (hash contains access_token + type=recovery)
    try {
      const hash = window.location.hash.substring(1); // remove leading #
      const params = new URLSearchParams(hash);
      if (params.get("type") === "recovery" && params.get("access_token")) {
        // Set the recovery token — this triggers the ResetPasswordPage
        setRecoveryToken(params.get("access_token"));
        // Clean URL so refreshing doesn't re-trigger
        window.history.replaceState(null, "", window.location.pathname);
        setSessionRestored(true);
        return; // skip normal session restore
      }
    } catch(e) {}

    (async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const { token, refreshToken, profile, expiry } = JSON.parse(stored);
          if (token && profile && expiry && Date.now() < expiry) {
            // Access token expires after 1h — refresh if older than 50 minutes
            // We store tokenIssuedAt to track this; fallback: always refresh
            try {
              if (refreshToken) {
                const fresh = await db.refreshToken(refreshToken);
                db.setToken(fresh.access_token);
                const newExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
                localStorage.setItem(SESSION_KEY, JSON.stringify({
                  token: fresh.access_token,
                  refreshToken: fresh.refresh_token,
                  profile,
                  expiry: newExpiry
                }));
              } else {
                db.setToken(token);
              }
            } catch(refreshErr) {
              // Refresh failed (token revoked etc.) — use stored token, may fail
              db.setToken(token);
            }
            setUser(profile);
            if (!profile.terms_accepted_at) setShowTermsModal(true);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch(e) {}
      setSessionRestored(true);
    })();
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [u, s, p, sl, schedData, cl, ue] = await Promise.all([db.select("users"), db.select("shoots"), db.select("shoot_participants"), db.select("shotlist"), db.select("schedule"), db.select("clients"), db.select("user_equipment", `user_id=eq.${user.id}`)]);
      setUsers(u); setShoots(s); setParticipants(p); setShotlist(sl); setSchedule(schedData); setClients(cl); setUserEquipment(ue);
      // Note: network data loads lazily in NetworkPage
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh JWT every 50 minutes (Supabase tokens expire after 60 min)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return;
        const { refreshToken, profile, expiry } = JSON.parse(stored);
        if (!refreshToken) return;
        const fresh = await db.refreshToken(refreshToken);
        db.setToken(fresh.access_token);
        const newExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          token: fresh.access_token,
          refreshToken: fresh.refresh_token,
          profile,
          expiry: newExpiry
        }));
      } catch(e) { console.warn("Token refresh failed:", e.message); }
    }, 50 * 60 * 1000); // 50 minutes
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (profile, token, refreshToken) => {
    db.setToken(token);
    setUser(profile);
    try {
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 Tage
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, refreshToken, profile, expiry }));
    } catch(e) {}
    if (!profile.terms_accepted_at) setShowTermsModal(true);
  };
  const handleLogout = () => { db.clearToken(); setUser(null); setShoots([]); setParticipants([]); setShotlist([]); setSchedule([]); setUsers([]); setClients([]); setUserEquipment([]); setPage("dashboard"); };

  const handleSaveShoot = (shoot) => {
    setShoots(prev => prev.find(s => s.id === shoot.id) ? prev.map(s => s.id === shoot.id ? shoot : s) : [...prev, shoot]);
    setSelectedShoot(shoot); setPage("shoot-detail");
  };
  const handleDeleteShoot = async (id) => {
    try { await db.remove("shoots", `id=eq.${id}`); setShoots(prev => prev.filter(s => s.id !== id)); setParticipants(prev => prev.filter(p => p.shoot_id !== id)); setShotlist(prev => prev.filter(s => s.shoot_id !== id)); setSchedule(prev => prev.filter(s => s.shoot_id !== id)); setPage("shoots"); }
    catch (e) { alert("Fehler: " + e.message); }
  };

  if (!sessionRestored) return null; // wait for localStorage restore
  if (recoveryToken) return <ResetPasswordPage token={recoveryToken} onDone={() => setRecoveryToken(null)} />;
  if (!user) return <AuthPage onLogin={handleLogin} />;
  if (user.must_change_password) return <ChangePasswordPage user={user} onDone={() => setUser(u => ({ ...u, must_change_password: false }))} />;
  const termsModalEl = showTermsModal ? (
    <TermsAcceptanceModal user={user} onAccept={() => {
      setShowTermsModal(false);
      setUser(u => ({ ...u, terms_accepted_at: new Date().toISOString() }));
    }} />
  ) : null;

  const myIds = participants.filter(p => p.user_id === user.id).map(p => p.shoot_id);
  const visibleShoots = user.is_admin ? shoots : shoots.filter(s => myIds.includes(s.id) || s.created_by === user.id);

  const content = loading ? (
    <div style={{ textAlign: "center", padding: 60, color: C.textDim, fontFamily: "inherit", fontSize: 12 }}>Loading...</div>
  ) : (
    <>
      {page === "dashboard" && <Dashboard user={user} shoots={visibleShoots} participants={participants} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
      {page === "shoots" && <ShootsList user={user} shoots={shoots} participants={participants} clients={clients} setPage={setPage} setSelectedShoot={setSelectedShoot} />}
      {page === "calendar" && (<div><div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}><div><div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginBottom: 3 }}>Kalender</div></div></div><CalendarView shoots={visibleShoots} user={user} setSelectedShoot={setSelectedShoot} setPage={setPage} /></div>)}
      {page === "clients" && <ClientsPage user={user} />}
      {page === "actors" && user.is_admin && <ActorsPage user={user} />}
      {page === "my-equipment" && <MyEquipmentPage user={user} userEquipment={userEquipment} setUserEquipment={setUserEquipment} />}
      {page === "network" && <NetworkPage user={user} users={users} setShoots={setShoots} shoots={shoots} participants={participants} setParticipants={setParticipants} />}
      {page === "marketplace" && <MarketplacePage user={user} users={users} userEquipment={userEquipment} />}
      {page === "profile" && <ProfilePage user={user} setUser={setUser} />}
      {page === "users" && user.is_admin && <UsersPage users={users} setUsers={setUsers} user={user} />}
      {page === "new-shoot" && <NewShootPage user={user} clients={clients} setPage={setPage} onSave={handleSaveShoot} />}
      {page === "shoot-detail" && selectedShoot && <ShootDetail shoot={selectedShoot} setShoot={setSelectedShoot} participants={participants} setParticipants={setParticipants} shotlist={shotlist} setShotlist={setShotlist} schedule={schedule} setSchedule={setSchedule} users={users} clients={clients} user={user} setPage={setPage} onDelete={handleDeleteShoot} userEquipment={userEquipment} />}
    </>
  );

  return (
    <>
{(() => {
        const isDark = _themeMode === 'dark';
        return <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { margin: 0; background: ${C.bg}; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif; -webkit-font-smoothing: antialiased; color: ${C.text}; transition: background 0.25s, color 0.25s; }
          input, textarea, select, button { font-family: inherit; }
          input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px ${C.accentDim}; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
          button:hover { opacity: 0.85; }
          a:hover { opacity: 0.75; }
          ::placeholder { color: ${C.textDim}; opacity: 1; }
          ::selection { background: ${C.accent}; color: ${isDark ? '#000' : '#fff'}; }
          input, textarea, select { color: ${C.text}; background-color: ${C.surfaceHi}; }
          @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
          .fadeIn { animation: fadeIn 0.2s ease; }
        `}</style>;
      })()}
      {termsModalEl}
      <Layout page={page} setPage={setPage} user={user} onLogout={handleLogout}>{content}</Layout>
    </>
  );
}

// ============================================================
// NETWORK PAGE — vollständig überarbeitet
// ============================================================
