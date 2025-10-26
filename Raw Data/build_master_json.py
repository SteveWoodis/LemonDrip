import pandas as pd
import json
import math
import os
from pathlib import Path

# -------------------------------------------------------------------
# CONFIGURATION
# -------------------------------------------------------------------
DATA_DIR = Path(".")
OUTPUT_FILE = "Master_EventData_Full.json"

FILES = {
    "events": "EventInfo.csv",
    "employees": "EmployeeTracker.csv",
    "drinks": "DrinkSales.csv",
    "fees": "AdditionalFees.csv",
    "discounts": "Discounts.csv",
    "supplies": "SupplyCost.csv",
    "runners": "EventRunnerFee.csv",
    "tips": "TipTracker.csv",
}

# -------------------------------------------------------------------
# HELPER FUNCTIONS
# -------------------------------------------------------------------

def load_csv(name):
    """Safely load CSVs and trim whitespace."""
    file_path = DATA_DIR / FILES[name]
    if not file_path.exists():
        print(f"⚠️ {FILES[name]} not found.")
        return pd.DataFrame()
    df = pd.read_csv(file_path)
    df.columns = [c.strip() for c in df.columns]
    print(f"✅ Loaded {FILES[name]} ({len(df)} rows)")
    return df.replace({math.nan: None})


def find_event_column(df):
    """Find the event-identifying column name."""
    if df.empty:
        return None
    candidates = [
        "Event Name", "Event", "Type of Event", "Event Title", "Event_Name",
        "EventTitle", "Event Description"
    ]
    for col in df.columns:
        for cand in candidates:
            if col.strip().lower() == cand.strip().lower():
                return col
    for col in df.columns:
        if "event" in col.lower():
            return col
    return None


def match_event_rows(df, col, event_name):
    """Return all rows from df that match a given event name."""
    if df.empty or col is None or col not in df.columns:
        return []
    subset = df[df[col] == event_name]
    return subset.to_dict(orient="records")


# -------------------------------------------------------------------
# LOAD ALL CSV FILES
# -------------------------------------------------------------------
events = load_csv("events")
employees = load_csv("employees")
drinks = load_csv("drinks")
fees = load_csv("fees")
discounts = load_csv("discounts")
supplies = load_csv("supplies")
runners = load_csv("runners")
tips = load_csv("tips")

# -------------------------------------------------------------------
# DETECT EVENT COLUMN NAMES
# -------------------------------------------------------------------
col_events = find_event_column(events)
col_employees = find_event_column(employees)
col_drinks = find_event_column(drinks)
col_fees = find_event_column(fees)
col_discounts = find_event_column(discounts)
col_supplies = find_event_column(supplies)
col_runners = find_event_column(runners)
col_tips = find_event_column(tips)

print("\n📋 Event column mapping:")
print(f"EventInfo: {col_events}")
print(f"Employees: {col_employees}")
print(f"Drinks: {col_drinks}")
print(f"Additional Fees: {col_fees}")
print(f"Discounts: {col_discounts}")
print(f"Supply Cost: {col_supplies}")
print(f"Event Runner Fee: {col_runners}")
print(f"Tip Tracker: {col_tips}")

# -------------------------------------------------------------------
# SMART HEADER TRANSLATION for EventInfo.csv
# -------------------------------------------------------------------
header_map = {
    "Type of Event": "Event Name",
    "Event Dates": "Event Date",
    "Number of Days for Event": "Days",
    "Event Color": "Color",
    "Event Coordinator": "Coordinator",
}

events.rename(columns={k: v for k, v in header_map.items() if k in events.columns}, inplace=True)

# Re-detect in case headers changed
col_events = find_event_column(events)

# -------------------------------------------------------------------
# BUILD MASTER JSON STRUCTURE
# -------------------------------------------------------------------
master = {"Events": []}

if not events.empty and col_events:
    for i, row in events.iterrows():
        event_id = i + 1
        cell_value = events.iloc[i][col_events]
if isinstance(cell_value, (list, pd.Series)):
    cell_value = cell_value.iloc[0] if len(cell_value) > 0 else None
event_name = str(cell_value) if pd.notna(cell_value) else f"Event {event_id}"

print(f"Processing event: {event_name}") 

# Build dictionary of all columns dynamically
event_details = row.to_dict()
event_details = {k: (None if pd.isna(v) else v) for k, v in event_details.items()}

entry = {
    "EventID": event_id,
    **event_details,  # merge all columns from EventInfo
    "Employees": match_event_rows(employees, col_employees, event_name),
    "DrinksSold": match_event_rows(drinks, col_drinks, event_name),
    "SupplyCost": match_event_rows(supplies, col_supplies, event_name),
    "AdditionalFees": match_event_rows(fees, col_fees, event_name),
    "Discounts": match_event_rows(discounts, col_discounts, event_name),
    "EventRunnerFees": match_event_rows(runners, col_runners, event_name),
    "TipTracker": match_event_rows(tips, col_tips, event_name),
}


master["Events"].append(entry)


# -------------------------------------------------------------------
# WRITE FINAL JSON
# -------------------------------------------------------------------
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(master, f, indent=2, ensure_ascii=False)

print(f"\n🎉 Successfully built {OUTPUT_FILE}")
