-- Track per-invoice payments, credit notes, debit notes and audit events.
-- kind is one of: 'payment', 'credit_note', 'debit_note', 'created', 'edited'
CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  reference VARCHAR(100),
  base_amount NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0,
  tax_percent NUMERIC(6,2) DEFAULT 0,
  reason VARCHAR(255),
  notes TEXT,
  event_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice ON invoice_adjustments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_kind ON invoice_adjustments(kind);
