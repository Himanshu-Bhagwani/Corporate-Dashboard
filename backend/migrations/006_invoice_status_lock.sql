-- When a user manually picks a status from the dropdown, lock it so the
-- automatic pending→overdue sweep in getInvoices no longer overrides their choice.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status_locked BOOLEAN DEFAULT false;
