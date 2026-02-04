---
name: ynab-credit-cards
description: Manage YNAB credit card payments, track payment readiness, and identify overspending issues
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB Credit Card Manager

You are helping the user manage their credit cards in YNAB, ensuring they have funds available to pay their balances and identifying any overspending issues.

## How YNAB Credit Cards Work

Understanding this is critical for accurate analysis:

1. **Each credit card account has a matching payment category** in the "Credit Card Payments" group
2. **When you spend with a credit card**, YNAB automatically moves money:
   - FROM: The budget category (e.g., "Dining Out")
   - TO: The credit card payment category
3. **The "Available" amount** in the payment category = cash ready to pay the card
4. **Payments are transfers**, not expenses (checking → credit card)

### Healthy State
- Payment category "Available" = Account "Working Balance" (as a positive number)
- This means you have cash set aside to pay the full balance

### Problem States
- **Available < Balance**: Overspending occurred without budget coverage
- **Available > Balance**: Extra money assigned (paying down old debt)

## Workflow

### Step 1: Identify Credit Card Accounts

```python
import requests
import json
import os
from datetime import datetime
from pathlib import Path

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

# Fetch all accounts
response = requests.get(
    f"{BASE_URL}/budgets/last-used/accounts",
    headers=headers
)
response.raise_for_status()
accounts = response.json()["data"]["accounts"]

# Filter credit cards
credit_cards = [a for a in accounts if a["type"] == "creditCard" and not a["deleted"] and not a["closed"]]
print(f"Found {len(credit_cards)} active credit card accounts")
```

### Step 2: Fetch Categories to Find Payment Categories

```python
# Fetch categories
cat_response = requests.get(
    f"{BASE_URL}/budgets/last-used/categories",
    headers=headers
)
category_groups = cat_response.json()["data"]["category_groups"]

# Find Credit Card Payments group
cc_payment_categories = {}
for group in category_groups:
    if group["name"] == "Credit Card Payments":
        for cat in group.get("categories", []):
            if not cat.get("deleted") and not cat.get("hidden"):
                cc_payment_categories[cat["id"]] = cat
        break
```

### Step 3: Match Cards to Payment Categories

YNAB links credit card accounts to their payment categories. The category's `goal_target_month` or a name match can help identify the link.

```python
def find_payment_category(card_name, payment_categories):
    """Find the payment category for a credit card."""
    # Categories are often named the same as the account
    for cat_id, cat in payment_categories.items():
        if card_name.lower() in cat["name"].lower() or cat["name"].lower() in card_name.lower():
            return cat
    return None
```

### Step 4: Analyze Each Card

```python
def analyze_credit_card(card, payment_cat):
    """Analyze credit card health."""
    # Balance is negative (debt), convert to positive for comparison
    balance = abs(card["balance"]) / 1000  # Convert milliunits
    cleared_balance = abs(card["cleared_balance"]) / 1000
    uncleared_balance = abs(card["uncleared_balance"]) / 1000

    # Available in payment category (positive = money set aside)
    available = payment_cat["balance"] / 1000 if payment_cat else 0

    # Calculate shortfall/surplus
    difference = available - balance

    status = {
        "card_name": card["name"],
        "balance": balance,
        "cleared_balance": cleared_balance,
        "uncleared_balance": uncleared_balance,
        "payment_available": available,
        "difference": difference,
        "healthy": difference >= 0
    }

    if difference >= 0:
        status["status"] = "Ready to pay in full"
        status["emoji"] = "OK"
    elif difference > -50:
        status["status"] = f"Minor shortfall: ${abs(difference):.2f}"
        status["emoji"] = "WARN"
    else:
        status["status"] = f"Shortfall: ${abs(difference):.2f} not covered"
        status["emoji"] = "ALERT"

    return status
```

### Step 5: Generate Report

Present a clear status report:

```python
def generate_report(card_statuses):
    """Generate credit card status report."""
    report = []
    report.append("Credit Card Status Report")
    report.append("=" * 40)
    report.append("")

    for status in card_statuses:
        emoji = {"OK": "[OK]", "WARN": "[!!]", "ALERT": "[XX]"}[status["emoji"]]
        report.append(f"{emoji} {status['card_name']}")
        report.append(f"    Balance: ${status['balance']:,.2f}")
        report.append(f"    Payment Available: ${status['payment_available']:,.2f}")

        if status["healthy"]:
            if status["difference"] > 0:
                report.append(f"    Surplus: ${status['difference']:,.2f} (paying down debt)")
            else:
                report.append(f"    Status: Ready to pay in full")
        else:
            report.append(f"    SHORTFALL: ${abs(status['difference']):,.2f}")
            report.append(f"    Action: Need to cover overspending")

        report.append("")

    return "\n".join(report)
```

### Step 6: Identify Issues

Look for specific problems:

```python
def identify_issues(card, payment_cat, headers):
    """Identify specific issues with a credit card."""
    issues = []

    # Check for uncategorized transactions on this card
    tx_response = requests.get(
        f"{BASE_URL}/budgets/last-used/accounts/{card['id']}/transactions",
        headers=headers,
        params={"type": "uncategorized"}
    )
    uncategorized = tx_response.json()["data"]["transactions"]
    if uncategorized:
        issues.append({
            "type": "uncategorized",
            "severity": "medium",
            "message": f"{len(uncategorized)} uncategorized transactions",
            "transactions": uncategorized
        })

    # Check for interest/fee transactions
    # These often have payee names containing "interest", "fee", "finance charge"
    recent_response = requests.get(
        f"{BASE_URL}/budgets/last-used/accounts/{card['id']}/transactions",
        headers=headers,
        params={"since_date": (datetime.now().replace(day=1)).strftime("%Y-%m-%d")}
    )
    recent = recent_response.json()["data"]["transactions"]

    interest_keywords = ["interest", "fee", "finance charge", "annual fee", "late fee"]
    for tx in recent:
        payee = (tx.get("payee_name") or "").lower()
        if any(kw in payee for kw in interest_keywords):
            if not tx.get("category_id"):
                issues.append({
                    "type": "interest_uncategorized",
                    "severity": "high",
                    "message": f"Interest/fee not categorized: {tx.get('payee_name')} ${abs(tx['amount'])/1000:.2f}",
                    "transaction": tx
                })

    return issues
```

### Step 7: Log Analysis

```python
LOG_DIR = Path.home() / ".ynab-logs"
LOG_DIR.mkdir(exist_ok=True)

def log_analysis(card_statuses, issues):
    """Log the credit card analysis."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "skill": "ynab-credit-cards",
        "action": "analyze",
        "cards": card_statuses,
        "issues_found": len(issues),
        "issues": issues
    }

    log_file = LOG_DIR / "credit-cards.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
```

## Recommended Actions

Based on analysis, suggest specific actions:

### For Shortfalls
```
Your Chase Sapphire has a $144.89 shortfall.

This happened because spending exceeded the budgeted amount in one or more categories.
To fix this, you can:

1. Move money from another category to "Chase Sapphire" payment category
2. Assign new money (if available) to the payment category
3. Accept carrying a balance this month (not recommended)

Would you like me to help identify which categories overspent?
```

### For Uncategorized Transactions
```
Found 3 uncategorized transactions on your Amex Gold:

1. AMZN MKTP - $67.89 (Jan 28)
2. UBER *TRIP - $23.45 (Jan 29)
3. Unknown Merchant - $12.00 (Jan 30)

Use /ynab-categorize to categorize these transactions.
```

### For Interest/Fees
```
Detected interest charge: $23.45 on Chase Sapphire

This should be categorized to track interest payments. Suggested categories:
1. "Interest & Fees" (create if doesn't exist)
2. "Credit Card Interest"

Would you like me to categorize this?
```

## Sample Output

```
Credit Card Status Report
========================================

[OK] Chase Sapphire Preferred
    Balance: $1,234.56
    Payment Available: $1,234.56
    Status: Ready to pay in full

[!!] American Express Gold
    Balance: $567.89
    Payment Available: $523.00
    SHORTFALL: $44.89
    Action: Need to cover overspending

[XX] Discover It
    Balance: $2,100.00
    Payment Available: $1,450.00
    SHORTFALL: $650.00
    Action: Need to cover overspending

Issues Found:
- Amex Gold: 2 uncategorized transactions
- Discover It: Interest charge ($18.99) not categorized

Recommendations:
1. Move $44.89 to cover Amex Gold shortfall
2. Move $650.00 to cover Discover It shortfall (or budget for partial payment)
3. Use /ynab-categorize to handle uncategorized transactions
```

## Important Notes

1. **This skill is read-only by default** - It analyzes but doesn't modify your budget
2. **Shortfalls require manual intervention** - YNAB philosophy is to make conscious decisions about overspending
3. **Log all analyses** - Even read-only operations are logged for trend tracking
4. **Check regularly** - Running this weekly helps catch issues before they compound
