"use client";
import { useEffect, useState } from "react";

// ═══ LANDING PAGE ═══ creates the participant ID and forwards to SurveyMonkey ═══
// Flow: Landing (ID) → SurveyMonkey part 1 (?session=ID) → prototype (?session=ID) → SurveyMonkey part 2 (?session=ID)
const SUPABASE_URL      = "https://iljzwxwopxuzpgkjivmn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KEoCJtCLyGTJjqB1phGy2Q_v3PftUYH";
const SURVEY_START_URL  = "https://www.surveymonkey.ca/r/5C7MWMD";   // SurveyMonkey part 1 (Web Link with custom variable "session")
const FLOW              = "landing";

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

// Same tab keeps its ID (e.g. reload); a new tab/participant gets a new one
function getParticipantId() {
  const KEY = "shdm_landing_participant_id";
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) { id = makeId(); sessionStorage.setItem(KEY, id); }
    return id;
  } catch { return makeId(); }
}

function logLanding(participantId, url) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/study_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        participant_id: participantId, session_id: participantId, flow: FLOW,
        event: "landing_redirect", page: "landing",
        details: { url, user_agent: navigator.userAgent },
        client_timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}
}

export default function App() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const id = getParticipantId();
    const target = `${SURVEY_START_URL}?session=${encodeURIComponent(id)}`;
    setUrl(target);
    logLanding(id, target);
    // replace(): the landing page is not kept in the browser history → "back" cannot create a second ID
    const t = setTimeout(() => window.location.replace(target), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif", color: "#6b7280", background: "#ffffff" }}>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <p style={{ margin: 0 }}>Loading survey…</p>
        {url && (
          <p style={{ marginTop: 12, fontSize: 12 }}>
            Not redirected? <a href={url} style={{ color: "#2563eb" }}>Continue to the survey</a>
          </p>
        )}
      </div>
    </div>
  );
}
