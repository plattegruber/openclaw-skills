# YNAB Skills for OpenClaw

A family of OpenClaw skills for managing your YNAB (You Need A Budget) through AI assistance.

## Skills Included

| Skill | Command | Description |
|-------|---------|-------------|
| `ynab` | (auto) | Core API reference - loaded automatically when other skills run |
| `ynab-config` | `/ynab-config` | **Start here!** Select budget, check account links, view status |
| `ynab-categorize` | `/ynab-categorize` | Categorize uncategorized transactions |
| `ynab-credit-cards` | `/ynab-credit-cards` | Check credit card payment readiness |
| `ynab-budget` | `/ynab-budget` | Adjust budget category amounts |
| `ynab-trends` | `/ynab-trends` | Analyze spending trends over time |

## Setup

### 1. Generate a YNAB Personal Access Token

1. Log in to [YNAB](https://app.ynab.com)
2. Go to **Account Settings** (click your email in the bottom left)
3. Scroll down to **Developer Settings**
4. Click **New Token**
5. Give it a name (e.g., "OpenClaw")
6. Copy the token (you won't see it again!)

### 2. Configure OpenClaw

Add your token to your OpenClaw configuration. Choose ONE of these methods:

#### Option A: Environment Variable (Recommended)

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export YNAB_API_TOKEN="your-token-here"
```

Then restart your terminal or run `source ~/.zshrc`.

#### Option B: OpenClaw Config File

Add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "ynab": {
        "apiKey": "your-token-here"
      }
    }
  }
}
```

### 3. Install Skills

Copy or symlink this skills directory to your OpenClaw skills folder:

```bash
# Option 1: Symlink (recommended for development)
ln -s /path/to/openclaw-skills/skills/ynab ~/.openclaw/skills/ynab
ln -s /path/to/openclaw-skills/skills/ynab-config ~/.openclaw/skills/ynab-config
ln -s /path/to/openclaw-skills/skills/ynab-categorize ~/.openclaw/skills/ynab-categorize
ln -s /path/to/openclaw-skills/skills/ynab-credit-cards ~/.openclaw/skills/ynab-credit-cards
ln -s /path/to/openclaw-skills/skills/ynab-budget ~/.openclaw/skills/ynab-budget
ln -s /path/to/openclaw-skills/skills/ynab-trends ~/.openclaw/skills/ynab-trends

# Option 2: Copy
cp -r /path/to/openclaw-skills/skills/* ~/.openclaw/skills/
```

### 4. Create Log Directory

The skills log all changes to `~/.ynab-logs/`:

```bash
mkdir -p ~/.ynab-logs/budget-snapshots ~/.ynab-logs/trends
```

## Usage

### First Time Setup

Run `/ynab-config` to select which budget to use:

```
/ynab-config        # Select budget and check account status
```

### Budget Management

Ask naturally about your budget selection:

- "What budget am I using?"
- "Switch to My New Budget"
- "List my budgets"
- "Check my account links"

### Daily Operations

```
/ynab-categorize    # Review and categorize uncategorized transactions
/ynab-credit-cards  # Check credit card payment status
/ynab-budget        # View or adjust your budget
/ynab-trends        # Analyze spending patterns
```

Or just ask naturally:

- "What transactions need to be categorized?"
- "How are my credit cards looking?"
- "Show me my grocery spending over the last 6 months"
- "Move $50 from Dining Out to Entertainment"

### Account Link Warnings

All skills automatically check for broken bank connections and will warn you:

```
⚠️  ACCOUNT LINK ALERT

The following accounts have broken bank connections:
  • Chase Checking - link needs reauthorization

Log in to YNAB (app.ynab.com) and click on each account to reconnect.
```

## Philosophy: Glacial Changes

These skills are designed to make **slow, deliberate changes** to your budget:

- **Never auto-modify** - All changes require your explicit confirmation
- **Log everything** - Full audit trail in `~/.ynab-logs/`
- **Show before/after** - Always displays current state before changes
- **Batch recommendations** - Collects suggestions for review, applies once
- **Weekly trends** - Analysis designed for weekly review, not daily noise

## Log Files

All activity is logged to `~/.ynab-logs/`:

```
~/.ynab-logs/
├── categorization.jsonl     # Transaction categorization history
├── credit-cards.jsonl       # Credit card status checks
├── budget-changes.jsonl     # Budget modifications
├── budget-snapshots/        # Point-in-time budget snapshots
├── trends/                  # Trend analysis cache
│   └── category-trends.json
├── payee-patterns.json      # Learned payee categorizations
└── sync-state.json          # API delta sync state
```

## API Rate Limits

YNAB allows **200 requests per hour**. These skills are designed to minimize API calls through:

- Delta sync (only fetch changed data)
- Caching of historical months
- Batching of operations

## Security

Your YNAB token has full access to your budget. Keep it secure:

- Never commit tokens to git
- Use environment variables, not command-line arguments
- The token is non-expiring - revoke it in YNAB if compromised
