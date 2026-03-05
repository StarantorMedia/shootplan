import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Secrets (set via Supabase Dashboard → Edge Functions → Secrets) ──────────
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL")     ?? "ShootPlan <noreply@starantor.com>";
const APP_URL        = Deno.env.get("APP_URL")        ?? "https://planning.starantor.com";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://planning.starantor.com";

if (!RESEND_API_KEY) {
  console.error("[send-notification] RESEND_API_KEY secret is not set!");
}

// ── CORS — restrict to own domain only ───────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── In-memory rate limiter (per IP, resets on cold start) ────────────────────
const _ipLog = new Map<string, number[]>();
function checkRateLimit(ip: string, maxReqs = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const log  = (_ipLog.get(ip) ?? []).filter(t => now - t < windowMs);
  if (log.length >= maxReqs) return false;
  log.push(now);
  _ipLog.set(ip, log);
  return true;
}

// ── Input validation ─────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const VALID_TYPES = new Set([
  "equipment_request",
  "new_user_registration",
  "network_invite",
  "shoot_application",
  "new_shoot_published",
]);
const MAX_BODY_BYTES = 8_000; // 8 KB max request body

function sanitizeStr(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // Remove HTML tags, control chars, trim
  return v.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, max);
}

function sanitizeData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[sanitizeStr(k, 50)] = sanitizeStr(v, 500);
  }
  return out;
}

// ── Send via Resend ───────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    throw new Error("Email send failed");
  }
  return res.json();
}

// ── Email Templates ───────────────────────────────────────────────────────────
function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { margin:0; padding:0; background:#000; font-family:-apple-system,BlinkMacSystemFont,'SF Pro',system-ui,sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#1C1C1E; border:1px solid #38383A; border-radius:16px; padding:28px 32px; }
  .logo { font-size:15px; font-weight:700; color:#0A84FF; letter-spacing:-0.01em; margin-bottom:24px; }
  h2 { color:#FFFFFF; font-size:17px; margin:0 0 12px; font-weight:700; letter-spacing:-0.01em; }
  p { color:rgba(235,235,245,0.7); font-size:13px; line-height:1.6; margin:0 0 14px; }
  .hi { color:#FFFFFF; font-weight:600; }
  .tag { display:inline-block; padding:3px 10px; background:rgba(10,132,255,0.15); border:1px solid rgba(10,132,255,0.3); color:#0A84FF; font-size:11px; border-radius:20px; font-weight:600; }
  .btn { display:inline-block; margin-top:20px; padding:11px 24px; background:#0A84FF; color:#fff; text-decoration:none; font-weight:600; font-size:13px; border-radius:10px; }
  .footer { margin-top:20px; font-size:11px; color:#48484A; text-align:center; }
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">🎬 ShootPlan</div>
${content}
<a href="${APP_URL}" class="btn">App öffnen →</a>
</div>
<div class="footer">ShootPlan · Diese Mail wurde automatisch generiert.</div>
</div></body></html>`;
}

function getTemplate(type: string, data: Record<string, string>) {
  switch (type) {
    case "equipment_request":
      return {
        subject: `📦 Neue Mietanfrage: ${data.equipment_name}`,
        html: baseTemplate(`
          <h2>Neue Mietanfrage</h2>
          <p><span class="hi">${data.requester_name}</span> möchte dein Equipment mieten:</p>
          <p><span class="tag">${data.equipment_name}</span></p>
          <p>📅 <span class="hi">${data.date_from}</span> – <span class="hi">${data.date_to}</span><br>
          💰 Geschätzt: <span class="hi">CHF ${data.total_cost}</span></p>
          ${data.message ? `<p><em style="color:rgba(235,235,245,0.5)">"${data.message}"</em></p>` : ""}
          <p>Melde dich in der App an um die Anfrage zu bearbeiten.</p>
        `),
      };
    case "new_user_registration":
      return {
        subject: `👤 Neue Registrierung: ${data.user_name}`,
        html: baseTemplate(`
          <h2>Neuer User wartet auf Freigabe</h2>
          <p><span class="hi">${data.user_name}</span> hat sich registriert:</p>
          <p>📧 <span class="hi">${data.user_email}</span><br>
          🎭 Rolle: <span class="tag">${data.user_role}</span></p>
          <p>Gehe zu <strong style="color:#fff">Verwaltung → Benutzer</strong> um den Account freizugeben.</p>
        `),
      };
    case "network_invite":
      return {
        subject: `🌐 Einladung: ${data.network_name}`,
        html: baseTemplate(`
          <h2>Du wurdest eingeladen</h2>
          <p><span class="hi">${data.inviter_name}</span> hat dich zum Netzwerk eingeladen:</p>
          <p><span class="tag">${data.network_name}</span></p>
          <p>Gehe zu <strong style="color:#fff">Netzwerk → Meine Netzwerke</strong> um die Einladung anzunehmen.</p>
        `),
      };
    case "shoot_application":
      return {
        subject: `🎬 Neue Bewerbung: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neue Anfrage für deinen Shoot</h2>
          <p><span class="hi">${data.applicant_name}</span> möchte bei deinem Shoot mitmachen:</p>
          <p><span class="tag">${data.shoot_title}</span></p>
          <p>🎭 Rolle: <span class="hi">${data.proposed_role}</span></p>
          ${data.message ? `<p><em style="color:rgba(235,235,245,0.5)">"${data.message}"</em></p>` : ""}
          <p>Gehe zu <strong style="color:#fff">Netzwerk → Anfragen</strong> um zu antworten.</p>
        `),
      };
    case "new_shoot_published":
      return {
        subject: `🎬 Neuer Shoot: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neuer Shoot ausgeschrieben</h2>
          <p><span class="hi">${data.publisher_name}</span> hat einen Shoot im Netzwerk <span class="tag">${data.network_name}</span> veröffentlicht:</p>
          <p><span class="tag">${data.shoot_title}</span></p>
          ${data.shoot_date ? `<p>📅 <span class="hi">${data.shoot_date}</span></p>` : ""}
          <p>Öffne die App um dich zu bewerben.</p>
        `),
      };
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // IP-based rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip, 30, 60_000)) {
    console.warn(`[send-notification] Rate limit exceeded for IP: ${ip}`);
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
    );
  }

  // Request size limit
  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: "Request too large" }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { type, to, data } = body;

    // Validate required fields
    if (!type || typeof type !== "string" || !VALID_TYPES.has(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!to || !EMAIL_RE.test(String(to))) {
      return new Response(
        JSON.stringify({ error: "Invalid recipient email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!data || typeof data !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing data payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize all template data before rendering HTML
    const safeData = sanitizeData(data);
    const { subject, html } = getTemplate(type, safeData);

    await sendEmail(String(to).toLowerCase().trim(), subject, html);
    console.log(`[send-notification] ✓ type=${type} ip=${ip}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Log full error server-side, return minimal info to client
    console.error("[send-notification] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Notification failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
