-- Migration: Add rich invoice fields to support full invoice creation form
-- Run this against your Neon/Postgres database

-- Extend invoices table with new fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_gstin VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_pan VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_reg VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_state VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_logo TEXT; -- base64 data URL

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_gstin VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_contact VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_discount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cess_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance_due NUMERIC(15,2) DEFAULT 0;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_account_holder VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_bank_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_ifsc VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_upi VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Bank Transfer';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ack_number VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS irn_number VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_scheme VARCHAR(20); -- 'IGST' or 'CGST+SGST'

-- Update amount column to use grand_total semantics (keep backward compat)
-- No change needed — amount stays as is for old invoices
