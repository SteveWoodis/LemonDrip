-- =============================================================
-- VenView / LemonDrip — Consolidated Schema for Supabase
-- =============================================================
-- Generated from local Postgres pg_dump --schema-only --no-owner.
-- Idempotent? NO — run this once on a fresh Supabase project.
-- For re-runs against existing schema, you'd want IF NOT EXISTS
-- or DROP IF EXISTS guards (not added here to keep the dump clean).
--
-- Excluded:
--   * sqlite_sequence (legacy SQLite migration artifact)
--   * Postgres 18 \restrict / \unrestrict commands
--   * Owner / privilege grants (handled by Supabase automatically)
-- =============================================================

-- Dumped from database version 18.2
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: additionalfees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.additionalfees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AdditionalFees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdditionalFees" (
    id bigint DEFAULT nextval('public.additionalfees_id_seq'::regclass) NOT NULL,
    "eventID" bigint,
    "feeType" text,
    "feeName" text,
    "feeAmount" double precision,
    metadata text
);

--
-- Name: Companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Companies" (
    "CompanyID" bigint NOT NULL,
    "companyName" text,
    "contactName" text,
    phone text,
    email text,
    notes text,
    "vendorCategory" text
);

--
-- Name: discounts_discountid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discounts_discountid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: Discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Discounts" (
    "discountID" bigint DEFAULT nextval('public.discounts_discountid_seq'::regclass) NOT NULL,
    "eventID" bigint,
    "discountType" text,
    "discountAmount" double precision,
    "discountName" text,
    metadata text
);

--
-- Name: DrinkSales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DrinkSales" (
    id bigint NOT NULL,
    "eventID" bigint,
    name text,
    "unitPrice" double precision,
    "quantitySold" bigint,
    "totalCost" double precision,
    category text,
    metadata text,
    "rowCost" double precision,
    source text
);

--
-- Name: DrinkSales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."DrinkSales_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: DrinkSales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."DrinkSales_id_seq" OWNED BY public."DrinkSales".id;

--
-- Name: EmployeeTracker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmployeeTracker" (
    "employeeID" bigint NOT NULL,
    "eventID" bigint,
    "employeeName" text,
    role text,
    "hoursWorked" double precision,
    "hourlyRate" double precision,
    "totalPay" double precision,
    "tipsEarned" double precision,
    metadata text,
    "squareEmployeeID" text
);

--
-- Name: EventDays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDays" (
    "dayID" integer NOT NULL,
    "eventID" integer NOT NULL,
    "dayNumber" integer NOT NULL,
    date text NOT NULL,
    "startTime" text,
    "endTime" text
);

--
-- Name: EventDays_dayID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventDays_dayID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventDays_dayID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventDays_dayID_seq" OWNED BY public."EventDays"."dayID";

--
-- Name: EventEmployees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventEmployees" (
    "eventEmployeeID" bigint NOT NULL,
    "eventID" bigint,
    "employeeID" bigint,
    "hoursWorked" double precision,
    "hourlyRate" double precision,
    "totalPay" double precision,
    "startTime" text,
    "endTime" text,
    "squareTimecardID" text
);

--
-- Name: EventEmployees_eventEmployeeID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventEmployees_eventEmployeeID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventEmployees_eventEmployeeID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventEmployees_eventEmployeeID_seq" OWNED BY public."EventEmployees"."eventEmployeeID";

--
-- Name: EventExpenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventExpenses" (
    "eventID" bigint NOT NULL,
    "healthDeptFee" double precision,
    "eventFee" double precision,
    "mileageReimbursement" double precision,
    "eventRunnerFees" double precision,
    "employeeBonus" double precision,
    "updatedAt" text,
    "coordinatorFee" double precision,
    "laborFees" double precision,
    "posFee" double precision,
    "supplyFees" double precision,
    "additionalFees" real DEFAULT 0
);

--
-- Name: EventFinalizeSnapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFinalizeSnapshot" (
    "snapshotID" bigint NOT NULL,
    "eventID" bigint,
    "totalCollected" double precision,
    refunds double precision,
    "squareFees" double precision,
    tax double precision,
    "totalNetRevenue" double precision,
    "supplyCosts" double precision,
    "laborCosts" double precision,
    "otherExpenses" double precision,
    "totalExpenses" double precision,
    "netProfit" double precision,
    "finalizedAt" timestamp without time zone
);

--
-- Name: EventInfo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventInfo" (
    "eventID" bigint NOT NULL,
    "companyID" bigint,
    "eventName" text,
    "eventType" text,
    "eventDate" text,
    "numDays" bigint,
    coordinator text,
    "grossSales" double precision,
    returns double precision,
    discounts double precision,
    "netSales" double precision,
    tips double precision,
    "giftCardSales" double precision,
    "totalSales" double precision,
    cash double precision,
    card double precision,
    wallet double precision,
    "cashApp" double precision,
    "Other" double precision,
    notes text,
    metadata text,
    status text,
    "isFinalized" bigint,
    "finalizedDate" text,
    "applicationDate" text,
    "eventFee" bigint,
    "squareLocationId" text,
    "time" text,
    permits text,
    employees text,
    "eventRating" text,
    "eventHost" text,
    "squareGrossSales" double precision,
    "squareNetSales" double precision,
    "squareRefunds" double precision,
    "squareFees" double precision,
    "totalCosts" double precision,
    "netProfit" double precision,
    "profitMargin" double precision,
    "teamArrivalRating" bigint,
    "teamExecutionRating" bigint,
    "teamCommunicationRating" bigint,
    "teamCleanUpRating" bigint,
    "teamProfessionalismRating" bigint,
    "internalNotes" text,
    "vendorAccessRating" bigint,
    "eventOrganizationRating" bigint,
    "crowdQualityRating" bigint,
    "weatherImpactRating" bigint,
    "hostCommunicationRating" bigint,
    "externalNotes" text,
    "internalScore" double precision,
    "externalScore" double precision,
    "eventScore" double precision,
    "eventLocation" text,
    "customFields" text,
    "healthDeptFee" double precision,
    "mileageReimbursement" double precision,
    "eventRunnerFees" double precision,
    "taxOverride" double precision,
    state text,
    "zipCode" text,
    "userId" text,
    "salesFeesLocked" boolean DEFAULT false,
    timezone text
);

--
-- Name: EventInfo_eventID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventInfo_eventID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventInfo_eventID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventInfo_eventID_seq" OWNED BY public."EventInfo"."eventID";

--
-- Name: EventInventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventInventory" (
    id integer NOT NULL,
    "eventID" integer NOT NULL,
    "inventoryId" integer NOT NULL,
    "startingQty" real DEFAULT 0 NOT NULL,
    "quantityOnHand" real DEFAULT 0 NOT NULL,
    "reorderThreshold" real DEFAULT 0 NOT NULL,
    "reorderQty" real DEFAULT 0 NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);

--
-- Name: EventInventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventInventory_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventInventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventInventory_id_seq" OWNED BY public."EventInventory".id;

--
-- Name: EventLabor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventLabor" (
    "laborID" bigint NOT NULL,
    "eventID" bigint,
    "employeeName" text,
    "hoursWorked" double precision,
    "hourlyRate" double precision,
    "createdAt" text,
    "updatedAt" text,
    "flatRate" double precision
);

--
-- Name: EventLabor_laborID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventLabor_laborID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventLabor_laborID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventLabor_laborID_seq" OWNED BY public."EventLabor"."laborID";

--
-- Name: EventPayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventPayments" (
    "PaymentID" bigint NOT NULL,
    "EventID" bigint,
    "Method" text,
    "Amount" double precision,
    "Metadata" text
);

--
-- Name: EventPermits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventPermits" (
    "permitID" bigint NOT NULL,
    "eventID" bigint,
    "fileName" text,
    "originalName" text,
    "mimeType" text,
    "uploadedAt" timestamp without time zone
);

--
-- Name: EventSalesFees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventSalesFees" (
    id integer NOT NULL,
    "eventID" integer NOT NULL,
    "itemName" text NOT NULL,
    "recipeId" integer,
    "matchType" text,
    "matchedName" text,
    "quantitySold" integer DEFAULT 0 NOT NULL,
    "costPerUnit" real DEFAULT 0 NOT NULL,
    "totalCost" real DEFAULT 0 NOT NULL,
    "calculatedAt" timestamp without time zone DEFAULT now()
);

--
-- Name: EventSalesFees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventSalesFees_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventSalesFees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventSalesFees_id_seq" OWNED BY public."EventSalesFees".id;

--
-- Name: EventSupplies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventSupplies" (
    id bigint NOT NULL,
    "eventID" bigint,
    "itemName" text,
    "unitCost" double precision,
    "quantityUsed" double precision,
    "createdAt" timestamp without time zone,
    "vendorInventoryId" integer
);

--
-- Name: EventSupplies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EventSupplies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: EventSupplies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EventSupplies_id_seq" OWNED BY public."EventSupplies".id;

--
-- Name: EventTaxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventTaxes" (
    "eventID" bigint NOT NULL,
    "federalTaxRate" double precision,
    "stateTaxRate" double precision,
    "localTaxRate" double precision,
    "taxOverrideAmount" double precision,
    "taxNotes" text,
    "updatedAt" text
);

--
-- Name: FormTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormTemplate" (
    "TemplateID" bigint NOT NULL,
    "TemplateName" text,
    "Fields" text,
    "CreatedAt" timestamp without time zone
);

--
-- Name: FormTemplate_TemplateID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FormTemplate_TemplateID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: FormTemplate_TemplateID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FormTemplate_TemplateID_seq" OWNED BY public."FormTemplate"."TemplateID";

--
-- Name: InventoryAlerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryAlerts" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    "itemId" integer,
    "itemName" text,
    message text,
    "isRead" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now()
);

--
-- Name: InventoryAlerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."InventoryAlerts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: InventoryAlerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."InventoryAlerts_id_seq" OWNED BY public."InventoryAlerts".id;

--
-- Name: InventoryMovements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryMovements" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    "inventoryId" integer NOT NULL,
    "eventID" integer,
    "qtyChange" real NOT NULL,
    reason text NOT NULL,
    "squareOrderId" text,
    "squareLineUid" text,
    note text,
    "createdAt" timestamp without time zone DEFAULT now()
);

--
-- Name: InventoryMovements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."InventoryMovements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: InventoryMovements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."InventoryMovements_id_seq" OWNED BY public."InventoryMovements".id;

--
-- Name: InventorySales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventorySales" (
    id integer NOT NULL,
    "eventID" integer,
    name text,
    "quantitySold" integer,
    "totalCost" real,
    "unitPrice" real,
    category text,
    metadata text,
    "rowCost" real,
    source text
);

--
-- Name: InventorySales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."InventorySales_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: InventorySales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."InventorySales_id_seq" OWNED BY public."InventorySales".id;

--
-- Name: OAuthState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OAuthState" (
    state text NOT NULL,
    "createdAt" timestamp without time zone,
    "userId" text NOT NULL
);

--
-- Name: PosItemMapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PosItemMapping" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    "posSystem" text DEFAULT 'square'::text NOT NULL,
    "posItemId" text NOT NULL,
    "posItemName" text,
    "variationName" text,
    "inventoryId" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);

--
-- Name: PosItemMapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."PosItemMapping_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: PosItemMapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."PosItemMapping_id_seq" OWNED BY public."PosItemMapping".id;

--
-- Name: RecipeCards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecipeCards" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    "squareName" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);

--
-- Name: RecipeCards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."RecipeCards_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: RecipeCards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."RecipeCards_id_seq" OWNED BY public."RecipeCards".id;

--
-- Name: RecipeIngredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecipeIngredients" (
    id integer NOT NULL,
    "recipeId" integer NOT NULL,
    "ingredientName" text NOT NULL,
    "quantityUsed" real DEFAULT 1 NOT NULL,
    "unitType" text,
    "unitCost" real DEFAULT 0 NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "inventoryId" integer
);

--
-- Name: RecipeIngredients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."RecipeIngredients_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: RecipeIngredients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."RecipeIngredients_id_seq" OWNED BY public."RecipeIngredients".id;

--
-- Name: SalesSummary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesSummary" (
    "salesID" bigint NOT NULL,
    "eventID" bigint,
    "squareTxnID" text,
    "grossSales" double precision,
    "netSales" double precision,
    discounts double precision,
    refunds double precision,
    tips double precision,
    "totalCollected" double precision,
    "datePulledAt" text,
    "squareReportedTax" double precision,
    "squareFees" double precision,
    cash double precision,
    card double precision,
    wallet double precision,
    "cashApp" double precision,
    other double precision,
    "feesPending" bigint,
    "squareFeesFinal" double precision,
    "totalNetRevenue" double precision,
    "DatePulledAt" timestamp without time zone DEFAULT now()
);

--
-- Name: SalesSummary_salesID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."SalesSummary_salesID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: SalesSummary_salesID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."SalesSummary_salesID_seq" OWNED BY public."SalesSummary"."salesID";

--
-- Name: squareauth_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squareauth_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: SquareAuth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SquareAuth" (
    id bigint DEFAULT nextval('public.squareauth_id_seq'::regclass) NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "merchantId" text,
    "createdAt" text,
    "updatedAt" text,
    "expiresAt" text
);

--
-- Name: SquareConnection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SquareConnection" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    "merchantId" text,
    "accessTokenEnc" text NOT NULL,
    "refreshTokenEnc" text,
    "expiresAt" timestamp with time zone,
    scopes text,
    status text DEFAULT 'connected'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);

--
-- Name: SquareConnection_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."SquareConnection_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: SquareConnection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."SquareConnection_id_seq" OWNED BY public."SquareConnection".id;

--
-- Name: SquareLocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SquareLocations" (
    "LocationID" text NOT NULL,
    "Name" text,
    "Status" text,
    "Address" text,
    "CreatedAt" timestamp without time zone
);

--
-- Name: SquareSyncState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SquareSyncState" (
    "eventID" integer NOT NULL,
    "lastClosedAt" timestamp without time zone,
    "lastSyncAt" timestamp without time zone DEFAULT now(),
    "isLive" boolean DEFAULT true
);

--
-- Name: SupplyCosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyCosts" (
    "supplyCostID" bigint NOT NULL,
    "eventID" bigint,
    "itemName" text,
    category text,
    quantity double precision,
    "unitCost" double precision,
    notes text,
    "createdAt" timestamp without time zone,
    "updatedAt" timestamp without time zone
);

--
-- Name: tiptracker_tipid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tiptracker_tipid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: TipTracker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TipTracker" (
    "tipID" bigint DEFAULT nextval('public.tiptracker_tipid_seq'::regclass) NOT NULL,
    "eventID" bigint,
    "tipAmount" double precision,
    source text,
    "createdAt" timestamp without time zone
);

--
-- Name: UserPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserPlan" (
    "userId" text NOT NULL,
    plan text DEFAULT 'starter'::text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "squareBannerDismissed" boolean DEFAULT false
);

--
-- Name: VendorInventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VendorInventory" (
    id integer NOT NULL,
    "userId" text NOT NULL,
    "itemName" text NOT NULL,
    "unitCost" real DEFAULT 0 NOT NULL,
    category text,
    sku text,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "quantityOnHand" real DEFAULT 0,
    "reorderThreshold" real DEFAULT 0,
    "reorderQty" real DEFAULT 0
);

--
-- Name: VendorInventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."VendorInventory_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: VendorInventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."VendorInventory_id_seq" OWNED BY public."VendorInventory".id;

--
-- Name: vw_event_inventory_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_event_inventory_usage AS
 SELECT ei."eventID",
    ei."inventoryId",
    v."itemName",
    ei."startingQty",
    ei."quantityOnHand",
    GREATEST((0)::real, (ei."startingQty" - ei."quantityOnHand")) AS "qtyUsed",
        CASE
            WHEN (ei."startingQty" > (0)::double precision) THEN round(((((ei."startingQty" - ei."quantityOnHand"))::numeric / (ei."startingQty")::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS "pctUsed"
   FROM (public."EventInventory" ei
     JOIN public."VendorInventory" v ON ((v.id = ei."inventoryId")));

--
-- Name: vw_inventory_onhand_from_ledger; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_inventory_onhand_from_ledger AS
SELECT
    NULL::integer AS "inventoryId",
    NULL::text AS "userId",
    NULL::text AS "itemName",
    NULL::real AS "reorderThreshold",
    NULL::real AS "qtyFromLedger",
    NULL::real AS "qtyOnTable",
    NULL::real AS drift;

--
-- Name: DrinkSales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DrinkSales" ALTER COLUMN id SET DEFAULT nextval('public."DrinkSales_id_seq"'::regclass);

--
-- Name: EventDays dayID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDays" ALTER COLUMN "dayID" SET DEFAULT nextval('public."EventDays_dayID_seq"'::regclass);

--
-- Name: EventEmployees eventEmployeeID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventEmployees" ALTER COLUMN "eventEmployeeID" SET DEFAULT nextval('public."EventEmployees_eventEmployeeID_seq"'::regclass);

--
-- Name: EventInfo eventID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInfo" ALTER COLUMN "eventID" SET DEFAULT nextval('public."EventInfo_eventID_seq"'::regclass);

--
-- Name: EventInventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInventory" ALTER COLUMN id SET DEFAULT nextval('public."EventInventory_id_seq"'::regclass);

--
-- Name: EventLabor laborID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventLabor" ALTER COLUMN "laborID" SET DEFAULT nextval('public."EventLabor_laborID_seq"'::regclass);

--
-- Name: EventSalesFees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSalesFees" ALTER COLUMN id SET DEFAULT nextval('public."EventSalesFees_id_seq"'::regclass);

--
-- Name: EventSupplies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSupplies" ALTER COLUMN id SET DEFAULT nextval('public."EventSupplies_id_seq"'::regclass);

--
-- Name: FormTemplate TemplateID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTemplate" ALTER COLUMN "TemplateID" SET DEFAULT nextval('public."FormTemplate_TemplateID_seq"'::regclass);

--
-- Name: InventoryAlerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryAlerts" ALTER COLUMN id SET DEFAULT nextval('public."InventoryAlerts_id_seq"'::regclass);

--
-- Name: InventoryMovements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryMovements" ALTER COLUMN id SET DEFAULT nextval('public."InventoryMovements_id_seq"'::regclass);

--
-- Name: InventorySales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventorySales" ALTER COLUMN id SET DEFAULT nextval('public."InventorySales_id_seq"'::regclass);

--
-- Name: PosItemMapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PosItemMapping" ALTER COLUMN id SET DEFAULT nextval('public."PosItemMapping_id_seq"'::regclass);

--
-- Name: RecipeCards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeCards" ALTER COLUMN id SET DEFAULT nextval('public."RecipeCards_id_seq"'::regclass);

--
-- Name: RecipeIngredients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeIngredients" ALTER COLUMN id SET DEFAULT nextval('public."RecipeIngredients_id_seq"'::regclass);

--
-- Name: SalesSummary salesID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesSummary" ALTER COLUMN "salesID" SET DEFAULT nextval('public."SalesSummary_salesID_seq"'::regclass);

--
-- Name: SquareConnection id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareConnection" ALTER COLUMN id SET DEFAULT nextval('public."SquareConnection_id_seq"'::regclass);

--
-- Name: VendorInventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VendorInventory" ALTER COLUMN id SET DEFAULT nextval('public."VendorInventory_id_seq"'::regclass);

--
-- Name: AdditionalFees AdditionalFees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdditionalFees"
    ADD CONSTRAINT "AdditionalFees_pkey" PRIMARY KEY (id);

--
-- Name: Companies Companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Companies"
    ADD CONSTRAINT "Companies_pkey" PRIMARY KEY ("CompanyID");

--
-- Name: Discounts Discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Discounts"
    ADD CONSTRAINT "Discounts_pkey" PRIMARY KEY ("discountID");

--
-- Name: DrinkSales DrinkSales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DrinkSales"
    ADD CONSTRAINT "DrinkSales_pkey" PRIMARY KEY (id);

--
-- Name: EmployeeTracker EmployeeTracker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTracker"
    ADD CONSTRAINT "EmployeeTracker_pkey" PRIMARY KEY ("employeeID");

--
-- Name: EventDays EventDays_eventID_dayNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDays"
    ADD CONSTRAINT "EventDays_eventID_dayNumber_key" UNIQUE ("eventID", "dayNumber");

--
-- Name: EventDays EventDays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDays"
    ADD CONSTRAINT "EventDays_pkey" PRIMARY KEY ("dayID");

--
-- Name: EventEmployees EventEmployees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventEmployees"
    ADD CONSTRAINT "EventEmployees_pkey" PRIMARY KEY ("eventEmployeeID");

--
-- Name: EventExpenses EventExpenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventExpenses"
    ADD CONSTRAINT "EventExpenses_pkey" PRIMARY KEY ("eventID");

--
-- Name: EventFinalizeSnapshot EventFinalizeSnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFinalizeSnapshot"
    ADD CONSTRAINT "EventFinalizeSnapshot_pkey" PRIMARY KEY ("snapshotID");

--
-- Name: EventInfo EventInfo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInfo"
    ADD CONSTRAINT "EventInfo_pkey" PRIMARY KEY ("eventID");

--
-- Name: EventInventory EventInventory_eventID_inventoryId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInventory"
    ADD CONSTRAINT "EventInventory_eventID_inventoryId_key" UNIQUE ("eventID", "inventoryId");

--
-- Name: EventInventory EventInventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInventory"
    ADD CONSTRAINT "EventInventory_pkey" PRIMARY KEY (id);

--
-- Name: EventLabor EventLabor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventLabor"
    ADD CONSTRAINT "EventLabor_pkey" PRIMARY KEY ("laborID");

--
-- Name: EventPayments EventPayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventPayments"
    ADD CONSTRAINT "EventPayments_pkey" PRIMARY KEY ("PaymentID");

--
-- Name: EventPermits EventPermits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventPermits"
    ADD CONSTRAINT "EventPermits_pkey" PRIMARY KEY ("permitID");

--
-- Name: EventSalesFees EventSalesFees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSalesFees"
    ADD CONSTRAINT "EventSalesFees_pkey" PRIMARY KEY (id);

--
-- Name: EventSupplies EventSupplies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSupplies"
    ADD CONSTRAINT "EventSupplies_pkey" PRIMARY KEY (id);

--
-- Name: EventTaxes EventTaxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventTaxes"
    ADD CONSTRAINT "EventTaxes_pkey" PRIMARY KEY ("eventID");

--
-- Name: FormTemplate FormTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormTemplate"
    ADD CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("TemplateID");

--
-- Name: InventoryAlerts InventoryAlerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryAlerts"
    ADD CONSTRAINT "InventoryAlerts_pkey" PRIMARY KEY (id);

--
-- Name: InventoryMovements InventoryMovements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryMovements"
    ADD CONSTRAINT "InventoryMovements_pkey" PRIMARY KEY (id);

--
-- Name: InventorySales InventorySales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventorySales"
    ADD CONSTRAINT "InventorySales_pkey" PRIMARY KEY (id);

--
-- Name: OAuthState OAuthState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OAuthState"
    ADD CONSTRAINT "OAuthState_pkey" PRIMARY KEY (state);

--
-- Name: PosItemMapping PosItemMapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PosItemMapping"
    ADD CONSTRAINT "PosItemMapping_pkey" PRIMARY KEY (id);

--
-- Name: PosItemMapping PosItemMapping_userId_posSystem_posItemId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PosItemMapping"
    ADD CONSTRAINT "PosItemMapping_userId_posSystem_posItemId_key" UNIQUE ("userId", "posSystem", "posItemId");

--
-- Name: RecipeCards RecipeCards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeCards"
    ADD CONSTRAINT "RecipeCards_pkey" PRIMARY KEY (id);

--
-- Name: RecipeIngredients RecipeIngredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeIngredients"
    ADD CONSTRAINT "RecipeIngredients_pkey" PRIMARY KEY (id);

--
-- Name: SalesSummary SalesSummary_eventID_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesSummary"
    ADD CONSTRAINT "SalesSummary_eventID_unique" UNIQUE ("eventID");

--
-- Name: SalesSummary SalesSummary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesSummary"
    ADD CONSTRAINT "SalesSummary_pkey" PRIMARY KEY ("salesID");

--
-- Name: SquareAuth SquareAuth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareAuth"
    ADD CONSTRAINT "SquareAuth_pkey" PRIMARY KEY (id);

--
-- Name: SquareConnection SquareConnection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareConnection"
    ADD CONSTRAINT "SquareConnection_pkey" PRIMARY KEY (id);

--
-- Name: SquareConnection SquareConnection_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareConnection"
    ADD CONSTRAINT "SquareConnection_userId_key" UNIQUE ("userId");

--
-- Name: SquareLocations SquareLocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareLocations"
    ADD CONSTRAINT "SquareLocations_pkey" PRIMARY KEY ("LocationID");

--
-- Name: SquareSyncState SquareSyncState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareSyncState"
    ADD CONSTRAINT "SquareSyncState_pkey" PRIMARY KEY ("eventID");

--
-- Name: SupplyCosts SupplyCosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyCosts"
    ADD CONSTRAINT "SupplyCosts_pkey" PRIMARY KEY ("supplyCostID");

--
-- Name: TipTracker TipTracker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TipTracker"
    ADD CONSTRAINT "TipTracker_pkey" PRIMARY KEY ("tipID");

--
-- Name: UserPlan UserPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserPlan"
    ADD CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("userId");

--
-- Name: VendorInventory VendorInventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VendorInventory"
    ADD CONSTRAINT "VendorInventory_pkey" PRIMARY KEY (id);

--
-- Name: EventInfo_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventInfo_userId_idx" ON public."EventInfo" USING btree ("userId");

--
-- Name: EventInventory_eventID_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventInventory_eventID_idx" ON public."EventInventory" USING btree ("eventID");

--
-- Name: EventInventory_inventoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventInventory_inventoryId_idx" ON public."EventInventory" USING btree ("inventoryId");

--
-- Name: EventSalesFees_eventID_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSalesFees_eventID_idx" ON public."EventSalesFees" USING btree ("eventID");

--
-- Name: InventoryMovements_eventID_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryMovements_eventID_idx" ON public."InventoryMovements" USING btree ("eventID");

--
-- Name: InventoryMovements_inventoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryMovements_inventoryId_idx" ON public."InventoryMovements" USING btree ("inventoryId");

--
-- Name: InventoryMovements_sale_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryMovements_sale_dedupe" ON public."InventoryMovements" USING btree ("squareOrderId", "squareLineUid", "inventoryId") WHERE ("squareOrderId" IS NOT NULL);

--
-- Name: InventoryMovements_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryMovements_userId_idx" ON public."InventoryMovements" USING btree ("userId");

--
-- Name: PosItemMapping_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PosItemMapping_userId_idx" ON public."PosItemMapping" USING btree ("userId", "posSystem");

--
-- Name: RecipeCards_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecipeCards_name_idx" ON public."RecipeCards" USING btree ("userId", name);

--
-- Name: RecipeCards_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecipeCards_userId_idx" ON public."RecipeCards" USING btree ("userId");

--
-- Name: RecipeIngredients_inventoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecipeIngredients_inventoryId_idx" ON public."RecipeIngredients" USING btree ("inventoryId");

--
-- Name: RecipeIngredients_recipeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecipeIngredients_recipeId_idx" ON public."RecipeIngredients" USING btree ("recipeId");

--
-- Name: VendorInventory_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VendorInventory_userId_idx" ON public."VendorInventory" USING btree ("userId");

--
-- Name: vw_inventory_onhand_from_ledger _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.vw_inventory_onhand_from_ledger AS
 SELECT v.id AS "inventoryId",
    v."userId",
    v."itemName",
    v."reorderThreshold",
    COALESCE(sum(m."qtyChange"), (0)::real) AS "qtyFromLedger",
    v."quantityOnHand" AS "qtyOnTable",
    (v."quantityOnHand" - COALESCE(sum(m."qtyChange"), (0)::real)) AS drift
   FROM (public."VendorInventory" v
     LEFT JOIN public."InventoryMovements" m ON ((m."inventoryId" = v.id)))
  GROUP BY v.id;

--
-- Name: EventDays EventDays_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDays"
    ADD CONSTRAINT "EventDays_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID") ON DELETE CASCADE;

--
-- Name: EventInventory EventInventory_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInventory"
    ADD CONSTRAINT "EventInventory_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID") ON DELETE CASCADE;

--
-- Name: EventInventory EventInventory_inventoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventInventory"
    ADD CONSTRAINT "EventInventory_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES public."VendorInventory"(id);

--
-- Name: EventSalesFees EventSalesFees_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSalesFees"
    ADD CONSTRAINT "EventSalesFees_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID") ON DELETE CASCADE;

--
-- Name: EventSalesFees EventSalesFees_recipeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSalesFees"
    ADD CONSTRAINT "EventSalesFees_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES public."RecipeCards"(id) ON DELETE SET NULL;

--
-- Name: InventoryMovements InventoryMovements_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryMovements"
    ADD CONSTRAINT "InventoryMovements_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID") ON DELETE SET NULL;

--
-- Name: InventoryMovements InventoryMovements_inventoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryMovements"
    ADD CONSTRAINT "InventoryMovements_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES public."VendorInventory"(id) ON DELETE CASCADE;

--
-- Name: InventorySales InventorySales_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventorySales"
    ADD CONSTRAINT "InventorySales_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID");

--
-- Name: PosItemMapping PosItemMapping_inventoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PosItemMapping"
    ADD CONSTRAINT "PosItemMapping_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES public."VendorInventory"(id) ON DELETE SET NULL;

--
-- Name: RecipeIngredients RecipeIngredients_inventoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeIngredients"
    ADD CONSTRAINT "RecipeIngredients_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES public."VendorInventory"(id) ON DELETE SET NULL;

--
-- Name: RecipeIngredients RecipeIngredients_recipeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecipeIngredients"
    ADD CONSTRAINT "RecipeIngredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES public."RecipeCards"(id) ON DELETE CASCADE;

--
-- Name: SquareSyncState SquareSyncState_eventID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SquareSyncState"
    ADD CONSTRAINT "SquareSyncState_eventID_fkey" FOREIGN KEY ("eventID") REFERENCES public."EventInfo"("eventID") ON DELETE CASCADE;

