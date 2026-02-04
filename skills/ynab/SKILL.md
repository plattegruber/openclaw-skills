---
name: ynab
description: Core YNAB API context and authentication for budget management
user-invocable: false
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB API Reference

You have access to the YNAB (You Need A Budget) API for managing the user's budget.

## CRITICAL: Budget Selection

**Before any YNAB operation, you MUST determine which budget to use.**

### Check for saved budget preference

```python
import json
from pathlib import Path

CONFIG_FILE = Path.home() / ".ynab-logs" / "config.json"

def get_selected_budget():
    """Get the user's selected budget ID, or None if not set."""
    if CONFIG_FILE.exists():
        config = json.loads(CONFIG_FILE.read_text())
        return config.get("selected_budget")
    return None

def get_budget_id():
    """Get the budget ID to use for API calls."""
    selected = get_selected_budget()
    if selected:
        return selected["id"]
    return "last-used"  # Fallback, but should prompt user to select
```

### If no budget is selected, prompt the user

When `get_selected_budget()` returns `None`, you MUST:
1. Fetch the list of budgets
2. Present them to the user
3. Ask which one to use
4. Save their selection

```python
import requests
import os

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

def list_budgets():
    """Fetch all available budgets."""
    response = requests.get(
        "https://api.ynab.com/v1/budgets",
        headers=headers
    )
    response.raise_for_status()
    return response.json()["data"]["budgets"]

def save_budget_selection(budget_id, budget_name):
    """Save the user's budget selection."""
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

    config = {}
    if CONFIG_FILE.exists():
        config = json.loads(CONFIG_FILE.read_text())

    config["selected_budget"] = {
        "id": budget_id,
        "name": budget_name,
        "selected_at": datetime.utcnow().isoformat() + "Z"
    }

    CONFIG_FILE.write_text(json.dumps(config, indent=2))
```

### User can ask about or change their budget

Handle these queries:
- "What budget am I using?" → Show saved selection from config
- "Switch to [budget name]" → Update config with new selection
- "List my budgets" → Show all available budgets

Example response for "What budget am I using?":
```
You're currently using: "My Budget" (selected on 2026-02-03)

Other available budgets:
- Old Budget (last modified: 2025-01-15)
- Test Budget (last modified: 2024-12-01)

Say "switch to [name]" to change budgets.
```

## CRITICAL: Check Account Link Status

**At the start of ANY YNAB skill session, check for broken account links.**

```python
def check_account_links(budget_id):
    """Check for accounts with broken bank connections."""
    response = requests.get(
        f"https://api.ynab.com/v1/budgets/{budget_id}/accounts",
        headers=headers
    )
    response.raise_for_status()
    accounts = response.json()["data"]["accounts"]

    broken_links = []
    for account in accounts:
        if account.get("deleted") or account.get("closed"):
            continue

        # Check if this is a linked account with an error
        if account.get("direct_import_linked") and account.get("direct_import_in_error"):
            broken_links.append({
                "name": account["name"],
                "type": account["type"],
                "last_reconciled": account.get("last_reconciled_at")
            })

    return broken_links
```

### Display warning if links are broken

If `check_account_links()` returns any accounts, display a warning BEFORE proceeding:

```
⚠️  ACCOUNT LINK ALERT

The following accounts have broken bank connections:
  • Chase Checking - link needs reauthorization
  • Amex Gold - link needs reauthorization

Log in to YNAB (app.ynab.com) and click on each account to reconnect.

Proceeding with current data (may be outdated)...
```

## Authentication

All requests require the header:
```
Authorization: Bearer $YNAB_API_TOKEN
```

## Base URL

```
https://api.ynab.com/v1
```

## Rate Limits

- **200 requests per hour** (rolling window)
- Returns `429 Too Many Requests` when exceeded
- Cache responses and use delta sync to minimize requests

## Currency Format: Milliunits

YNAB uses "milliunits" where **1000 milliunits = $1.00**:
- `$123.93` = `123930` milliunits
- `-$50.00` = `-50000` milliunits (outflows are negative)

Always convert for display: `amount / 1000`

## Delta Sync

Most GET endpoints support incremental sync:
1. First request: omit `last_knowledge_of_server`
2. Response includes `server_knowledge` integer
3. Subsequent requests: pass `?last_knowledge_of_server={value}`
4. Only changed/deleted entities returned

Store `server_knowledge` in `~/.ynab-logs/sync-state.json`.

## Key Endpoints

### Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets` | List all budgets |
| GET | `/budgets/{id}` | Full budget with all entities |
| GET | `/budgets/{id}/settings` | Date/currency format settings |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/accounts` | List all accounts |
| GET | `/budgets/{id}/accounts/{account_id}` | Single account details |
| POST | `/budgets/{id}/accounts` | Create new account |

**Account fields for link status:**
- `direct_import_linked`: Boolean - whether account is linked to a bank
- `direct_import_in_error`: Boolean - whether the link is broken
- `last_reconciled_at`: Date - when account was last reconciled

Account types include: `checking`, `savings`, `creditCard`, `cash`, `lineOfCredit`, `otherAsset`, `otherLiability`, `mortgage`, `autoLoan`, `studentLoan`, `personalLoan`, `medicalDebt`, `otherDebt`

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/categories` | List all category groups and categories |
| GET | `/budgets/{id}/categories/{category_id}` | Single category |
| PATCH | `/budgets/{id}/categories/{category_id}` | Update category (name, note, goal_target) |
| GET | `/budgets/{id}/months/{month}/categories/{category_id}` | Category for specific month |
| PATCH | `/budgets/{id}/months/{month}/categories/{category_id}` | Update monthly budgeted amount |

Category PATCH body:
```json
{"category": {"budgeted": 50000}}
```

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/transactions` | List transactions |
| GET | `/budgets/{id}/transactions?type=uncategorized` | **Uncategorized transactions only** |
| GET | `/budgets/{id}/transactions?type=unapproved` | Unapproved transactions only |
| GET | `/budgets/{id}/transactions?since_date=YYYY-MM-DD` | Transactions since date |
| GET | `/budgets/{id}/transactions/{tx_id}` | Single transaction |
| POST | `/budgets/{id}/transactions` | Create transaction(s) |
| PUT | `/budgets/{id}/transactions/{tx_id}` | Update transaction |
| DELETE | `/budgets/{id}/transactions/{tx_id}` | Delete transaction |
| PATCH | `/budgets/{id}/transactions` | Bulk update transactions |

Transaction PUT body:
```json
{
  "transaction": {
    "category_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "memo": "Optional memo",
    "approved": true
  }
}
```

### Payees

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/payees` | List all payees |
| GET | `/budgets/{id}/payees/{payee_id}` | Single payee |
| PATCH | `/budgets/{id}/payees/{payee_id}` | Update payee name |
| GET | `/budgets/{id}/payees/{payee_id}/transactions` | All transactions for payee |

### Months

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/months` | List all budget months |
| GET | `/budgets/{id}/months/{month}` | Single month with category snapshots |

Use `"current"` for the current month or ISO date `"2026-02"`.

### Scheduled Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/budgets/{id}/scheduled_transactions` | List scheduled transactions |
| POST | `/budgets/{id}/scheduled_transactions` | Create scheduled transaction |
| PUT | `/budgets/{id}/scheduled_transactions/{id}` | Update scheduled transaction |
| DELETE | `/budgets/{id}/scheduled_transactions/{id}` | Delete scheduled transaction |

## Response Format

Successful responses wrap data:
```json
{
  "data": {
    "transactions": [...],
    "server_knowledge": 12345
  }
}
```

Errors include details:
```json
{
  "error": {
    "id": "401",
    "name": "unauthorized",
    "detail": "Invalid access token"
  }
}
```

## Logging Requirements

**All YNAB skills MUST log their actions** to `~/.ynab-logs/`.

Before any write operation:
1. Ensure `~/.ynab-logs/` directory exists
2. Log the action with timestamp, before/after state, and reason
3. Confirm with user before executing

Log format (JSONL):
```json
{"timestamp": "2026-02-03T10:30:00Z", "skill": "ynab-categorize", "action": "categorize", "transaction_id": "xxx", "before": null, "after": "Groceries", "reason": "User approved", "user_confirmed": true}
```

## Standard Session Startup

Every YNAB skill session should:

```python
from pathlib import Path
from datetime import datetime
import json
import requests
import os

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}
LOG_DIR = Path.home() / ".ynab-logs"
CONFIG_FILE = LOG_DIR / "config.json"

def startup():
    """Standard startup for any YNAB skill."""
    LOG_DIR.mkdir(exist_ok=True)

    # 1. Check budget selection
    budget_id = None
    budget_name = None

    if CONFIG_FILE.exists():
        config = json.loads(CONFIG_FILE.read_text())
        if "selected_budget" in config:
            budget_id = config["selected_budget"]["id"]
            budget_name = config["selected_budget"]["name"]

    if not budget_id:
        # Must prompt user to select budget
        return None, "NO_BUDGET_SELECTED"

    # 2. Check account links
    broken_links = check_account_links(budget_id)

    return {
        "budget_id": budget_id,
        "budget_name": budget_name,
        "broken_links": broken_links
    }, None
```

## Credit Card Behavior

YNAB automatically manages credit cards:
1. Each credit card account has a matching "Credit Card Payments" category
2. Spending on credit card moves money FROM budget category TO payment category
3. The "Available" amount in the payment category = cash ready to pay the bill
4. Payments are recorded as transfers, not expenses

When checking credit card health:
- Compare payment category "Available" vs account "Working Balance"
- Shortfall indicates overspending not covered by budget
