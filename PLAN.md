# YNAB Skills for OpenClaw - Implementation Plan

## Overview

This plan outlines a family of YNAB skills that enable OpenClaw to manage your budget through the YNAB API. The design emphasizes **glacial, logged changes** to prevent daily thrash in your budget.

## Skill Family Architecture

```
skills/
├── ynab/                      # Core shared skill (model-invocable, not user-invocable)
│   └── SKILL.md               # API reference, auth, shared context
├── ynab-categorize/           # Categorize uncategorized transactions
│   └── SKILL.md
├── ynab-credit-cards/         # Credit card management
│   └── SKILL.md
├── ynab-budget/               # Budget category management
│   └── SKILL.md
└── ynab-trends/               # Month-over-month analysis
    └── SKILL.md
```

---

## Skill 1: `ynab` (Core/Shared)

**Purpose**: Provides API documentation, authentication context, and shared utilities for all YNAB skills.

### Configuration

```yaml
name: ynab
description: Core YNAB API context and authentication for budget management
user-invocable: false
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
```

### Key API Reference (to embed in skill)

**Base URL**: `https://api.ynab.com/v1`

**Authentication**: `Authorization: Bearer {YNAB_API_TOKEN}`

**Rate Limit**: 200 requests/hour (rolling window)

**Currency**: Milliunits (1000 = $1.00, e.g., 123930 = $123.93)

**Critical Endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/budgets` | GET | List all budgets |
| `/budgets/{id}/transactions?type=uncategorized` | GET | Get uncategorized transactions |
| `/budgets/{id}/transactions/{tx_id}` | PUT | Update a transaction |
| `/budgets/{id}/categories` | GET | List all categories |
| `/budgets/{id}/months/{month}/categories/{cat_id}` | PATCH | Update monthly budget amount |
| `/budgets/{id}/months` | GET | List all budget months |
| `/budgets/{id}/months/{month}` | GET | Get month details with category snapshots |
| `/budgets/{id}/accounts` | GET | List accounts (for credit card identification) |
| `/budgets/{id}/payees` | GET | List payees (for pattern matching) |

**Delta Sync**: Pass `last_knowledge_of_server` to get only changed data.

**Budget ID Shortcuts**: Use `"last-used"` or `"default"` instead of UUID.

---

## Skill 2: `ynab-categorize`

**Purpose**: Categorize uncategorized transactions intelligently.

### Configuration

```yaml
name: ynab-categorize
description: Categorize uncategorized YNAB transactions based on payee patterns and history
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
```

### Workflow Instructions

1. **Fetch uncategorized transactions**:
   ```
   GET /budgets/last-used/transactions?type=uncategorized
   ```

2. **For each transaction, analyze**:
   - Payee name and history
   - Previous categorizations for same payee
   - Amount patterns (recurring amounts often = same category)

3. **Fetch payee history** for context:
   ```
   GET /budgets/last-used/payees/{payee_id}/transactions
   ```

4. **Present recommendations to user** before making changes

5. **Log all changes** to `~/.ynab-logs/categorization.jsonl`:
   ```json
   {"timestamp": "2026-02-03T10:30:00Z", "action": "categorize", "transaction_id": "xxx", "payee": "Amazon", "amount": -45670, "from_category": null, "to_category": "Shopping", "reason": "Matches 12 previous Amazon transactions"}
   ```

6. **Apply changes** only after user approval:
   ```
   PUT /budgets/last-used/transactions/{transaction_id}
   Body: {"transaction": {"category_id": "xxx"}}
   ```

### Anti-Thrash Rules

- Never auto-categorize without user confirmation
- Show confidence score for each recommendation
- Log ALL changes with timestamps and reasoning
- Maintain a "learned patterns" file at `~/.ynab-logs/payee-patterns.json`

---

## Skill 3: `ynab-credit-cards`

**Purpose**: Manage credit card payments and ensure proper YNAB credit card workflow.

### Configuration

```yaml
name: ynab-credit-cards
description: Manage YNAB credit card payments, track payment readiness, and handle overspending
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
```

### YNAB Credit Card Model (embed in skill)

**How YNAB handles credit cards**:
1. Credit card accounts have an auto-created "Credit Card Payments" category
2. When you spend $50 on "Dining Out" with a credit card:
   - $50 moves FROM "Dining Out" TO "Credit Card Payment" category
   - This ensures you have cash to pay the bill
3. The "Available" amount in the credit card category = amount ready to pay

**Key concepts**:
- **Payment Available** (green): Cash set aside for payment
- **Working Balance**: Current balance including pending transactions
- **Cleared Balance**: Settled transactions only

### Workflow Instructions

1. **Identify credit card accounts**:
   ```
   GET /budgets/last-used/accounts
   ```
   Filter for `type: "creditCard"`

2. **Check payment readiness** for each card:
   - Get the credit card payment category
   - Compare "Available" vs "Working Balance"
   - Flag discrepancies (overspending not covered)

3. **Detect issues**:
   - Uncovered overspending (category went negative)
   - Direct credit card spending without budget coverage
   - Interest/fee transactions not categorized

4. **Generate report**:
   ```
   Credit Card Status Report
   ─────────────────────────
   Chase Sapphire:
     Balance: -$1,234.56
     Payment Available: $1,234.56 ✓
     Status: Ready to pay in full

   Amex Gold:
     Balance: -$567.89
     Payment Available: $423.00 ⚠
     Shortfall: $144.89
     Reason: Overspending in "Dining Out" not covered
   ```

5. **Log all analysis** to `~/.ynab-logs/credit-cards.jsonl`

### Recommended Actions

- Suggest moving money to cover shortfalls
- Identify recurring charges that need budget allocation
- Flag new merchants that might need categorization

---

## Skill 4: `ynab-budget`

**Purpose**: Manage budget category allocations and structure.

### Configuration

```yaml
name: ynab-budget
description: Adjust YNAB budget category amounts and manage category structure
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
```

### Workflow Instructions

1. **View current budget state**:
   ```
   GET /budgets/last-used/months/current
   ```

2. **Before any changes, snapshot current state** to `~/.ynab-logs/budget-snapshots/YYYY-MM-DD.json`

3. **Types of changes supported**:
   - Adjust budgeted amount for a category:
     ```
     PATCH /budgets/last-used/months/{month}/categories/{category_id}
     Body: {"category": {"budgeted": 50000}}  // $50.00
     ```
   - Update category name/notes:
     ```
     PATCH /budgets/last-used/categories/{category_id}
     Body: {"category": {"name": "New Name", "note": "Updated note"}}
     ```
   - Move money between categories (calculate and apply delta)

4. **Log all changes** to `~/.ynab-logs/budget-changes.jsonl`:
   ```json
   {"timestamp": "2026-02-03T10:30:00Z", "action": "adjust_budget", "category": "Groceries", "month": "2026-02", "from_amount": 40000, "to_amount": 50000, "reason": "User requested $100 increase"}
   ```

### Anti-Thrash Safeguards

- Always show current state before proposing changes
- Require explicit user confirmation for any modification
- Log the "reason" for every change
- Create daily snapshots when changes are made

---

## Skill 5: `ynab-trends`

**Purpose**: Analyze month-over-month spending and budget trends.

### Configuration

```yaml
name: ynab-trends
description: Analyze YNAB spending trends, month-over-month comparisons, and budget performance
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
```

### Workflow Instructions

1. **Fetch historical months**:
   ```
   GET /budgets/last-used/months
   ```

2. **For detailed analysis, fetch each month**:
   ```
   GET /budgets/last-used/months/{month}
   ```
   Returns category-level activity/budgeted/balance for that month.

3. **Build trend data**:
   - Category spending over time
   - Budget vs actual variance
   - Seasonal patterns
   - Category growth rates

4. **Store trend analysis** to `~/.ynab-logs/trends/`:
   - `monthly-summary-YYYY-MM.json` - Snapshot per month
   - `category-trends.json` - Rolling category analysis
   - `alerts.json` - Detected anomalies

5. **Generate reports**:
   ```
   Spending Trends (Last 6 Months)
   ───────────────────────────────
   Groceries:
     Avg: $450/mo | This Month: $523 (+16%)
     Trend: ↑ increasing 3 months

   Dining Out:
     Avg: $200/mo | This Month: $156 (-22%)
     Trend: ↓ decreasing (good!)

   Subscriptions:
     Avg: $89/mo | This Month: $89 (stable)
     Note: New charge detected: "Claude Pro $20"
   ```

6. **Detect anomalies**:
   - Unusual spending spikes
   - New recurring charges
   - Categories consistently over/under budget

### Trend Log Structure

The skill maintains a persistent trend log that prevents "thrash" by:
- Only updating summaries weekly or on-demand
- Tracking 12-month rolling averages
- Flagging changes only when statistically significant

---

## Logging Architecture

All skills write to `~/.ynab-logs/`:

```
~/.ynab-logs/
├── categorization.jsonl       # Transaction categorization history
├── credit-cards.jsonl         # Credit card status checks
├── budget-changes.jsonl       # Budget modifications
├── budget-snapshots/          # Daily budget state snapshots
│   └── 2026-02-03.json
├── trends/                    # Trend analysis data
│   ├── monthly-summary-2026-01.json
│   ├── monthly-summary-2026-02.json
│   └── category-trends.json
├── payee-patterns.json        # Learned payee → category mappings
└── sync-state.json            # Delta sync server_knowledge values
```

### Log Entry Format

All `.jsonl` files use newline-delimited JSON with consistent fields:
```json
{
  "timestamp": "2026-02-03T10:30:00Z",
  "skill": "ynab-categorize",
  "action": "categorize",
  "details": { ... },
  "user_confirmed": true,
  "reason": "User approved recommendation"
}
```

---

## Anti-Thrash Philosophy

The core principle is **glacial changes**:

1. **Never auto-modify** - All changes require explicit user confirmation
2. **Log everything** - Complete audit trail of all actions
3. **Show before/after** - Always display current state before proposing changes
4. **Batch recommendations** - Collect suggestions, present together, apply once
5. **Track patterns over time** - Build confidence in categorizations over weeks, not days
6. **Weekly summaries preferred** - Trends skill runs weekly analysis by default

---

## Implementation Order

1. **Phase 1**: `ynab` core skill (API docs, auth setup)
2. **Phase 2**: `ynab-trends` (read-only, builds historical data)
3. **Phase 3**: `ynab-categorize` (first write operations, most commonly needed)
4. **Phase 4**: `ynab-credit-cards` (specialized analysis)
5. **Phase 5**: `ynab-budget` (direct budget modifications)

This order ensures:
- Logging infrastructure is established before write operations
- Historical data exists before making data-driven recommendations
- Simpler read operations validate API integration before writes

---

## Required User Setup

1. **Generate YNAB API Token**:
   - Go to YNAB → Account Settings → Developer Settings
   - Create a Personal Access Token
   - Add to OpenClaw config:
     ```json
     {
       "skills": {
         "entries": {
           "ynab": { "apiKey": "your-token-here" }
         }
       }
     }
     ```

2. **Create log directory**:
   ```bash
   mkdir -p ~/.ynab-logs/budget-snapshots ~/.ynab-logs/trends
   ```

---

## Sources

- [YNAB API Documentation](https://api.ynab.com/)
- [YNAB API Endpoints - v1](https://api.ynab.com/v1)
- [OpenAPI Specification](https://api.ynab.com/papi/open_api_spec.yaml)
- [How Credit Cards Work in YNAB](https://www.ynab.com/blog/how-to-manage-credit-cards-in-ynab)
- [Credit Card Payments Guide](https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j)
- [Categorizing Transactions Guide](https://support.ynab.com/en_us/categorizing-transactions-a-guide-HyRl60sks)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills)
