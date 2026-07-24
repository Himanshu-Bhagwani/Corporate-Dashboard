/**
 * ApeiloProvider + useApeilo — for SODA (Vite + React)
 * ====================================================
 * Copy to:  frontend/src/context/ApeiloContext.jsx
 *
 * Responsibilities:
 *   1. Ask the user for CONSENT to monitor (location + transactions) the first
 *      time they sign up / sign in. Location is requested from the consent
 *      button click, which is the user gesture browsers require.
 *   2. Register the user's profile and score every sign-in.
 *   3. Show a passive alert toast when risk is high.
 *
 * NOTE: "was this you?" verification is intentionally NOT done here. Those
 * challenges are queued on Apeilo and answered in the Apeilo dashboard, so the
 * end user is never interrupted mid-task inside this app.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createApeilo, hasConsent, setConsent, CONSENT_KEY } from "../services/apeiloClient";

const ApeiloContext = createContext(null);

const LEVEL_STYLES = {
  critical: { bg: "#b91c1c", label: "Critical security risk" },
  high:     { bg: "#c2410c", label: "High security risk" },
  medium:   { bg: "#a16207", label: "Unusual activity" },
  low:      { bg: "#15803d", label: "Low risk" },
  minimal:  { bg: "#15803d", label: "All clear" },
  unknown:  { bg: "#374151", label: "Activity checked" },
};

function isRealUser(id) {
  return !!id && id !== "guest" && id !== "anonymous";
}

export function ApeiloProvider({
  apiKey,
  userId,
  name = "",
  email = "",
  apiUrl,
  debug = false,
  showToast = true,
  onRisk,
  children,
}) {
  const [toast, setToast]       = useState(null);
  const [consentAsk, setConsentAsk] = useState(false);
  const timer          = useRef(null);
  const identifiedFor  = useRef(null);
  const pendingIdent   = useRef(null);

  const client = useMemo(
    () =>
      createApeilo({
        apiUrl,
        apiKey,
        userId,
        debug,
        onRisk: (r) => {
          if (typeof onRisk === "function") onRisk(r);
          if (showToast && (r.level === "high" || r.level === "critical")) {
            setToast(r);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setToast(null), 8000);
          }
          // NOTE: "was this you?" verification deliberately does NOT happen
          // here. Challenges are queued on Apeilo and answered in the Apeilo
          // dashboard, where the account is monitored. This app only surfaces
          // a passive alert toast so the user isn't interrupted mid-task.
        },
      }),
    [apiKey, apiUrl, debug, showToast], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Run identification (register + GPS + score) once consent is settled.
  const runIdentify = useCallback((uid) => {
    client.identify({ userId: uid, name, email });
  }, [client, name, email]);

  useEffect(() => {
    client.setUser(userId);

    if (!isRealUser(userId)) {
      identifiedFor.current = null;   // reset so the next sign-in re-tracks
      return;
    }
    if (identifiedFor.current === userId) return;
    identifiedFor.current = userId;

    if (hasConsent() === null) {
      // First time: ask before collecting anything.
      pendingIdent.current = userId;
      setConsentAsk(true);
    } else {
      runIdentify(userId);
    }
  }, [client, userId, name, email, runIdentify]);

  async function acceptConsent() {
    setConsent(true);
    setConsentAsk(false);
    // Requested inside this click handler so the browser actually prompts.
    await client.requestLocation().catch(() => {});
    if (pendingIdent.current) runIdentify(pendingIdent.current);
    pendingIdent.current = null;
  }

  function declineConsent() {
    setConsent(false);
    setConsentAsk(false);
    // Still score the sign-in itself — just without location.
    if (pendingIdent.current) runIdentify(pendingIdent.current);
    pendingIdent.current = null;
  }


  return (
    <ApeiloContext.Provider value={client}>
      {children}
      {consentAsk && <ConsentModal onAccept={acceptConsent} onDecline={declineConsent} />}
      {toast && <ThreatToast result={toast} onClose={() => setToast(null)} />}
    </ApeiloContext.Provider>
  );
}

export function useApeilo() {
  const ctx = useContext(ApeiloContext);
  if (!ctx) throw new Error("useApeilo must be used inside <ApeiloProvider>");
  return ctx;
}

/* ── Modals ─────────────────────────────────────────────── */

const overlay = {
  position: "fixed", inset: 0, zIndex: 10000,
  background: "rgba(3,7,18,0.72)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  fontFamily: "system-ui, sans-serif",
};
const card = {
  width: "100%", maxWidth: 460, background: "#0f172a", color: "#e2e8f0",
  border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: "24px 26px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
};
const btnPrimary = {
  flex: 1, padding: "11px 16px", borderRadius: 9, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 700, color: "#fff", background: "#2563eb",
};
const btnGhost = {
  flex: 1, padding: "11px 16px", borderRadius: 9, cursor: "pointer",
  fontSize: 13, fontWeight: 700, color: "#94a3b8",
  background: "transparent", border: "1px solid rgba(255,255,255,0.14)",
};

function ConsentModal({ onAccept, onDecline }) {
  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={card}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
          Protect this account?
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.65, color: "#cbd5e1", marginBottom: 14 }}>
          We can watch this account for suspicious activity — unusual sign-in times,
          sign-ins from unexpected places, and transactions that don't match your
          normal pattern. To do that we'd record:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#cbd5e1", margin: "0 0 16px 18px", padding: 0 }}>
          <li><b>Approximate location</b> when you sign in</li>
          <li><b>Sign-in times</b> and failed attempts</li>
          <li><b>Transactions and invoices</b> you create (amount and time)</li>
        </ul>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "#94a3b8", marginBottom: 18 }}>
          We never store your password. You can decline and still use the app —
          you'll just get less protection.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnPrimary} onClick={onAccept}>Allow monitoring</button>
          <button style={btnGhost} onClick={onDecline}>Not now</button>
        </div>
      </div>
    </div>
  );
}



function ThreatToast({ result, onClose }) {
  const style = LEVEL_STYLES[result.level] || LEVEL_STYLES.unknown;
  return (
    <div
      role="alert"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999, maxWidth: 360,
        color: "#fff", background: style.bg, borderRadius: 12, padding: "14px 16px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)", fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <strong style={{ fontSize: 14 }}>⚠ {style.label}</strong>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
        Risk score {(result.score * 100).toFixed(0)}% on {result.event}.
        {result.recommendedActions?.length ? ` Recommended: ${result.recommendedActions[0]}.` : ""}
      </div>
    </div>
  );
}
