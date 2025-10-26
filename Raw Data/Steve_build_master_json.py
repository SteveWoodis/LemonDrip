import pandas as pd
import json
import math
import os

# === CONFIG ===
# Change these if your filenames differ
EVENTINFO_FILE = "EventInfo.csv"
EMPLOYEETRACKER_FILE = "EmployeeTracker.csv"
DRINKSALES_FILE = "DrinkSales.csv"
SUPPLYCOSTS_FILE = "SupplyCosts.csv"
ADDITIONALFEES_FILE = "AdditionalFees.csv"
DISCOUNTS_FILE = "Discounts.csv"
EVENTRUNNERFEE_FILE = "EventRunnerFee.csv"
TIPTRACKER_FILE = "TipTracker.csv"
OUTPUT_FILE = "Master_EventData_Full.json"

# === HELPER FUNCTION ===
def clean_dataframe(df):
    """Replace NaN or empty strings with None for valid JSON nulls."""
    df = df.replace({math.nan: None})
    df = df.replace(r'^\s*$', None, regex=True)
    return df

# === LOAD CSV FILES ===
def load_csv_safe(filename):
    if os.path.exists(filename):
        print(f"✅ Loading {filename} ...")
        return pd.read_csv(filename)
    else:
        print(f"⚠️ Warning: {filename} not found. Using empty DataFrame.")
        return pd.DataFrame()

events = load_csv_safe(EVENTINFO_FILE)
employees = load_csv_safe(EMPLOYEES_FILE)
drinks = load_csv_safe(DRINKSALES_FILE)
supplies = load_csv_safe(SUPPLYCOSTS_FILE)
fees = load_csv_safe(ADDITIONALFEES_FILE)
discounts = load_csv_safe(DISCOUNTS_FILE)
runner = load_csv_safe(EVENTRUNNERFEE_FILE)
tips = load_csv_safe(TIPTRACKER_FILE)



# Clean data
employees = clean_dataframe(employees)
drinks = clean_dataframe(drinks)
fees = clean_dataframe(fees)
events = clean_dataframe(events)
NEEDTO FINISH THIS

# === BUILD MASTER STRUCTURE ===
master_data = {"Events": []}

if not events.empty:
    for i, row in events.iterrows():
        event_id = i + 1
        event_name = row.get("Event Name") or f"Event {event_id}"

        # Filter related rows from each CSV
        emp_data = employees[employees["Event Name"] == event_name].to_dict(orient="records") if "Event Name" in employees else []
        drink_data = drinks[drinks["Event Name"] == event_name].to_dict(orient="records") if "Event Name" in drinks else []
        fee_data = fees[fees["Event Name"] == event_name].to_dict(orient="records") if "Event Name" in fees else []

        # Build each event record
        event_entry = {
            "EventID": event_id,
            "EventName": event_name,
            "EventDate": row.get("Event Date"),
            "Location": row.get("Location"),
            "Employees": emp_data,
            "DrinksSold": drink_data,
            "AdditionalFees": fee_data
        }

        master_data["Events"].append(event_entry)

else:
    print("⚠️ No event info found. Master file will be empty.")

# === WRITE TO JSON FILE ===
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(master_data, f, indent=2, ensure_ascii=False)

print(f"\n🎉 Master JSON file created successfully: {OUTPUT_FILE}")
