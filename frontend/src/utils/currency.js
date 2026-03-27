// Currency utility functions

export const getCurrencySymbol = (currencyCode) => {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF ',
    CNY: '¥'
  };
  return symbols[currencyCode] || '$';
};

export const formatCurrency = (amount, currencyCode) => {
  const symbol = getCurrencySymbol(currencyCode);
  const absAmount = Math.abs(amount);
  return `${symbol}${absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const getCurrentCurrency = () => {
  return localStorage.getItem('currency') || 'USD';
};
