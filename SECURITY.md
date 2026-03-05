# ShootPlan — Security Guide

## API Keys & Secrets

### Was ist öffentlich (sicher im Browser)
| Variable | Typ | Warum sicher |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Öffentlich — wie eine Datenbank-Adresse |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Key | Intentionally public (wie Stripe `pk_`) — Zugriff wird durch Supabase Row Level Security kontrolliert |

### Was niemals ins Git / Frontend darf
| Secret | Wo setzen |
|---|---|
| `RESEND_API_KEY` | Supabase → Edge Functions → Secrets |
| Supabase `service_role` Key | Nur serverseitig, niemals im Frontend |

### Setup
```bash
# 1. Lokal entwickeln
cp .env.example .env.local
# .env.local mit echten Werten füllen
# .env.local ist in .gitignore — wird NIE committed

# 2. Vercel Deployment
# Dashboard → Project → Settings → Environment Variables
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 3. Supabase Edge Function Secrets
# Supabase Dashboard → Edge Functions → send-notification → Secrets
# RESEND_API_KEY=re_...
# FROM_EMAIL=ShootPlan <noreply@yourdomain.com>
# APP_URL=https://planning.starantor.com
# ALLOWED_ORIGIN=https://planning.starantor.com
```

---

## Input Validation (`V`)

Alle Formular-Inputs werden client-seitig durch `V.check()` validiert:

```js
const err = V.check([
  ["Feld",  V.text(value, maxLen),   "Fehlermeldung"],
  ["Email", V.email(email),          "Ungültige E-Mail"],
]);
if (err) { setError(err); return; }
```

| Validator | Beschreibung |
|---|---|
| `V.email(v)` | RFC-konforme E-Mail-Adresse |
| `V.password(v)` | 8–128 Zeichen |
| `V.name(v)` | 2–80 Zeichen, nicht leer |
| `V.text(v, max)` | Pflichtfeld, max. Länge |
| `V.textOpt(v, max)` | Optional, max. Länge |
| `V.number(v, min, max)` | Numerisch, im Bereich |
| `V.date(v)` | YYYY-MM-DD Format |
| `V.url(v)` | https:// oder http:// URL |

---

## Sanitization (`sanitizeObj`)

Alle Daten werden vor dem Schreiben in die DB bereinigt:

```js
await db.insert("table", sanitizeObj({ name, description }));
// sanitizeObj: entfernt HTML-Tags, trimmt, begrenzt auf 2000 Zeichen
```

Schützt vor XSS bei Daten die später gerendert werden.

---

## Rate Limiting (`RL`)

Client-seitiges Rate Limiting (UI-Schutz + Supabase-Entlastung):

| Limit | Calls | Fenster |
|---|---|---|
| `RL.login()` | 5 | 60s |
| `RL.register()` | 3 | 5min |
| `RL.form(key)` | 10 | 60s |
| `RL.notify(key)` | 20 | 60s |

**Serverseitig** zusätzlich im Edge Function: 30 Requests / 60s pro IP.

> ⚠️ Client-seitiges Rate Limiting ist kein Ersatz für server-seitigen Schutz.
> Supabase bietet eingebautes Rate Limiting — aktiviere es im Dashboard.

---

## Edge Function Hardening

Die `send-notification` Edge Function implementiert:

- ✅ IP-basiertes Rate Limiting (30 req/min)
- ✅ Request Size Limit (8 KB)
- ✅ CORS nur für eigene Domain (`ALLOWED_ORIGIN`)
- ✅ Whitelist für erlaubte Notification Types
- ✅ E-Mail-Adress-Validierung (Empfänger)
- ✅ HTML-Sanitization aller Template-Daten
- ✅ Minimale Fehlermeldungen an Client (kein Stack Trace)

---

## Checkliste für neue Features

Bei jedem neuen Formular / Handler:

```
[ ] Validation mit V.check() vor dem db.insert/update
[ ] sanitizeObj() um alle db.insert/update Daten
[ ] RL.form("feature_name") bei Write-Operationen
[ ] Keine Secrets als Fallback-Strings im Code
[ ] Neue Env Vars in .env.example dokumentieren
[ ] Supabase RLS Policy für neue Tabellen erstellen
```

---

## Supabase Row Level Security (RLS)

Die wichtigste Verteidigungslinie liegt auf DB-Ebene. Alle Tabellen
müssen RLS aktiviert haben. Beispiel-Policies (SQL):

```sql
-- users können nur ihre eigenen Daten lesen/schreiben
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own" ON users
  USING (auth.uid()::text = id::text);

-- shoots: sichtbar für Teilnehmer + Admins
ALTER TABLE shoots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shoots_visible" ON shoots
  USING (
    created_by = auth.uid()::uuid
    OR EXISTS (SELECT 1 FROM participants WHERE shoot_id = shoots.id AND user_id = auth.uid()::uuid)
  );
```

RLS ist **unabhängig** vom Frontend und schützt auch bei direktem API-Zugriff.
