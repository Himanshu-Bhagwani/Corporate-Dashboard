-- A credit/debit note is raised against specific lines of the parent invoice.
-- The UI now makes the user pick them from that invoice's own line items, so
-- store the selection: it is what a GST auditor asks for when reconciling a
-- Section 34 note back to the original supply.
ALTER TABLE invoice_adjustments
  ADD COLUMN IF NOT EXISTS line_item_refs JSONB DEFAULT '[]'::jsonb;
