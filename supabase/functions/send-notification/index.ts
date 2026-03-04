import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "ShootPlan <noreply@starantor.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://planning.starantor.com";

// ─── CORS headers ────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Send via Resend ──────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    throw new Error("Email send failed: " + err);
  }
  return res.json();
}

// ─── Email Templates ──────────────────────────────────────────────────────────
function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { margin:0; padding:0; background:#0D0D0D; font-family:'Courier New',monospace; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#141414; border:1px solid #242424; border-radius:3px; padding:28px 32px; }
  .logo { font-size:13px; font-weight:700; color:#E8FF47; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:24px; }
  .logo span { color:#888; font-weight:400; }
  h2 { color:#F0F0F0; font-size:16px; margin:0 0 12px; font-weight:700; }
  p { color:#8A8A8A; font-size:13px; line-height:1.6; margin:0 0 16px; }
  .highlight { color:#F0F0F0; }
  .tag { display:inline-block; padding:2px 8px; background:rgba(232,255,71,0.1); border:1px solid rgba(232,255,71,0.3); color:#E8FF47; font-size:11px; border-radius:2px; font-family:'Courier New',monospace; }
  .btn { display:inline-block; margin-top:20px; padding:10px 24px; background:#E8FF47; color:#000; text-decoration:none; font-weight:700; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; border-radius:2px; }
  .footer { margin-top:24px; font-size:11px; color:#333; text-align:center; }
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">SHOOT<span>PLAN</span></div>
${content}
<a href="${APP_URL}" class="btn">App öffnen →</a>
</div>
<div class="footer">ShootPlan · planning.starantor.com · Diese Mail wurde automatisch generiert.</div>
</div></body></html>`;
}

function templates(type: string, data: Record<string, string>) {
  switch (type) {

    case "equipment_request":
      return {
        subject: `📦 Neue Mietanfrage: ${data.equipment_name}`,
        html: baseTemplate(`
          <h2>Neue Mietanfrage</h2>
          <p><span class="highlight">${data.requester_name}</span> möchte dein Equipment mieten:</p>
          <p><span class="tag">${data.equipment_name}</span></p>
          <p>
            📅 <span class="highlight">${data.date_from}</span> bis <span class="highlight">${data.date_to}</span><br>
            💰 Geschätzte Kosten: <span class="highlight">CHF ${data.total_cost}</span>
          </p>
          ${data.message ? `<p>Nachricht: <em style="color:#aaa">"${data.message}"</em></p>` : ""}
          <p>Melde dich in der App an um die Anfrage anzunehmen oder abzulehnen.</p>
        `),
      };

    case "new_user_registration":
      return {
        subject: `👤 Neue Registrierung: ${data.user_name}`,
        html: baseTemplate(`
          <h2>Neuer User wartet auf Freigabe</h2>
          <p><span class="highlight">${data.user_name}</span> hat sich registriert und wartet auf deine Freigabe:</p>
          <p>
            📧 <span class="highlight">${data.user_email}</span><br>
            🎭 Rolle: <span class="tag">${data.user_role}</span>
          </p>
          <p>Gehe in der App zu <strong style="color:#F0F0F0">Verwaltung → Benutzer</strong> um den Account freizugeben.</p>
        `),
      };

    case "network_invite":
      return {
        subject: `🌐 Einladung: ${data.network_name}`,
        html: baseTemplate(`
          <h2>Du wurdest eingeladen</h2>
          <p><span class="highlight">${data.inviter_name}</span> hat dich zum Netzwerk eingeladen:</p>
          <p><span class="tag">${data.network_name}</span></p>
          <p>Öffne die App und gehe zu <strong style="color:#F0F0F0">Netzwerk → Meine Netzwerke</strong> um die Einladung anzunehmen.</p>
        `),
      };

    case "shoot_application":
      return {
        subject: `🎬 Neue Beitrittsanfrage: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neue Anfrage für deinen Shoot</h2>
          <p><span class="highlight">${data.applicant_name}</span> möchte bei deinem Shoot mitmachen:</p>
          <p><span class="tag">${data.shoot_title}</span></p>
          <p>
            🎭 Gewünschte Rolle: <span class="highlight">${data.proposed_role}</span>
          </p>
          ${data.message ? `<p>Nachricht: <em style="color:#aaa">"${data.message}"</em></p>` : ""}
          <p>Gehe in der App zu <strong style="color:#F0F0F0">Netzwerk → Anfragen</strong> um die Anfrage zu bearbeiten.</p>
        `),
      };

    case "new_shoot_published":
      return {
        subject: `🎬 Neuer Shoot: ${data.shoot_title}`,
        html: baseTemplate(`
          <h2>Neuer Shoot ausgeschrieben</h2>
          <p><span class="hi">${data.publisher_name}</span> hat einen neuen Shoot im Netzwerk <span class="tag">${data.network_name}</span> veröffentlicht:</p>
          <p><span class="tag">${data.shoot_title}</span></p>
          ${data.shoot_date ? `<p>📅 <span class="hi">${data.shoot_date}</span></p>` : ""}
          <p>Öffne die App um die Details zu sehen und dich zu bewerben.</p>
        `),
      };
    default:
      throw new Error("Unknown notification type: " + type);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, to, data } = await req.json();

    if (!type || !to || !data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, to, data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html } = templates(type, data);
    await sendEmail(to, subject, html);

    console.log(`✓ Notification sent: type=${type} to=${to}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Notification error:", err);
    // Return 200 even on error — don't break the app flow
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
