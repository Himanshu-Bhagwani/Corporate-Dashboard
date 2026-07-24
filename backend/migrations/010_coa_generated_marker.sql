-- getChartOfAccounts auto-seeds the default chart whenever the table is empty
-- for a company. That makes "Clear All" look broken: delete the last heading and
-- the whole default chart is rebuilt on the next load.
--
-- Record when the chart was first generated so seeding happens exactly once.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS coa_generated_at TIMESTAMPTZ;

-- Existing companies that already have a chart shouldn't be re-seeded.
UPDATE companies c
   SET coa_generated_at = NOW()
 WHERE coa_generated_at IS NULL
   AND EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.company_id = c.id);
