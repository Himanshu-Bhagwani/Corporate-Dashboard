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

  // ── account.lockdown — secure a confirmed-compromised account ──────────
  if (threat.event_type === "account.lockdown") {
    const actions = (threat.details && threat.details.actions) || [];
    const email = String(threat.user_id || "").toLowerCase();
    const applied = [];

    if (actions.includes("logout_all") && email) {
      try {
        // Invalidate every refresh token issued before now. Access tokens are
        // short-lived (15m) and expire on their own, so the account is fully
        // signed out within one access-token lifetime — with no per-request
        // database lookup on the hot path.
        // Cut-off is stamped from the APP clock, not the database clock.
        // It is compared against a JWT `iat`, which this same process issues —
        // using NOW() would mix two clocks, and any drift could leave a
        // legitimate user unable to sign back in at all.
        const r = await pool.query(
          "UPDATE users SET refresh_valid_from = $2 WHERE email = $1 RETURNING id",
          [email, new Date()],
        );
        if (r.rowCount > 0) {
          applied.push("logout_all");
          console.warn(`[Apeilo] Revoked all sessions for ${email}`);
        } else {
          console.warn(`[Apeilo] logout_all requested for unknown user ${email}`);
        }
      } catch (err) {
        console.error("[Apeilo] logout_all failed:", err.message);
      }
    }

    if (actions.includes("force_password_reset")) {
      // Not enforced yet on purpose: SODA has no password-reset channel (no
      // email delivery), and Google-only accounts have no password at all —
      // enforcing it would lock those users out permanently. Surfaced as an
      // operator recommendation until a reset flow exists.
      console.warn(
        `[Apeilo] RECOMMENDED: force a password reset for ${email}. ` +
          `Not applied automatically — no reset channel is configured.`,
      );
    }

    return res.json({ received: true, applied });
  }

  // TODO for SODA — other reactions, e.g.:
  //   await notifyUser(threat.user_id, threat);          // email / in-app banner
  //   await db.query("INSERT INTO security_events ...", [threat.user_id, ...]);
  //   io.emit("security_alert", threat);                  // socket.io live ops view

  res.json({ received: true });
});

module.exports = router;
