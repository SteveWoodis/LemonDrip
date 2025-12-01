# ========================================================
# LemonDrip Database Initialization Script (Full Version)
# Using Python's sqlite3
# Author: Steve Woodis / LemonDrip Project
# ========================================================

import sqlite3
import os
import json

DB_PATH = "./backend/data/lemonDrip.db"
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# --------------------------------------------------------
# Connect to database
# --------------------------------------------------------
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
conn.execute("PRAGMA foreign_keys = ON;")

# --------------------------------------------------------
# Schema Definition
# --------------------------------------------------------
schema = """
CREATE TABLE IF NOT EXISTS Companies (
    CompanyID      INTEGER PRIMARY KEY AUTOINCREMENT,
    CompanyName    TEXT NOT NULL,
    ContactName    TEXT,
    Phone          TEXT,
    Email          TEXT,
    Notes          TEXT
);

CREATE TABLE IF NOT EXISTS EventInfo (
    EventID          INTEGER PRIMARY KEY AUTOINCREMENT,
    CompanyID        INTEGER REFERENCES Companies(CompanyID) ON DELETE SET NULL,
    EventName        TEXT NOT NULL,
    EventType        TEXT,
    EventDate        TEXT,
    NumDays          INTEGER,
    Coordinator      TEXT,
    GrossSales       REAL,
    Returns          REAL,
    Discounts        REAL,
    NetSales         REAL,
    Tips             REAL,
    GiftCardSales    REAL,
    TotalSales       REAL,
    Cash             REAL,
    Card             REAL,
    Venmo            REAL,
    CashApp          REAL,
    Other            REAL,
    Notes            TEXT,
    Metadata         JSON
);

CREATE TABLE IF NOT EXISTS DrinkSales (
    DrinkID        INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    DrinkName      TEXT,
    CostPerDrink   REAL,
    QuantitySold   INTEGER,
    TotalCost      REAL,
    Category       TEXT,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS EmployeeTracker (
    EmployeeID     INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    EmployeeName   TEXT,
    Role           TEXT,
    HoursWorked    REAL,
    HourlyRate     REAL,
    TotalPay       REAL,
    TipsEarned     REAL,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS SupplyCosts (
    SupplyID       INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    ItemName       TEXT,
    QuantityUsed   REAL,
    UnitType       TEXT,
    UnitCost       REAL,
    TotalCost      REAL,
    Vendor         TEXT,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS AdditionalFees (
    FeeID          INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    FeeType        TEXT,
    Description    TEXT,
    Amount         REAL,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS Discounts (
    DiscountID     INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    DiscountType   TEXT,
    Amount         REAL,
    Description    TEXT,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS TipTracker (
    TipID          INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    Source         TEXT,
    Amount         REAL,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS EventPayments (
    PaymentID      INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID        INTEGER NOT NULL REFERENCES EventInfo(EventID) ON DELETE CASCADE,
    Method         TEXT,
    Amount         REAL,
    Metadata       JSON
);

CREATE TABLE IF NOT EXISTS FormTemplates (
    TemplateID     INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateName   TEXT NOT NULL,
    Fields         JSON NOT NULL,
    Version        TEXT,
    IsActive       INTEGER DEFAULT 0
);
"""
cur.executescript(schema)
print("✅ Database schema created successfully.")

# --------------------------------------------------------
# Seed Base Data
# --------------------------------------------------------
company = ("LemonDrip HQ", "Steve Woodis", "555-123-4567", "info@lemondrip.com", "Head office and test tenant")
cur.execute("""
    INSERT INTO Companies (CompanyName, ContactName, Phone, Email, Notes)
    VALUES (?, ?, ?, ?, ?)
""", company)
company_id = cur.lastrowid

event = (company_id, "Utah County Fair", "Mobile Event", "2025-08-12", 3, "Steve Woodis",
         4200.00, 0, 300.00, 3900.00, 350.00, 0, 4250.00,
         1200.00, 2700.00, 350.00, 0, 0, "Strong performance; added sugar-free line.",
         json.dumps({"weather": "Sunny"}))
cur.execute("""
    INSERT INTO EventInfo (CompanyID, EventName, EventType, EventDate, NumDays, Coordinator,
        GrossSales, Returns, Discounts, NetSales, Tips, GiftCardSales, TotalSales, Cash, Card,
        Venmo, CashApp, Other, Notes, Metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", event)
event_id = cur.lastrowid

# --------------------------------------------------------
# Drinks, Employees, Supplies
# --------------------------------------------------------
cur.executemany("""
    INSERT INTO DrinkSales (EventID, DrinkName, CostPerDrink, QuantitySold, TotalCost, Category)
    VALUES (?, ?, ?, ?, ?, ?)
""", [
    (event_id, "Regular Lemonade", 0.95, 300, 285.00, "Regular"),
    (event_id, "Blue Raspberry Lemonade", 1.14, 150, 171.00, "Flavored"),
    (event_id, "Sugar Free Peach Lemonade", 1.65, 80, 132.00, "Sugar Free")
])

cur.executemany("""
    INSERT INTO EmployeeTracker (EventID, EmployeeName, Role, HoursWorked, HourlyRate, TotalPay)
    VALUES (?, ?, ?, ?, ?, ?)
""", [
    (event_id, "Ava Lopez", "Cashier", 16, 15, 240.00),
    (event_id, "Noah Brown", "Server", 20, 15, 300.00)
])

cur.executemany("""
    INSERT INTO SupplyCosts (EventID, ItemName, QuantityUsed, UnitType, UnitCost, TotalCost, Vendor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
""", [
    (event_id, "Cups", 600, "units", 0.05, 30.00, "Utah Supplies Co"),
    (event_id, "Sugar", 20, "lbs", 0.80, 16.00, "SweetWorks"),
    (event_id, "Lemons", 100, "count", 0.25, 25.00, "Fresh Farms")
])

# --------------------------------------------------------
# Seed FormTemplates (for dynamic Add Event forms)
# --------------------------------------------------------
mobile_template_fields = [
    {"label": "Event Name", "type": "text", "required": True},
    {"label": "Event Date", "type": "date", "required": True},
    {"label": "Event Type", "type": "select", "options": ["Mobile Event", "Festival", "Private Party"]},
    {"label": "Coordinator", "type": "text"},
    {"label": "Gross Sales", "type": "number"},
    {"label": "Net Sales", "type": "number"},
    {"label": "Tips", "type": "number"},
    {"label": "Notes", "type": "textarea"}
]

kiosk_template_fields = [
    {"label": "Event Name", "type": "text", "required": True},
    {"label": "Event Date", "type": "date", "required": True},
    {"label": "Location", "type": "text"},
    {"label": "Shift Lead", "type": "text"},
    {"label": "Gross Sales", "type": "number"},
    {"label": "Net Sales", "type": "number"},
    {"label": "Gift Card Sales", "type": "number"},
    {"label": "Card", "type": "number"},
    {"label": "Cash", "type": "number"},
    {"label": "Venmo", "type": "number"},
    {"label": "Notes", "type": "textarea"}
]

templates = [
    ("Mobile Event Form", json.dumps(mobile_template_fields), "v1.0", 1),
    ("Kiosk Event Form", json.dumps(kiosk_template_fields), "v1.0", 0)
]

cur.executemany("""
    INSERT INTO FormTemplates (TemplateName, Fields, Version, IsActive)
    VALUES (?, ?, ?, ?)
""", templates)

conn.commit()
conn.close()

print(f"🍋 LemonDrip database initialized and saved at: {DB_PATH}")
print("✅ Includes FormTemplates for 'Mobile Event' and 'Kiosk Event'")
