-- invoice_number was created as a GLOBALLY unique column (001_initial_schema.sql),
-- but every generator numbers invoices *per company* (INV-<year>-0001, 0002, …).
-- Two companies therefore collide on the same number, and a PDF upload that keeps
-- the supplier's own number can squat a number the counter will hand out later —
-- which is what makes "Save Invoice" fail with invoices_invoice_number_key.
--
-- Scope the constraint to the company, which is what the numbering actually means.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_company_invoice_number_key'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_company_invoice_number_key
      UNIQUE (company_id, invoice_number);
  END IF;
END $$;
