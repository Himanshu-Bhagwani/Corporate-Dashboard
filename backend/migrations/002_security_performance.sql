-- ============================================================
-- SODA Business Platform — Migration 002
-- Security, Performance & Compliance Schema Upgrades
-- ============================================================

-- ─── 1. AUDIT LOG TABLE ──────────────────────────────────────
-- Every write action is recorded with user identity and IP.
-- Required by doc: "every entry includes: timestamp, user ID, source, IP address"

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  action       VARCHAR(100) NOT NULL,
  table_name   VARCHAR(100),
  record_id    INTEGER,
  ip_address   INET,
  user_agent   TEXT,
  details      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user       ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_company    ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table      ON audit_log(table_name, record_id);

-- ─── 2. SOFT DELETE ON FINANCIAL RECORDS ─────────────────────
-- Doc: "Soft delete only — no hard deletes on any financial record ever"

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by     INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS source         VARCHAR(50) DEFAULT 'manual'
    CHECK (source IN ('manual', 'upload', 'auto', 'bank_sync', 'tally')),
  ADD COLUMN IF NOT EXISTS ip_address     INET,
  ADD COLUMN IF NOT EXISTS created_by     INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS gstin          VARCHAR(15),
  ADD COLUMN IF NOT EXISTS hsn_sac        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tds_section    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tds_rate       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tds_amount     BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_rate       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cgst_amount    BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount    BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount    BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_recurring   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_id   INTEGER,
  ADD COLUMN IF NOT EXISTS duplicate_hash VARCHAR(64);   -- SHA256 for dedup detection

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by  INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS gstin       VARCHAR(15),
  ADD COLUMN IF NOT EXISTS hsn_sac     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gst_rate    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cgst        BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst        BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst        BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS irn         VARCHAR(100),   -- E-invoice IRN
  ADD COLUMN IF NOT EXISTS irn_status  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS supply_type VARCHAR(20) DEFAULT 'B2B';

-- ─── 3. PAISE STORAGE COLUMNS ────────────────────────────────
-- Doc: "All financial amounts must be stored as integers (paise) — non-negotiable"
-- Adding _paise columns alongside existing NUMERIC for backward compat.
-- New code MUST use _paise columns; NUMERIC columns kept for data migration.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount_paise BIGINT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paise BIGINT;

-- Backfill paise columns from existing NUMERIC values (multiply by 100)
UPDATE transactions SET amount_paise = ROUND(amount * 100)::BIGINT WHERE amount_paise IS NULL;
UPDATE invoices     SET amount_paise = ROUND(amount * 100)::BIGINT WHERE amount_paise IS NULL;

-- ─── 4. COMPOSITE PERFORMANCE INDEXES ────────────────────────
-- Critical for dashboard speed targets: <3s load, <5s reports

-- Transactions: most queries filter by company + date + type
CREATE INDEX IF NOT EXISTS idx_tx_company_date      ON transactions(company_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_company_type_date ON transactions(company_id, type, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_company_category  ON transactions(company_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_duplicate_hash    ON transactions(company_id, duplicate_hash) WHERE duplicate_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_account_date      ON transactions(account_id, date DESC) WHERE deleted_at IS NULL;

-- Invoices: AR/AP ageing queries
CREATE INDEX IF NOT EXISTS idx_inv_company_status   ON invoices(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_company_due_date ON invoices(company_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_company_type     ON invoices(company_id, type) WHERE deleted_at IS NULL;

-- Compliance: calendar + alert queries
CREATE INDEX IF NOT EXISTS idx_comp_company_due     ON compliance_events(company_id, due_date ASC);
CREATE INDEX IF NOT EXISTS idx_comp_company_status  ON compliance_events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_comp_due_date        ON compliance_events(due_date) WHERE status = 'PENDING';

-- Chart of accounts: ledger rollup
CREATE INDEX IF NOT EXISTS idx_coa_company_type     ON chart_of_accounts(company_id, account_type);

-- Users & companies: fast auth lookup
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_companies_gstin      ON companies(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_pan        ON companies(pan) WHERE pan IS NOT NULL;

-- ─── 5. GOVERNMENT VERIFICATION TABLE ────────────────────────
-- Stores results from GSTN / IT / MCA21 API calls with cache TTL

CREATE TABLE IF NOT EXISTS govt_verifications (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  verify_type   VARCHAR(20) NOT NULL CHECK (verify_type IN ('GSTIN','PAN','CIN','LLPIN','AADHAAR')),
  input_value   VARCHAR(100) NOT NULL,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('VERIFIED','PARTIAL','MISMATCH','FAILED','PENDING')),
  api_response  JSONB DEFAULT '{}',
  legal_name    VARCHAR(255),
  address       TEXT,
  extra_data    JSONB DEFAULT '{}',     -- directors, filing status, etc.
  verified_by   INTEGER REFERENCES users(id),
  verified_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',  -- re-verify after 24h
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_govtver_company      ON govt_verifications(company_id);
CREATE INDEX IF NOT EXISTS idx_govtver_type_value   ON govt_verifications(verify_type, input_value);
CREATE INDEX IF NOT EXISTS idx_govtver_expires      ON govt_verifications(expires_at);

-- ─── 6. TDS DEDUCTION RECORDS ────────────────────────────────

CREATE TABLE IF NOT EXISTS tds_deductions (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  vendor_pan      VARCHAR(10) NOT NULL,
  vendor_name     VARCHAR(255),
  section         VARCHAR(20) NOT NULL,   -- 194A, 194C, 194H, 194J etc.
  payment_nature  VARCHAR(255),
  gross_amount    BIGINT NOT NULL,        -- paise
  tds_rate        NUMERIC(5,2) NOT NULL,
  tds_amount      BIGINT NOT NULL,        -- paise
  net_amount      BIGINT NOT NULL,        -- paise
  deducted_on     DATE NOT NULL,
  challan_number  VARCHAR(50),
  challan_date    DATE,
  bsr_code        VARCHAR(20),
  deposit_date    DATE,
  form_type       VARCHAR(10) DEFAULT '26Q',
  quarter         VARCHAR(5),             -- Q1/Q2/Q3/Q4
  fy              VARCHAR(10),            -- e.g. 2024-25
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tds_company_fy       ON tds_deductions(company_id, fy);
CREATE INDEX IF NOT EXISTS idx_tds_company_section  ON tds_deductions(company_id, section);
CREATE INDEX IF NOT EXISTS idx_tds_vendor_pan       ON tds_deductions(vendor_pan);

-- ─── 7. AUTOMATION RULES ENGINE ──────────────────────────────

CREATE TABLE IF NOT EXISTS automation_rules (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  priority        INTEGER DEFAULT 10,         -- lower = higher priority
  conditions      JSONB NOT NULL DEFAULT '{}',
  -- e.g. {"vendor": "Swiggy", "amount_gt": 50000, "type": "expense"}
  actions         JSONB NOT NULL DEFAULT '{}',
  -- e.g. {"category": "Food & Beverage", "account_id": 5, "tag": "food"}
  match_count     INTEGER DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_company_active ON automation_rules(company_id, is_active, priority);

-- ─── 8. REFRESH TOKEN STORE (for token revocation) ───────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,   -- SHA256 of the refresh token
  ip_address  INET,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ─── 9. TALLY SYNC LOG ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS tally_sync_log (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  sync_type       VARCHAR(50) NOT NULL,   -- LEDGER, VOUCHER, BALANCE_SHEET, PNL
  records_synced  INTEGER DEFAULT 0,
  errors          INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  error_details   JSONB DEFAULT '{}',
  tally_company   VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_tally_sync_company ON tally_sync_log(company_id, started_at DESC);

-- ─── 10. ROC/MCA COMPLIANCE DEADLINES ────────────────────────

CREATE TABLE IF NOT EXISTS roc_deadlines (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  form_type       VARCHAR(50) NOT NULL,  -- MGT-7, AOC-4, DIR-3 KYC, INC-20A, etc.
  description     VARCHAR(255),
  due_date        DATE NOT NULL,
  grace_date      DATE,
  penalty_per_day BIGINT DEFAULT 0,      -- paise per day of delay
  status          VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','FILED','OVERDUE')),
  filed_date      DATE,
  filed_by        INTEGER REFERENCES users(id),
  srn             VARCHAR(50),           -- Service Request Number from MCA
  documents       JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roc_company_due      ON roc_deadlines(company_id, due_date ASC);
CREATE INDEX IF NOT EXISTS idx_roc_status           ON roc_deadlines(status, due_date ASC);

-- ─── 11. SUPPORT TICKETS (SLA tracking) ──────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id),
  subject         VARCHAR(500) NOT NULL,
  description     TEXT,
  priority        VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  status          VARCHAR(30) DEFAULT 'Open'   CHECK (status IN ('Open','In Progress','Pending','Resolved','Closed')),
  plan_tier       VARCHAR(20) DEFAULT 'Core',  -- Core=48h, Growth=24h, Enterprise=same-day
  sla_hours       INTEGER DEFAULT 48,
  sla_breach_at   TIMESTAMPTZ,
  assigned_to     INTEGER REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_company      ON support_tickets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breach   ON support_tickets(sla_breach_at) WHERE status NOT IN ('Resolved','Closed');

-- ─── DONE ─────────────────────────────────────────────────────
-- Run this migration once on startup via the migration runner (see backend/utils/runMigrations.js)
