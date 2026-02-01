const fs = require('fs');
const economy = require('./economy');
const botConfig = require('../botConfig');
const path = require('path');

// NEW: Database Imports
const mongoose = require('mongoose');
const LoanModel = require('./models/Loan');
const System = require('./models/System');
const connectDB = require('../db');

// State
const pendingLoans = new Map(); // Key: lenderJid, Value: { borrowerJid, amount, interest, duration, timestamp }
const activeLoans = []; // Array of loan objects
const loanBlocks = new Map(); // Key: userId, Value: unblockTimestamp

// Constants
const getZENI = () => economy.getZENI();

// Load data
async function loadLoans() {
  try {
    await connectDB();
    
    // 1. Load Active Loans
    const loans = await LoanModel.find({ status: 'active' });
    activeLoans.length = 0; // Clear array
    loans.forEach(l => activeLoans.push(l.toObject()));

    // 2. Load Loan Blocks
    const sys = await System.findOne({ key: 'loan_blocks' });
    if (sys && sys.value) {
      for (const [id, time] of Object.entries(sys.value)) {
        loanBlocks.set(id, time);
      }
    }
    
    console.log(`✅ Loaded ${activeLoans.length} active loans from MongoDB`);
  } catch (err) {
    console.error("Error loading loans from DB:", err.message);
  }
}

async function syncLoanBlocks() {
    try {
        await System.updateOne(
            { key: 'loan_blocks' },
            { $set: { value: Object.fromEntries(loanBlocks) } },
            { upsert: true }
        );
    } catch (err) {
        console.error("Error syncing loan blocks:", err.message);
    }
}

async function saveLoan(loan) {
    try {
        await LoanModel.updateOne(
            { loanId: loan.id || loan.loanId },
            { $set: loan },
            { upsert: true }
        );
    } catch (err) {
        console.error("Error saving loan to DB:", err.message);
    }
}

async function deleteLoan(loanId) {
    try {
        await LoanModel.deleteOne({ loanId });
    } catch (err) {
        console.error("Error deleting loan from DB:", err.message);
    }
}

function saveLoans() {
  // Deprecated: Individual functions handle sync
}

// Check if user is blocked due to unpaid loans
function isLoanBlocked(userId) {
  if (!loanBlocks.has(userId)) return false;
  
  const unblockTime = loanBlocks.get(userId);
  if (Date.now() > unblockTime) {
    loanBlocks.delete(userId);
    syncLoanBlocks();
    return false;
  }
  return true;
}

function getLoanBlockTime(userId) {
  if (!loanBlocks.has(userId)) return 0;
  return loanBlocks.get(userId) - Date.now();
}

function getTotalDebt() {
  return activeLoans.reduce((sum, loan) => {
    const repay = Number(loan.totalRepayment);
    return sum + (isNaN(repay) ? 0 : repay);
  }, 0);
}

// Request a loan
function requestLoan(borrowerJid, lenderJid, amount, interestRate, durationMinutes) {
  // Basic validation
  if (amount <= 0) return { success: false, msg: `❌ Amount must be positive.` };
  if (interestRate < 0) return { success: false, msg: `❌ Interest cannot be negative.` };
  if (durationMinutes < 1) return { success: false, msg: `❌ Duration must be at least 1 minute.` };
  if (borrowerJid === lenderJid) return { success: false, msg: `❌ You can't loan money to yourself.` };

  // Check if lender has funds (pre-check)
  const lenderBal = economy.getBankBalance(lenderJid);
  if (lenderBal.total < amount) {
    return { success: false, msg: `❌ The lender doesn't have enough money.` };
  }

  // Check if borrower is blocked
  if (isLoanBlocked(borrowerJid)) {
      return { success: false, msg: `❌ You are currently blocked from the economy for unpaid debts.` };
  }

  // Store pending request
  pendingLoans.set(lenderJid, {
    borrowerJid,
    amount,
    interest: interestRate,
    duration: durationMinutes,
    timestamp: Date.now()
  });

  return { 
    success: true, 
    msg: `📝 *LOAN REQUEST SENT*\n\nTo: @${lenderJid.split('@')[0]}
Amount: ${getZENI()}${amount}
Interest: ${interestRate}%
Duration: ${durationMinutes} mins

⏳ *Time:* 120s to accept.
Waiting for them to type:
✅ \`${botConfig.getPrefix()} accept\`
❌ \`${botConfig.getPrefix()} decline\`` 
  };
}

// Accept a loan
function acceptLoan(lenderJid) {
  const request = pendingLoans.get(lenderJid);
  if (!request) return { success: false, msg: `❌ You have no pending loan requests.` };

  if (Date.now() - request.timestamp > 120000) {
      pendingLoans.delete(lenderJid);
      return { success: false, msg: `❌ Loan request expired! (120s limit)` };
  }

  // Double check funds
  const lenderBal = economy.getBankBalance(lenderJid);
  if (lenderBal.wallet < request.amount) {
      return { success: false, msg: `❌ You don't have enough money in your wallet. Withdraw it first.` };
  }

  // Calculate totals
  const totalRepayment = Math.floor(request.amount * (1 + request.interest / 100));
  const dueTime = Date.now() + (request.duration * 60 * 1000);

  // Execute transfer
  economy.removeMoney(lenderJid, request.amount);
  economy.addMoney(request.borrowerJid, request.amount);

  // Save active loan
  const loanObj = {
    loanId: Date.now().toString(),
    lender: lenderJid,
    borrower: request.borrowerJid,
    amount: request.amount,
    interestRate: request.interest,
    totalRepayment,
    dueDate: dueTime,
    status: 'active'
  };
  
  activeLoans.push(loanObj);
  saveLoan(loanObj);

  // Clear pending
  pendingLoans.delete(lenderJid);

  return { 
    success: true, 
    msg: `🤝 *LOAN ACTIVE*\n\nSent ${getZENI()}${request.amount} to @${request.borrowerJid.split('@')[0]}

They must repay ${getZENI()}${totalRepayment} in ${request.duration} minutes.

⚠️ If they fail to pay, they will be blocked and drained!` 
  };
}

// Decline a loan
function declineLoan(lenderJid) {
  const request = pendingLoans.get(lenderJid);
  if (!request) return { success: false, msg: `❌ You have no pending loan requests.` };

  if (Date.now() - request.timestamp > 120000) {
      pendingLoans.delete(lenderJid);
      return { success: false, msg: `❌ Loan request already expired.` };
  }

  // Clear pending
  pendingLoans.delete(lenderJid);

  return { 
    success: true, 
    msg: `❌ *LOAN DECLINED*\n\nYou rejected the loan request from @${request.borrowerJid.split('@')[0]}.`
  };
}

// Check loans (run this in interval)
function checkDueLoans() {
  const now = Date.now();
  const results = []; // Messages to send

  // Filter out loans that are processed
  for (let i = activeLoans.length - 1; i >= 0; i--) {
    const loan = activeLoans[i];
    
    if (now >= loan.dueDate) {
      // Time is up!
      const borrowerBal = economy.getBankBalance(loan.borrower);
      
      if (borrowerBal.total >= loan.totalRepayment) {
        // Scenario A: Borrower has money
        let remaining = loan.totalRepayment;
        
        if (borrowerBal.wallet >= remaining) {
            economy.removeMoney(loan.borrower, remaining);
            remaining = 0;
        } else {
            remaining -= borrowerBal.wallet;
            economy.removeMoney(loan.borrower, borrowerBal.wallet); // Empty wallet
            const user = economy.getUser(loan.borrower);
            user.bank -= remaining;
            economy.saveUser(loan.borrower);
        }

        // Pay lender
        economy.addMoney(loan.lender, loan.totalRepayment);

        results.push({
          type: 'paid',
          lender: loan.lender,
          borrower: loan.borrower,
          amount: loan.totalRepayment
        });

        loan.status = 'paid';
        saveLoan(loan);

      } else {
        // Scenario B: Borrower is broke
        const seizedAmount = borrowerBal.total;
        const user = economy.getUser(loan.borrower);
        
        if (user) {
            if (!user.frozenAssets) user.frozenAssets = { wallet: 0, bank: 0, reason: "" };
            user.frozenAssets.wallet += user.wallet || 0;
            user.frozenAssets.bank += user.bank || 0;
            user.frozenAssets.reason = "Unpaid Loan Default";
            
            user.wallet = 0;
            user.bank = 0;
            economy.saveUser(loan.borrower);
        }

        if (seizedAmount > 0) {
            economy.addMoney(loan.lender, seizedAmount);
        }

        // Block the user
        const unpaid = loan.totalRepayment - seizedAmount;
        const blockMinutes = Math.max(60, Math.ceil(unpaid / 10)); 
        const unblockTime = Date.now() + (blockMinutes * 60 * 1000);
        
        loanBlocks.set(loan.borrower, unblockTime);
        syncLoanBlocks();

        results.push({
          type: 'defaulted',
          lender: loan.lender,
          borrower: loan.borrower,
          seized: seizedAmount,
          unpaid: unpaid,
          blockTime: blockMinutes
        });

        loan.status = 'defaulted';
        saveLoan(loan);
      }

      // Remove loan from array
      activeLoans.splice(i, 1);
    }
  }

  return results;
}

module.exports = {
  loadLoans,
  requestLoan,
  acceptLoan,
  declineLoan,
  checkDueLoans,
  isLoanBlocked,
  getLoanBlockTime,
  getTotalDebt
};

