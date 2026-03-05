import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL")     ?? "ShootPlan <noreply@starantor.com>";
const APP_URL        = Deno.env.get("APP_URL")        ?? "https://planning.starantor.com";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://planning.starantor.com";

if (!RESEND_API_KEY) console.error("[send-notification] RESEND_API_KEY secret is not set!");

const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const _ipLog = new Map<string, number[]>();
function checkRateLimit(ip: string, maxReqs = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const log  = (_ipLog.get(ip) ?? []).filter(t => now - t < windowMs);
  if (log.length >= maxReqs) return false;
  log.push(now); _ipLog.set(ip, log); return true;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const VALID_TYPES = new Set([
  "equipment_request",
  "new_user_registration",
  "network_invite",
  "shoot_application",
  "new_shoot_published",
  "admin_broadcast",
]);
const MAX_BODY_BYTES = 16_000;

function sanitizeStr(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]*>/g, "")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
          .trim().slice(0, max);
}

function sanitizeData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[sanitizeStr(k, 50)] = sanitizeStr(v, 5000);
  }
  return out;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Resend error:", err); throw new Error("Email send failed"); }
  return res.json();
}

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'SF Pro',system-ui,sans-serif;}
  .wrap{max-width:560px;margin:0 auto;padding:40px 20px;}
  .card{background:#1C1C1E;border:1px solid #38383A;border-radius:16px;padding:28px 32px;}
  .logo{font-size:15px;font-weight:700;color:#0A84FF;letter-spacing:-0.01em;margin-bottom:24px;}
  h2{color:#FFFFFF;font-size:17px;margin:0 0 12px;font-weight:700;letter-spacing:-0.01em;}
  p{color:rgba(235,235,245,0.7);font-size:13px;line-height:1.6;margin:0 0 14px;}
  .hi{color:#FFFFFF;font-weight:600;}
  .tag{display:inline-block;padding:3px 10px;background:rgba(10,132,255,0.15);border:1px solid rgba(10,132,255,0.3);color:#0A84FF;font-size:11px;border-radius:20px;font-weight:600;}
  .btn{display:inline-block;margin-top:20px;padding:11px 24px;background:#0A84FF;color:#fff;text-decoration:none;font-weight:600;font-size:13px;border-radius:10px;}
  .msg{background:#2C2C2E;border-left:3px solid #0A84FF;border-radius:0 10px 10px 0;padding:14px 16px;margin:14px 0;}
  .msg p{color:rgba(235,235,245,0.85);white-space:pre-wrap;word-break:break-word;margin:0;}
  .footer{margin-top:20px;font-size:11px;color:#48484A;text-align:center;}
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">ShootPlan</div>
${content}
<a href="${APP_URL}" class="btn">App öffnen</a>
</div>
<div class="footer">ShootPlan &middot; Diese E-Mail wurde vom Admin versendet. &middot; <a href="${APP_URL}" style="color:#48484A;">Abmelden</a></div>
</div></body></html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function getTemplate(type: string, data: Record<string, string>) {
  switch (type) {
    case "equipment_request":
      return {
        subject: `Neue Mietanfrage: ${data.equipment_name}`,
        html: baseTemplate(`
          <h2>Neue Mietanfrage</h2>
          <p><span class="hi">${escapeHtml(data.requester_name)}</span> möchte dein Equipment mieten:</p>
          <p><span class="tag">${escapeHtml(data.equipment_name)}</span></p>
          <p>Zeitraum: <span class="hi">${escapeHtml(data.date_from)}</span> – <span class="hi">${escapeHtml(data.date_to)}</span><br>
          Geschätzt: <span class="hi">CHF ${escapeHtml(data.total_cost)}</span></p>
          ${data.message ? `<div class="msg"><p>${escapeHtml(data.message)}</p></div>` : ""}
          <p>Melde dich in der App an um die Anfrage zu bearbeiten.</p>
        `),
      };
    case "new_user_registration":
      return {
        subject: `Neue Registrierung: ${data.user_name}`,
        html: baseTemplate(`
          <h2>Neuer User wartet auf Freigabe</h2>
          <p><span class="hi">${escapeHtml(data.user_name)}</span> hat sich registriert:</p>
          <p>${escapeHtml(data.user_email)}<br>Rolle: <span class="tag">${escapeHtml(data.user_role)}</span></p>
          <p>Gehe zu <strong style="color:#fff">Verwaltung → Benutzer</strong> um den Account freizugeben.</p>
        `),
      };
    case "network_invite":
      return {
        subject: `Einladung: ${data.network_name}`,
        html: baseTemplate(`
          <h2>Du wurdest eingeladen</h2>
          <p><span class="hi">${escapeHtml(data.inviter_name)}</span> hat dich zum Netzwerk eingeladen:</p>
          <p><span class="tag">${escapeHtml(data.network_name)}</span></p>
          <p>Gehe zu <strong style="color:#fff">Netzwerk → Meine Netzwerke</strong> um die Einladung anzunehmen.</p>
        `),
      };
    case "shoot_application":
      return {
        subject: `Neue Bewerbung: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neue Anfrage für deinen Shoot</h2>
          <p><span class="hi">${escapeHtml(data.applicant_name)}</span> möchte bei deinem Shoot mitmachen:</p>
          <p><span class="tag">${escapeHtml(data.shoot_title)}</span></p>
          <p>Rolle: <span class="hi">${escapeHtml(data.proposed_role)}</span></p>
          ${data.message ? `<div class="msg"><p>${escapeHtml(data.message)}</p></div>` : ""}
          <p>Gehe zu <strong style="color:#fff">Netzwerk → Anfragen</strong> um zu antworten.</p>
        `),
      };
    case "new_shoot_published":
      return {
        subject: `Neuer Shoot: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neuer Shoot ausgeschrieben</h2>
          <p><span class="hi">${escapeHtml(data.publisher_name)}</span> hat einen Shoot im Netzwerk <span class="tag">${escapeHtml(data.network_name)}</span> veröffentlicht:</p>
          <p><span class="tag">${escapeHtml(data.shoot_title)}</span></p>
          ${data.shoot_date ? `<p>Datum: <span class="hi">${escapeHtml(data.shoot_date)}</span></p>` : ""}
          <p>Öffne die App um dich zu bewerben.</p>
        `),
      };
    case "admin_broadcast":
      return {
        subject: escapeHtml(data.subject),
        html: baseTemplate(`
          <h2>${escapeHtml(data.subject)}</h2>
          <p>Hallo <span class="hi">${escapeHtml(data.user_name)}</span>,</p>
          <div class="msg"><p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p></div>
          <p style="margin-top:14px;font-size:12px;color:rgba(235,235,245,0.4);">Diese Nachricht wurde vom ShootPlan-Administrator versendet.</p>
        `),
      };
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip, 60, 60_000)) {
    console.warn(`[send-notification] Rate limit exceeded: ${ip}`);
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
  }

  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const { type, to, data } = body;

    if (!type || typeof type !== "string" || !VALID_TYPES.has(type)) {
      return new Response(JSON.stringify({ error: "Invalid notification type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!to || !EMAIL_RE.test(String(to))) {
      return new Response(JSON.stringify({ error: "Invalid recipient email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!data || typeof data !== "object") {
      return new Response(JSON.stringify({ error: "Missing data payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeData = sanitizeData(data);
    const { subject, html } = getTemplate(type, safeData);
    await sendEmail(String(to).toLowerCase().trim(), subject, html);
    console.log(`[send-notification] ok type=${type} ip=${ip}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[send-notification] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Notification failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
