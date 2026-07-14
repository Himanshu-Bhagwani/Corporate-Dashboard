-- Migration 003: TDS Engine, ROC Tracker, E-Invoice scaffold
-- Applied automatically by runMigrations.js

-- ─── TDS Sections master ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tds_sections (
  id            SERIAL PRIMARY KEY,
  section       VARCHAR(20) NOT NULL UNIQUE,   -- e.g. '194C', '194A'
  description   TEXT NOT NULL,
  threshold_pa  NUMERIC NOT NULL DEFAULT 0,    -- annual threshold in rupees
  rate_pct      NUMERIC NOT NULL DEFAULT 0,    -- default rate (no PAN case)
  rate_pct_pan  NUMERIC NOT NULL DEFAULT 0,    -- rate when PAN furnished
  rate_pct_no_pan NUMERIC NOT NULL DEFAULT 20, -- rate when no PAN (Sec 206AA)
  applicable_to TEXT NOT NULL DEFAULT 'all',   -- 'individual','company','all'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard TDS sections (idempotent)
INSERT INTO tds_sections (section, description, threshold_pa, rate_pct_pan, rate_pct_no_pan) VALUES
  ('192',  'Salary',                                      250000, 0,    30),  -- slab-based
  ('192A', 'PF premature withdrawal',                     50000,  10,   30),
  ('193',  'Interest on securities',                      10000,  10,   20),
  ('194',  'Dividend',                                    5000,   10,   20),
  ('194A', 'Interest other than on securities (bank)',    40000,  10,   20),
  ('194B', 'Winnings from lottery/puzzle',                10000,  30,   30),
  ('194C', 'Contractor/sub-contractor (single)',          30000,  1,    20),
  ('194C_HUF', 'Contractor (HUF/Individual)',             30000,  1,    20),
  ('194D', 'Insurance commission',                        15000,  5,    20),
  ('194DA','Life insurance maturity',                     100000, 5,    20),
  ('194G', 'Commission on lottery tickets',               15000,  5,    20),
  ('194H', 'Commission or brokerage',                     15000,  5,    20),
  ('194I_land','Rent - land/building/furniture',          240000, 10,   20),
  ('194I_plant','Rent - plant/machinery',                 240000, 2,    20),
  ('194IA','TDS on immovable property purchase',          5000000,1,    1),
  ('194IB','Rent by individuals/HUF',                    50000,  5,    20),
  ('194J', 'Professional/technical services',             30000,  10,   20),
  ('194J_royalty','Royalty',                              30000,  10,   20),
  ('194K', 'Income from mutual fund units',               5000,   10,   20),
  ('194LA','Compensation on immovable property',          250000, 10,   20),
  ('194M', 'Payment by Individual/HUF to contractor/professional', 5000000, 5, 20),
  ('194N', 'Cash withdrawal from bank',                   10000000,2,   2),
  ('194O', 'Payment to e-commerce participant',           500000, 1,    5),
  ('194Q', 'Purchase of goods',                           5000000,0.1,  5),
  ('206C', 'TCS on sale of goods/scrap',                  0,      1,    1)
ON CONFLICT (section) DO NOTHING;

-- Ensure tables created by previous migrations have all necessary columns before we try to use or index them
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS invoice_id INTEGER;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS deductee_name VARCHAR(255) DEFAULT '';
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS deductee_pan VARCHAR(10);
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS payment_amount NUMERIC;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS tds_amount_paise BIGINT DEFAULT 0;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS surcharge NUMERIC DEFAULT 0;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS health_edu_cess NUMERIC DEFAULT 0;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS net_tds_payable NUMERIC DEFAULT 0;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS challan_no VARCHAR(100);
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tds_deductions ADD COLUMN IF NOT EXISTS created_by INTEGER;

ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS form_name VARCHAR(50);
ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS fy VARCHAR(9);
ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS filing_period VARCHAR(100);
ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS filing_number VARCHAR(100);
ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE roc_deadlines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─── TDS deductions ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tds_deductions (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  section         VARCHAR(20) NOT NULL,
  deductee_name   VARCHAR(255) NOT NULL,
  deductee_pan    VARCHAR(10),
  payment_date    DATE NOT NULL,
  payment_amount  NUMERIC NOT NULL,
  tds_rate        NUMERIC NOT NULL,
  tds_amount      NUMERIC NOT NULL,
  tds_amount_paise BIGINT NOT NULL,
  surcharge       NUMERIC DEFAULT 0,
  health_edu_cess NUMERIC DEFAULT 0,
  net_tds_payable NUMERIC NOT NULL,
  challan_no      VARCHAR(100),
  challan_date    DATE,
  deposit_date    DATE,
  status          VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','deposited','overdue')),
  quarter         VARCHAR(5),   -- 'Q1','Q2','Q3','Q4'
  fy              VARCHAR(9),   -- '2024-25'
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tds_company_quarter ON tds_deductions(company_id, quarter, fy);
CREATE INDEX IF NOT EXISTS idx_tds_company_section  ON tds_deductions(company_id, section);
CREATE INDEX IF NOT EXISTS idx_tds_status           ON tds_deductions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tds_deductee_pan     ON tds_deductions(deductee_pan) WHERE deductee_pan IS NOT NULL;

-- ─── ROC / Company Law filings tracker ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS roc_deadlines (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  form_name       VARCHAR(50) NOT NULL,    -- 'MGT-7','AOC-4','ADT-1','DIR-3 KYC' etc.
  description     TEXT NOT NULL,
  due_date        DATE NOT NULL,
  fy              VARCHAR(9),              -- '2024-25'
  filing_period   VARCHAR(100),            -- 'AGM within 6 months of FY end'
  status          VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','filed','overdue','na')),
  filed_date      DATE,
  filing_number   VARCHAR(100),            -- SRN from MCA
  penalty_per_day NUMERIC DEFAULT 0,       -- Late filing fee per day in INR
  reminder_days   INTEGER[] DEFAULT '{30,15,7,1}',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roc_company_due ON roc_deadlines(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_roc_status       ON roc_deadlines(company_id, status);

-- Seed standard ROC forms for existing companies (will be populated per company by API)
-- Standard MCA21 forms reference table (system-wide)
CREATE TABLE IF NOT EXISTS roc_form_templates (
  id           SERIAL PRIMARY KEY,
  form_name    VARCHAR(50) NOT NULL UNIQUE,
  description  TEXT NOT NULL,
  due_rule     TEXT NOT NULL,   -- human-readable rule
  due_offset_days INTEGER,      -- days after FY end (NULL = fixed date or event-based)
  applicable_to TEXT DEFAULT 'all', -- 'private','public','opc','all'
  penalty_per_day NUMERIC DEFAULT 200
);

INSERT INTO roc_form_templates (form_name, description, due_rule, due_offset_days, applicable_to, penalty_per_day) VALUES
  ('MGT-7',   'Annual Return',                         '60 days from AGM (Sep AGM → Nov 29)',          60,  'private,public', 200),
  ('MGT-7A',  'Annual Return (OPC/Small Company)',     '60 days from AGM',                             60,  'opc,small',      200),
  ('AOC-4',   'Financial Statements filing',           '30 days from AGM (Sep AGM → Oct 29)',          30,  'private,public', 100),
  ('AOC-4 CFS','Consolidated Financial Statements',   '30 days from AGM',                             30,  'public',         100),
  ('ADT-1',   'Auditor appointment',                   '15 days from AGM',                             15,  'all',            300),
  ('DIR-3 KYC','Director KYC (web based)',             'Sep 30 every year',                            NULL,'all',            5000),
  ('DPT-3',   'Return of Deposits',                   'Jun 30 every year',                            NULL,'all',            500),
  ('MSME-1',  'Outstanding payments to MSME suppliers','Apr 30 (Oct-Mar period) / Oct 31 (Apr-Sep)',   NULL,'all',            0),
  ('BEN-2',   'Register of Significant Beneficial Owners','30 days of receiving BEN-1',               30,  'all',            200),
  ('INC-20A', 'Declaration for commencement of business','180 days from incorporation',               180, 'all',            50000),
  ('CHG-1',   'Creation/modification of charge',      '30 days from date of creation',                30,  'all',            500),
  ('PAS-3',   'Return of allotment',                  '30 days from date of allotment',               30,  'all',            200),
  ('SH-7',    'Notice of alteration in share capital','30 days from passing resolution',              30,  'all',            200)
ON CONFLICT (form_name) DO NOTHING;

-- ─── E-Invoice scaffold ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS einvoice_irn (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  irn             VARCHAR(255) UNIQUE,        -- Invoice Reference Number
  ack_no          VARCHAR(100),               -- Acknowledgement number
  ack_date        TIMESTAMPTZ,
  signed_invoice  TEXT,                       -- Signed JSON from IRP
  qr_code         TEXT,                       -- Base64 QR code
  status          VARCHAR(50) DEFAULT 'generated' CHECK (status IN ('generated','cancelled','pending','failed')),
  cancel_reason   VARCHAR(100),
  cancel_date     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irn_company    ON einvoice_irn(company_id);
CREATE INDEX IF NOT EXISTS idx_irn_invoice    ON einvoice_irn(invoice_id);

-- ─── GST Filing tracker ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_filings (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  return_type     VARCHAR(20) NOT NULL,   -- 'GSTR-1','GSTR-3B','GSTR-9','GSTR-9C'
  period          VARCHAR(10) NOT NULL,   -- '2024-04' (YYYY-MM) or '2024-25' for annual
  due_date        DATE NOT NULL,
  filed_date      DATE,
  arn             VARCHAR(100),           -- Acknowledgement Reference Number
  tax_payable     NUMERIC DEFAULT 0,
  tax_paid        NUMERIC DEFAULT 0,
  late_fee        NUMERIC DEFAULT 0,
  interest        NUMERIC DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','filed','late_filed','nil_filed')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gst_filings_company ON gst_filings(company_id, return_type, period);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gst_unique ON gst_filings(company_id, return_type, period);

