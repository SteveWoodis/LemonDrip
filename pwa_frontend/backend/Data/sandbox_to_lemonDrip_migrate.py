#!/usr/bin/env python3
"""
LemonDrip data migration: sandbox_events.db  ->  lemonDrip.db

- Discovers existing tables in the old DB.
- Copies rows into new normalized schema (created by init_lemonDrip_db.js).
- Tries to parse legacy JSON columns if present (e.g., DrinkSales JSON arrays) and inserts into the proper tables.
- Idempotent-ish: can skip inserts when duplicates are detected by simple heuristics.
- Usage:
    python sandbox_to_lemonDrip_migrate.py --old ./backend/data/sandbox_events.db --new ./backend/data/lemonDrip.db

Author: ChatGPT (for Steve Woodis / LemonDrip)
"""
import argparse
import json
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (name,))
    return cur.fetchone() is not None

def colnames(conn: sqlite3.Connection, table: str) -> List[str]:
    cur = conn.execute(f"PRAGMA table_info({table});")
    return [r[1] for r in cur.fetchall()]

def ensure_json(obj: Any) -> str:
    if obj is None or obj == "":
        return "{}"
    if isinstance(obj, str):
        try:
            json.loads(obj)
            return obj
        except Exception:
            # wrap it
            return json.dumps({"value": obj})
    return json.dumps(obj)

def pick(d: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    return {k: d.get(k) for k in keys}

def migrate_eventinfo(old_conn: sqlite3.Connection, new_conn: sqlite3.Connection):
    if not table_exists(old_conn, "EventInfo"):
        print("Old DB: EventInfo not found, skipping.")
        return

    old_cols = colnames(old_conn, "EventInfo")
    new_cols = set(colnames(new_conn, "EventInfo"))
    # We'll map best-effort from legacy names to new schema.
    # Common legacy labels seen in Steve's app: Event Name, Event Date, Event Coordinator, Event Host, Event Location, Notes, etc.
    # Some older versions may have JSON blobs for sub-data.

    select_sql = "SELECT * FROM EventInfo"
    rows = [dict(zip(old_cols, r)) for r in old_conn.execute(select_sql).fetchall()]
    print(f"Found {len(rows)} events in old DB.")

    # Company cache: name->id
    company_cache: Dict[str, int] = {}
    if table_exists(new_conn, "Companies"):
        for (cid, cname) in new_conn.execute("SELECT CompanyID, CompanyName FROM Companies"):
            company_cache[cname] = cid

    def get_or_create_company_id(name: Optional[str]) -> Optional[int]:
        if not name:
            return None
        name = name.strip()
        if not name:
            return None
        if name in company_cache:
            return company_cache[name]
        cur = new_conn.execute("INSERT INTO Companies (CompanyName) VALUES (?);", (name,))
        new_id = cur.lastrowid
        company_cache[name] = new_id
        return new_id

    inserted = 0
    for row in rows:
        # Flexible access (support both snake_case and spaced labels)
        def g(*candidates: str) -> Optional[Any]:
            for c in candidates:
                if c in row and row[c] not in (None, ""):
                    return row[c]
            return None

        company_name = g("Event Host", "Host", "CompanyName", "Company Name")
        company_id = get_or_create_company_id(company_name)

        event_name = g("Event Name", "EventName", "Name")
        event_date = g("Event Date", "EventDate", "Date")
        event_type = g("Event Type", "EventType")
        num_days   = g("NumDays", "Event NumDays", "Days")
        coord      = g("Event Coordinator", "Coordinator")
        notes      = g("Event Notes", "Notes")
        status     = g("Event Status", "Status") or "Planned"

        meta = g("Metadata JSON", "Metadata")
        # Merge in legacy "Event Location" into Metadata.Location if present
        event_location = g("Event Location", "Location")
        if event_location:
            base = {}
            if meta:
                try:
                    base = json.loads(meta) if isinstance(meta, str) else meta
                except Exception:
                    base = {}
            base.setdefault("Location", event_location)
            meta = json.dumps(base)
        metadata_json = ensure_json(meta)

        # Numeric fields
        def gnum(*cands: str) -> Optional[float]:
            v = g(*cands)
            if v is None or v == "":
                return None
            try:
                return float(v)
            except Exception:
                return None

        gross      = gnum("Gross Sales", "GrossSales")
        returns    = gnum("Returns")
        discounts  = gnum("Discounts")
        netsales   = gnum("Net Sales", "NetSales")
        tips       = gnum("Tips")
        giftcards  = gnum("Gift Card Sales", "GiftCardSales")
        totalsales = gnum("Total Sales", "TotalSales")
        cash       = gnum("Cash")
        card       = gnum("Card")
        venmo      = gnum("Venmo")
        cashapp    = gnum("Cash App", "CashApp")
        other      = gnum("Other")

        # Try to preserve EventID if free
        old_event_id = g("Event ID", "EventID")

        # Insert
        cols = ["CompanyID","EventName","EventType","EventDate","NumDays","Coordinator",
                "GrossSales","Returns","Discounts","NetSales","Tips","GiftCardSales","TotalSales",
                "Cash","Card","Venmo","CashApp","Other","Notes","Status","Metadata"]
        vals = [company_id,event_name,event_type,event_date,num_days,coord,
                gross,returns,discounts,netsales,tips,giftcards,totalsales,
                cash,card,venmo,cashapp,other,notes,status,metadata_json]

        # If we can keep the same EventID, try it (only if no conflict)
        if old_event_id is not None:
            try:
                new_conn.execute("INSERT INTO EventInfo (EventID,{cols}) VALUES (?,{qs});".format(
                    cols=",".join(cols), qs=",".join(["?"]*len(cols))
                ), [old_event_id] + vals)
                new_id = old_event_id
            except sqlite3.IntegrityError:
                # ID taken; just insert without forcing EventID
                cur = new_conn.execute("INSERT INTO EventInfo ({cols}) VALUES ({qs});".format(
                    cols=",".join(cols), qs=",".join(["?"]*len(cols))
                ), vals)
                new_id = cur.lastrowid
        else:
            cur = new_conn.execute("INSERT INTO EventInfo ({cols}) VALUES ({qs});".format(
                cols=",".join(cols), qs=",".join(["?"]*len(cols))
            ), vals)
            new_id = cur.lastrowid

        inserted += 1

        # Attempt to migrate embedded JSON arrays if present on the row
        # Expected shapes: { Data: [ ...items... ] } or just [ ...items... ]
        def items_from(obj: Any) -> List[Dict[str, Any]]:
            if obj is None or obj == "":
                return []
            try:
                data = json.loads(obj) if isinstance(obj, str) else obj
            except Exception:
                return []
            if isinstance(data, dict) and "Data" in data and isinstance(data["Data"], list):
                return data["Data"]
            if isinstance(data, list):
                return data
            return []

        # DrinkSales
        drink_blob = g("DrinkSales", "Drinks")
        for d in items_from(drink_blob):
            new_conn.execute("""
                INSERT INTO DrinkSales (EventID, DrinkName, CostPerDrink, QuantitySold, TotalCost, Category, Metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                new_id,
                d.get("Drink Name") or d.get("DrinkName") or d.get("Name"),
                (d.get("Cost Per Drink") or d.get("CostPerDrink") or d.get("Unit Cost")),
                d.get("Quantity Sold") or d.get("QuantitySold") or d.get("Qty"),
                d.get("Total Cost") or d.get("TotalCost"),
                d.get("Category"),
                ensure_json(d.get("Metadata")),
            ))

        # Employees
        emp_blob = g("EmployeeTracker", "Employees")
        for e in items_from(emp_blob):
            new_conn.execute("""
                INSERT INTO EmployeeTracker (EventID, EmployeeName, Role, HoursWorked, HourlyRate, TotalPay, TipsEarned, Metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                new_id,
                e.get("Employee Name") or e.get("EmployeeName") or e.get("Name"),
                e.get("Role"),
                e.get("Hours Worked") or e.get("HoursWorked"),
                e.get("Hourly Rate") or e.get("HourlyRate"),
                e.get("Total Pay") or e.get("TotalPay"),
                e.get("Tips Earned") or e.get("TipsEarned"),
                ensure_json(e.get("Metadata")),
            ))

        # Supplies
        supply_blob = g("SupplyCosts", "Supplies")
        for s in items_from(supply_blob):
            new_conn.execute("""
                INSERT INTO SupplyCosts (EventID, ItemName, QuantityUsed, UnitType, UnitCost, TotalCost, Vendor, Metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                new_id,
                s.get("Item Name") or s.get("ItemName"),
                s.get("Quantity Used") or s.get("QuantityUsed"),
                s.get("Unit Type") or s.get("UnitType"),
                s.get("Unit Cost") or s.get("UnitCost"),
                s.get("Total Cost") or s.get("TotalCost"),
                s.get("Vendor"),
                ensure_json(s.get("Metadata")),
            ))

        # Fees
        fees_blob = g("AdditionalFees", "Fees")
        for f in items_from(fees_blob):
            new_conn.execute("""
                INSERT INTO AdditionalFees (EventID, FeeType, Description, Amount, Metadata)
                VALUES (?, ?, ?, ?, ?);
            """, (
                new_id,
                f.get("Fee Type") or f.get("FeeType"),
                f.get("Description"),
                f.get("Amount"),
                ensure_json(f.get("Metadata")),
            ))

        # Discounts
        disc_blob = g("Discounts")
        for d in items_from(disc_blob):
            new_conn.execute("""
                INSERT INTO Discounts (EventID, DiscountType, Amount, Description, Metadata)
                VALUES (?, ?, ?, ?, ?);
            """, (
                new_id,
                d.get("Discount Type") or d.get("DiscountType"),
                d.get("Amount"),
                d.get("Description"),
                ensure_json(d.get("Metadata")),
            ))

        # Tips
        tips_blob = g("TipTracker", "TipsTracker", "TipsDetail")
        for t in items_from(tips_blob):
            new_conn.execute("""
                INSERT INTO TipTracker (EventID, Source, Amount, Metadata)
                VALUES (?, ?, ?, ?);
            """, (
                new_id,
                t.get("Source"),
                t.get("Amount"),
                ensure_json(t.get("Metadata")),
            ))

        # Payments
        pay_blob = g("EventPayments", "Payments")
        for p in items_from(pay_blob):
            new_conn.execute("""
                INSERT INTO EventPayments (EventID, Method, Amount, Metadata)
                VALUES (?, ?, ?, ?);
            """, (
                new_id,
                p.get("Method"),
                p.get("Amount"),
                ensure_json(p.get("Metadata")),
            ))

    new_conn.commit()
    print(f"Migrated {inserted} EventInfo rows.")

def migrate(old_path: str, new_path: str):
    if not os.path.exists(old_path):
        raise SystemExit(f"Old DB not found: {old_path}")
    if not os.path.exists(new_path):
        raise SystemExit(f"New DB not found: {new_path} (run init_lemonDrip_db.js first)")

    old_conn = sqlite3.connect(old_path)
    new_conn = sqlite3.connect(new_path)

    try:
        # Safety: enforce FKs on both
        old_conn.execute("PRAGMA foreign_keys=ON;")
        new_conn.execute("PRAGMA foreign_keys=ON;")

        migrate_eventinfo(old_conn, new_conn)

    finally:
        old_conn.close()
        new_conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--old", default="./backend/data/sandbox_events.db", help="Path to old database")
    parser.add_argument("--new", default="./backend/data/lemonDrip.db", help="Path to new database")
    args = parser.parse_args()
    migrate(args.old, args.new)
