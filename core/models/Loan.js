const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
    loanId: { type: String, required: true, unique: true },
    lender: { type: String, required: true },
    borrower: { type: String, required: true },
    amount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    totalRepayment: { type: Number, required: true },
    
    // Status
    status: { type: String, default: 'active' }, // active, paid, defaulted
    
    // Dates
    createdAt: { type: Number, default: Date.now },
    dueDate: { type: Number, required: true },
    paidAt: { type: Number, default: null },
    
    // Defaults
    notifiedDue: { type: Boolean, default: false }

}, { timestamps: true });

module.exports = mongoose.model('Loan', LoanSchema);
