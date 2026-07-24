const express = require('express');
const router = express.Router();
const {
  getLoans,
  getLoanPrefill,
  createLoan,
  getLoan,
  updateLoanStatus,
  saveSanctionDetails,
  updateEmiStatus,
  deleteLoan,
} = require('../controllers/loansController');

router.get('/', getLoans);
router.get('/prefill', getLoanPrefill);
router.post('/', createLoan);
router.get('/:id', getLoan);
router.patch('/:id/status', updateLoanStatus);
router.put('/:id/sanction', saveSanctionDetails);
router.patch('/:id/emis/:emiId', updateEmiStatus);
router.delete('/:id', deleteLoan);

module.exports = router;
