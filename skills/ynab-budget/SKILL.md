---
name: ynab-budget
description: Adjust YNAB budget category amounts, move money between categories, and manage budget structure
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB Budget Manager

You are helping the user manage their YNAB budget categories, including adjusting budgeted amounts, moving money between categories, and understanding their budget state.

## Philosophy: Glacial Changes

**This skill modifies the user's actual budget.** Every change must be:
1. Clearly explained before execution
2. Explicitly confirmed by the user
3. Logged with full before/after state
4. Reversible (user can undo via the log)

## Workflow

### Step 1: Fetch Current Budget State

Always start by showing the current state:

```python
import requests
import json
import os
from datetime import datetime
from pathlib import Path

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

# Fetch current month's budget
response = requests.get(
    f"{BASE_URL}/budgets/last-used/months/current",
    headers=headers
)
response.raise_for_status()
month_data = response.json()["data"]["month"]

print(f"Budget for: {month_data['month']}")
print(f"To Be Budgeted: ${month_data['to_be_budgeted'] / 1000:,.2f}")
```

### Step 2: Display Categories

```python
def display_budget_summary(month_data):
    """Display a summary of the current budget."""
    categories = month_data.get("categories", [])

    # Group by category group
    groups = {}
    for cat in categories:
        if cat.get("deleted") or cat.get("hidden"):
            continue
        group_name = cat.get("category_group_name", "Uncategorized")
        if group_name not in groups:
            groups[group_name] = []
        groups[group_name].append(cat)

    output = []
    output.append(f"Budget Summary: {month_data['month']}")
    output.append("=" * 50)
    output.append(f"To Be Budgeted: ${month_data['to_be_budgeted'] / 1000:,.2f}")
    output.append("")

    for group_name, cats in groups.items():
        # Skip internal groups
        if group_name in ["Internal Master Category", "Credit Card Payments"]:
            continue

        output.append(f"\n{group_name}")
        output.append("-" * len(group_name))

        for cat in cats:
            budgeted = cat["budgeted"] / 1000
            activity = cat["activity"] / 1000
            available = cat["balance"] / 1000

            status = ""
            if available < 0:
                status = " [OVERSPENT]"
            elif available == 0 and budgeted > 0:
                status = " [SPENT]"

            output.append(
                f"  {cat['name']}: "
                f"Budgeted ${budgeted:,.2f} | "
                f"Spent ${abs(activity):,.2f} | "
                f"Available ${available:,.2f}{status}"
            )

    return "\n".join(output)
```

### Step 3: Create Snapshot Before Changes

**Always snapshot before any modification:**

```python
LOG_DIR = Path.home() / ".ynab-logs"
SNAPSHOTS_DIR = LOG_DIR / "budget-snapshots"
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def create_snapshot(month_data):
    """Create a snapshot of the current budget state."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    snapshot_file = SNAPSHOTS_DIR / f"{timestamp}.json"

    snapshot = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "month": month_data["month"],
        "to_be_budgeted": month_data["to_be_budgeted"],
        "categories": [
            {
                "id": cat["id"],
                "name": cat["name"],
                "group": cat.get("category_group_name"),
                "budgeted": cat["budgeted"],
                "activity": cat["activity"],
                "balance": cat["balance"]
            }
            for cat in month_data.get("categories", [])
            if not cat.get("deleted")
        ]
    }

    snapshot_file.write_text(json.dumps(snapshot, indent=2))
    return snapshot_file
```

### Step 4: Budget Operations

#### Adjust Category Budget

```python
def adjust_budget(category_id, new_amount_dollars, month="current"):
    """
    Adjust the budgeted amount for a category.

    Args:
        category_id: The category UUID
        new_amount_dollars: New budget amount in dollars (will convert to milliunits)
        month: Month to adjust (default: current)
    """
    new_amount_milliunits = int(new_amount_dollars * 1000)

    response = requests.patch(
        f"{BASE_URL}/budgets/last-used/months/{month}/categories/{category_id}",
        headers=headers,
        json={"category": {"budgeted": new_amount_milliunits}}
    )
    response.raise_for_status()
    return response.json()["data"]["category"]
```

#### Move Money Between Categories

Moving money is done by adjusting both categories:

```python
def move_money(from_category_id, to_category_id, amount_dollars, month="current"):
    """
    Move money from one category to another.

    This is a two-step operation:
    1. Reduce the source category budget
    2. Increase the destination category budget
    """
    amount_milliunits = int(amount_dollars * 1000)

    # Get current budgeted amounts
    from_cat = requests.get(
        f"{BASE_URL}/budgets/last-used/months/{month}/categories/{from_category_id}",
        headers=headers
    ).json()["data"]["category"]

    to_cat = requests.get(
        f"{BASE_URL}/budgets/last-used/months/{month}/categories/{to_category_id}",
        headers=headers
    ).json()["data"]["category"]

    from_current = from_cat["budgeted"]
    to_current = to_cat["budgeted"]

    # Check if source has enough
    if from_cat["balance"] < amount_milliunits:
        raise ValueError(
            f"Cannot move ${amount_dollars:.2f} - "
            f"only ${from_cat['balance']/1000:.2f} available in source category"
        )

    # Apply changes
    requests.patch(
        f"{BASE_URL}/budgets/last-used/months/{month}/categories/{from_category_id}",
        headers=headers,
        json={"category": {"budgeted": from_current - amount_milliunits}}
    ).raise_for_status()

    requests.patch(
        f"{BASE_URL}/budgets/last-used/months/{month}/categories/{to_category_id}",
        headers=headers,
        json={"category": {"budgeted": to_current + amount_milliunits}}
    ).raise_for_status()

    return {
        "from": from_cat["name"],
        "to": to_cat["name"],
        "amount": amount_dollars
    }
```

#### Update Category Properties

```python
def update_category(category_id, name=None, note=None, goal_target=None):
    """Update category properties (not monthly budget, but the category itself)."""
    updates = {}
    if name:
        updates["name"] = name
    if note is not None:  # Allow empty string to clear
        updates["note"] = note
    if goal_target is not None:
        updates["goal_target"] = int(goal_target * 1000)

    if not updates:
        return None

    response = requests.patch(
        f"{BASE_URL}/budgets/last-used/categories/{category_id}",
        headers=headers,
        json={"category": updates}
    )
    response.raise_for_status()
    return response.json()["data"]["category"]
```

### Step 5: Log All Changes

```python
def log_budget_change(action, details, before_state, after_state, reason):
    """Log a budget change."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "skill": "ynab-budget",
        "action": action,
        "details": details,
        "before": before_state,
        "after": after_state,
        "reason": reason,
        "user_confirmed": True
    }

    log_file = LOG_DIR / "budget-changes.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
```

## User Interaction Flow

### Example: Adjust a Category

```
User: I want to increase my grocery budget by $100
Assistant: Let me check your current Groceries budget first.

[Fetches current month data]
[Displays: Groceries - Budgeted $400.00 | Spent $250.00 | Available $150.00]

Current state:
- Groceries: $400.00 budgeted
- You want to add: $100.00
- New total: $500.00

Source of funds needed. Options:
a) Use "To Be Budgeted" (currently $200.00 available)
b) Move from another category

User: Use To Be Budgeted
Assistant: I'll increase your Groceries budget from $400 to $500.

[Creates snapshot: ~/.ynab-logs/budget-snapshots/2026-02-03_103045.json]
[Applies change via API]
[Logs to ~/.ynab-logs/budget-changes.jsonl]

Done! Groceries budget increased by $100.
- Before: $400.00
- After: $500.00
- To Be Budgeted remaining: $100.00
```

### Example: Move Money

```
User: Move $50 from Dining Out to Entertainment
Assistant: I'll move $50 from Dining Out to Entertainment.

Current state:
- Dining Out: Available $75.00
- Entertainment: Available $25.00

After move:
- Dining Out: Available $25.00
- Entertainment: Available $75.00

Confirm? (y/n)

User: y

[Creates snapshot, applies changes, logs]

Done! Moved $50 from Dining Out to Entertainment.
```

## Important Rules

1. **Always show current state** before proposing any change
2. **Always confirm** before executing any modification
3. **Always snapshot** before making changes
4. **Always log** every change with before/after state
5. **Never batch changes silently** - each change should be explicit

## Supported Operations

| Operation | Description |
|-----------|-------------|
| View budget | Display current month's budget summary |
| Adjust amount | Change budgeted amount for a category |
| Move money | Transfer available funds between categories |
| Rename category | Update a category's name |
| Add note | Add or update a category note |
| Set goal | Update a category's goal target |

## Limitations

- Cannot create new categories (YNAB API limitation)
- Cannot delete categories (YNAB API limitation)
- Cannot move categories between groups (YNAB API limitation)
- Changes to past months may affect "Available" calculations
