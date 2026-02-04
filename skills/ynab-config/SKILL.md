---
name: ynab-config
description: Check YNAB status, select budget, view account link health, and manage YNAB settings
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB Configuration & Status

You are helping the user manage their YNAB configuration, including budget selection and account health monitoring.

## Common User Queries

Handle these queries:
- "What budget am I using?" / "Which budget?"
- "List my budgets" / "Show budgets"
- "Switch to [budget name]" / "Use [budget name]"
- "Check my accounts" / "Account status"
- "YNAB status" / "Check YNAB"

## Workflow

### Step 1: Initialize

```python
import requests
import json
import os
from pathlib import Path
from datetime import datetime

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

LOG_DIR = Path.home() / ".ynab-logs"
CONFIG_FILE = LOG_DIR / "config.json"
LOG_DIR.mkdir(exist_ok=True)

def load_config():
    """Load saved configuration."""
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}

def save_config(config):
    """Save configuration."""
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
```

### Step 2: Fetch Budgets

```python
def list_budgets():
    """Fetch all available budgets."""
    response = requests.get(
        f"{BASE_URL}/budgets",
        headers=headers
    )
    response.raise_for_status()
    budgets = response.json()["data"]["budgets"]

    # Sort by last modified, most recent first
    budgets.sort(key=lambda b: b.get("last_modified_on", ""), reverse=True)
    return budgets
```

### Step 3: Check Account Links

```python
def check_account_links(budget_id):
    """Check for accounts with broken bank connections."""
    response = requests.get(
        f"{BASE_URL}/budgets/{budget_id}/accounts",
        headers=headers
    )
    response.raise_for_status()
    accounts = response.json()["data"]["accounts"]

    results = {
        "healthy": [],
        "broken": [],
        "unlinked": []
    }

    for account in accounts:
        if account.get("deleted") or account.get("closed"):
            continue

        account_info = {
            "name": account["name"],
            "type": account["type"],
            "balance": account["balance"] / 1000,
            "last_reconciled": account.get("last_reconciled_at")
        }

        if account.get("direct_import_linked"):
            if account.get("direct_import_in_error"):
                results["broken"].append(account_info)
            else:
                results["healthy"].append(account_info)
        else:
            results["unlinked"].append(account_info)

    return results
```

## Response Templates

### "What budget am I using?"

```python
config = load_config()
budgets = list_budgets()

if "selected_budget" in config:
    selected = config["selected_budget"]
    print(f"Currently using: {selected['name']}")
    print(f"Selected on: {selected['selected_at'][:10]}")
    print()
    print("Other available budgets:")
    for b in budgets:
        if b["id"] != selected["id"]:
            print(f"  • {b['name']} (modified: {b['last_modified_on'][:10]})")
    print()
    print("Say 'switch to [name]' to change budgets.")
else:
    print("No budget selected yet!")
    print()
    print("Available budgets:")
    for i, b in enumerate(budgets, 1):
        print(f"  {i}. {b['name']} (modified: {b['last_modified_on'][:10]})")
    print()
    print("Which budget would you like to use?")
```

### "Switch to [budget name]"

```python
def switch_budget(target_name):
    """Switch to a different budget."""
    budgets = list_budgets()

    # Find matching budget (case-insensitive partial match)
    matches = [b for b in budgets if target_name.lower() in b["name"].lower()]

    if not matches:
        print(f"No budget found matching '{target_name}'")
        print("Available budgets:")
        for b in budgets:
            print(f"  • {b['name']}")
        return False

    if len(matches) > 1:
        print(f"Multiple budgets match '{target_name}':")
        for b in matches:
            print(f"  • {b['name']}")
        print("Please be more specific.")
        return False

    # Save selection
    budget = matches[0]
    config = load_config()
    config["selected_budget"] = {
        "id": budget["id"],
        "name": budget["name"],
        "selected_at": datetime.utcnow().isoformat() + "Z"
    }
    save_config(config)

    print(f"Switched to: {budget['name']}")
    return True
```

### "Check my accounts" / "Account status"

```python
def show_account_status():
    """Show account link status."""
    config = load_config()

    if "selected_budget" not in config:
        print("No budget selected. Use '/ynab-config' to select one first.")
        return

    budget_id = config["selected_budget"]["id"]
    budget_name = config["selected_budget"]["name"]

    print(f"Account Status for: {budget_name}")
    print("=" * 50)

    links = check_account_links(budget_id)

    if links["broken"]:
        print()
        print("⚠️  BROKEN LINKS (need reauthorization):")
        for acc in links["broken"]:
            print(f"  • {acc['name']} ({acc['type']})")
            if acc["last_reconciled"]:
                print(f"    Last reconciled: {acc['last_reconciled'][:10]}")
        print()
        print("  → Log in to app.ynab.com and click each account to reconnect")

    if links["healthy"]:
        print()
        print("✓ Linked accounts (working):")
        for acc in links["healthy"]:
            print(f"  • {acc['name']} - ${acc['balance']:,.2f}")

    if links["unlinked"]:
        print()
        print("○ Manual accounts (not linked):")
        for acc in links["unlinked"]:
            print(f"  • {acc['name']} - ${acc['balance']:,.2f}")
```

### "YNAB status" (full status check)

```python
def full_status():
    """Show complete YNAB status."""
    config = load_config()
    budgets = list_budgets()

    print("YNAB Status")
    print("=" * 50)

    # Budget selection
    if "selected_budget" in config:
        selected = config["selected_budget"]
        print(f"Active budget: {selected['name']}")
    else:
        print("Active budget: NOT SELECTED")
        print()
        print("Available budgets:")
        for b in budgets:
            print(f"  • {b['name']}")
        print()
        print("Select a budget to continue.")
        return

    # Account links
    print()
    links = check_account_links(selected["id"])

    if links["broken"]:
        print(f"⚠️  {len(links['broken'])} account(s) need reauthorization:")
        for acc in links["broken"]:
            print(f"   • {acc['name']}")
        print()
        print("   → Log in to app.ynab.com to fix")
    else:
        print(f"✓ All {len(links['healthy'])} linked accounts are working")

    # Quick stats
    print()
    print(f"Accounts: {len(links['healthy'])} linked, {len(links['unlinked'])} manual")
```

## Important Notes

1. **Budget selection persists** - Saved to `~/.ynab-logs/config.json`
2. **All other YNAB skills check this config** - They will prompt if no budget is selected
3. **Account link check is quick** - Only one API call
4. **Run this first** - Before using other YNAB skills, run `/ynab-config` to ensure setup is complete
