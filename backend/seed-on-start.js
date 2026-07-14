const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

async function seedDemoData() {
  try {
    console.log('🌱 Checking for demo user...');
    
    // Check if demo user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      ['demo@corporate.com']
    );
    
    let userId;
    
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      console.log('✓ Demo user already exists');
      
      // Force update password hash to 'demo123' to fix invalid/placeholder hashes from raw SQL files
      const passwordHash = await bcrypt.hash('demo123', 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
      
      // Check if seed data also exists
      const existingCompany = await pool.query(
        `SELECT c.id FROM companies c 
         JOIN user_companies uc ON c.id = uc.company_id 
         WHERE uc.user_id = $1 LIMIT 1`,
        [userId]
      );
      
      if (existingCompany.rows.length > 0) {
        const txnCount = await pool.query(
          'SELECT count(*) FROM transactions WHERE company_id = $1',
          [existingCompany.rows[0].id]
        );
        if (parseInt(txnCount.rows[0].count) > 0) {
          console.log('✓ Seed data already exists, skipping');
          return;
        }
        // Company exists but no data — we'll seed into it
        console.log('⚠ Company exists but data is missing, re-seeding data...');
        await seedCompanyData(existingCompany.rows[0].id);
        return;
      }
      
      // User exists but no company — create company and data
      console.log('⚠ No company found, creating company and data...');
    } else {
      // Create demo user
      console.log('Creating demo user...');
      const passwordHash = await bcrypt.hash('demo123', 10);
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, created_at) 
         VALUES ($1, $2, $3, NOW()) 
         RETURNING id, email, full_name`,
        ['demo@corporate.com', passwordHash, 'Demo User']
      );
      userId = userResult.rows[0].id;
      console.log('✓ Demo user created:', userResult.rows[0].email);
    }
    
    // Create demo company
    const companyResult = await pool.query(
      `INSERT INTO companies (name, industry, tax_id, address, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, name`,
      ['HB devs Pvt. Ltd.', 'Technology', 'TAX123456', '123 Business Street, Tech City']
    );
    
    const companyId = companyResult.rows[0].id;
    console.log('✓ Demo company created:', companyResult.rows[0].name);
    
    // Link user to company
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id, role, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, companyId, 'owner']
    );
    console.log('✓ User linked to company');
    
    await seedCompanyData(companyId);
    
  } catch (error) {
    console.error('❌ Error seeding demo data:', error.message);
  }
}

async function seedCompanyData(companyId) {
  // Insert demo accounts
  await pool.query(
    `INSERT INTO accounts (company_id, name, type, bank, account_number, opening_balance, created_at)
     VALUES 
       ($1, 'Business Checking', 'Checking', 'Chase Bank', '****1234', 500000.00, NOW()),
       ($1, 'Savings Account', 'Savings', 'Chase Bank', '****5678', 1200000.00, NOW()),
       ($1, 'Corporate Credit Card', 'Credit', 'American Express', '****9012', 0.00, NOW())
     ON CONFLICT DO NOTHING`,
    [companyId]
  );
  console.log('✓ Demo accounts created');
  
  // Get account IDs
  const accounts = await pool.query(
    `SELECT id, name FROM accounts WHERE company_id = $1`,
    [companyId]
  );
  
  const checkingAccount = accounts.rows.find(a => a.name === 'Business Checking');
  const creditCard = accounts.rows.find(a => a.name === 'Corporate Credit Card');
  
  if (!checkingAccount || !creditCard) {
    console.error('❌ Could not find required accounts');
    return;
  }
  
  // Insert corporate transactions spanning 6 months
  const transactions = [
    // Current month
    ['Payment from HB devs Pvt. Ltd. for Q1 services', 'income', 'Sales', checkingAccount.id, 450000.00, '2026-03-25', 'Q1 service delivery payment'],
    ['March salary payments', 'expense', 'Salaries', checkingAccount.id, 325000.00, '2026-03-24', 'Monthly payroll - 45 employees'],
    ['Google Ads campaign - March', 'expense', 'Marketing', creditCard.id, 75000.00, '2026-03-22', 'Digital marketing spend'],
    ['Equity shares purchase - Reliance', 'expense', 'Shares', checkingAccount.id, 120000.00, '2026-03-20', 'Investment in Reliance Industries'],
    ['Office rent - March', 'expense', 'Rent', checkingAccount.id, 85000.00, '2026-03-18', 'Monthly office lease payment'],
    ['Consulting fees - TechStart Inc', 'income', 'Consulting', checkingAccount.id, 180000.00, '2026-03-15', 'Consulting project payment'],
    ['GST payment - Q4', 'expense', 'Tax', checkingAccount.id, 95000.00, '2026-03-12', 'Quarterly GST filing'],
    ['SaaS subscriptions renewal', 'expense', 'Software', creditCard.id, 45000.00, '2026-03-10', 'Annual software licenses - AWS, Slack, Jira'],
    ['Legal consultation fees', 'expense', 'Professional Fees', creditCard.id, 35000.00, '2026-03-08', 'Corporate legal advisory'],
    ['Electricity & Internet', 'expense', 'Utilities', checkingAccount.id, 22000.00, '2026-03-05', 'Monthly utility bills'],
    
    // Last month
    ['Project delivery - Global Solutions', 'income', 'Sales', checkingAccount.id, 560000.00, '2026-02-28', 'Major project completion'],
    ['February salary payments', 'expense', 'Salaries', checkingAccount.id, 320000.00, '2026-02-25', 'Monthly payroll'],
    ['Annual maintenance contract - InfoSys', 'income', 'Consulting', checkingAccount.id, 240000.00, '2026-02-20', 'AMC renewal payment'],
    ['Meta Ads - February', 'expense', 'Marketing', creditCard.id, 55000.00, '2026-02-18', 'Social media advertising'],
    ['TDS payment - Q3', 'expense', 'Tax', checkingAccount.id, 78000.00, '2026-02-15', 'TDS quarterly payment'],
    ['Office supplies & equipment', 'expense', 'Misc', creditCard.id, 42000.00, '2026-02-10', 'New monitors, keyboards, chairs'],
    
    // 2 months ago
    ['Enterprise license - DataFlow Corp', 'income', 'Sales', checkingAccount.id, 380000.00, '2026-01-28', 'Annual enterprise license'],
    ['January salary payments', 'expense', 'Salaries', checkingAccount.id, 315000.00, '2026-01-25', 'Monthly payroll'],
    ['AWS hosting costs', 'expense', 'Software', creditCard.id, 68000.00, '2026-01-20', 'Cloud infrastructure'],
    ['Advance tax payment - Q3', 'expense', 'Tax', checkingAccount.id, 150000.00, '2026-01-15', 'Advance tax installment'],
    
    // 3 months ago
    ['API integration project - FinTech Co', 'income', 'Consulting', checkingAccount.id, 290000.00, '2025-12-22', 'API development project'],
    ['December salary payments', 'expense', 'Salaries', checkingAccount.id, 315000.00, '2025-12-25', 'Monthly payroll'],
    ['Year-end bonus payouts', 'expense', 'Salaries', checkingAccount.id, 180000.00, '2025-12-30', 'Annual performance bonuses'],
    ['Office rent - December', 'expense', 'Rent', checkingAccount.id, 85000.00, '2025-12-18', 'Monthly office lease'],
    
    // 4 months ago
    ['Product launch revenue - CloudSync', 'income', 'Sales', checkingAccount.id, 520000.00, '2025-11-25', 'New product launch sales'],
    ['November salary payments', 'expense', 'Salaries', checkingAccount.id, 310000.00, '2025-11-25', 'Monthly payroll'],
    ['Conference & events', 'expense', 'Marketing', creditCard.id, 95000.00, '2025-11-15', 'Tech conference sponsorship'],
    
    // 5 months ago
    ['Training partnership - EduTech', 'income', 'Consulting', checkingAccount.id, 175000.00, '2025-10-28', 'Corporate training program'],
    ['October salary payments', 'expense', 'Salaries', checkingAccount.id, 305000.00, '2025-10-25', 'Monthly payroll'],
    ['Dividend income - Mutual Funds', 'income', 'Shares', checkingAccount.id, 45000.00, '2025-10-15', 'Quarterly MF dividend'],
  ];
  
  for (const txn of transactions) {
    await pool.query(
      `INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [companyId, ...txn]
    );
  }
  console.log('✓ Demo transactions created:', transactions.length);
  
  // Insert demo invoices matching the screenshot
  const invoices = [
    ['INV-1005', 'Digital Ventures', null, 'receivable', 180000.00, 'paid', '2026-01-20', '2026-01-05'],
    ['INV-1001', 'HB devs Pvt. Ltd.', null, 'receivable', 450000.00, 'overdue', '2026-02-15', '2026-01-15'],
    ['INV-1004', 'InnovateLabs', null, 'receivable', 325000.00, 'overdue', '2026-02-20', '2026-01-20'],
    ['INV-1002', 'TechStart Inc', null, 'receivable', 280000.00, 'overdue', '2026-02-28', '2026-02-01'],
    ['INV-1003', 'Global Solutions', null, 'receivable', 560000.00, 'overdue', '2026-03-10', '2026-02-10'],
    ['INV-1006', 'Enterprise Solutions', null, 'receivable', 720000.00, 'overdue', '2026-03-15', '2026-02-15'],
  ];
  
  for (const inv of invoices) {
    await pool.query(
      `INSERT INTO invoices (company_id, invoice_number, client_name, vendor_name, type, amount, status, due_date, issue_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [companyId, ...inv]
    );
  }
  console.log('✓ Demo invoices created:', invoices.length);
  
  // Insert demo compliance filings
  const filings = [
    ['GST Filing - March 2026', 'GST', '2026-04-20', 'PENDING'],
    ['TDS Return - Q4 FY26', 'TDS', '2026-04-30', 'PENDING'],
    ['Advance Tax - Q1 FY27', 'INCOME_TAX', '2026-06-15', 'PENDING'],
    ['GST Filing - February 2026', 'GST', '2026-03-20', 'FILED'],
  ];
  
  for (const filing of filings) {
    await pool.query(
      `INSERT INTO compliance_events (company_id, title, type, due_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [companyId, ...filing]
    );
  }
  console.log('✓ Demo compliance filings created:', filings.length);
  
  console.log('\n==============================================');
  console.log('✅ Demo setup completed successfully!');
  console.log('==============================================');
  console.log('📧 Email: demo@corporate.com');
  console.log('🔑 Password: demo123');
  console.log('🏢 Company: HB devs Pvt. Ltd.');
  console.log('==============================================\n');
}

module.exports = { seedDemoData, seedCompanyData };
