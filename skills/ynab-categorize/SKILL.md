---
name: ynab-categorize
description: Categorize uncategorized YNAB transactions based on payee patterns and history
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB Transaction Categorizer

You are helping the user categorize uncategorized transactions in their YNAB budget.

## Confidence-Based Auto-Categorization

**Categorization behavior based on confidence level:**

| Confidence | Action |
|------------|--------|
| >90% | **Auto-apply** without asking (log it) |
| ≤90% | **Ask user** with category options |
| No history | **Ask user** with full category list |

This allows routine transactions to flow through automatically while ensuring uncertain ones get human review.

## Workflow

### Step 1: Startup Checks

```python
import requests
import json
import os
from datetime import datetime
from pathlib import Path

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

LOG_DIR = Path.home() / ".ynab-logs"
CONFIG_FILE = LOG_DIR / "config.json"
LOG_DIR.mkdir(exist_ok=True)

# Check for budget selection
def get_budget_id():
    if CONFIG_FILE.exists():
        config = json.loads(CONFIG_FILE.read_text())
        if "selected_budget" in config:
            return config["selected_budget"]["id"]
    return None

budget_id = get_budget_id()
if not budget_id:
    print("No budget selected! Run /ynab-config first.")
    # Stop here and prompt user
```

### Step 2: Fetch Uncategorized Transactions

```python
# Fetch uncategorized transactions
response = requests.get(
    f"{BASE_URL}/budgets/{budget_id}/transactions",
    headers=headers,
    params={"type": "uncategorized"}
)
response.raise_for_status()
transactions = response.json()["data"]["transactions"]

# Filter out transfers (they don't need categories)
transactions = [t for t in transactions if not t.get("transfer_account_id")]

print(f"Found {len(transactions)} uncategorized transactions")
```

### Step 3: Fetch Categories

```python
# Fetch all categories
cat_response = requests.get(
    f"{BASE_URL}/budgets/{budget_id}/categories",
    headers=headers
)
category_groups = cat_response.json()["data"]["category_groups"]

# Build category lookup (exclude internal/hidden)
category_map = {}
category_list = []  # For presenting options
for group in category_groups:
    if group["name"] in ["Internal Master Category", "Credit Card Payments"]:
        continue
    for cat in group.get("categories", []):
        if not cat.get("deleted") and not cat.get("hidden"):
            category_map[cat["id"]] = {
                "name": cat["name"],
                "group": group["name"]
            }
            category_list.append({
                "id": cat["id"],
                "name": cat["name"],
                "group": group["name"]
            })
```

### Step 4: Analyze Each Transaction

```python
def analyze_transaction(tx):
    """Analyze a transaction and calculate confidence."""
    payee_id = tx.get("payee_id")
    payee_name = tx.get("payee_name", "Unknown")

    if not payee_id:
        return None, 0, "No payee ID", {}

    # Fetch payee's transaction history
    history_response = requests.get(
        f"{BASE_URL}/budgets/{budget_id}/payees/{payee_id}/transactions",
        headers=headers
    )
    history = history_response.json()["data"]["transactions"]

    # Count category occurrences (excluding uncategorized)
    category_counts = {}
    for hist_tx in history:
        cat_id = hist_tx.get("category_id")
        if cat_id and cat_id in category_map:
            category_counts[cat_id] = category_counts.get(cat_id, 0) + 1

    if not category_counts:
        return None, 0, "No categorized history", {}

    # Sort by frequency
    sorted_cats = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    best_cat_id, best_count = sorted_cats[0]
    total = sum(category_counts.values())
    confidence = best_count / total

    return best_cat_id, confidence, f"Used {best_count}/{total} times", dict(sorted_cats[:5])
```

### Step 5: Process Transactions

**This is the key logic for auto-apply vs ask:**

```python
AUTO_THRESHOLD = 0.90  # 90% confidence

def process_transactions(transactions):
    """Process all uncategorized transactions."""
    auto_applied = []
    needs_review = []

    for tx in transactions:
        best_cat_id, confidence, reason, top_cats = analyze_transaction(tx)

        tx_info = {
            "id": tx["id"],
            "date": tx["date"],
            "payee": tx.get("payee_name", "Unknown"),
            "amount": tx["amount"] / 1000,
            "best_category_id": best_cat_id,
            "best_category_name": category_map.get(best_cat_id, {}).get("name") if best_cat_id else None,
            "confidence": confidence,
            "reason": reason,
            "top_categories": top_cats  # For showing options
        }

        if confidence > AUTO_THRESHOLD:
            # AUTO-APPLY: High confidence, apply immediately
            apply_category(tx["id"], best_cat_id)
            log_categorization(
                tx_id=tx["id"],
                payee=tx_info["payee"],
                amount=tx_info["amount"],
                old_cat=None,
                new_cat=tx_info["best_category_name"],
                confidence=confidence,
                reason=reason,
                auto_applied=True
            )
            auto_applied.append(tx_info)
        else:
            # NEEDS REVIEW: Ask user
            needs_review.append(tx_info)

    return auto_applied, needs_review
```

### Step 6: Apply and Log

```python
def apply_category(tx_id, category_id):
    """Apply a category to a transaction."""
    response = requests.put(
        f"{BASE_URL}/budgets/{budget_id}/transactions/{tx_id}",
        headers=headers,
        json={"transaction": {"category_id": category_id}}
    )
    response.raise_for_status()
    return response.json()

def log_categorization(tx_id, payee, amount, old_cat, new_cat, confidence, reason, auto_applied):
    """Log a categorization change."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "skill": "ynab-categorize",
        "action": "categorize",
        "transaction_id": tx_id,
        "payee": payee,
        "amount": amount,
        "from_category": old_cat,
        "to_category": new_cat,
        "confidence": confidence,
        "reason": reason,
        "auto_applied": auto_applied,  # True = auto, False = user confirmed
        "user_confirmed": not auto_applied
    }

    log_file = LOG_DIR / "categorization.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
```

### Step 7: Report Results and Ask About Remaining

**Output format:**

```
Transaction Categorization
==========================

AUTO-APPLIED (>90% confidence):
  ✓ Amazon.com - $45.67 → Shopping (95%)
  ✓ Netflix - $15.99 → Subscriptions (100%)
  ✓ Shell Oil - $52.30 → Auto & Gas (92%)

NEEDS YOUR INPUT (≤90% confidence):

1. UBER *EATS - $23.45 (Jan 30)
   Best guess: Dining Out (73%)
   Other options:
     a) Dining Out (73% - 11 times)
     b) Transportation (27% - 4 times)
     c) Other category...

   Which category? [a/b/c]:

2. ACH TRANSFER XYZ - $500.00 (Feb 1)
   No history for this payee.
   Common categories:
     a) Income
     b) Transfer
     c) Reimbursement
     d) Other category...

   Which category? [a/b/c/d]:
```

## Presenting Options to User

When confidence ≤90%, present options like this:

```python
def present_options(tx_info, category_list):
    """Present category options to user."""
    print(f"\n{tx_info['payee']} - ${abs(tx_info['amount']):,.2f} ({tx_info['date']})")

    if tx_info['confidence'] > 0:
        print(f"   Best guess: {tx_info['best_category_name']} ({tx_info['confidence']*100:.0f}%)")
        print("   Options based on history:")

        # Show top categories from history
        options = []
        for i, (cat_id, count) in enumerate(tx_info['top_categories'].items()):
            cat_name = category_map[cat_id]["name"]
            options.append({"id": cat_id, "name": cat_name})
            letter = chr(ord('a') + i)
            print(f"     {letter}) {cat_name}")

        print(f"     {chr(ord('a') + len(options))}) Other category...")

    else:
        print("   No history for this payee.")
        print("   Suggested categories:")
        # Show common expense categories
        common = ["Groceries", "Dining Out", "Shopping", "Transportation", "Utilities"]
        options = [c for c in category_list if c["name"] in common]
        for i, cat in enumerate(options):
            letter = chr(ord('a') + i)
            print(f"     {letter}) {cat['name']}")
        print(f"     {chr(ord('a') + len(options))}) Other category...")

    return options
```

## Full Category Selection

When user selects "Other category", show the full list grouped:

```python
def show_full_category_list():
    """Show all categories grouped."""
    print("\nAll Categories:")
    print("-" * 40)

    current_group = None
    for cat in sorted(category_list, key=lambda c: (c["group"], c["name"])):
        if cat["group"] != current_group:
            current_group = cat["group"]
            print(f"\n{current_group}:")
        print(f"  • {cat['name']}")
```

## Edge Cases

### Transfers
Transactions with `transfer_account_id` are transfers between accounts. Skip these - they don't need categories.

### Split Transactions
If a transaction might need splitting (large Amazon orders, Costco runs), mention it:
```
This $234.56 Amazon transaction might contain multiple items.
Would you like to:
  a) Categorize as Shopping (whole amount)
  b) Split into multiple categories
```

### Credit Card Transactions
These work normally - YNAB automatically handles the credit card payment category adjustment when you categorize.

## Summary Output

At the end, show a summary:

```
Categorization Complete
=======================
Auto-applied: 5 transactions
User categorized: 3 transactions
Skipped: 0 transactions

All changes logged to ~/.ynab-logs/categorization.jsonl
```

## Important Notes

1. **>90% = auto-apply** - No confirmation needed, but always logged
2. **≤90% = ask user** - Present options based on payee history
3. **No history = ask user** - Show common categories
4. **Everything is logged** - Check `~/.ynab-logs/categorization.jsonl` for audit trail
5. **Confidence is based on payee history** - Same payee, same category pattern
