-- Corporate Loans module: one company → many loans, each with its own
-- status history (audit timeline) and EMI repayment schedule.

CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  loan_ref VARCHAR(50) UNIQUE NOT NULL,               -- LOAN-2026-001
  loan_type VARCHAR(30) NOT NULL DEFAULT 'TERM_LOAN'
    CHECK (loan_type IN ('TERM_LOAN','WORKING_CAPITAL_CC','OVERDRAFT_OD','WCDL','MSME_LOAN','VEHICLE_LOAN','EQUIPMENT_LOAN','OTHER')),
  lender VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED','UNDER_REVIEW','SANCTIONED','DISBURSED','REPAYMENT_ACTIVE','CLOSED','REJECTED')),

  -- Step 1: company details (snapshot at application time)
  company_name VARCHAR(255),
  cin_number VARCHAR(50),
  date_of_incorporation DATE,
  business_type VARCHAR(50),
  industry VARCHAR(100),
  annual_turnover NUMERIC(18,2),

  -- Step 2: loan requirement
  amount_required NUMERIC(18,2),
  purpose VARCHAR(50),
  tenure_preferred_months INTEGER,
  has_existing_loans BOOLEAN DEFAULT false,
  existing_loans_outstanding NUMERIC(18,2) DEFAULT 0,

  -- Step 3: financial details
  net_profit_y1 NUMERIC(18,2),
  net_profit_y2 NUMERIC(18,2),
  net_profit_y3 NUMERIC(18,2),
  monthly_revenue NUMERIC(18,2),
  gst_filing_status VARCHAR(30),
  itr_filed BOOLEAN DEFAULT false,

  -- Step 4: documents (names/flags only for MVP)
  documents JSONB DEFAULT '[]'::jsonb,

  -- Sanction details (filled when status → SANCTIONED)
  sanctioned_amount NUMERIC(18,2),
  disbursed_amount NUMERIC(18,2),
  interest_rate NUMERIC(6,3),
  tenure_months INTEGER,
  emi_amount NUMERIC(18,2),
  first_emi_date DATE,
  last_emi_date DATE,
  lender_bank VARCHAR(255),
  loan_account_number VARCHAR(100),
  processing_fee NUMERIC(18,2),

  outstanding_principal NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_status_history (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_emis (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE,
  emi_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal NUMERIC(18,2) NOT NULL,
  interest NUMERIC(18,2) NOT NULL,
  emi_amount NUMERIC(18,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PAID','OVERDUE','PARTIALLY_PAID')),
  paid_amount NUMERIC(18,2) DEFAULT 0,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_id, emi_number)
);

CREATE INDEX IF NOT EXISTS idx_loans_company ON loans(company_id);
CREATE INDEX IF NOT EXISTS idx_loan_status_history_loan ON loan_status_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_emis_loan ON loan_emis(loan_id);
