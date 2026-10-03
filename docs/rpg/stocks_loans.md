# RPG Subsystem: Stock Market & Loans

## Stock Market (`core/rpg/stockMarket.js`)

Players can buy and sell shares in 5 fictional companies. Prices fluctuate via a random walk algorithm.

### Available Stocks
| Symbol | Name | Base Price | Volatility | Trend |
|--------|------|-----------|------------|-------|
| ARCH | Architect Solutions | 150 | 5% | +1% |
| CHAS | Chaos Energy | 80 | 15% | -2% |
| GUIL | Guild Logistics | 200 | 3% | +5% |
| VOID | Void Mining Co. | 500 | 20% | +10% |
| ZENI | Zeni Central Bank | 100 | 1% | +2% |

### Price Mechanics
- 10% chance per update to flip trend direction
- Price = max(10, floor(price * (1 + variance + trend)))
- Price cap: 1,000,000 Zeni per share
- Buy: cost = price × amount. Sell: payout = price × amount.
- 0% transaction fee (pure transfer)

## Loan System (`core/rpg/loans.js`)

Player-to-player lending with interest and auto-repayment.

### Flow
1. **Request**: Borrower specifies amount, interest rate, duration
2. **Approve**: Lender pays amount → borrower receives it
3. **Repay**: Borrower pays totalRepayment (amount + interest) → lender receives it
4. **Overdue**: Auto-deduct 10% daily from borrower's wallet
5. **Default**: If borrower can't pay, lender seizes remaining wallet + bank balance

### Guild Loan Auto-Repayment (`core/rpg/guildPerks.js`)
- Runs daily alongside interest processing
- Auto-deducts 10% of loan amount from borrower's wallet
- If wallet empty: 5% penalty added to principal (compounding)
- Encourages repayment through escalating debt

### Recent Changes
- Fixed: loan accept 0.1s timeout (result.amount was undefined, now uses result.msg)
- Fixed: removeMoney/addMoney return values now checked (rollback on failure)
