/**
 * Apeilo webhook receiver for SODA (Express / Node)
 * =================================================
 * Copy to:  backend/routes/apeiloWebhook.js
 *
 * Apeilo POSTs here whenever a tracked user crosses the threat threshold. The
 * request is signed with SODA's webhook secret; we verify it before trusting
 * the payload, then react (notify the user, force re-auth, write an audit row).
 *
 * IMPORTANT — raw body:
 *   The signature is an HMAC over the EXACT request bytes, so this route uses
 *   its own express.raw() parser. Mount it BEFORE any global express.json()
 *   in server.js (see README), otherwise the body is already consumed and the
 *   signature check will fail.
 *
 * Env (backend): APEILO_WEBHOOK_SECRET=whsec_...
 */

const express = require("express");
const crypto = require("crypto");
const { pool } = require("../config/db");
const { revokeSessions } = require("../middleware/auth");

const router = express.Router();

function verifySignature(rawBuf, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBuf).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// express.raw gives us req.body as a Buffer — required for a correct HMAC.
router.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const secret = process.env.APEILO_WEBHOOK_SECRET || "";
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = req.get("x-apeilo-signature");

  if (!verifySignature(rawBuf, signature, secret)) {
    return res.status(401).json({ error: "invalid signature" });
  }

  let threat;
  try {
    threat = JSON.parse(rawBuf.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "invalid json" });
  }

  // ── React to the threat ─────────────────────────────
  console.warn(
    `[Apeilo] ${String(threat.risk_level).toUpperCase()} threat for user ${threat.user_id}: ` +
      `${(threat.primary_threats || []).join(", ")} (score ${threat.risk_score})`,
  );

  // ── account.lockdown — block login access for a period ─────────────────
  if (threat.event_type === "account.lockdown") {
    const d = threat.details || {};
    const email = String(threat.user_id || "").toLowerCase();
    const lockMinutes = Math.max(1, Math.min(1440, parseInt(d.lock_minutes, 10) || 15));
    const lockUntil = d.lock_until ? new Date(d.lock_until) : new Date(Date.now() + lockMinutes * 60000);

    try {
      // Two things at once:
      //  1. login_locked_until  — refuse NEW logins until this instant
      //     (checked in routes/auth.js, shown as a countdown to the user).
      //  2. refresh_valid_from  — kill EXISTING sessions: refresh tokens issued
      //     before now stop working, and the 15-min access token expires on its
      //     own, so an already-signed-in attacker is out within one lifetime —
      //     no per-request DB lookup on the hot path.
      // Timestamps are stamped from the app clock (compared against JWT `iat`,
      // which this same process issues) rather than NOW(), to avoid clock drift.
      const r = await pool.query(
        "UPDATE users SET login_locked_until = $2, refresh_valid_from = $3 WHERE email = $1 RETURNING id",
        [email, lockUntil, new Date()],
      );
      if (r.rowCount > 0) {
        // Instant boot: reject every access token this account already holds,
        // starting now — the attacker is signed out on their next request.
        revokeSessions(email, Date.now());
        console.warn(`[Apeilo] Locked login for ${email} until ${lockUntil.toISOString()} (${lockMinutes} min) + revoked active sessions`);
        return res.json({ received: true, locked: true, lock_until: lockUntil.toISOString(), lock_minutes: lockMinutes });
      }
      console.warn(`[Apeilo] lockdown requested for unknown user ${email}`);
      return res.json({ received: true, locked: false, reason: "unknown_user" });
    } catch (err) {
      console.error("[Apeilo] lockdown failed:", err.message);
      return res.status(500).json({ received: true, locked: false, error: "lock_failed" });
    }
  }

  // TODO for SODA — other reactions, e.g.:
  //   await notifyUser(threat.user_id, threat);          // email / in-app banner
  //   await db.query("INSERT INTO security_events ...", [threat.user_id, ...]);
  //   io.emit("security_alert", threat);                  // socket.io live ops view

  res.json({ received: true });
});

module.exports = router;
