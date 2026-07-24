-- A TDS filing needs far more than "advance tax paid": the return is filed per
-- quarter against a TAN, on a specific form, and the tax deducted is a real
-- liability until it is deposited with a challan.
--
-- Form numbering follows the Income-tax Act 2025, effective 1 Apr 2026:
--   138 (salary, was 24Q) · 140 (non-salary residents, was 26Q)
--   144 (non-residents, was 27Q) · 143 (TCS, was 27EQ)
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_form        VARCHAR(10);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_quarter     VARCHAR(5);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_fy          VARCHAR(9);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tan             VARCHAR(15);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_section     VARCHAR(20);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS deductee_count  INTEGER DEFAULT 0;
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC DEFAULT 0;
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_deducted    NUMERIC DEFAULT 0;
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS tds_deposited   NUMERIC DEFAULT 0;
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS challan_no      VARCHAR(50);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS challan_date    DATE;
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS bsr_code        VARCHAR(20);
ALTER TABLE compliance_events ADD COLUMN IF NOT EXISTS late_fee        NUMERIC DEFAULT 0;
