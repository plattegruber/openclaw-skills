---
name: ynab-trends
description: Analyze YNAB spending trends, month-over-month comparisons, and budget performance
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["YNAB_API_TOKEN"]}, "primaryEnv": "YNAB_API_TOKEN"}}
---

# YNAB Trends Analyzer

You are helping the user understand their spending patterns and budget performance over time. This skill is **read-only** and focuses on analysis and insights.

## Philosophy: Glacial Awareness

This skill supports the "glacial changes" philosophy by:
1. Building historical context before making recommendations
2. Identifying patterns over weeks/months, not days
3. Flagging only statistically significant changes
4. Storing trend data locally to reduce API calls

## Workflow

### Step 1: Fetch Historical Months

```python
import requests
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

YNAB_API_TOKEN = os.environ["YNAB_API_TOKEN"]
BASE_URL = "https://api.ynab.com/v1"
headers = {"Authorization": f"Bearer {YNAB_API_TOKEN}"}

LOG_DIR = Path.home() / ".ynab-logs"
TRENDS_DIR = LOG_DIR / "trends"
TRENDS_DIR.mkdir(parents=True, exist_ok=True)

# Fetch all months
response = requests.get(
    f"{BASE_URL}/budgets/last-used/months",
    headers=headers
)
response.raise_for_status()
months = response.json()["data"]["months"]

# Get last 12 months of data
recent_months = sorted(months, key=lambda m: m["month"], reverse=True)[:12]
print(f"Analyzing {len(recent_months)} months of data")
```

### Step 2: Fetch Detailed Month Data

```python
def fetch_month_details(month_date):
    """Fetch detailed category data for a specific month."""
    response = requests.get(
        f"{BASE_URL}/budgets/last-used/months/{month_date}",
        headers=headers
    )
    response.raise_for_status()
    return response.json()["data"]["month"]

# Cache month data locally
def get_or_fetch_month(month_date):
    """Get month data from cache or fetch from API."""
    cache_file = TRENDS_DIR / f"monthly-summary-{month_date[:7]}.json"

    # Use cache if month is complete (not current month)
    current_month = datetime.now().strftime("%Y-%m")
    if month_date[:7] != current_month and cache_file.exists():
        return json.loads(cache_file.read_text())

    # Fetch fresh data
    month_data = fetch_month_details(month_date)

    # Cache if not current month
    if month_date[:7] != current_month:
        cache_file.write_text(json.dumps(month_data, indent=2))

    return month_data
```

### Step 3: Build Category Trends

```python
def build_category_trends(months_data):
    """Build spending trends by category."""
    trends = defaultdict(lambda: {
        "months": [],
        "amounts": [],
        "budgeted": []
    })

    for month_data in months_data:
        month = month_data["month"][:7]  # YYYY-MM

        for cat in month_data.get("categories", []):
            if cat.get("deleted") or cat.get("hidden"):
                continue

            name = cat["name"]
            # Activity is negative for spending
            spent = abs(cat.get("activity", 0)) / 1000
            budgeted = cat.get("budgeted", 0) / 1000

            trends[name]["months"].append(month)
            trends[name]["amounts"].append(spent)
            trends[name]["budgeted"].append(budgeted)

    return dict(trends)

def calculate_stats(amounts):
    """Calculate basic statistics for a list of amounts."""
    if not amounts:
        return {"avg": 0, "min": 0, "max": 0, "total": 0}

    return {
        "avg": sum(amounts) / len(amounts),
        "min": min(amounts),
        "max": max(amounts),
        "total": sum(amounts),
        "count": len(amounts)
    }
```

### Step 4: Detect Anomalies

```python
def detect_anomalies(trends, current_month_data):
    """Detect spending anomalies compared to historical patterns."""
    anomalies = []

    for cat in current_month_data.get("categories", []):
        if cat.get("deleted") or cat.get("hidden"):
            continue

        name = cat["name"]
        current_spent = abs(cat.get("activity", 0)) / 1000

        if name not in trends or len(trends[name]["amounts"]) < 3:
            continue  # Not enough history

        historical = trends[name]["amounts"][:-1]  # Exclude current
        stats = calculate_stats(historical)

        if stats["avg"] == 0:
            continue

        # Calculate percentage difference from average
        pct_diff = ((current_spent - stats["avg"]) / stats["avg"]) * 100

        # Flag significant deviations (>25% above or below average)
        if abs(pct_diff) > 25:
            anomalies.append({
                "category": name,
                "current": current_spent,
                "average": stats["avg"],
                "difference_pct": pct_diff,
                "direction": "above" if pct_diff > 0 else "below"
            })

    return sorted(anomalies, key=lambda x: abs(x["difference_pct"]), reverse=True)
```

### Step 5: Generate Trend Report

```python
def generate_trend_report(trends, anomalies, months_analyzed):
    """Generate a human-readable trend report."""
    report = []
    report.append(f"Spending Trends Report ({months_analyzed} months analyzed)")
    report.append("=" * 50)
    report.append("")

    # Top spending categories
    report.append("TOP SPENDING CATEGORIES (by average)")
    report.append("-" * 40)

    category_avgs = []
    for name, data in trends.items():
        stats = calculate_stats(data["amounts"])
        if stats["avg"] > 0:
            category_avgs.append((name, stats["avg"], stats))

    category_avgs.sort(key=lambda x: x[1], reverse=True)

    for name, avg, stats in category_avgs[:10]:
        report.append(f"  {name}: ${avg:,.2f}/mo (range: ${stats['min']:,.2f} - ${stats['max']:,.2f})")

    report.append("")

    # Anomalies
    if anomalies:
        report.append("NOTABLE CHANGES THIS MONTH")
        report.append("-" * 40)

        for a in anomalies[:5]:
            direction = "UP" if a["direction"] == "above" else "DOWN"
            report.append(
                f"  {a['category']}: ${a['current']:,.2f} "
                f"({direction} {abs(a['difference_pct']):.0f}% from ${a['average']:,.2f} avg)"
            )

        report.append("")

    # Trend directions
    report.append("TRENDING CATEGORIES")
    report.append("-" * 40)

    for name, data in trends.items():
        if len(data["amounts"]) >= 3:
            recent_3 = data["amounts"][-3:]
            if all(recent_3[i] < recent_3[i+1] for i in range(len(recent_3)-1)):
                report.append(f"  {name}: INCREASING (3 months)")
            elif all(recent_3[i] > recent_3[i+1] for i in range(len(recent_3)-1)):
                report.append(f"  {name}: DECREASING (3 months)")

    return "\n".join(report)
```

### Step 6: Store Trend Analysis

```python
def save_trend_analysis(trends, anomalies):
    """Save trend analysis for future reference."""
    analysis = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "trends": {
            name: {
                "average": calculate_stats(data["amounts"])["avg"],
                "months_analyzed": len(data["amounts"]),
                "last_updated": datetime.utcnow().isoformat() + "Z"
            }
            for name, data in trends.items()
        },
        "anomalies": anomalies
    }

    trends_file = TRENDS_DIR / "category-trends.json"
    trends_file.write_text(json.dumps(analysis, indent=2))

    return trends_file
```

## Sample Output

```
Spending Trends Report (12 months analyzed)
==================================================

TOP SPENDING CATEGORIES (by average)
----------------------------------------
  Mortgage: $2,150.00/mo (range: $2,150.00 - $2,150.00)
  Groceries: $487.50/mo (range: $412.00 - $567.00)
  Auto & Transport: $325.00/mo (range: $180.00 - $520.00)
  Utilities: $245.00/mo (range: $180.00 - $340.00)
  Dining Out: $198.00/mo (range: $120.00 - $310.00)

NOTABLE CHANGES THIS MONTH
----------------------------------------
  Dining Out: $310.00 (UP 57% from $198.00 avg)
  Groceries: $567.00 (UP 16% from $487.50 avg)
  Entertainment: $45.00 (DOWN 55% from $100.00 avg)

TRENDING CATEGORIES
----------------------------------------
  Subscriptions: INCREASING (3 months)
  Gas: DECREASING (3 months)
```

## Insights to Provide

When analyzing trends, look for:

1. **Seasonal patterns**: Higher utility bills in summer/winter
2. **Lifestyle creep**: Gradually increasing spending in discretionary categories
3. **New recurring charges**: Subscriptions that appeared recently
4. **Budget accuracy**: Categories consistently over/under budget
5. **Opportunities**: Categories with declining spend that could fund goals

## Recommendations

Based on trends, suggest:

- Categories where budget could be reduced (consistently under)
- Categories needing more budget (consistently over)
- Spending that may need attention (unusual increases)
- Positive trends to acknowledge (successful reductions)

## Important Notes

1. **This skill is read-only** - It only analyzes, never modifies
2. **Caches historical data** - Past months don't change, so cache them
3. **Run weekly** - Daily analysis is noise; weekly shows real patterns
4. **12-month context** - Use full year to account for seasonal variation
5. **Log analyses** - Track when reports were run for consistency
