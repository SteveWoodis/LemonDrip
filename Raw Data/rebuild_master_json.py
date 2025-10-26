import pandas as pd
import json
from pathlib import Path

# File paths
files = {
    "EventInfo": "EventInfo.csv",
    "DrinkSales": "Drink Sales.csv",
    "EmployeeTracker": "Employee Tracker.csv",
    "AdditionalFees": "AdditionalFees.csv",
    "Discounts": "Discounts.csv",
    "EventRunnerFees": "Event Runner Fee.csv",
    "SupplyCosts": "SupplyCosts.csv",
    "TipTracker": "Tip Tracker.csv",
}

def load_csv(path):
    """Load CSV and replace NaN with None (-> null in JSON)."""
    try:
        df = pd.read_csv(path)
        df = df.where(pd.notnull(df), None)
        return df
    except Exception as e:
        print(f"⚠️ Error reading {path}: {e}")
        return pd.DataFrame()

def load_data_section(path):
    """Return list of dicts for sections like DrinkSales, Employees, etc."""
    df = load_csv(path)
    return {"Data": df.to_dict(orient="records")}

# --- 1️⃣ Event Info (flattened key/value pairs) ---
info_df = load_csv(files["EventInfo"])
event_info = None
if not info_df.empty:
    first_row = info_df.iloc[0].to_dict()
    event_info = {k: (None if pd.isna(v) or v == "" else v) for k, v in first_row.items()}
else:
    event_info = {}

# --- 2️⃣ Other Sections ---
event_data = {
    "EventID": 1,
    "EventInfo": event_info,
    "DrinkSales": load_data_section(files["DrinkSales"]),
    "EmployeeTracker": load_data_section(files["EmployeeTracker"]),
    "AdditionalFees": load_data_section(files["AdditionalFees"]),
    "Discounts": {
        "Data": load_csv(files["Discounts"]).to_dict(orient="records"),
        "Totals": {}
    },
    "SupplyCosts": load_data_section(files["SupplyCosts"]),
    "TipTracker": load_data_section(files["TipTracker"]),
    "EventRunnerFees": load_data_section(files["EventRunnerFees"])
}

# --- 3️⃣ Final Structure ---
master_json = {"Events": [event_data]}

# --- 4️⃣ Save pretty JSON ---
out_path = Path("Master_EventData_Full.json")
out_path.write_text(json.dumps(master_json, indent=2), encoding="utf-8")

print(f"✅ Rebuilt file saved as: {out_path.resolve()}")
