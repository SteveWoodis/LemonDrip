-- migration_bridge.sql
-- LemonDrip Compatibility Layer (Views + Triggers)
-- Purpose: keep the legacy frontend/backend contract stable while using the new normalized schema.
-- Safe to run after init_lemonDrip_db.js (tables must already exist).
-- You can re-run; objects are created IF NOT EXISTS where supported.
-- Requires SQLite JSON1 extension for json_* functions (bundled with modern SQLite).

PRAGMA foreign_keys = ON;

---------------------------------------------------------------------
-- Helper: ensure Companies has a row when inserting by CompanyName
---------------------------------------------------------------------
-- We use an upsert helper view + triggers pattern for EventInfoLegacy to
-- resolve NEW."Event Host" -> Companies.CompanyID smoothly.

---------------------------------------------------------------------
-- Legacy Facade: EventInfoLegacy
-- Exposes old column names while reading/writing the new EventInfo.
---------------------------------------------------------------------
DROP VIEW IF EXISTS EventInfoLegacy;
CREATE VIEW EventInfoLegacy AS
SELECT
  e.EventID                         AS "Event ID",
  e.EventName                       AS "Event Name",
  e.EventType                       AS "Event Type",
  e.EventDate                       AS "Event Date",
  e.NumDays                         AS "Event NumDays",
  e.Coordinator                     AS "Event Coordinator",
  COALESCE(c.CompanyName, '')       AS "Event Host",
  -- Location lives in Metadata JSON (legacy kept it as a loose field)
  COALESCE(json_extract(e.Metadata, '$.Location'), '') AS "Event Location",
  COALESCE(e.Status, 'Planned')     AS "Event Status",
  COALESCE(e.GrossSales, 0)         AS "Gross Sales",
  COALESCE(e.Returns, 0)            AS "Returns",
  COALESCE(e.Discounts, 0)          AS "Discounts",
  COALESCE(e.NetSales, 0)           AS "Net Sales",
  COALESCE(e.Tips, 0)               AS "Tips",
  COALESCE(e.GiftCardSales, 0)      AS "Gift Card Sales",
  COALESCE(e.TotalSales, 0)         AS "Total Sales",
  COALESCE(e.Cash, 0)               AS "Cash",
  COALESCE(e.Card, 0)               AS "Card",
  COALESCE(e.Venmo, 0)              AS "Venmo",
  COALESCE(e.CashApp, 0)            AS "Cash App",
  COALESCE(e.Other, 0)              AS "Other",
  e.Notes                           AS "Event Notes",
  e.FinalizedDate                   AS "Finalized Date",
  COALESCE(e.IsFinalized, 0)        AS "Is Finalized",
  e.CompanyID                       AS "CompanyID",
  e.Metadata                        AS "Metadata JSON"
FROM EventInfo e
LEFT JOIN Companies c ON c.CompanyID = e.CompanyID;

---------------------------------------------------------------------
-- INSTEAD OF triggers for EventInfoLegacy
---------------------------------------------------------------------
DROP TRIGGER IF EXISTS EventInfoLegacy_Insert;
CREATE TRIGGER EventInfoLegacy_Insert
INSTEAD OF INSERT ON EventInfoLegacy
BEGIN
  -- ensure company exists (if Event Host provided)
  INSERT INTO Companies (CompanyName)
  SELECT NEW."Event Host"
  WHERE NEW."Event Host" IS NOT NULL
    AND TRIM(NEW."Event Host") <> ''
    AND NOT EXISTS (SELECT 1 FROM Companies WHERE CompanyName = NEW."Event Host");

  INSERT INTO EventInfo (
    CompanyID, EventName, EventType, EventDate, NumDays, Coordinator,
    GrossSales, Returns, Discounts, NetSales, Tips, GiftCardSales, TotalSales,
    Cash, Card, Venmo, CashApp, Other,
    Notes, Status, IsFinalized, FinalizedDate, Metadata
  )
  VALUES (
    (SELECT CompanyID FROM Companies WHERE CompanyName = NEW."Event Host"),
    NEW."Event Name",
    NEW."Event Type",
    NEW."Event Date",
    NEW."Event NumDays",
    NEW."Event Coordinator",
    NEW."Gross Sales",
    NEW."Returns",
    NEW."Discounts",
    NEW."Net Sales",
    NEW."Tips",
    NEW."Gift Card Sales",
    NEW."Total Sales",
    NEW."Cash",
    NEW."Card",
    NEW."Venmo",
    NEW."Cash App",
    NEW."Other",
    NEW."Event Notes",
    COALESCE(NEW."Event Status", 'Planned'),
    COALESCE(NEW."Is Finalized", 0),
    NEW."Finalized Date",
    CASE
      WHEN NEW."Event Location" IS NOT NULL AND NEW."Event Location" <> ''
      THEN json_set(COALESCE(NEW."Metadata JSON", '{}'), '$.Location', NEW."Event Location")
      ELSE COALESCE(NEW."Metadata JSON", '{}')
    END
  );
END;

DROP TRIGGER IF EXISTS EventInfoLegacy_Update;
CREATE TRIGGER EventInfoLegacy_Update
INSTEAD OF UPDATE ON EventInfoLegacy
BEGIN
  -- sync company if host changed
  INSERT INTO Companies (CompanyName)
  SELECT NEW."Event Host"
  WHERE NEW."Event Host" IS NOT NULL
    AND TRIM(NEW."Event Host") <> ''
    AND NOT EXISTS (SELECT 1 FROM Companies WHERE CompanyName = NEW."Event Host");

  UPDATE EventInfo
  SET
    CompanyID     = (SELECT CompanyID FROM Companies WHERE CompanyName = NEW."Event Host"),
    EventName     = NEW."Event Name",
    EventType     = NEW."Event Type",
    EventDate     = NEW."Event Date",
    NumDays       = NEW."Event NumDays",
    Coordinator   = NEW."Event Coordinator",
    GrossSales    = NEW."Gross Sales",
    Returns       = NEW."Returns",
    Discounts     = NEW."Discounts",
    NetSales      = NEW."Net Sales",
    Tips          = NEW."Tips",
    GiftCardSales = NEW."Gift Card Sales",
    TotalSales    = NEW."Total Sales",
    Cash          = NEW."Cash",
    Card          = NEW."Card",
    Venmo         = NEW."Venmo",
    CashApp       = NEW."Cash App",
    Other         = NEW."Other",
    Notes         = NEW."Event Notes",
    Status        = COALESCE(NEW."Event Status", Status),
    IsFinalized   = COALESCE(NEW."Is Finalized", IsFinalized),
    FinalizedDate = COALESCE(NEW."Finalized Date", FinalizedDate),
    Metadata      = CASE
                      WHEN NEW."Event Location" IS NOT NULL AND NEW."Event Location" <> ''
                      THEN json_set(COALESCE(NEW."Metadata JSON", '{}'), '$.Location', NEW."Event Location")
                      ELSE COALESCE(NEW."Metadata JSON", '{}')
                    END
  WHERE EventID = OLD."Event ID";
END;

DROP TRIGGER IF EXISTS EventInfoLegacy_Delete;
CREATE TRIGGER EventInfoLegacy_Delete
INSTEAD OF DELETE ON EventInfoLegacy
BEGIN
  DELETE FROM EventInfo WHERE EventID = OLD."Event ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: DrinkSalesLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS DrinkSalesLegacy;
CREATE VIEW DrinkSalesLegacy AS
SELECT
  d.DrinkID           AS "Drink ID",
  d.EventID           AS "Event ID",
  d.DrinkName         AS "Drink Name",
  d.CostPerDrink      AS "Cost Per Drink",
  d.QuantitySold      AS "Quantity Sold",
  d.TotalCost         AS "Total Cost",
  d.Category          AS "Category",
  d.Metadata          AS "Metadata JSON"
FROM DrinkSales d;

DROP TRIGGER IF EXISTS DrinkSalesLegacy_Insert;
CREATE TRIGGER DrinkSalesLegacy_Insert
INSTEAD OF INSERT ON DrinkSalesLegacy
BEGIN
  INSERT INTO DrinkSales (EventID, DrinkName, CostPerDrink, QuantitySold, TotalCost, Category, Metadata)
  VALUES (
    NEW."Event ID", NEW."Drink Name", NEW."Cost Per Drink", NEW."Quantity Sold",
    NEW."Total Cost", NEW."Category", COALESCE(NEW."Metadata JSON", '{}')
  );
END;

DROP TRIGGER IF EXISTS DrinkSalesLegacy_Update;
CREATE TRIGGER DrinkSalesLegacy_Update
INSTEAD OF UPDATE ON DrinkSalesLegacy
BEGIN
  UPDATE DrinkSales
  SET
    EventID      = NEW."Event ID",
    DrinkName    = NEW."Drink Name",
    CostPerDrink = NEW."Cost Per Drink",
    QuantitySold = NEW."Quantity Sold",
    TotalCost    = NEW."Total Cost",
    Category     = NEW."Category",
    Metadata     = COALESCE(NEW."Metadata JSON", '{}')
  WHERE DrinkID = OLD."Drink ID";
END;

DROP TRIGGER IF EXISTS DrinkSalesLegacy_Delete;
CREATE TRIGGER DrinkSalesLegacy_Delete
INSTEAD OF DELETE ON DrinkSalesLegacy
BEGIN
  DELETE FROM DrinkSales WHERE DrinkID = OLD."Drink ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: EmployeeTrackerLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS EmployeeTrackerLegacy;
CREATE VIEW EmployeeTrackerLegacy AS
SELECT
  e.EmployeeID     AS "Employee ID",
  e.EventID        AS "Event ID",
  e.EmployeeName   AS "Employee Name",
  e.Role           AS "Role",
  e.HoursWorked    AS "Hours Worked",
  e.HourlyRate     AS "Hourly Rate",
  e.TotalPay       AS "Total Pay",
  e.TipsEarned     AS "Tips Earned",
  e.Metadata       AS "Metadata JSON"
FROM EmployeeTracker e;

DROP TRIGGER IF EXISTS EmployeeTrackerLegacy_Insert;
CREATE TRIGGER EmployeeTrackerLegacy_Insert
INSTEAD OF INSERT ON EmployeeTrackerLegacy
BEGIN
  INSERT INTO EmployeeTracker
    (EventID, EmployeeName, Role, HoursWorked, HourlyRate, TotalPay, TipsEarned, Metadata)
  VALUES
    (NEW."Event ID", NEW."Employee Name", NEW."Role", NEW."Hours Worked", NEW."Hourly Rate",
     NEW."Total Pay", NEW."Tips Earned", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS EmployeeTrackerLegacy_Update;
CREATE TRIGGER EmployeeTrackerLegacy_Update
INSTEAD OF UPDATE ON EmployeeTrackerLegacy
BEGIN
  UPDATE EmployeeTracker
  SET
    EventID      = NEW."Event ID",
    EmployeeName = NEW."Employee Name",
    Role         = NEW."Role",
    HoursWorked  = NEW."Hours Worked",
    HourlyRate   = NEW."Hourly Rate",
    TotalPay     = NEW."Total Pay",
    TipsEarned   = NEW."Tips Earned",
    Metadata     = COALESCE(NEW."Metadata JSON", '{}')
  WHERE EmployeeID = OLD."Employee ID";
END;

DROP TRIGGER IF EXISTS EmployeeTrackerLegacy_Delete;
CREATE TRIGGER EmployeeTrackerLegacy_Delete
INSTEAD OF DELETE ON EmployeeTrackerLegacy
BEGIN
  DELETE FROM EmployeeTracker WHERE EmployeeID = OLD."Employee ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: SupplyCostsLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS SupplyCostsLegacy;
CREATE VIEW SupplyCostsLegacy AS
SELECT
  s.SupplyID       AS "Supply ID",
  s.EventID        AS "Event ID",
  s.ItemName       AS "Item Name",
  s.QuantityUsed   AS "Quantity Used",
  s.UnitType       AS "Unit Type",
  s.UnitCost       AS "Unit Cost",
  s.TotalCost      AS "Total Cost",
  s.Vendor         AS "Vendor",
  s.Metadata       AS "Metadata JSON"
FROM SupplyCosts s;

DROP TRIGGER IF EXISTS SupplyCostsLegacy_Insert;
CREATE TRIGGER SupplyCostsLegacy_Insert
INSTEAD OF INSERT ON SupplyCostsLegacy
BEGIN
  INSERT INTO SupplyCosts
    (EventID, ItemName, QuantityUsed, UnitType, UnitCost, TotalCost, Vendor, Metadata)
  VALUES
    (NEW."Event ID", NEW."Item Name", NEW."Quantity Used", NEW."Unit Type",
     NEW."Unit Cost", NEW."Total Cost", NEW."Vendor", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS SupplyCostsLegacy_Update;
CREATE TRIGGER SupplyCostsLegacy_Update
INSTEAD OF UPDATE ON SupplyCostsLegacy
BEGIN
  UPDATE SupplyCosts
  SET
    EventID      = NEW."Event ID",
    ItemName     = NEW."Item Name",
    QuantityUsed = NEW."Quantity Used",
    UnitType     = NEW."Unit Type",
    UnitCost     = NEW."Unit Cost",
    TotalCost    = NEW."Total Cost",
    Vendor       = NEW."Vendor",
    Metadata     = COALESCE(NEW."Metadata JSON", '{}')
  WHERE SupplyID = OLD."Supply ID";
END;

DROP TRIGGER IF EXISTS SupplyCostsLegacy_Delete;
CREATE TRIGGER SupplyCostsLegacy_Delete
INSTEAD OF DELETE ON SupplyCostsLegacy
BEGIN
  DELETE FROM SupplyCosts WHERE SupplyID = OLD."Supply ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: AdditionalFeesLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS AdditionalFeesLegacy;
CREATE VIEW AdditionalFeesLegacy AS
SELECT
  a.FeeID         AS "Fee ID",
  a.EventID       AS "Event ID",
  a.FeeType       AS "Fee Type",
  a.Description   AS "Description",
  a.Amount        AS "Amount",
  a.Metadata      AS "Metadata JSON"
FROM AdditionalFees a;

DROP TRIGGER IF EXISTS AdditionalFeesLegacy_Insert;
CREATE TRIGGER AdditionalFeesLegacy_Insert
INSTEAD OF INSERT ON AdditionalFeesLegacy
BEGIN
  INSERT INTO AdditionalFees
    (EventID, FeeType, Description, Amount, Metadata)
  VALUES
    (NEW."Event ID", NEW."Fee Type", NEW."Description", NEW."Amount", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS AdditionalFeesLegacy_Update;
CREATE TRIGGER AdditionalFeesLegacy_Update
INSTEAD OF UPDATE ON AdditionalFeesLegacy
BEGIN
  UPDATE AdditionalFees
  SET
    EventID     = NEW."Event ID",
    FeeType     = NEW."Fee Type",
    Description = NEW."Description",
    Amount      = NEW."Amount",
    Metadata    = COALESCE(NEW."Metadata JSON", '{}')
  WHERE FeeID = OLD."Fee ID";
END;

DROP TRIGGER IF EXISTS AdditionalFeesLegacy_Delete;
CREATE TRIGGER AdditionalFeesLegacy_Delete
INSTEAD OF DELETE ON AdditionalFeesLegacy
BEGIN
  DELETE FROM AdditionalFees WHERE FeeID = OLD."Fee ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: DiscountsLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS DiscountsLegacy;
CREATE VIEW DiscountsLegacy AS
SELECT
  d.DiscountID    AS "Discount ID",
  d.EventID       AS "Event ID",
  d.DiscountType  AS "Discount Type",
  d.Amount        AS "Amount",
  d.Description   AS "Description",
  d.Metadata      AS "Metadata JSON"
FROM Discounts d;

DROP TRIGGER IF EXISTS DiscountsLegacy_Insert;
CREATE TRIGGER DiscountsLegacy_Insert
INSTEAD OF INSERT ON DiscountsLegacy
BEGIN
  INSERT INTO Discounts (EventID, DiscountType, Amount, Description, Metadata)
  VALUES (NEW."Event ID", NEW."Discount Type", NEW."Amount", NEW."Description", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS DiscountsLegacy_Update;
CREATE TRIGGER DiscountsLegacy_Update
INSTEAD OF UPDATE ON DiscountsLegacy
BEGIN
  UPDATE Discounts
  SET
    EventID      = NEW."Event ID",
    DiscountType = NEW."Discount Type",
    Amount       = NEW."Amount",
    Description  = NEW."Description",
    Metadata     = COALESCE(NEW."Metadata JSON", '{}')
  WHERE DiscountID = OLD."Discount ID";
END;

DROP TRIGGER IF EXISTS DiscountsLegacy_Delete;
CREATE TRIGGER DiscountsLegacy_Delete
INSTEAD OF DELETE ON DiscountsLegacy
BEGIN
  DELETE FROM Discounts WHERE DiscountID = OLD."Discount ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: TipTrackerLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS TipTrackerLegacy;
CREATE VIEW TipTrackerLegacy AS
SELECT
  t.TipID         AS "Tip ID",
  t.EventID       AS "Event ID",
  t.Source        AS "Source",
  t.Amount        AS "Amount",
  t.Metadata      AS "Metadata JSON"
FROM TipTracker t;

DROP TRIGGER IF EXISTS TipTrackerLegacy_Insert;
CREATE TRIGGER TipTrackerLegacy_Insert
INSTEAD OF INSERT ON TipTrackerLegacy
BEGIN
  INSERT INTO TipTracker (EventID, Source, Amount, Metadata)
  VALUES (NEW."Event ID", NEW."Source", NEW."Amount", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS TipTrackerLegacy_Update;
CREATE TRIGGER TipTrackerLegacy_Update
INSTEAD OF UPDATE ON TipTrackerLegacy
BEGIN
  UPDATE TipTracker
  SET
    EventID   = NEW."Event ID",
    Source    = NEW."Source",
    Amount    = NEW."Amount",
    Metadata  = COALESCE(NEW."Metadata JSON", '{}')
  WHERE TipID = OLD."Tip ID";
END;

DROP TRIGGER IF EXISTS TipTrackerLegacy_Delete;
CREATE TRIGGER TipTrackerLegacy_Delete
INSTEAD OF DELETE ON TipTrackerLegacy
BEGIN
  DELETE FROM TipTracker WHERE TipID = OLD."Tip ID";
END;

---------------------------------------------------------------------
-- Legacy Facade: EventPaymentsLegacy
---------------------------------------------------------------------
DROP VIEW IF EXISTS EventPaymentsLegacy;
CREATE VIEW EventPaymentsLegacy AS
SELECT
  p.PaymentID     AS "Payment ID",
  p.EventID       AS "Event ID",
  p.Method        AS "Method",
  p.Amount        AS "Amount",
  p.Metadata      AS "Metadata JSON"
FROM EventPayments p;

DROP TRIGGER IF EXISTS EventPaymentsLegacy_Insert;
CREATE TRIGGER EventPaymentsLegacy_Insert
INSTEAD OF INSERT ON EventPaymentsLegacy
BEGIN
  INSERT INTO EventPayments (EventID, Method, Amount, Metadata)
  VALUES (NEW."Event ID", NEW."Method", NEW."Amount", COALESCE(NEW."Metadata JSON", '{}'));
END;

DROP TRIGGER IF EXISTS EventPaymentsLegacy_Update;
CREATE TRIGGER EventPaymentsLegacy_Update
INSTEAD OF UPDATE ON EventPaymentsLegacy
BEGIN
  UPDATE EventPayments
  SET
    EventID  = NEW."Event ID",
    Method   = NEW."Method",
    Amount   = NEW."Amount",
    Metadata = COALESCE(NEW."Metadata JSON", '{}')
  WHERE PaymentID = OLD."Payment ID";
END;

DROP TRIGGER IF EXISTS EventPaymentsLegacy_Delete;
CREATE TRIGGER EventPaymentsLegacy_Delete
INSTEAD OF DELETE ON EventPaymentsLegacy
BEGIN
  DELETE FROM EventPayments WHERE PaymentID = OLD."Payment ID";
END;

---------------------------------------------------------------------
-- Convenience View: PostEventInfo (Completed/Finalized events)
---------------------------------------------------------------------
DROP VIEW IF EXISTS PostEventInfo;
CREATE VIEW PostEventInfo AS
SELECT *
FROM EventInfo
WHERE COALESCE(IsFinalized, 0) = 1 OR Status = 'Completed';
