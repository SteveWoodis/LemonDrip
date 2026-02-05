// ===============================================
// LemonDrip Database Initialization Script
// Using better-sqlite3 (synchronous, fast, reliable)
// Author: Steve Woodis / LemonDrip Project
// ===============================================

import Database from 'better-sqlite3';
import fs from 'fs';

const DB_PATH = './backend/data/lemonDrip.db';

// Ensure directory exists
fs.mkdirSync('./backend/data', { recursive: true });

// Initialize DB connection
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ================================
// TABLE CREATION
// ================================

const schema = `

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

`;

db.exec(schema);
console.log('✅ Database schema created successfully.');

// ================================
// SEED SAMPLE DATA
// ================================

const insertCompany = db.prepare(`
  INSERT INTO Companies (CompanyName, ContactName, Phone, Email, Notes)
  VALUES (@CompanyName, @ContactName, @Phone, @Email, @Notes)
`);

const insertEvent = db.prepare(`
  INSERT INTO EventInfo (CompanyID, EventName, EventType, EventDate, NumDays, Coordinator,
    GrossSales, NetSales, Tips, TotalSales, Cash, Card, Venmo, Notes)
  VALUES (@CompanyID, @EventName, @EventType, @EventDate, @NumDays, @Coordinator,
    @GrossSales, @NetSales, @Tips, @TotalSales, @Cash, @Card, @Venmo, @Notes)
`);

const insertDrink = db.prepare(`
  INSERT INTO DrinkSales (EventID, DrinkName, CostPerDrink, QuantitySold, TotalCost, Category)
  VALUES (@EventID, @DrinkName, @CostPerDrink, @QuantitySold, @TotalCost, @Category)
`);

const insertEmployee = db.prepare(`
  INSERT INTO EmployeeTracker (EventID, EmployeeName, Role, HoursWorked, HourlyRate, TotalPay)
  VALUES (@EventID, @EmployeeName, @Role, @HoursWorked, @HourlyRate, @TotalPay)
`);

const insertSupply = db.prepare(`
  INSERT INTO SupplyCosts (EventID, ItemName, QuantityUsed, UnitType, UnitCost, TotalCost, Vendor)
  VALUES (@EventID, @ItemName, @QuantityUsed, @UnitType, @UnitCost, @TotalCost, @Vendor)
`);

// Transaction to seed all at once
const seed = db.transaction(() => {
  const company = {
    CompanyName: 'LemonDrip HQ',
    ContactName: 'Steve Woodis',
    Phone: '555-123-4567',
    Email: 'info@lemondrip.com',
    Notes: 'Head office and testing tenant'
  };
  const { lastInsertRowid: companyId } = insertCompany.run(company);

  const event = {
    CompanyID: companyId,
    EventName: 'Utah County Fair',
    EventType: 'Mobile Event',
    EventDate: '2025-08-12',
    NumDays: 3,
    Coordinator: 'Steve Woodis',
    GrossSales: 4200.00,
    NetSales: 3900.00,
    Tips: 350.00,
    TotalSales: 4250.00,
    Cash: 1200.00,
    Card: 2700.00,
    Venmo: 350.00,
    Notes: 'Strong performance; added new sugar-free line.'
  };
  const { lastInsertRowid: eventId } = insertEvent.run(event);

  const drinks = [
    { DrinkName: 'Regular Lemonade', CostPerDrink: 0.95, QuantitySold: 300, TotalCost: 285, Category: 'Regular' },
    { DrinkName: 'Blue Raspberry Lemonade', CostPerDrink: 1.14, QuantitySold: 150, TotalCost: 171, Category: 'Flavored' },
    { DrinkName: 'Sugar Free Peach Lemonade', CostPerDrink: 1.65, QuantitySold: 80, TotalCost: 132, Category: 'Sugar Free' }
  ];
  drinks.forEach(d => insertDrink.run({ EventID: eventId, ...d }));

  const employees = [
    { EmployeeName: 'Ava Lopez', Role: 'Cashier', HoursWorked: 16, HourlyRate: 15, TotalPay: 240 },
    { EmployeeName: 'Noah Brown', Role: 'Server', HoursWorked: 20, HourlyRate: 15, TotalPay: 300 }
  ];
  employees.forEach(e => insertEmployee.run({ EventID: eventId, ...e }));

  const supplies = [
    { ItemName: 'Cups', QuantityUsed: 600, UnitType: 'units', UnitCost: 0.05, TotalCost: 30, Vendor: 'Utah Supplies Co' },
    { ItemName: 'Sugar', QuantityUsed: 20, UnitType: 'lbs', UnitCost: 0.8, TotalCost: 16, Vendor: 'SweetWorks' },
    { ItemName: 'Lemons', QuantityUsed: 100, UnitType: 'count', UnitCost: 0.25, TotalCost: 25, Vendor: 'Fresh Farms' }
  ];
  supplies.forEach(s => insertSupply.run({ EventID: eventId, ...s }));

  console.log('✅ Seed data inserted successfully.');
});

seed();

db.close();
console.log(`🍋 LemonDrip database initialized at: ${DB_PATH}`);
