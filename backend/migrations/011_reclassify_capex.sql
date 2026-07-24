-- Equipment and other asset purchases used to be filed under "Office supplies",
-- which put capital expenditure inside operating expenses. That understates
-- margin twice over: once in the expense total, and again in Free Cash Flow,
-- where CapEx is meant to be the only place it is subtracted.
--
-- Relabel the rows already imported so existing companies don't have to
-- re-upload their statements. Matching is on the transaction description, the
-- same signal the importer now uses.
UPDATE transactions
   SET category = 'Equipment'
 WHERE type = 'expense'
   AND COALESCE(category, '') IN ('Office supplies', 'Misc')
   AND (
        name ILIKE '%equipment%'
     OR name ILIKE '%machinery%'
     OR name ILIKE '%vehicle%'
     OR name ILIKE '%furniture%'
     OR name ILIKE '%laptop%'
     OR name ILIKE '%capex%'
   );

-- The Chart of Accounts row generated from the old bucket keeps a stale
-- opening_balance; live balances are recomputed from transactions on read, so
-- only the description needs correcting where it was auto-generated.
UPDATE chart_of_accounts
   SET description = 'Expense - Equipment (capital purchases)'
 WHERE account_type = 'Expense'
   AND name = 'Equipment'
   AND description = 'Expense - Equipment';
