const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'dashboard_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dashboard_db',
  password: process.env.DB_PASSWORD || 'dashboard123',
  port: process.env.DB_PORT || 5433,
});

async function createDemoUser() {
  try {
    console.log('Creating demo user...');
    
    // Hash the password 'demo123'
    const passwordHash = await bcrypt.hash('demo123', 10);
    
    // Insert demo user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (email) DO UPDATE SET password_hash = $2
       RETURNING id, email, full_name`,
      ['demo@corporate.com', passwordHash, 'Demo User']
    );
    
    const user = userResult.rows[0];
    console.log('✓ Demo user created:', user);
    
    // Insert demo company
    const companyResult = await pool.query(
      `INSERT INTO companies (name, industry, tax_id, address, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING
       RETURNING id, name`,
      ['Acme Corp Pvt Ltd', 'Technology', 'TAX123456', '123 Business Street, Tech City']
    );
    
    let company;
    if (companyResult.rows.length > 0) {
      company = companyResult.rows[0];
      console.log('✓ Demo company created:', company);
    } else {
      const existingCompany = await pool.query(
        `SELECT id, name FROM companies WHERE name = $1`,
        ['Acme Corp Pvt Ltd']
      );
      company = existingCompany.rows[0];
      console.log('✓ Demo company already exists:', company);
    }
    
    // Link user to company
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id, role, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [user.id, company.id, 'owner']
    );
    console.log('✓ User linked to company');
    
    // Insert demo accounts
    const accountsResult = await pool.query(
      `INSERT INTO accounts (company_id, name, type, bank, account_number, opening_balance, created_at)
       VALUES 
         ($1, 'Business Checking', 'Checking', 'Chase Bank', '****1234', 50000.00, NOW()),
         ($1, 'Savings Account', 'Savings', 'Chase Bank', '****5678', 100000.00, NOW()),
         ($1, 'Corporate Credit Card', 'Credit', 'American Express', '****9012', 0.00, NOW())
       ON CONFLICT DO NOTHING
       RETURNING id, name`,
      [company.id]
    );
    
    if (accountsResult.rows.length > 0) {
      console.log('✓ Demo accounts created:', accountsResult.rows.length);
    }
    
    // Get account IDs
    const accounts = await pool.query(
      `SELECT id, name FROM accounts WHERE company_id = $1`,
      [company.id]
    );
    
    const checkingAccount = accounts.rows.find(a => a.name === 'Business Checking');
    const creditCard = accounts.rows.find(a => a.name === 'Corporate Credit Card');
    
    // Insert demo transactions
    const transactions = [
      ['Payment from Acme Corp for Q1 services', 'income', 'Sales', checkingAccount.id, 450000.00, '2026-02-25', 'Q1 service payment'],
      ['February salary payments', 'expense', 'Salaries', checkingAccount.id, 325000.00, '2026-02-24', 'Monthly payroll'],
      ['Consulting fees - TechStart Inc', 'income', 'Consulting', checkingAccount.id, 180000.00, '2026-02-23', 'Consulting project payment'],
      ['Google Ads campaign - February', 'expense', 'Marketing', creditCard.id, 75000.00, '2026-02-22', 'Digital marketing spend'],
      ['SaaS subscriptions renewal', 'expense', 'Software', creditCard.id, 45000.00, '2026-02-21', 'Annual software licenses'],
      ['Project delivery - Global Solutions', 'income', 'Sales', checkingAccount.id, 560000.00, '2026-02-20', 'Major project completion'],
    ];
    
    for (const txn of transactions) {
      await pool.query(
        `INSERT INTO transactions (company_id, name, type, category, account_id, amount, date, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT DO NOTHING`,
        [company.id, ...txn]
      );
    }
    console.log('✓ Demo transactions created:', transactions.length);
    
    console.log('\n==============================================');
    console.log('✓ Demo setup completed successfully!');
    console.log('==============================================');
    console.log('Email: demo@corporate.com');
    console.log('Password: demo123');
    console.log('==============================================');
    console.log('Company: Acme Corp Pvt Ltd');
    console.log('==============================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating demo user:', error);
    process.exit(1);
  }
}

createDemoUser();
