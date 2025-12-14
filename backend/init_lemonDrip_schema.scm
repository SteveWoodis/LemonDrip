PRAGMA foreign_keys = ON;

-- ============================================
-- TABLE: EventInfo
-- ============================================

CREATE TABLE IF NOT EXISTS EventInfo (
    EventID                 INTEGER PRIMARY KEY AUTOINCREMENT,

    eventName               TEXT NOT NULL,
    eventDate               TEXT NOT NULL,
    applicationDate         TEXT,
    finalizedDate           TEXT,
    coordinator             TEXT,
    eventType               TEXT,
    numDays                 INTEGER DEFAULT 1,
    status                  TEXT DEFAULT 'Pending',
    location                TEXT,
    squareLocationId        TEXT,

    -- Financial
    eventFee                REAL DEFAULT 0,
    healthDeptFee           REAL DEFAULT 0,
    mileageReimbursement    REAL DEFAULT 0,
    eventRunnerFees         REAL DEFAULT 0,
    giftCardSales           REAL DEFAULT 0,

    -- Tender Breakdown
    cash                    REAL DEFAULT 0,
    card                    REAL DEFAULT 0,
    venmo                   REAL DEFAULT 0,
    other                   REAL DEFAULT 0,
    cashApp                 REAL DEFAULT 0,

    -- Optional override
    taxOverride             REAL DEFAULT NULL,

    isFinalized             INTEGER DEFAULT 0,
    notes                   TEXT
);

-- ============================================
-- TABLE: SalesSummary
-- ============================================

CREATE TABLE IF NOT EXISTS SalesSummary (
    SalesSummaryID          INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    grossSales              REAL DEFAULT 0,
    refunds                 REAL DEFAULT 0,
    discounts               REAL DEFAULT 0,
    tips                    REAL DEFAULT 0,
    totalSales              REAL DEFAULT 0,

    squareReportedTax       REAL DEFAULT 0,
    squareFees              REAL DEFAULT 0,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- TABLE: DrinkSales
-- ============================================

CREATE TABLE IF NOT EXISTS DrinkSales (
    DrinkSaleID             INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    drinkName               TEXT NOT NULL,
    quantitySold            INTEGER DEFAULT 0,
    unitPrice               REAL DEFAULT 0,
    totalCost               REAL DEFAULT 0,
    flavor                  TEXT,
    size                    TEXT,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- TABLE: Discounts
-- ============================================

CREATE TABLE IF NOT EXISTS Discounts (
    DiscountID              INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    discountName            TEXT,
    discountAmount          REAL DEFAULT 0,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- TABLE: TipTracker
-- ============================================

CREATE TABLE IF NOT EXISTS TipTracker (
    TipID                   INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    tipAmount               REAL NOT NULL,
    tipTime                 TEXT,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- TABLE: SupplyCosts
-- ============================================

CREATE TABLE IF NOT EXISTS SupplyCosts (
    SupplyID                INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    itemName                TEXT,
    quantityUsed            REAL DEFAULT 0,
    unitCost                REAL DEFAULT 0,
    totalCost               REAL DEFAULT 0,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- TABLE: AdditionalFees
-- ============================================

CREATE TABLE IF NOT EXISTS AdditionalFees (
    FeeID                   INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,

    feeName                 TEXT,
    feeAmount               REAL DEFAULT 0,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- EMPLOYEE SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS EmployeeTracker (
    EmployeeID              INTEGER PRIMARY KEY AUTOINCREMENT,
    EmployeeName            TEXT NOT NULL,
    defaultWage             REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS EventEmployees (
    EventEmployeeID         INTEGER PRIMARY KEY AUTOINCREMENT,
    EventID                 INTEGER NOT NULL,
    EmployeeID              INTEGER NOT NULL,

    hoursWorked             REAL DEFAULT 0,
    hourlyRate              REAL DEFAULT 0,
    role                    TEXT,
    notes                   TEXT,
    totalPay                REAL DEFAULT 0,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID),
    FOREIGN KEY (EmployeeID) REFERENCES EmployeeTracker(EmployeeID)
);

-- ============================================
-- Optional Raw Square Payments
-- ============================================

CREATE TABLE IF NOT EXISTS EventPayments (
    PaymentID               TEXT PRIMARY KEY,
    EventID                 INTEGER,
    amount                  REAL,
    tipAmount               REAL,
    taxAmount               REAL,
    feeAmount               REAL,
    method                  TEXT,
    createdAt               TEXT,

    FOREIGN KEY (EventID) REFERENCES EventInfo(EventID)
);

-- ============================================
-- Form Templates (Dynamic)
-- ============================================

CREATE TABLE IF NOT EXISTS FormTemplates (
    TemplateID              INTEGER PRIMARY KEY AUTOINCREMENT,
    templateName            TEXT NOT NULL,
    fields                  TEXT NOT NULL      -- JSON
);
