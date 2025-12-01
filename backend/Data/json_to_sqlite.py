
import json
import sqlite3
import sys
import os

def create_tables(conn):
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON;")

    cur.execute('''CREATE TABLE IF NOT EXISTS EventInfo (
        EventID INTEGER PRIMARY KEY,
        EventName TEXT,
        EventDate TEXT,
        EventColor TEXT,
        Coordinator TEXT,
        Status TEXT,
        Location TEXT,
        Notes TEXT
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS DrinkSales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        DrinkName TEXT,
        CostPerDrink REAL,
        QuantitySold INTEGER,
        TotalCost REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS EmployeeTracker (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Employee TEXT,
        HoursWorked REAL,
        HourlyRate REAL,
        TotalPay REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS AdditionalFees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Description TEXT,
        Category TEXT,
        Amount REAL,
        Notes TEXT,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS Discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Type TEXT,
        Description TEXT,
        Amount REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS SupplyCosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Item TEXT,
        Quantity INTEGER,
        Cost REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS TipTracker (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Employee TEXT,
        TipAmount REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    cur.execute('''CREATE TABLE IF NOT EXISTS EventRunnerFees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        EventID INTEGER,
        Runner TEXT,
        Fee REAL,
        FOREIGN KEY(EventID) REFERENCES EventInfo(EventID)
    )''')

    conn.commit()

def clear_existing_event(conn, event_id):
    cur = conn.cursor()
    tables = ["DrinkSales", "EmployeeTracker", "AdditionalFees", "Discounts",
              "SupplyCosts", "TipTracker", "EventRunnerFees", "EventInfo"]
    for table in tables:
        cur.execute(f"DELETE FROM {table} WHERE EventID = ?", (event_id,))
    conn.commit()

def insert_data(conn, data):
    cur = conn.cursor()

    for event in data.get("Events", []):
        event_id = event["EventID"]
        info = event["EventInfo"]
        clear_existing_event(conn, event_id)

        cur.execute('''INSERT INTO EventInfo (EventID, EventName, EventDate, EventColor,
                        Coordinator, Status, Location, Notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                    (event_id,
                     info.get("Event Name"),
                     info.get("Event Date"),
                     info.get("Event Color"),
                     info.get("Coordinator"),
                     info.get("Status"),
                     info.get("Location"),
                     info.get("Notes")))

        for sale in event.get("DrinkSales", []):
            cur.execute('''INSERT INTO DrinkSales (EventID, DrinkName, CostPerDrink, QuantitySold, TotalCost)
                           VALUES (?, ?, ?, ?, ?)''',
                        (event_id, sale.get("Drink Name"), sale.get("Cost Per Drink"),
                         sale.get("Quantity Sold"), sale.get("Total Cost")))

        for emp in event.get("EmployeeTracker", []):
            cur.execute('''INSERT INTO EmployeeTracker (EventID, Employee, HoursWorked, HourlyRate, TotalPay)
                           VALUES (?, ?, ?, ?, ?)''',
                        (event_id, emp.get("Employee"), emp.get("Hours Worked"),
                         emp.get("Hourly Rate"), emp.get("Total Pay")))

        for fee in event.get("AdditionalFees", []):
            cur.execute('''INSERT INTO AdditionalFees (EventID, Description, Category, Amount, Notes)
                           VALUES (?, ?, ?, ?, ?)''',
                        (event_id, fee.get("Description"), fee.get("Category"),
                         fee.get("Amount"), fee.get("Notes")))

        for disc in event.get("Discounts", []):
            cur.execute('''INSERT INTO Discounts (EventID, Type, Description, Amount)
                           VALUES (?, ?, ?, ?)''',
                        (event_id, disc.get("Type"), disc.get("Description"), disc.get("Amount")))

        for supply in event.get("SupplyCosts", []):
            cur.execute('''INSERT INTO SupplyCosts (EventID, Item, Quantity, Cost)
                           VALUES (?, ?, ?, ?)''',
                        (event_id, supply.get("Item"), supply.get("Quantity"), supply.get("Cost")))

        for tip in event.get("TipTracker", []):
            cur.execute('''INSERT INTO TipTracker (EventID, Employee, TipAmount)
                           VALUES (?, ?, ?)''',
                        (event_id, tip.get("Employee"), tip.get("Tip Amount")))

        for run in event.get("EventRunnerFees", []):
            cur.execute('''INSERT INTO EventRunnerFees (EventID, Runner, Fee)
                           VALUES (?, ?, ?)''',
                        (event_id, run.get("Runner"), run.get("Fee")))

    conn.commit()

def main():
    if len(sys.argv) != 2:
        print("Usage: python json_to_sqlite.py <path_to_json_file>")
        sys.exit(1)

    json_file = sys.argv[1]
    if not os.path.exists(json_file):
        print(f"Error: File '{json_file}' not found.")
        sys.exit(1)

    with open(json_file, "r") as f:
        data = json.load(f)

    conn = sqlite3.connect("sandbox_events.db")
    create_tables(conn)
    insert_data(conn, data)
    conn.close()

    print("✅ Database 'sandbox_events.db' created and populated successfully.")

if __name__ == "__main__":
    main()
