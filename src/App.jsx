"use client";
import { useEffect, useState } from "react";

// ═══ LANDING PAGE + PROTOTYPE LINKS ═══════════════════════════════════════════
// Flow: Landing "/"             → creates the ID → SurveyMonkey (?session=ID)
//       Survey link (new tab)   → "/p/<flow>" (e.g. /p/high_manual) → prototype (?session=ID)
//       Prototype end           → participant closes the tab and answers the rest in the survey tab
// The survey link cannot carry the ID, so "/p/…" reads it from this browser (saved by "/"),
// or from ?session=… if one is given. "/go" (optional) assigns a random prototype instead.
const SUPABASE_URL      = "https://iljzwxwopxuzpgkjivmn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KEoCJtCLyGTJjqB1phGy2Q_v3PftUYH";
const SURVEY_START_URL  = "https://www.surveymonkey.ca/r/5C7MWMD";   // SurveyMonkey part 1 (Web Link with custom variable "session")
const FLOW              = "landing";

// The 9 prototypes (order must never change once the study has started — it decides the assignment)
const CONDITIONS = [
  { flow: "low_manual",       url: "https://shdm-low-manual2.vercel.app" },
  { flow: "low_assisted",     url: "https://shdm-low-assisted.vercel.app" },
  { flow: "low_automated",    url: "https://shdm-low-automated.vercel.app" },
  { flow: "medium_manual",    url: "https://shdm-medium-manual.vercel.app" },
  { flow: "medium_assisted",  url: "https://shdm-medium-assisted.vercel.app" },
  { flow: "medium_automated", url: "https://shdm-medium-automated.vercel.app" },
  { flow: "high_manual",      url: "https://shdm-high-manual.vercel.app" },
  { flow: "high_assisted",    url: "https://shdm-high-assisted.vercel.app" },
  { flow: "high_automated",   url: "https://shdm-high-automated.vercel.app" },
];

const ID_KEY = "shdm_landing_participant_id";   // sessionStorage (this tab) + localStorage (this browser)

// Letters + digits only (SurveyMonkey does not allow - # ? & ; in custom variable values), no look-alikes (0/O, 1/l/I)
function makeId(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => chars[b % chars.length]).join("");
  } catch {
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
}

// Same tab keeps its ID (e.g. reload); a new start in another tab gets a new one.
// The latest ID is also kept for this browser so the prototype tab opened from the survey can find it.
function getParticipantId() {
  let id = "";
  try { id = sessionStorage.getItem(ID_KEY) || ""; } catch {}
  if (!id) { id = makeId(); try { sessionStorage.setItem(ID_KEY, id); } catch {} }
  try { localStorage.setItem(ID_KEY, id); } catch {}
  return id;
}

// ID for the prototype: ?session=… → this tab → this browser (latest start) → "unknown"
function findParticipantId() {
  const clean = v => (v || "").trim().replace(/^\[|\]$/g, "");
  let id = "";
  try { const p = new URLSearchParams(window.location.search); id = clean(p.get("session") || p.get("pid")); } catch {}
  if (id) return { id, source: "url" };
  try { id = clean(sessionStorage.getItem(ID_KEY)); } catch {}
  if (id) return { id, source: "tab" };
  try { id = clean(localStorage.getItem(ID_KEY)); } catch {}
  if (id) return { id, source: "browser" };
  return { id: "unknown", source: "missing" };
}

// Random assignment that is FIXED per ID: the ID itself is random, so its hash is uniformly
// distributed over the 9 conditions; the same ID always gets the same prototype (reload-safe).
function assignCondition(id) {
  let h = 0x811c9dc5;                                   // FNV-1a 32-bit
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return CONDITIONS[(h >>> 0) % CONDITIONS.length];
}

function logEvent(participantId, event, fields = {}) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/study_events`, {
      method: "POST",
      keepalive: true, // still delivered when the page redirects
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        participant_id: participantId, session_id: participantId, flow: FLOW,
        event, page: fields.page ?? "landing", target: fields.target ?? null,
        details: { ...(fields.details || {}), user_agent: navigator.userAgent },
        client_timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}
}

// "/"   → start: new ID → SurveyMonkey part 1
function startRoute() {
  const id = getParticipantId();
  const target = `${SURVEY_START_URL}?session=${encodeURIComponent(id)}`;
  logEvent(id, "landing_redirect", { details: { url: target } });
  return target;
}

// "/p/<flow>" → link in the survey (opens a new tab) → that prototype with the ID
function prototypeRoute(flow) {
  const cond = CONDITIONS.find(c => c.flow === flow);
  if (!cond) return null;
  const { id, source } = findParticipantId();
  const target = `${cond.url}/?session=${encodeURIComponent(id)}`;
  logEvent(id, "prototype_opened", { page: "p", target: cond.flow, details: { url: target, participant_source: source } });
  return target;
}

// "/go" (optional) → random but fixed prototype per ID
function goRoute() {
  const { id, source } = findParticipantId();
  const cond = id === "unknown" ? CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)] : assignCondition(id);
  const target = `${cond.url}/?session=${encodeURIComponent(id)}`;
  logEvent(id, "condition_assigned", { page: "go", target: cond.flow, details: { url: target, participant_source: source } });
  return target;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") : "";
  const pMatch = path.match(/^\/p\/([a-z_]+)$/);
  const mode = pMatch ? "p" : path === "/go" ? "go" : "start";

  useEffect(() => {
    const target = mode === "p" ? prototypeRoute(pMatch[1]) : mode === "go" ? goRoute() : startRoute();
    if (!target) { setBad(true); return; }
    setUrl(target);
    // replace(): this page is not kept in the browser history → "back" cannot create a second ID
    const t = setTimeout(() => window.location.replace(target), 400);
    return () => clearTimeout(t);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif", color: "#6b7280", background: "#ffffff" }}>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <p style={{ margin: 0 }}>{bad ? "Unknown prototype link." : mode === "start" ? "Loading survey…" : "Loading the smart home system…"}</p>
        {url && (
          <p style={{ marginTop: 12, fontSize: 12 }}>
            Not redirected? <a href={url} style={{ color: "#2563eb" }}>Continue</a>
          </p>
        )}
      </div>
    </div>
  );
}
