export const mockTransactions = [
  { id: 1, name: 'Grocery Shopping', category: 'Food & Dining', account: 'Chase Checking', date: '2026-01-12', amount: -125.50, type: 'expense' },
  { id: 2, name: 'Salary Deposit', category: 'Income', account: 'Chase Checking', date: '2026-01-10', amount: 4500.00, type: 'income' },
  { id: 3, name: 'Netflix Subscription', category: 'Entertainment', account: 'Credit Card', date: '2026-01-09', amount: -15.99, type: 'expense' },
  { id: 4, name: 'Freelance Project', category: 'Income', account: 'Chase Checking', date: '2026-01-08', amount: 850.00, type: 'income' },
];

export const mockAccounts = [
  { id: 1, name: 'Chase Checking', type: 'Checking', bank: 'Chase Bank', accountNumber: '****1234', balance: 8450.23, connected: true, lastSync: '2 hours ago' },
  { id: 2, name: 'Savings Account', type: 'Savings', bank: 'Chase Bank', accountNumber: '****5678', balance: 15890.00, connected: true, lastSync: '2 hours ago' },
  { id: 3, name: 'Chase Freedom Credit Card', type: 'Credit', bank: 'Chase Bank', accountNumber: '****9012', balance: -1234.56, connected: true, lastSync: '2 hours ago' },
];

export const mockStats = {
  totalIncome: 12450,
  totalExpenses: 8234,
  savings: 15890,
  investments: 32145,
  netTotal: 4978.63,
  totalBalance: 56486.01,
  totalDebt: 1234.56,
  connectedAccounts: 4,
  monthlyIncome: 4500, // Average monthly income
  monthlyExpenses: 2745, // Average monthly expenses
};

// Financial Health Indicators - These will be calculated dynamically
export const mockFinancialHealth = {
  emergencyFund: {
    current: 15890, // Current savings
    target: 16470, // 6 months of expenses (2745 * 6)
    monthsCovered: 5.8,
    targetMonths: 6
  },
  debtToIncome: {
    monthlyDebt: 1234.56, // Total debt payments
    monthlyIncome: 4500,
    ratio: 0.28, // 28%
    targetRatio: 0.20 // Target below 20%
  },
  savingsRate: {
    monthlySavings: 850,
    monthlyIncome: 4500,
    rate: 0.19, // 19%
    targetRate: 0.20 // Target 20%
  },
  investmentDiversification: {
    assetClasses: 5,
    score: 0.88, // 88%
    status: 'excellent'
  },
  creditUtilization: {
    usedCredit: 1234.56,
    availableCredit: 5000,
    utilization: 0.25, // 25%
    targetUtilization: 0.30 // Keep below 30%
  },
  budgetAdherence: {
    daysOnBudget: 21,
    totalDays: 30,
    adherenceRate: 0.70, // 70%
    targetRate: 0.80 // Target 80%
  }
};