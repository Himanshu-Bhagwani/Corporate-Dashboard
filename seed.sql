-- Demo user credentials
-- Email: demo@corporate.com
-- Password: demo123

-- Insert demo user (password hash for 'demo123')
INSERT INTO users (email, password_hash, full_name, created_at) 
VALUES (
  'demo@corporate.com',
  '$2b$10$rQJ5cKZhZ8vX9qYqYqYqYuK5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5.',
  'Demo User',
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- Insert demo company
INSERT INTO companies (id, name, industry, tax_id, address, created_at)
VALUES (
  1,
  'Acme Corp Pvt Ltd',
  'Technology',
  'TAX123456',
  '123 Business Street, Tech City',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Link demo user to demo company
INSERT INTO user_companies (user_id, company_id, role, created_at)
SELECT u.id, 1, 'owner', NOW()
FROM users u
WHERE u.email = 'demo@corporate.com'
ON CONFLICT (user_id, company_id) DO NOTHING;

-- Insert demo accounts
INSERT INTO accounts (company_id, name, type, bank, account_number, opening_balance, created_at)
VALUES 
  (1, 'Business Checking', 'Checking', 'Chase Bank', '****1234', 50000.00, NOW()),
  (1, 'Savings Account', 'Savings', 'Chase Bank', '****5678', 100000.00, NOW()),
  (1, 'Corporate Credit Card', 'Credit', 'American Express', '****9012', 0.00, NOW())
ON CONFLICT DO NOTHING;

-- Insert demo transactions
INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'Payment from Acme Corp for Q1 services',
  'income',
  'Sales',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Business Checking' LIMIT 1),
  450000.00,
  '2026-02-25',
  'Q1 service payment',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'Payment from Acme Corp for Q1 services');

INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'February salary payments',
  'expense',
  'Salaries',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Business Checking' LIMIT 1),
  325000.00,
  '2026-02-24',
  'Monthly payroll',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'February salary payments');

INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'Consulting fees - TechStart Inc',
  'income',
  'Consulting',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Business Checking' LIMIT 1),
  180000.00,
  '2026-02-23',
  'Consulting project payment',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'Consulting fees - TechStart Inc');

INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'Google Ads campaign - February',
  'expense',
  'Marketing',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Corporate Credit Card' LIMIT 1),
  75000.00,
  '2026-02-22',
  'Digital marketing spend',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'Google Ads campaign - February');

INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'SaaS subscriptions renewal',
  'expense',
  'Software',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Corporate Credit Card' LIMIT 1),
  45000.00,
  '2026-02-21',
  'Annual software licenses',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'SaaS subscriptions renewal');

INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
SELECT 
  1,
  'Project delivery - Global Solutions',
  'income',
  'Sales',
  (SELECT id FROM accounts WHERE company_id = 1 AND name = 'Business Checking' LIMIT 1),
  560000.00,
  '2026-02-20',
  'Major project completion',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE company_id = 1 AND name = 'Project delivery - Global Solutions');

-- Insert demo invoices
INSERT INTO invoices (company_id, invoice_number, vendor_name, client_name, type, amount, status, due_date, issue_date, notes, created_at)
VALUES 
  (1, 'INV-2026-001', NULL, 'Acme Corp', 'receivable', 450000.00, 'paid', '2026-03-15', '2026-02-15', 'Q1 Services Invoice', NOW()),
  (1, 'INV-2026-002', NULL, 'TechStart Inc', 'receivable', 180000.00, 'paid', '2026-03-10', '2026-02-10', 'Consulting Services', NOW()),
  (1, 'INV-2026-003', 'Google Ads', NULL, 'payable', 75000.00, 'paid', '2026-03-01', '2026-02-01', 'Marketing Campaign', NOW()),
  (1, 'INV-2026-004', NULL, 'Global Solutions', 'receivable', 560000.00, 'pending', '2026-03-20', '2026-02-20', 'Project Delivery', NOW())
ON CONFLICT (invoice_number) DO NOTHING;

-- Insert demo vendors
INSERT INTO vendors (company_id, name, email, phone, address, created_at)
VALUES 
  (1, 'Google Ads', 'billing@google.com', '+1-650-253-0000', 'Mountain View, CA', NOW()),
  (1, 'Microsoft Azure', 'billing@microsoft.com', '+1-425-882-8080', 'Redmond, WA', NOW()),
  (1, 'AWS Services', 'billing@aws.com', '+1-206-266-1000', 'Seattle, WA', NOW())
ON CONFLICT DO NOTHING;

-- Display demo credentials
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Demo credentials created successfully!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Email: demo@corporate.com';
  RAISE NOTICE 'Password: demo123';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Company: Acme Corp Pvt Ltd';
  RAISE NOTICE '==============================================';
END $$;
