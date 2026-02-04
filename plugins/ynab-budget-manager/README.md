# YNAB Budget Manager Plugin

A TypeScript OpenClaw plugin for managing your YNAB (You Need A Budget) through AI assistance.

## Features

- **Read Tools**: List budgets, view accounts, transactions, categories, and monthly summaries
- **Write Tools** (optional): Categorize transactions, add memos, set flags
- **Escape Hatch** (optional): Raw API access for advanced operations
- **Multi-Budget Support**: Select and switch between budgets
- **Credit Card Analysis**: Track payment readiness and identify shortfalls
- **Review Modes**: Multiple ways to identify transactions needing attention
- **Safety First**: All write operations default to dry-run mode

## Installation

### 1. Generate a YNAB Personal Access Token

1. Log in to [YNAB](https://app.ynab.com)
2. Go to **Account Settings** (click your email in the bottom left)
3. Scroll down to **Developer Settings**
4. Click **New Token**
5. Give it a name (e.g., "OpenClaw")
6. Copy the token (you won't see it again!)

### 2. Configure the Plugin

Add to your OpenClaw configuration (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "ynab-budget-manager": {
        "enabled": true,
        "config": {
          "ynabToken": "your-token-here",
          "writeToolsEnabled": true
        }
      }
    }
  }
}
```

### 3. Install the Plugin

```bash
# From the plugin directory
npm install
npm run build

# Link to OpenClaw plugins directory
ln -s /path/to/ynab-budget-manager ~/.openclaw/plugins/ynab-budget-manager
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ynabToken` | string | *required* | YNAB Personal Access Token |
| `budgetId` | string | (prompt) | Default budget ID (prompts if not set) |
| `reviewMode` | string | `uncategorizedOnly` | How to detect transactions needing review |
| `syncLookbackDays` | number | `30` | Days to look back when fetching transactions |
| `statePath` | string | `~/.ynab-logs` | Path for state and log files |
| `writeToolsEnabled` | boolean | `false` | Enable write tools |
| `escapeHatchEnabled` | boolean | `false` | Enable raw API tool |
| `catchAllCategories` | string[] | `[]` | Categories to treat as "needs review" |
| `reviewFlags` | string[] | `["orange"]` | Flag colors that indicate review needed |

### Review Modes

- **uncategorizedOnly**: Only flag transactions with no category
- **categoryAllowlistBlocklist**: Flag transactions in catch-all categories
- **flagBased**: Flag transactions with specific flag colors

## Available Tools

### Read Tools (Always Available)

| Tool | Description |
|------|-------------|
| `ynab_list_budgets` | List all budgets, show which is selected |
| `ynab_get_accounts` | Get accounts with balances and bank link status |
| `ynab_get_recent_transactions` | Fetch transactions with filtering |
| `ynab_get_categories` | Get categories grouped by category group |
| `ynab_get_month_summary` | Get monthly budget totals |

### Write Tools (Requires `writeToolsEnabled: true`)

| Tool | Description |
|------|-------------|
| `ynab_set_transaction_category` | Categorize a transaction |
| `ynab_add_transaction_memo` | Add/update transaction memo |
| `ynab_set_transaction_flag` | Set/clear flag color |

All write tools default to `dryRun: true`. Set `dryRun: false` to apply changes.

### Escape Hatch (Requires `escapeHatchEnabled: true`)

| Tool | Description |
|------|-------------|
| `ynab_api_request` | Make raw API requests |

Some dangerous operations (DELETE, bulk updates) are blocked for safety.

## Usage Examples

### Basic Usage

```
/ynab-budget-manager

> What transactions need to be categorized?
> How are my credit cards looking?
> Show me my spending this month
> List my budgets
```

### Categorizing Transactions

```
> Categorize my uncategorized transactions

Found 3 uncategorized transactions:
1. Amazon.com - $45.67 (Jan 30)
2. Shell Gas - $52.30 (Jan 29)
3. Unknown Merchant - $12.00 (Jan 28)

Would you like me to categorize these?
```

### Credit Card Health

```
> Check my credit card status

Credit Card Status Report
========================================

[OK] Chase Sapphire
    Balance: $1,234.56
    Payment Available: $1,234.56
    Status: Ready to pay in full

[!!] Amex Gold
    Balance: $567.89
    Payment Available: $500.00
    SHORTFALL: $67.89
    Action: Need to cover overspending
```

## State Files

The plugin stores state in `~/.ynab-logs/` (configurable):

```
~/.ynab-logs/
└── state.json          # Selected budget, sync state, pending review
```

## API Rate Limits

YNAB allows **200 requests per hour**. The plugin:
- Tracks rate limit usage
- Warns when getting low on requests
- Uses efficient API calls where possible

## Security

- Tokens are never logged or displayed
- Write operations require explicit opt-in
- Dangerous API operations are blocked
- All changes default to dry-run preview

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
