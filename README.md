# OpenClaw Skills & Plugins

A collection of OpenClaw plugins and skills for extending AI assistant capabilities.

## Plugins

### YNAB Budget Manager

A comprehensive YNAB (You Need A Budget) integration plugin.

**Location:** `plugins/ynab-budget-manager/`

**Features:**
- List budgets and select which to use
- View accounts, transactions, categories, and monthly summaries
- Categorize transactions (optional, opt-in)
- Track credit card payment readiness
- Multiple review modes for transaction management
- Safety-first: write operations default to dry-run

**Quick Start:**

1. Generate a YNAB Personal Access Token at [app.ynab.com](https://app.ynab.com) → Account Settings → Developer Settings

2. Configure the plugin in `~/.openclaw/openclaw.json`:

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

3. Install and build:

```bash
cd plugins/ynab-budget-manager
npm install
npm run build
```

4. Use the skill:

```
/ynab-budget-manager

> What transactions need to be categorized?
> How are my credit cards looking?
> Show me my spending this month
```

See [plugins/ynab-budget-manager/README.md](plugins/ynab-budget-manager/README.md) for full documentation.

## Configuration

### Environment Variables

For sensitive values like API tokens, you can use environment variables:

```bash
export YNAB_API_TOKEN="your-token-here"
```

Then reference in config:

```json
{
  "plugins": {
    "entries": {
      "ynab-budget-manager": {
        "enabled": true,
        "config": {
          "ynabToken": "${YNAB_API_TOKEN}"
        }
      }
    }
  }
}
```

### State and Logs

Plugins store state in `~/.ynab-logs/` by default (configurable per plugin):

```
~/.ynab-logs/
└── state.json          # Plugin state (selected budget, sync state, etc.)
```

## Development

### Project Structure

```
├── plugins/
│   └── ynab-budget-manager/    # TypeScript plugin
│       ├── openclaw.plugin.json
│       ├── package.json
│       ├── tsconfig.json
│       ├── index.ts
│       ├── src/
│       │   ├── types.ts
│       │   ├── client.ts
│       │   ├── state.ts
│       │   ├── review.ts
│       │   ├── credit-cards.ts
│       │   ├── tools/
│       │   └── utils/
│       └── skills/
│           └── ynab-budget-manager/
│               └── SKILL.md
└── README.md
```

### Building Plugins

```bash
cd plugins/ynab-budget-manager
npm install
npm run build
```

### Testing

```bash
npm test
```

## Security

- Never commit API tokens to git
- Use environment variables for sensitive configuration
- Plugins that modify data default to dry-run mode
- Review plugin permissions before enabling write operations

## License

MIT
