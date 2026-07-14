/**
 * SODA Business Platform — Automation Rules Engine
 * =================================================
 * Applies user-defined rules to incoming transactions:
 *   - If vendor = X and amount > Y → categorise as Z
 *   - Auto-categorise repeat transactions by past patterns
 *   - Detect duplicates before saving
 *
 * Rules are stored in the `automation_rules` table (created in migration 002).
 * Each rule has:
 *   conditions: { vendor, name_contains, amount_gt, amount_lt, type, category }
 *   actions:    { category, account_id, tag, notes_append }
 */

const crypto = require('crypto');
const { pool } = require('../config/db');

// ─── Duplicate Hash ───────────────────────────────────────────────────────────
/**
 * Build a SHA-256 fingerprint for a transaction.
 * Matches are flagged before insert.
 * Fingerprint = date + amount_paise + normalised_name + type
 */
const buildDuplicateHash = ({ date, amount, name, type }) => {
  const normalisedName = (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const amountPaise    = Math.round((parseFloat(amount) || 0) * 100);
  const payload        = `${date}|${amountPaise}|${normalisedName}|${type}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
};

/**
 * Check if a duplicate of this transaction exists for the company.
 * Returns the existing transaction ID if found, null otherwise.
 */
const checkDuplicate = async (companyId, hash) => {
  const res = await pool.query(
    `SELECT id, name, date, amount FROM transactions
     WHERE company_id = $1 AND duplicate_hash = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [companyId, hash]
  );
  return res.rows[0] || null;
};

// ─── Condition Evaluator ──────────────────────────────────────────────────────
/**
 * Returns true if the transaction matches the rule's conditions.
 * conditions object fields (all optional, ANDed together):
 *   vendor         : string (exact or partial match on `name`)
 *   name_contains  : string (case-insensitive substring)
 *   amount_gt      : number (amount in rupees, greater than)
 *   amount_lt      : number (amount in rupees, less than)
 *   type           : 'income' | 'expense'
 *   category       : existing category to match
 *   account_id     : match on account_id
 */
const evaluateConditions = (transaction, conditions) => {
  const { vendor, name_contains, amount_gt, amount_lt, type, category, account_id } = conditions;
  const name   = (transaction.name || '').toLowerCase();
  const amount = parseFloat(transaction.amount) || 0;

  if (vendor       && !name.includes(vendor.toLowerCase()))               return false;
  if (name_contains && !name.includes(name_contains.toLowerCase()))        return false;
  if (amount_gt    && amount <= parseFloat(amount_gt))                     return false;
  if (amount_lt    && amount >= parseFloat(amount_lt))                     return false;
  if (type         && transaction.type !== type)                           return false;
  if (category     && transaction.category !== category)                  return false;
  if (account_id   && String(transaction.account_id) !== String(account_id)) return false;

  return true;
};

// ─── Apply Actions ────────────────────────────────────────────────────────────
/**
 * Merge rule actions into the transaction object.
 * actions object fields:
 *   category     : override category
 *   account_id   : override account
 *   notes_append : append text to notes
 *   tag          : stored in notes as #tag
 */
const applyActions = (transaction, actions) => {
  const updated = { ...transaction };

  if (actions.category)   updated.category   = actions.category;
  if (actions.account_id) updated.account_id = actions.account_id;

  const appendParts = [];
  if (actions.notes_append) appendParts.push(actions.notes_append);
  if (actions.tag)          appendParts.push(`#${actions.tag}`);
  if (appendParts.length > 0) {
    updated.notes = [updated.notes, ...appendParts].filter(Boolean).join(' ');
  }

  return updated;
};

// ─── Main: Apply Rules to Transaction ────────────────────────────────────────
/**
 * Run all active rules for a company against a single transaction.
 * Returns the (possibly modified) transaction and metadata.
 *
 * @param {number}  companyId
 * @param {object}  transaction  — raw transaction data
 * @param {boolean} dryRun       — if true, don't update match_count or DB
 * @returns {{ transaction, appliedRules, isDuplicate, duplicateOf, hash }}
 */
const applyRules = async (companyId, transaction, dryRun = false) => {
  // Step 1: Compute duplicate hash
  const hash = buildDuplicateHash(transaction);
  const duplicateOf = await checkDuplicate(companyId, hash);

  // Step 2: Load active rules sorted by priority
  const rulesResult = await pool.query(
    `SELECT * FROM automation_rules
     WHERE company_id = $1 AND is_active = TRUE
     ORDER BY priority ASC`,
    [companyId]
  );
  const rules = rulesResult.rows;

  let modified = { ...transaction, duplicate_hash: hash };
  const appliedRules = [];

  // Step 3: Apply each matching rule (first-match-wins per category field)
  for (const rule of rules) {
    try {
      const conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
      const actions    = typeof rule.actions === 'string'    ? JSON.parse(rule.actions)    : rule.actions;

      if (evaluateConditions(modified, conditions)) {
        modified = applyActions(modified, actions);
        appliedRules.push({ ruleId: rule.id, ruleName: rule.name, actions });

        // Update match stats (async, non-blocking)
        if (!dryRun) {
          pool.query(
            `UPDATE automation_rules
             SET match_count = match_count + 1, last_matched_at = NOW()
             WHERE id = $1`,
            [rule.id]
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[RULES] Rule #${rule.id} error:`, err.message);
    }
  }

  return { transaction: modified, appliedRules, isDuplicate: !!duplicateOf, duplicateOf, hash };
};

// ─── Pattern-based Auto-Categorisation ───────────────────────────────────────
/**
 * Look at past transactions with similar names and suggest a category.
 * Used as a fallback when no rule matches.
 */
const suggestCategory = async (companyId, name) => {
  const normName = (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const words    = normName.split(' ').filter((w) => w.length > 3);

  if (words.length === 0) return null;

  // Build ILIKE patterns for the first 3 meaningful words
  const patterns = words.slice(0, 3).map((w) => `%${w}%`);
  const conditions = patterns.map((_, i) => `t.name ILIKE $${i + 2}`).join(' OR ');

  const res = await pool.query(
    `SELECT category, COUNT(*) as cnt
     FROM transactions t
     WHERE t.company_id = $1
       AND t.category IS NOT NULL
       AND t.deleted_at IS NULL
       AND (${conditions})
     GROUP BY category
     ORDER BY cnt DESC
     LIMIT 1`,
    [companyId, ...patterns]
  );

  return res.rows[0]?.category || null;
};

// ─── CRUD helpers for rules management ───────────────────────────────────────
const getRules = async (companyId) => {
  const res = await pool.query(
    `SELECT * FROM automation_rules WHERE company_id = $1 ORDER BY priority ASC, created_at ASC`,
    [companyId]
  );
  return res.rows;
};

const createRule = async (companyId, userId, { name, conditions, actions, priority = 10 }) => {
  const res = await pool.query(
    `INSERT INTO automation_rules (company_id, name, conditions, actions, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [companyId, name, JSON.stringify(conditions), JSON.stringify(actions), priority, userId]
  );
  return res.rows[0];
};

const updateRule = async (companyId, ruleId, updates) => {
  const { name, conditions, actions, priority, is_active } = updates;
  const res = await pool.query(
    `UPDATE automation_rules
     SET name       = COALESCE($3, name),
         conditions = COALESCE($4, conditions),
         actions    = COALESCE($5, actions),
         priority   = COALESCE($6, priority),
         is_active  = COALESCE($7, is_active),
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [ruleId, companyId, name,
     conditions ? JSON.stringify(conditions) : null,
     actions    ? JSON.stringify(actions)    : null,
     priority, is_active]
  );
  return res.rows[0];
};

const deleteRule = async (companyId, ruleId) => {
  await pool.query(
    `DELETE FROM automation_rules WHERE id = $1 AND company_id = $2`,
    [ruleId, companyId]
  );
};

module.exports = {
  applyRules,
  checkDuplicate,
  buildDuplicateHash,
  suggestCategory,
  getRules,
  createRule,
  updateRule,
  deleteRule,
};
