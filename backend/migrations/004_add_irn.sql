-- Migration 004: Add irn_number to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS irn_number VARCHAR(64);
