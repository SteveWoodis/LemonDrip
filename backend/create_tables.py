"""
VenView — PostgreSQL Schema Setup
Extracts all CREATE TABLE statements from server.js and creates
the complete database schema. Safe to re-run (IF NOT EXISTS).

Usage:
  python create_tables.py

Requires DATABASE_URL env var (or defaults to localhost).
Install: pip install psycopg2-binary
"""

import os
import psycopg2

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/venview"
)

SCHEMA_SQL = """

-- ============================================
-- FormTemplate
-- ============================================
CREATE TABLE IF NOT EXISTS "FormTemplate" (
    "TemplateID" SERIAL PRIMARY KEY,
    "TemplateName" TEXT NOT NULL,
    "Fields" TEXT,
    "CreatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SquareLocations
-- ============================================
CREATE TABLE IF NOT EXISTS "SquareLocations" (
    "LocationID" TEXT PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "Status" TEXT,
    "Address" TEXT,
    "CreatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Companies
-- ============================================
CREATE TABLE IF NOT EXISTS "Companies" (
    "companyID" SERIAL PRIMARY KEY,
    "companyName" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "vendorCategory" TEXT,
    "email" TEXT
);

-- ============================================
-- EventInfo
-- ============================================
CREATE TABLE IF NOT EXISTS "EventInfo" (
    "eventID" SERIAL PRIMARY KEY,
    "companyID" INTEGER,
    "eventName" TEXT,
    "eventType" TEXT,
    "eventDate" TEXT,
    "numDays" INTEGER,
    "coordinator" TEXT,
    "eventHost" TEXT,
    "eventLocation" TEXT,
    "status" TEXT,
    "isFinalized" INTEGER DEFAULT 0,
    "finalizedDate" TEXT,
    "squareLocationId" TEXT,
    "time" TEXT,
    "notes" TEXT,
    "customFields" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "grossSales" REAL,
    "returns" REAL,
    "discounts" REAL,
    "netSales" REAL,
    "tips" REAL,
    "giftCardSales" REAL,
    "totalSales" REAL,
    "cash" REAL,
    "card" REAL,
    "wallet" REAL,
    "cashApp" REAL,
    "Other" REAL,
    "applicationDate" TEXT,
    "eventFee" REAL,
    "permits" TEXT,
    "employees" TEXT,
    "eventRating" TEXT,
    "healthDeptFee" REAL DEFAULT 0,
    "mileageReimbursement" REAL DEFAULT 0,
    "eventRunnerFees" REAL DEFAULT 0,
    "taxOverride" REAL,
    "state" TEXT,
    "zipCode" TEXT
);

-- ============================================
-- SalesSummary
-- ============================================
CREATE TABLE IF NOT EXISTS "SalesSummary" (
    "SalesID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL UNIQUE REFERENCES "EventInfo"("eventID"),
    "SquareTxnID" TEXT,
    "grossSales" REAL,
    "netSales" REAL,
    "discounts" REAL,
    "refunds" REAL,
    "tips" REAL,
    "totalCollected" REAL,
    "squareFees" REAL DEFAULT 0,
    "DatePulledAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EventExpenses
-- ============================================
CREATE TABLE IF NOT EXISTS "EventExpenses" (
    "eventID" INTEGER PRIMARY KEY REFERENCES "EventInfo"("eventID"),
    "healthDeptFee" REAL DEFAULT 0,
    "eventFee" REAL DEFAULT 0,
    "mileageReimbursement" REAL DEFAULT 0,
    "eventRunnerFees" REAL DEFAULT 0,
    "employeeBonus" REAL DEFAULT 0,
    "coordinatorFee" REAL DEFAULT 0,
    "posFee" REAL DEFAULT 0,
    "supplyFees" REAL DEFAULT 0,
    "laborFees" REAL DEFAULT 0,
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- InventorySales
-- ============================================
CREATE TABLE IF NOT EXISTS "InventorySales" (
    "id" SERIAL PRIMARY KEY,
    "eventID" INTEGER REFERENCES "EventInfo"("eventID"),
    "name" TEXT,
    "quantitySold" INTEGER,
    "totalCost" REAL,
    "unitPrice" REAL,
    "category" TEXT,
    "metadata" TEXT,
    "rowCost" REAL,
    "source" TEXT
);

-- ============================================
-- UserPlan
-- ============================================
CREATE TABLE IF NOT EXISTS "UserPlan" (
    "userId" TEXT PRIMARY KEY,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- EmployeeTracker
-- ============================================
CREATE TABLE IF NOT EXISTS "EmployeeTracker" (
    "EmployeeID" SERIAL PRIMARY KEY,
    "employeeName" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "hourlyRate" REAL DEFAULT 0
);

-- ============================================
-- EventEmployees
-- ============================================
CREATE TABLE IF NOT EXISTS "EventEmployees" (
    "eventEmployeeID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "employeeID" INTEGER NOT NULL REFERENCES "EmployeeTracker"("EmployeeID"),
    "hoursWorked" REAL DEFAULT 0,
    "hourlyRate" REAL DEFAULT 0,
    "totalPay" REAL DEFAULT 0
);

-- ============================================
-- EventLabor
-- ============================================
CREATE TABLE IF NOT EXISTS "EventLabor" (
    "laborID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "employeeName" TEXT,
    "hoursWorked" REAL DEFAULT 0,
    "hourlyRate" REAL DEFAULT 0,
    "flatRate" REAL DEFAULT 0
);

-- ============================================
-- EventSupplies
-- ============================================
CREATE TABLE IF NOT EXISTS "EventSupplies" (
    "id" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "itemName" TEXT,
    "unitCost" REAL DEFAULT 0,
    "quantityUsed" REAL DEFAULT 0
);

-- ============================================
-- AdditionalFees
-- ============================================
CREATE TABLE IF NOT EXISTS "AdditionalFees" (
    "FeeID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "feeName" TEXT,
    "feeAmount" REAL DEFAULT 0
);

-- ============================================
-- Discounts
-- ============================================
CREATE TABLE IF NOT EXISTS "Discounts" (
    "DiscountID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "discountName" TEXT,
    "discountAmount" REAL DEFAULT 0
);

-- ============================================
-- TipTracker
-- ============================================
CREATE TABLE IF NOT EXISTS "TipTracker" (
    "TipID" SERIAL PRIMARY KEY,
    "eventID" INTEGER NOT NULL REFERENCES "EventInfo"("eventID"),
    "tipAmount" REAL NOT NULL,
    "tipTime" TEXT
);

-- ============================================
-- EventPayments (Square raw payments)
-- ============================================
CREATE TABLE IF NOT EXISTS "EventPayments" (
    "PaymentID" TEXT PRIMARY KEY,
    "eventID" INTEGER REFERENCES "EventInfo"("eventID"),
    "amount" REAL,
    "tipAmount" REAL,
    "taxAmount" REAL,
    "feeAmount" REAL,
    "method" TEXT,
    "createdAt" TEXT
);

"""

VIEWS_SQL = """

-- ============================================
-- VIEW: vw_square_reconciliation_report
-- ============================================
CREATE OR REPLACE VIEW "vw_square_reconciliation_report" AS
SELECT
  e."eventID",
  e."eventName",
  e."eventDate",
  e."squareLocationId",
  e."isFinalized",
  e."finalizedDate",

  COALESCE(s."grossSales", 0)        AS "grossItemSales",
  COALESCE(s."discounts", 0)         AS "discounts",
  COALESCE(s."netSales", 0)          AS "netSales",

  COALESCE(s."totalCollected", 0)    AS "totalCollected",
  COALESCE(s."tips", 0)              AS "tips",
  COALESCE(s."refunds", 0)           AS "refunds",
  COALESCE(s."squareFees", 0)        AS "squareFees",

  COALESCE(x."laborFees", 0)         AS "laborFees",

  (
    COALESCE(s."totalCollected", 0)
    - COALESCE(s."refunds", 0)
    - COALESCE(s."squareFees", 0)
  ) AS "expectedNetDeposit",

  COALESCE(s."netSales", 0)
    - COALESCE(s."squareFees", 0)    AS "netAfterSquareFees",

  (
    COALESCE(s."netSales", 0)
    - COALESCE(s."squareFees", 0)
    - COALESCE(x."laborFees", 0)
  ) AS "netAfterSquareAndLabor",

  CASE
    WHEN ABS(
      (
        COALESCE(s."totalCollected", 0)
        - COALESCE(s."refunds", 0)
        - COALESCE(s."squareFees", 0)
      )
      - COALESCE(s."netSales", 0)
    ) < 0.01
    THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS "reconciliationStatus"

FROM "EventInfo" e
LEFT JOIN "SalesSummary" s   ON s."eventID" = e."eventID"
LEFT JOIN "EventExpenses" x  ON x."eventID" = e."eventID";

-- ============================================
-- VIEW: vw_event_expenses
-- ============================================
CREATE OR REPLACE VIEW "vw_event_expenses" AS
SELECT
  e."eventID",

  COALESCE(sup."supplyCosts", 0)  AS "supplyCosts",
  COALESCE(lab."laborCosts", 0)   AS "laborCosts",
  COALESCE(fee."otherFees", 0)    AS "otherExpenses",

  (
    COALESCE(sup."supplyCosts", 0)
    + COALESCE(lab."laborCosts", 0)
    + COALESCE(fee."otherFees", 0)
  ) AS "totalExpenses"

FROM "EventInfo" e

LEFT JOIN (
  SELECT "eventID", SUM("unitCost" * "quantityUsed") AS "supplyCosts"
  FROM "EventSupplies"
  GROUP BY "eventID"
) sup ON sup."eventID" = e."eventID"

LEFT JOIN (
  SELECT "eventID", SUM(
    CASE WHEN "flatRate" > 0 THEN "flatRate"
         ELSE "hoursWorked" * "hourlyRate"
    END
  ) AS "laborCosts"
  FROM "EventLabor"
  GROUP BY "eventID"
) lab ON lab."eventID" = e."eventID"

LEFT JOIN (
  SELECT "eventID", SUM("feeAmount") AS "otherFees"
  FROM "AdditionalFees"
  GROUP BY "eventID"
) fee ON fee."eventID" = e."eventID";

"""


def main():
    print(f"Connecting to: {DATABASE_URL.split('@')[-1]}")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()

    # --- Tables ---
    statements = [s.strip() for s in SCHEMA_SQL.split(";") if s.strip() and "CREATE TABLE" in s]

    print("Creating tables...")
    for stmt in statements:
        table_name = stmt.split('"')[1] if '"' in stmt else "unknown"
        try:
            cur.execute(stmt)
            print(f"  OK: {table_name}")
        except Exception as e:
            print(f"  ERROR: {table_name}: {e}")

    # --- Views ---
    view_stmts = [s.strip() for s in VIEWS_SQL.split(";") if s.strip() and "CREATE" in s]

    print("\nCreating views...")
    for stmt in view_stmts:
        # Extract view name from CREATE OR REPLACE VIEW "name"
        parts = stmt.split('"')
        view_name = parts[1] if len(parts) > 1 else "unknown"
        try:
            cur.execute(stmt)
            print(f"  OK: {view_name}")
        except Exception as e:
            print(f"  ERROR: {view_name}: {e}")

    cur.close()
    conn.close()
    print(f"\nDone — {len(statements)} tables, {len(view_stmts)} views processed.")


if __name__ == "__main__":
    main()
