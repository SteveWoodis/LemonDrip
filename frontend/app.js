// ---------------------------
// App created by Steve Woodis
//
// 🧭 Simple Client Router (cleaned)
// activeEvent -placeholder for the current event being acted upon
// currentAction - whatever the current action is. The default is the Manage action
// events - array to store objects
// formTemplate - Object to store Templates created by Design Event action
// ---------------------------
let activeEvent = null;
let currentAction = "manage";
let events = [];
let formTemplate = { templateName: "Custom Event Form", fields: [] };
let lastLoadedEvents = [];
let expensesEditMode = false;
window.USER_PLAN = "starter"; // or "pro"

// -----------------------------
// Home – Activity Image Rotator (STATE)
// -----------------------------

const activityImages = [
  "images/lemon-1.png",
  "images/lemon-2.png",
  "images/lemon-3.png",
  "images/lemon-4.png",
  "images/lemon-5.png",
  "images/lemon-6.png"
];

const CANONICAL_EVENT_FIELDS = {
  "Event Name": "eventName",
  "Event Date": "eventDate",
  "Application Date": "applicationDate",
  "Event Host": "eventHost",
  "Event Rating": "eventRating",
  "Event Type": "eventType",
  "Status": "status",
  "Coordinator": "coordinator",
  "Employees": "employees",
  "Notes": "notes",
  "Number of Days": "numDays",
  "Square Location": "squareLocationId"
};

let activityImageIndex = 0;
let activityImageTimer = null;

function safeLabelFromText(label) {
  return String(label || "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

// Canonical LABEL -> Canonical DB KEY (your backend contract)
const CANONICAL_LABEL_TO_DBKEY = {
  "eventName": "eventName",
  "eventDate": "eventDate",
  "applicationDate": "applicationDate",
  "eventFee": "eventFee",
  "eventHost": "eventHost",
  "eventLocation": "eventLocation",
  "Event Name": "eventName",
  "Event Date": "eventDate",
  "Application Date": "applicationDate",
  "Event Host": "eventHost",
  "Event Rating": "eventRating",
  "Event Type": "eventType",
  "Status": "status",
  "Coordinator": "coordinator",
  "Employees": "employees",
  "Notes": "notes",
  "Number of Days": "numDays",
  "Event Fee": "eventFee",
  "Event Location": "eventLocation",
  "Permits": "permits",
  "Finalized Date": "finalizedDate",
  "Time": "time",
  "Square Location": "squareLocationId"
};

function buildEventPayloadFromTemplate({ raw, template }) {
  const canonical = {};
  const customFields = {};

  const fields = (template?.fields?.[0]?.fields || template?.fields || []);
  if (!Array.isArray(fields)) {
    return { canonical, customFields };
  }

  for (const field of fields) {
    if (!field || !field.label) continue;

    const idKey = field.id || safeLabelFromText(field.label);
    const value = raw[idKey] ?? null;

    // 1) dbKey wins
    if (field.dbKey) {
      canonical[field.dbKey] = value;
      continue;
    }

    // 2) Known canonical labels
    const mapped = CANONICAL_LABEL_TO_DBKEY[field.label];
    if (mapped) {
      canonical[mapped] = value;
      continue;
    }

    // 3) Custom field
    customFields[field.label] = value;
  }

  if (Object.keys(customFields).length) {
    canonical.customFields = customFields;
  }

  return { canonical, customFields };
}



// ---------------------------
// 💾 Persistent State (localStorage)// 🔗 Backend base URL
const API_BASE = "http://localhost:3000";

// ---------------------------
// 🔄 Event Normalization Helpers
// ---------------------------
function normalizeEvent(e) {
	const n = (v) =>
  v === null || v === undefined ? null : Number(v);

  if (!e) {
  return {
    eventID: null,
    eventName: "",
    eventDate: "",
    coordinator: "",
    eventLocation: "",
    status: "",
    isFinalized: 0,

    sales: e.sales || null,
    expenses: e.expenses || null,   // ✅ REQUIRED
    totals: e.totals || null,       // ✅ REQUIRED

    drinkSales: e.drinkSales || [],
    additionalFees: e.additionalFees || [],
    discounts: e.discounts || [],
    tips: e.tips || [],
    supplies: e.supplies || [],
    labor: e.labor || []
  };
}


  const info = e.EventInfo ?? e;

  const normalized = {
    // ------------ BASIC EVENT METADATA ------------
    eventID:
      e.eventID ??
      e.EventID ??
      info.eventID ??
      info.EventID ??
      e["Event ID"] ??
      null,

    eventName:
      info.eventName ??
      info.EventName ??
      e.eventName ??
      e.EventName ??
      "",

    eventDate:
      info.eventDate ??
      info.EventDate ??
      e.eventDate ??
      e.EventDate ??
      "",

    coordinator:
      info.coordinator ??
      info.Coordinator ??
      e.coordinator ??
      "",

    eventLocation:
      info.eventLocation ??
      info.EventLocation ??
      info.location ??
      e.eventLocation ??
      "",

    eventType:
      info.eventType ??
      info.EventType ??
      e.eventType ??
      "",

    numDays:
      info.numDays ??
      info.NumDays ??
      e.numDays ??
      "",

    status:
      info.status ??
      info.EventStatus ??
      e.status ??
      "",

    isFinalized:
      Number(info.isFinalized ?? info.IsFinalized ?? e.isFinalized ?? 0),

    finalizedDate:
      info.finalizedDate ??
      info.FinalizedDate ??
      e.finalizedDate ??
      null,

    squareLocationId:
      info.squareLocationId ??
      info.SquareLocationID ??
      e.squareLocationId ??
      e.SquareLocationID ??
      null,

    // ------------ POST-EVENT REPORT FIELDS ------------
    drinkSales: Array.isArray(e.drinkSales) ? e.drinkSales : [],
    additionalFees: Array.isArray(e.additionalFees) ? e.additionalFees : [],
    discounts: Array.isArray(e.discounts) ? e.discounts : [],
    supplies: Array.isArray(e.supplies) ? e.supplies : [],
    tips: Array.isArray(e.tips) ? e.tips : [],
    labor: Array.isArray(e.labor) ? e.labor : [],

    expenses: e.expenses ?? null,
    totals: e.totals ?? null,
    sales: {
	  ...e.sales,
	  grossSales: e.sales?.grossSales ?? 0,
	  netSales: e.sales?.netSales ?? 0,
	  discounts: e.sales?.discounts ?? 0,
    refunds: e.sales?.refunds ?? 0,
	  totalCollected: e.sales?.totalCollected ?? 0
	},

    customFields:
      typeof e.customFields === "string"
        ? (JSON.parse(e.customFields || "{}") || {})
        : e.customFields || {},
  };

  // 🔹 Profit-related event-level fields
  normalized.healthDeptFee        = n(e.healthDeptFee);
  normalized.mileageReimbursement = n(e.mileageReimbursement);
  normalized.eventRunnerFees      = n(e.eventRunnerFees);

  normalized.giftCardSales = n(e.giftCardSales);

   normalized.taxOverride = e.taxOverride ?? null;

  // 🔹 Attach Square tax/fees safely (works for both list + report payloads)
  const srcSales = e.sales || {};
  if (!normalized.sales || typeof normalized.sales !== "object") {
    normalized.sales = {};
  }

  normalized.sales.squareReportedTax = n(
    srcSales.squareReportedTax ?? e.squareReportedTax
  );
  normalized.sales.squareFees = n(
    srcSales.squareFees ?? e.squareFees
  );


// ✅ Guarantee expenses object
normalized.expenses = normalized.expenses ?? {
  healthDeptFee: 0,
  eventFee: 0,
  mileageReimbursement: 0,
  eventRunnerFees: 0,
  employeeBonus: 0,
  supplyFees: 0,
  additionalFees: 0,
  laborFees: 0,
  totalExpenses: 0
};

// ✅ Guarantee totals object
normalized.totals = normalized.totals ?? {
  totalNetRevenue: 0,
  totalExpenses: normalized.expenses.totalExpenses ?? 0,
  grossProfit: 0
};


   return normalized;
}
function getFinalizedEventCount() {
  return (window.events || []).filter(e => Number(e.isFinalized) === 1).length;
}

//---------------------
//showUpgradeModal
//---------------------
function showUpgradeModal(title, message) {
  alert(`${title}\n\n${message}\n\nUpgrade to Pro to continue.`);
}

//
// ---------------------------
function saveAppState() {
  const state = {
    activeAction: currentAction,
    activeEvent: activeEvent,
    editMode: document.getElementById("btnEdit")?.classList.contains("active")
  };
  localStorage.setItem("lemon_app_state", JSON.stringify(state));
}

// Load the current App State
async function loadAppState() {
  const saved = localStorage.getItem("lemon_app_state");

  if (!saved) {
    // default: show Manage Events
    navigateTo("homeSection");
    return;
  }
  try {
    const state = JSON.parse(saved);
    const sectionId =
      (state.activeAction ? state.activeAction : "manage") + "Section";
    if (document.getElementById(sectionId)) {
      navigateTo(sectionId);
    } else {
      navigateTo("homeSection");
    }
    // ...rest unchanged
  } catch (err) {
    console.warn("⚠️ Failed to restore app state:", err);
    navigateTo("homeSection");
  }
}

// Handle browser back/forward
window.addEventListener("popstate", (event) => {
  const action = event.state?.action || eventLocation.hash.replace("#/", "");
  if (action) navigateTo(action + "Section"); // ✅ replaced showSection
});

// On initial page load
window.addEventListener("DOMContentLoaded", () => {
  loadAppState();
});

// ---------------------------
// 🧰 Utility: Convert keys to camelCase recursively
// ---------------------------
function toCamelCaseKeys(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseKeys);
  } else if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      acc[camelKey] = toCamelCaseKeys(value);
      return acc;
    }, {});
  }
  return obj;
}
function getSafeEventID(obj) {
  return (
    obj.eventID ||
    obj.EventID ||
    obj["Event ID"] ||
    obj.EventInfo?.eventID ||
    obj.EventInfo?.EventID ||
    null
  );
}

// ---------------------------
// 🧭 Clean Universal Navigator
// ---------------------------
function navigateTo(sectionId) {
  document.querySelectorAll("section").forEach((sec) =>
    sec.classList.add("hidden")
  );

  const section = document.getElementById(sectionId);
  if (!section) return console.warn(`⚠️ Section "${sectionId}" not found`);

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });

  if (sectionId === "homeSection") {
  if (typeof loadRecentActivity === "function") {
    loadRecentActivity();
  }
  if (typeof startActivityImageRotation === "function") {
    startActivityImageRotation();
  }
}


  // ⭐ AUTO-LOAD EVENTS ON MANAGE PAGE
  if (sectionId === "manageSection") {
    loadAllEvents();     // <-- FIX EVERYTHING
  }
}

window.navigateTo = navigateTo; // <-- FIX

function formatEvent(e) {
  const n = normalizeEvent(e);
  return {
    eventID: n.eventID,
    eventName: n.eventName,
    eventDate: n.eventDate,
    coordinator: n.coordinator,
    eventLocation: n.eventLocation,
    squareLocationId: n.squareLocationId,
    isFinalized: n.isFinalized,
    finalizedDate: n.finalizedDate,
    status: n.status,
  };
}



// -------------------------------------
// END IF UTILITIES
// -------------------------------------
function createStarRating(name, currentValue = 0, editable = true) {
  const container = document.createElement("div");
  container.classList.add("star-container");

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.classList.add("star");
    star.textContent = "★";
    star.dataset.value = i;

    if (i <= currentValue) star.classList.add("filled");

    if (editable) {
      star.addEventListener("click", () => {
        container.querySelectorAll(".star").forEach((s) => {
          s.classList.toggle(
            "filled",
            Number(s.dataset.value) <= i
          );
        });
        container.dataset.value = i;
      });
    }

    container.appendChild(star);
  }

  container.dataset.value = currentValue;
  container.dataset.field = name;

  return container;
}

// ✅ Removed old showSection() entirely

// ---------------------------
// 🟡 LemonDrip Expandable Table Builder
// modified 10-17-25 8:30 am.
// ---------------------------
function buildTableHTML(results, containerId = "searchResults") {
  results = results.map(ev => {
    if (ev.customFields && typeof ev.customFields === "string") {
      try {
        const parsed = JSON.parse(ev.customFields);
        ev.customFields = Object.entries(parsed)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
      } catch {
        // leave as-is
      }
    }
    return ev;
  });

  const container = document.getElementById(containerId) || document.body;
  container.innerHTML = "";

  if (!results.length) {
    container.textContent = "No matching events found.";
    return;
  }

  const table = document.createElement("table");
  table.classList.add("results-table", "lemondrip-table");

  const header = table.createTHead();
  const headerRow = header.insertRow();

  Object.keys(results[0]).forEach((key) => {
    const th = document.createElement("th");
    th.textContent = key;
    headerRow.appendChild(th);
  });

  const body = table.createTBody();

  results.forEach((event) => {
    const tr = body.insertRow();

    Object.keys(results[0]).forEach((key, colIndex) => {
      const td = tr.insertCell();
      let val = event[key] ?? "";

      if (colIndex === 0 && event.isFinalized) {
        const spanName = document.createElement("span");
        spanName.textContent = val;

        const badge = document.createElement("span");
        badge.textContent = "FINALIZED";
        badge.className = "finalized-badge";

        td.appendChild(spanName);
        td.appendChild(badge);
      } else {
        td.textContent = val ?? "";
      }
    });

    tr.addEventListener("click", async () => {
      try {
        const eventID = getSafeEventID(event);

        if (!eventID) {
          console.warn("⚠️ No eventID found for clicked row:", event);
          alert("eventID missing — cannot load details.");
          return;
        }
        if (window.USER_PLAN === "starter" && event.isFinalized === 1) {
          showUpgradeModal(
            "Event history is a Pro feature.",
            "Upgrade to view finalized events and trends."
          );
          return;
        }

        const res = await fetch(`${API_BASE}/api/events/${eventID}/report`);
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const report = await res.json();

        const fullEvent = normalizeEvent({
          ...report.event,
          drinkSales: report.drinkSales,
          additionalFees: report.additionalFees,
          discounts: report.discounts,
          tips: report.tips,
          supplies: report.supplies,
          labor: report.labor,
          totals: report.totals,
          sales: report.sales,
        });

        console.log("⭐ FULL REPORT EVENT LOADED:", fullEvent);
        loadEventIntoDashboard(fullEvent);
      } catch (err) {
        console.error("❌ Error loading event details:", err);
        alert("Could not load event details.");
      }
    });
  });

  // ⭐ FIXED: OUTSIDE THE LOOP
  container.appendChild(table);
} // ⭐ FIXED: PROPER CLOSING BRACE




async function filterEvents(mode) {
  const events = lastLoadedEvents;

  let filtered = events;

  if (mode === "finalized") {
    filtered = lastLoadedEvents.filter(e => e.isFinalized == 1);
  } else if (mode === "notfinalized") {
    filtered = lastLoadedEvents.filter(e => Number(e.isFinalized) !== 1);
  }

  buildTableHTML(filtered, "manageResults");
}

function clearEventForm() {
  const formEl = document.getElementById("eventForm");
  if (!formEl) return;

  // Reset all input, select, and textarea elements
  const inputs = formEl.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => {
    // For text, date, number, etc.
    if (input.type !== "checkbox" && input.type !== "radio") {
      input.value = "";
    }
    // For checkboxes and radios
    else {
      input.checked = false;
    }
  });
}

// List all
async function loadAllEvents() {
  try {
    const res = await fetch("http://localhost:3000/api/events");
    const data = await res.json();
    const events = data.Events || [];

    const formatted = events.map(formatEvent);
    let displayEvents = formatted;

    if (window.USER_PLAN === "starter") {
      displayEvents = formatted.filter(e => e.isFinalized == 0).slice(0, 1);
    }

    lastLoadedEvents = displayEvents;
    buildTableHTML(displayEvents, "manageResults");

  } catch (err) {
    console.error("loadAllEvents error:", err);
  }
}


// Search
async function manageSearch() {
  const name = document.getElementById("manageSearchName").value.trim();
  const date = document.getElementById("manageSearchDate").value.trim();
  const id = document.getElementById("manageSearchID").value.trim();

  const q = name || date || id;
  if (!q) {
    alert("Please enter a search term.");
    return;
  }

  const res = await fetch(`/api/events/search?q=${encodeURIComponent(q)}`);
  const results = await res.json();

  buildTableHTML(results, "manageResults");
}


//---------------
// Add Company - get company information for potential SASS down the road.
//----------------
async function addCompany(event) {
  const data = {
    companyName: document
      .getElementById("companyName")
      .value.trim(),
    phone: document.getElementById("phone").value.trim(),
    contactName: document
      .getElementById("contactName")
      .value.trim(),
    vendorCategory: document
      .getElementById("vendorCategory")
      .value.trim(),
    email: document.getElementById("email").value.trim()
  };
  console.log("Company event information: ", data);

  if (!data.companyName) {
    alert("Company name is required.");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const result = await res.json();
    console.log("✅ Company saved:", result);
    alert("Company added successfully!");
  } catch (err) {
    console.error("❌ Error adding company:", err);
    alert("Failed to add company. Check console for details.");
  }
}

// ---------------------------
// ✅ Build Expanded Event Details + Dashboard Button
// (hook is there—logic handled by loadEventIntoDashboard)
// ---------------------------
async function buildExpandedDetails(event) {
  const sections = [];
  // You can extend this if you want richer dashboard sections later.
}

// Load Square locations into the Add Event form
async function loadSquareLocationsIntoForm() {
  try {
    const res = await fetch(
      "http://localhost:3000/api/square/locations"
    );
    const locations = await res.json();

    const dropdown = document.getElementById("form_squareLocationId");
    if (!dropdown) {
      console.warn("Square Location dropdown not found.");
      return;
    }

    dropdown.innerHTML =
      `<option value="">Select Square Location…</option>`;

    locations.forEach((loc) => {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      dropdown.appendChild(opt);
    });
  } catch (err) {
    console.error("❌ Failed loading Square locations:", err);
  }
}

async function editEvent(eventData) {
  const info = eventData.EventInfo || eventData;

  if (!eventData) {
    alert("No Event Data to load.");
    return;
  }
  console.log("Editing Event.", eventData);

  window.activeEvent = eventData;
  window.activeeventID = eventData.eventID || eventData["Event ID"];
  window.isEditing = true;

  // Show Add/Edit form
  openAddEventForUser();


  // Determine active template
  const activeTemplateName =
    document.getElementById("templateSelect")?.value ||
    "Default Template";
  console.log("Current template is:", activeTemplateName);

  const template = window.availableTemplates?.find(
    (t) => t.templateName === activeTemplateName
  );
  if (!template) {
    alert("⚠️ Template not found. Please load a template first.");
    return;
  }

  // Rebuild form from template
  rebuildAddEventForm(stripEventColorFromTemplate(template));

  // Load Square locations, then select this event's location
  await loadSquareLocationsIntoForm();
  const sqSelect = document.getElementById("form_squareLocationId");
  if (sqSelect && info.squareLocationId) {
    sqSelect.value = info.squareLocationId;
  }

  // Prefill dynamic fields based on label
  const formContainer = document.getElementById("eventForm");
  const inputs = formContainer.querySelectorAll(
    "input, select, textarea"
  );

  console.log("Newly Edited Form:", inputs);

  inputs.forEach((input) => {
    const labelKey = input.id
      .replace(/^form_/, "")
      .replace(/_/g, " ");
    const match = Object.keys(info).find(
      (k) => k.toLowerCase() === labelKey.toLowerCase()
    );
    if (!match) return;

    const val = info[match];
    if (input.multiple && Array.isArray(val)) {
      Array.from(input.options).forEach((opt) => {
        opt.selected = val.includes(opt.value);
      });
    } else {
      input.value = val ?? "";
    }
  });
}

// ---------------------------
// 🔍 Search Events (Safe for Manage Events)
// ---------------------------
async function searchEvents() {
  const nameEl = document.getElementById("searchName");
  const dateEl = document.getElementById("searchDate");
  const idEl = document.getElementById("searchID");

  const name = nameEl ? nameEl.value.trim().toLowerCase() : "";
  const date = dateEl ? dateEl.value.trim() : "";
  const id = idEl ? idEl.value.trim() : "";

  // Load events if not already loaded
  if (!Array.isArray(window.events) || !window.events.length) {
    await loadEvents();
  }

  let results = window.events.filter((e) => {
    const info = e.EventInfo || e;
    const eventName = (info["eventName"] || "").toLowerCase();
    const eventDate = info["eventDate"] || "";
    const eventID =
      e.eventID?.toString() ||
      info["Event ID"]?.toString() ||
      "";
    return (
      (!name || eventName.includes(name)) &&
      (!date || eventDate === date) &&
      (!id || eventID.includes(id))
    );
  });

  const formatted = results.map((e) => {
    const info = e.EventInfo || e;
    return {
      "Event ID": e.eventID,
      eventName: info["eventName"] || "",
      eventDate: info["eventDate"] || "",
      "Event coordinator":
        info["Event coordinator"] ||
        info["coordinator"] ||
        "",
      location:
        info["Event squareLocationId"] ||
        info["squareLocationId"] ||
        "",
      eventHost: info["eventHost"] || info["Host"] || ""
    };
  });

  // 🔹 Decide where to render results
  const targetContainer =
    document.getElementById("manageResults") ||
    document.getElementById("searchResults");

  if (!targetContainer) {
    console.warn(
      "⚠️ No valid container (#manageResults or #searchResults) found for search results."
    );
    return;
  }

  buildTableHTML(formatted, targetContainer.id);
  console.log(
    `Rendered ${formatted.length} event(s) into ${targetContainer.id}.`
  );
}

async function loadEvents() {
  try {
    const res = await fetch("http://localhost:3000/api/events");
    const newEvent = await res.json();
    window.events = Array.isArray(newEvent)
      ? newEvent
      : newEvent.Events || [];
    console.log(
      `✅ Loaded ${window.events.length} events from backend`
    );
  } catch (err) {
    console.error("❌ Failed to load events:", err);
    window.events = [];
  }
}

// ---------------------------
// ✅ Cleaned renderTableArray()
// ---------------------------
function renderTableArray(elId, arr) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (!Array.isArray(arr) || arr.length === 0) {
    el.innerHTML = "<p>No data</p>";
    return;
  }

  buildTableHTML(arr);
}

function coerceForApi(obj) {
  if (typeof obj.eventName !== "string") {
  console.warn("⚠️ eventName is not string before coercion", obj.eventName);
}

  const result = { ...obj };

  const num = (v) =>
    v === "" || v == null ? null : Number(v);

  const int = (v) =>
    v === "" || v == null ? null : parseInt(v, 10);

  const str = (v) =>
    v == null || v === "" ? null : String(v);

  const bool = (v) =>
    v === true || v === "true" || v === "1";

  // ----------------------------
  // Numeric / integer fields
  // ----------------------------
  result.eventFee = int(result.eventFee);
  result.numDays = int(result.numDays);

  result.grossSales = num(result.grossSales);
  result.tips = num(result.tips);
  result.netSales = num(result.netSales);
  result.totalSales = num(result.totalSales);

  // ----------------------------
  // Boolean-like flags
  // ----------------------------
  result.isFinalized = bool(result.isFinalized);
  result.healthDeptFee = bool(result.healthDeptFee);
  result.mileageReimbursement = bool(result.mileageReimbursement);
  result.eventRunnerFees = bool(result.eventRunnerFees);
  result.giftCardSales = bool(result.giftCardSales);

  result.cash = bool(result.cash);
  result.card = bool(result.card);
  result.wallet = bool(result.wallet);
  result.other = bool(result.other);
  result.cashApp = bool(result.cashApp);
  result.taxOverride = bool(result.taxOverride);

  // ----------------------------
  // String fields (explicit)
  // ----------------------------
  result.eventName = str(result.eventName);
  result.eventDate = str(result.eventDate);
  result.applicationDate = str(result.applicationDate);
  result.finalizedDate = str(result.finalizedDate);
  result.eventHost = str(result.eventHost);
  result.eventLocation = str(result.eventLocation);
  result.eventRating = str(result.eventRating);
  result.eventType = str(result.eventType);
  result.status = str(result.status);
  result.coordinator = str(result.coordinator);
  result.time = str(result.time);
  result.permits = str(result.permits);
  result.squareLocationId = str(result.squareLocationId);

  // ----------------------------
  // customFields stays untouched
  // ----------------------------
  if (result.customFields && typeof result.customFields === "object") {
    result.customFields = result.customFields;
  }

  return result;
}


async function submitEvent(e) {
  if (e) e.preventDefault();

  // --------------------------------------------------
  // 0️⃣ Plan gating (unchanged logic)
  // --------------------------------------------------
  if (window.USER_PLAN === "starter") {
    const finalizedCount = getFinalizedEventCount();
    if (!window.isEditing && finalizedCount >= 1) {
      showUpgradeModal(
        "You’ve completed your first event.",
        "Upgrade to Pro to analyze unlimited events."
      );
      return;
    }
  }

  const formEl = document.getElementById("eventForm");
  if (!formEl) {
    alert("Form not found.");
    return;
  }

  // --------------------------------------------------
  // 1️⃣ Resolve active template
  // --------------------------------------------------
  const templateName = document.getElementById("templateSelect")?.value;
  
  const template = window.availableTemplates?.find(
    (t) => t.templateName === templateName
  );
  console.log("🧩 ACTIVE TEMPLATE:", template);
  console.log("🧩 TEMPLATE.FIELDS:", template.fields);

  if (!template || !Array.isArray(template.fields)) {
    alert("Template is missing or invalid.");
    return;
  }

  // --------------------------------------------------
  // 2️⃣ Read ALL form values ONCE (raw map)
  // --------------------------------------------------
  const raw = {};

  formEl
    .querySelectorAll("input, select, textarea")
    .forEach((el) => {
      if (!el.id.startsWith("form_")) return;

      const key = el.id.replace(/^form_/, "");

      if (el.multiple) {
        raw[key] = [...el.selectedOptions].map((o) => o.value);
      } else if (el.type === "checkbox") {
        raw[key] = el.checked;
      } else {
        raw[key] = el.value.trim();
      }
    });
// 🔍 DEBUG — raw form values
console.log("🧪 RAW FORM VALUES:", raw);

// --------------------------------------------------
// 3️⃣ Build canonical payload (ID-FIRST, FINAL)
// --------------------------------------------------

const canonical = {};
const customFields = {};

// Single source of truth: canonical backend fields
const CANONICAL_KEYS = new Set([
  "eventName",
  "eventDate",
  "applicationDate",
  "eventHost",
  "eventRating",
  "eventType",
  "status",
  "coordinator",
  "employees",
  "notes",
  "numDays",
  "eventFee",
  "eventLocation",
  "permits",
  "finalizedDate",
  "time",
  "squareLocationId"
]);

Object.entries(raw).forEach(([key, value]) => {
  if (CANONICAL_KEYS.has(key)) {
    canonical[key] = value;
  } else {
    customFields[key] = value;
  }
});

if (Object.keys(customFields).length > 0) {
  canonical.customFields = customFields;
}

console.log("🧪 CANONICAL FINAL:", canonical);
console.log("🧪 CUSTOM FIELDS FINAL:", customFields);


  // --------------------------------------------------
  // 4️⃣ Attach auxiliary known fields
  // --------------------------------------------------
  const sq = document.getElementById("form_squareLocationId");
  if (sq) canonical.squareLocationId = sq.value || null;

  if (Object.keys(customFields).length > 0) {
    canonical.customFields = customFields;
  }
console.log("🧪 CANONICAL BEFORE VALIDATION:", canonical);
  // --------------------------------------------------
  // 5️⃣ REQUIRED FIELD VALIDATION (single source)
  // --------------------------------------------------
  const REQUIRED = ["eventName", "eventDate"];

  for (const key of REQUIRED) {
    if (!canonical[key]) {
      alert("Event Name and Event Date are required.");
      return;
    }
  }

  // --------------------------------------------------
  // 6️⃣ Numeric coercion (centralized)
  // --------------------------------------------------
  const NUMERIC_KEYS = [
    "eventFee",
    "healthDeptFee",
    "mileageReimbursement",
    "eventRunnerFees",
    "giftCardSales",
    "cash",
    "card",
    "wallet",
    "other",
    "cashApp",
    "taxOverride",
    "grossSales",
    "tips",
    "netSales",
    "totalSales"
  ];

  NUMERIC_KEYS.forEach((k) => {
    if (canonical[k] !== undefined && canonical[k] !== null && canonical[k] !== "") {
      canonical[k] = Number(canonical[k]);
    }
  });

  // --------------------------------------------------
  // 7️⃣ Final payload (immutable boundary)
  // --------------------------------------------------
  const payload = coerceForApi(canonical);

  // --------------------------------------------------
  // 8️⃣ Determine POST vs PUT
  // --------------------------------------------------
  const isEditing =
    window.isEditing === true && window.activeeventID;

  const url = isEditing
    ? `${API_BASE}/api/events/${window.activeeventID}`
    : `${API_BASE}/api/events`;

  const method = isEditing ? "PUT" : "POST";

  console.log(
  "🚀 FINAL PAYLOAD STRINGIFIED:",
  JSON.stringify(payload, null, 2)
);


  // --------------------------------------------------
  // 9️⃣ Submit
  // --------------------------------------------------
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  if (!("eventName" in payload)) {
  console.error("❌ PAYLOAD MISSING eventName", payload);
  debugger;
  return;
}


  if (!res.ok) {
    console.error("🚨 Backend error:", json);
    alert(json.error || "Error saving event.");
    return;
  }

  // --------------------------------------------------
  // 🔟 Post-save actions
  // --------------------------------------------------
  const eventID = isEditing
    ? window.activeeventID
    : json.eventID || json.EventID;

  if (!eventID) {
    alert("Could not determine EventID from server response.");
    return;
  }

  await uploadEventPermits(eventID);

  alert(isEditing ? "Event updated!" : "Event created!");

  window.isEditing = false;
  window.activeeventID = null;
  window.activeEvent = null;

  navigateTo("manageSection");
  await loadAllEvents();
}




/*function showAddEventForm() {
  navigateTo("addSection");
  buildAddEventForm();
  loadSquareLocationsIntoForm(); // ← REQUIRED
}*/

// ---------------------------
// 🔄 Clear Search
// ---------------------------
function clearSearch() {
  const nameEl = document.getElementById("searchName");
  const dateEl = document.getElementById("searchDate");
  const idEl = document.getElementById("searchID");
  if (nameEl) nameEl.value = "";
  if (dateEl) dateEl.value = "";
  if (idEl) idEl.value = "";

  const container = document.getElementById("searchResults");
  if (container) container.innerHTML = "";

  const summarycard = document.getElementById("summarycard");
  if (summarycard) summarycard.style.display = "none";

  const dashboard = document.getElementById("dashboard");
  if (dashboard) dashboard.style.display = "none";

  console.log("🔄 Search fields and results cleared.");
}

//-------------------------------------------------------
//populateEmployeeDropdown
//--------------------------------------------------------

async function populateEmployeeDropdown(selectEl) {
  try {
    const res = await fetch("http://localhost:3000/api/employees");
    const employees = await res.json();

    selectEl.innerHTML =
      '<option value=""> -- Select Employee -- </option>';

    employees.forEach((emp) => {
      const opt = document.createElement("option");
      opt.value = emp.EmployeeID;
      opt.textContent = emp.EmployeeName;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("Error listing employees", err);
  }
}

function addFieldToTemplate() {
  const label = document
    .getElementById("builderLabel")
    .value.trim();
  const type = document.getElementById("builderType").value;
  const required = document.getElementById(
    "builderRequired"
  ).checked;
  const optionsInput = document
    .getElementById("builderOptions")
    .value.trim();

  if (!label) {
    alert("Please enter a field label.");
    return;
  }

  const newField = { label, type, required };
  if (["select", "multiselect"].includes(type)) {
    if (!optionsInput) {
      alert(
        "Please enter options for dropdowns or multiselects."
      );
      return;
    }
    newField.options = optionsInput
      .split(",")
      .map((o) => o.trim());
  }

  formTemplate.fields.push(newField);
  renderFormPreview();
  document.getElementById("builderLabel").value = "";
  document.getElementById("builderOptions").value = "";
}

function renderFormPreview() {
  const preview = document.getElementById("formPreview");
  preview.innerHTML = "";

  formTemplate.fields.forEach((field) => {
    const labelEl = document.createElement("label");
    labelEl.textContent =
      field.label + (field.required ? " *" : "");
    let input;

    switch (field.type) {
      case "select":
      case "multiselect":
        input = document.createElement("select");
        if (field.type === "multiselect") input.multiple = true;
        field.options.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          input.appendChild(option);
        });
        break;
      case "textarea":
        input = document.createElement("textarea");
        break;
      default:
        input = document.createElement("input");
        input.type = field.type;
    }

    if (field.required) input.required = true;
    labelEl.appendChild(input);
    preview.appendChild(labelEl);
  });
}

async function saveTemplate() {
  const templateName = prompt("Enter a name for this template:");
  if (!templateName) return;

  const payload = {
    TemplateName: templateName,
    Fields: formTemplate.fields || []
  };

  try {
    const response = await fetch(
      "http://localhost:3000/api/formTemplates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    if (response.ok) {
      alert("Template saved successfully!");
    } else {
      const err = await response.json();
      console.error("Save error:", err);
      alert("Error saving template. Check backend logs.");
    }
  } catch (err) {
    console.error("Fetch failed:", err);
    alert("Network or server error while saving template.");
  }
}

function clearManageSearch() {
  // Clear input fields
  document.getElementById('manageSearchName').value = '';
  document.getElementById('manageSearchDate').value = '';
  document.getElementById('manageSearchID').value = '';

  // Clear results table
  const container = document.getElementById('manageResults');
  container.innerHTML = '';

  // Optionally reset filter highlighting (if your UI uses active styles)
  if (typeof resetFilterButtons === "function") {
    resetFilterButtons();
  }

  // Provide user feedback (optional)
  console.log("Manage search cleared.");
}
function getDefaultStarterTemplate() {
  if (!Array.isArray(window.availableTemplates)) return null;

  return (
    window.availableTemplates.find(t =>
      t.templateName.toLowerCase() === "default starter"
    ) ||
    window.availableTemplates.find(t =>
      t.templateName.toLowerCase().includes("default")
    ) ||
    window.availableTemplates[0] ||
    null
  );
}
async function waitForTemplates(timeout = 3000) {
  const start = Date.now();
  while (!window.availableTemplates?.length) {
    if (Date.now() - start > timeout) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}


async function openAddEventForUser() {
  window.addEventListener("DOMContentLoaded", async () => {
  await populateTemplateDropdown(); // ✅ REQUIRED
});

  navigateTo("addSection");

   if (!window.availableTemplates) {
    console.error("Templates not loaded");
    return;
  }


  if (window.USER_PLAN === "starter") {
    const tpl = getDefaultStarterTemplate();
    rebuildAddEventForm(stripEventColorFromTemplate(tpl));
    // ✅ ADD THIS
    const dropdown = document.getElementById("templateSelect");
    if (dropdown && tpl) {
      dropdown.innerHTML = `<option>${tpl.templateName}</option>`;
    }
    loadSquareLocationsIntoForm();
    return;
  }

  populateTemplateDropdown();
  loadSquareLocationsIntoForm();
}

async function loadTemplates() {
  try {
    const res = await fetch("http://localhost:3000/api/formTemplates");
    const templates = await res.json();

    const selector = document.getElementById("templateSelect");
    selector.innerHTML =
      '<option value="">-- Select Template --</option>';

    templates.forEach((tpl) => {
      const opt = document.createElement("option");
      opt.value = tpl.templateName;
      opt.textContent = tpl.templateName;
      selector.appendChild(opt);
    });

    console.log("Loaded templates:", templates);
    // Keep templates in memory


    window.availableTemplates = templates;
  } catch (err) {
    console.error("Error loading templates:", err);
  }
}

// 🧩 Load templates into Add Event dropdown
async function populateTemplateDropdown() {
  try {
    const res = await fetch(`${API_BASE}/api/formTemplates`);
    let templates = await res.json();

    templates = toCamelCaseKeys(templates);
    window.availableTemplates = templates;

    const dropdown = document.getElementById("templateSelect");
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">-- Select Template --</option>';

    templates.forEach(tpl => {
      const opt = document.createElement("option");
      opt.value = tpl.templateName;
      opt.textContent = tpl.templateName;
      dropdown.appendChild(opt);
    });

    console.log(`✅ ${templates.length} templates loaded`);
  } catch (err) {
    console.error("❌ Error loading templates:", err);
  }
}


// ⚡ When user picks a template
// Helper to strip 'Event Color' field from templates defensively
function stripEventColorFromTemplate(tpl) {
  if (!tpl || !Array.isArray(tpl.fields)) return tpl;
  tpl.fields = tpl.fields.filter(
    (f) =>
      !(
        f &&
        typeof f.label === "string" &&
        /^event\s*color$/i.test(f.label)
      )
  );
  return tpl;
}

function useSelectedTemplate() {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) {
    alert("Please select a template first.");
    return;
  }
  console.log("Template value", selected);

  const template = window.availableTemplates.find(
    (t) => t.templateName === selected
  );
  if (!template) {
    alert("Template not found!");
    return;
  }

  console.log(
    "📋 Loading template into Add Event form:",
    template
  );
  rebuildAddEventForm(stripEventColorFromTemplate(template));
  alert(`✅ Loaded template: "${template.templateName}"`);
}

function activateTemplate() {
  const selector = document.getElementById("templateSelect");
  if (!selector) {
    console.warn(
      "activateTemplate called but #templateSelect not found"
    );
    return;
  }

  const selectedName = selector.value;
  if (!selectedName) {
    alert("Please select a template to activate.");
    return;
  }
  const tpl = window.availableTemplates.find(
    (t) => t.templateName === selectedName
  );
  if (!tpl) {
    alert("Template not found!");
    return;
  }
  console.log("Activating template:", tpl.templateName);
  rebuildAddEventForm(stripEventColorFromTemplate(tpl));
  alert(`✅ "${tpl.TemplateName}" activated!`);
}

function rebuildAddEventForm(template) {
  const formContainer = document.getElementById("eventForm");

  // 🧠 Keep existing event data if present
  const existing = window.activeEvent || {};

  // Only clear the form if we’re not editing an event
  formContainer.innerHTML = "";

  if (
    !template ||
    !template.fields ||
    !Array.isArray(template.fields)
  ) {
    console.error("❌ Invalid template structure:", template);
    formContainer.innerHTML =
      "<p>Template could not be loaded.</p>";
    return;
  }

  (template.fields[0]?.fields || template.fields).forEach(
    (field) => {
      // Skip deprecated "Event Color"
      if (
        field &&
        typeof field.label === "string" &&
        /^event\s*color$/i.test(field.label)
      ) {
        return;
      }

      // Create label
      const labelEl = document.createElement("label");
      labelEl.textContent =
        field.label + (field.required ? " *" : "");

      // Create input
      let input;
      switch (field.type) {
        case "select":
        case "multiselect":
          input = document.createElement("select");
          if (field.type === "multiselect") input.multiple = true;
          (field.options || []).forEach((optVal) => {
            const opt = document.createElement("option");
            opt.value = optVal;
            opt.textContent = optVal;
            input.appendChild(opt);
          });
          break;
        case "textarea":
          input = document.createElement("textarea");
          break;
        default:
          input = document.createElement("input");
          input.type = field.type || "text";
      }

      if (field.required) input.required = true;

      // ✅ Consistent ID pattern (no hardcoded fields)
      const safeLabel = String(field.label)
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "");
      input.id = "form_" + safeLabel;

      // Employees dropdown special case
      if (
        /^employees$/i.test(field.label) &&
        field.type === "select"
      ) {
        // dynamically populate from EmployeeTracker
        populateEmployeeDropdown(input);
        // Add Hours Worked field linked to this employee dropdown
        const hoursInput = document.createElement("input");
        hoursInput.type = "number";
        hoursInput.min = "0";
        hoursInput.step = "0.25";
        hoursInput.placeholder = "Hours Worked";
        hoursInput.classList.add("hours-worked");
        hoursInput.setAttribute(
          "data-employee-hours",
          input.id
        );

        formContainer.appendChild(hoursInput);
      }

      const lbl =
        typeof field.label === "string" ? field.label : "";

      // ✅ Pre-fill input with existing data if available
      const savedVal =
        existing[lbl] ||
        existing[lbl.replaceAll(" ", "_")] ||
        existing[lbl.toLowerCase()] ||
        null;

      if (savedVal !== null && savedVal !== undefined) {
        if (input.tagName === "SELECT" && input.multiple) {
          // Handle multiselect arrays or comma-delimited strings
          const values = Array.isArray(savedVal)
            ? savedVal
            : savedVal
                .toString()
                .split(",")
                .map((v) => v.trim());
          for (const opt of input.options) {
            if (values.includes(opt.value)) opt.selected = true;
          }
        } else if (input.tagName === "SELECT") {
          input.value = savedVal;
        } else if (
          input.tagName === "TEXTAREA" ||
          input.tagName === "INPUT"
        ) {
          input.value = savedVal;
        }
      }

      labelEl.appendChild(input);
      formContainer.appendChild(labelEl);
    }
  );

  // Add buttons
  const btnContainer = document.createElement("div");
  btnContainer.classList.add("form-buttons");
  btnContainer.innerHTML = `
    <button type="submit">💾 Save New Event</button>
    <button type="button" onclick="clearEventForm()">⬅️ Cancel</button>
  `;

  formContainer.appendChild(btnContainer);
  formContainer.onsubmit = submitEvent;
  console.log("Form information", formContainer);
}
//------------------------
//Helper Function For Currency
//------------------------
function fmt(x) {
  return Number(x || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
// -----------------------------
// Modern Sheet-Style Collapsible Card
// -----------------------------
// -----------------------------
// Modern Sheet-Style Collapsible Card
// -----------------------------
function createCollapsibleCard(title, contentHTML = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "sheet-card";

  // Header Button
  const header = document.createElement("button");
  header.className = "sheet-header";
  header.type = "button";
  header.innerHTML = `
      <span>${title}</span>
      <span class="arrow">▾</span>
  `;

  // Content Container
  const content = document.createElement("div");
  content.className = "sheet-content collapsed";
  content.innerHTML = contentHTML;

  // Toggle behavior
  header.addEventListener("click", () => {
    const isExpanded = content.classList.contains("expanded");
    content.classList.toggle("expanded", !isExpanded);
    content.classList.toggle("collapsed", isExpanded);

    const arrow = header.querySelector(".arrow");
    if (arrow) {
      arrow.style.transform = !isExpanded ? "rotate(180deg)" : "rotate(0deg)";
    }
  });

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  return wrapper;
}

function feeRowHTML(name = "", amount = "") {
  return `
    <tr class="fee-row">
      <td>
        <input type="text"
               class="fee-name"
               placeholder="e.g. Booth Rental"
               value="${name ?? ""}">
      </td>
      <td>
        <input type="number"
               step="0.01"
               class="fee-amount"
               value="${amount ?? ""}">
      </td>
      <td>
        <button type="button"
                class="delete-btn"
                onclick="this.closest('tr').remove()">✕</button>
      </td>
    </tr>
  `;
}

async function reloadEventDashboard() {
  if (!window.currentEventId) {
    console.warn("⚠️ reloadEventDashboard called with no active event");
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/events/${window.currentEventId}/report`
    );

    const report = await res.json();
    if (!res.ok) {
      throw new Error(report.error || "Failed to load event report");
    }

    const refreshedEvent = normalizeEvent({
      ...report.event,
      sales: report.sales,
      expenses: report.expenses,
      totals: report.totals,
      drinkSales: report.drinkSales,
      additionalFees: report.additionalFees,
      discounts: report.discounts,
      tips: report.tips,
      supplies: report.supplies,
      labor: report.labor
    });

    loadEventIntoDashboard(refreshedEvent);

  } catch (err) {
    console.error("❌ Failed to reload event dashboard", err);
    alert("Failed to reload event data.");
  }
}


function addFeeRow() {
  const tbody = document.querySelector("#feesEditor tbody");
  if (!tbody) return;

  tbody.insertAdjacentHTML("beforeend", feeRowHTML());
}

function collectFeesFromUI() {
  const rows = document.querySelectorAll(".fee-row");
  const fees = [];

  rows.forEach(row => {
    const name = row.querySelector(".fee-name")?.value.trim();
    const amt  = Number(row.querySelector(".fee-amount")?.value);

    if (name && !Number.isNaN(amt)) {
      fees.push({
        feeName: name,
        feeAmount: amt
      });
    }
  });

  return fees;
}

async function saveFees() {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    alert("No active event.");
    return;
  }

  const additionalFees = collectFeesFromUI();

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/adjustments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ additionalFees })
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("Save fees error:", json);
      alert(json.error || "Failed to save fees.");
      return;
    }

    alert("Fees saved!");

    // ✅ Single source of truth
    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveFees error:", err);
    alert("Network error saving fees.");
  }
}


// --------------------------------------------
// 💰 Build Editable Fees Card
// --------------------------------------------
function buildFeesEditor(event) {
  const rows = event.additionalFees || [];

  let html = `
    <table class="lemondrip-table" id="feesEditor">
      <thead>
        <tr>
          <th>Fee Name</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(f => {
    html += feeRowHTML(f.feeName, f.feeAmount);
  });

  html += `
      </tbody>
    </table>

    <div class="editor-actions">
      <button type="button" class="btn-secondary" onclick="addFeeRow()">➕ Add Fee</button>
      <button type="button" class="btn-primary" onclick="saveFees()">💾 Save Fees</button>
    </div>
  `;

  return html;
}

// --------------------------------------------
// 💵 Build Editable Tips Card (Event-Level)
// --------------------------------------------
function buildTipsEditor(event) {
  const rows = event.tips || [];

  let html = `
    <table class="lemondrip-table" id="tipsEditor">
      <thead>
        <tr>
          <th>Tip Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(t => {
    html += tipRowHTML(t.tipAmount);
  });

  html += `
      </tbody>
    </table>

    <div class="editor-actions">
      <button type="button" class="btn-secondary" onclick="addTipRow()">➕ Add Tip</button>
      <button type="button" class="btn-primary" onclick="saveTips()">💾 Save Tips</button>
    </div>
  `;

  return html;
}

function tipRowHTML(amount = "") {
  return `
    <tr class="tip-row">
      <td>
        <input type="number"
               step="0.01"
               class="tip-amount"
               placeholder="e.g. 5.00"
               value="${amount ?? ""}">
      </td>
      <td>
        <button type="button"
                class="delete-btn"
                onclick="this.closest('tr').remove()">✕</button>
      </td>
    </tr>
  `;
}

function addTipRow() {
  const tbody = document.querySelector("#tipsEditor tbody");
  if (!tbody) return;

  tbody.insertAdjacentHTML("beforeend", tipRowHTML());
}

function collectTipsFromUI() {
  const rows = document.querySelectorAll(".tip-row");
  const tips = [];

  rows.forEach(row => {
    const amt = Number(row.querySelector(".tip-amount")?.value);
    if (!Number.isNaN(amt) && amt > 0) {
      tips.push({ tipAmount: amt });
    }
  });

  return tips;
}


async function saveTips() {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  } 
  const eventID = window.currentEventId;
  if (!eventID) {
    alert("No active event.");
    return;
  }

  const tips = collectTipsFromUI();

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/adjustments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tips })
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("Save tips error:", json);
      alert(json.error || "Failed to save tips.");
      return;
    }

    alert("Tips saved!");

    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveTips error:", err);
    alert("Network error saving tips.");
  }
}


// --------------------------------------------
// 🧾 Build Editable Discounts Card
// --------------------------------------------
function buildDiscountsEditor(event) {
  const rows = event.discounts || [];

  let html = `
    <table class="lemondrip-table" id="discountsEditor">
      <thead>
        <tr>
          <th>Discount Name</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(d => {
    html += discountRowHTML(d.discountName, d.discountAmount);
  });

  html += `
      </tbody>
    </table>

    <div class="editor-actions">
      <button type="button" class="btn-secondary" onclick="addDiscountRow()">➕ Add Discount</button>
      <button type="button" class="btn-primary" onclick="saveDiscounts()">💾 Save Discounts</button>
    </div>
  `;

  return html;
}

function discountRowHTML(name = "", amount = "") {
  return `
    <tr class="discount-row">
      <td>
        <input type="text"
               class="discount-name"
               placeholder="e.g. Team Discount"
               value="${name ?? ""}">
      </td>
      <td>
        <input type="number"
               step="0.01"
               class="discount-amount"
               value="${amount ?? ""}">
      </td>
      <td>
        <button type="button"
                class="delete-btn"
                onclick="this.closest('tr').remove()">✕</button>
      </td>
    </tr>
  `;
}

function addDiscountRow() {
  const tbody = document.querySelector("#discountsEditor tbody");
  if (!tbody) return;

  tbody.insertAdjacentHTML("beforeend", discountRowHTML());
}
function collectDiscountsFromUI() {
  const rows = document.querySelectorAll(".discount-row");
  const discounts = [];

  rows.forEach(row => {
    const name = row.querySelector(".discount-name")?.value.trim();
    const amt  = Number(row.querySelector(".discount-amount")?.value);

    if (name && !Number.isNaN(amt)) {
      discounts.push({
        discountName: name,
        discountAmount: amt
      });
    }
  });

  return discounts;
}

async function saveDiscounts() {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    alert("No active event.");
    return;
  }

  const discounts = collectDiscountsFromUI();
  const payload = { discounts };

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/adjustments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("Save discounts error:", json);
      alert(json.error || "Failed to save discounts.");
      return;
    }

    alert("Discounts saved!");

    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveDiscounts error:", err);
    alert("Network error saving discounts.");
  }
}


function addDiscountRow(name = "", amount = "") {
  const tbody = document.querySelector("#discountsEditor tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.classList.add("discount-row");
  tr.innerHTML = `
    <td>
      <input type="text" class="discount-name" value="${name}">
    </td>
    <td>
      <input type="number" step="0.01" class="discount-amount" value="${amount}">
    </td>
    <td>
      <button type="button" onclick="this.closest('tr').remove()">✕</button>
    </td>
  `;
  tbody.appendChild(tr);
}

/*function collectAdjustmentsFromUI() {
  // Discounts
  const discountRows = document.querySelectorAll(".discount-row");
  const discounts = [];
  discountRows.forEach(row => {
    const nameEl = row.querySelector(".discount-name");
    const amtEl  = row.querySelector(".discount-amount");
    const name   = nameEl?.value.trim();
    const amount = Number(amtEl?.value || 0);
    if (name && !Number.isNaN(amount)) {
      discounts.push({ discountName: name, discountAmount: amount });
    }
  });

  // Similar pattern for Fees (feeName, feeAmount)
  // and Tips (tipAmount only)…

  const fees = []; // TODO: collect from .fee-row
  const tips = []; // TODO: collect from .tip-row

  return {
    additionalFees: fees,
    discounts,
    tips
  };
}
*/

function renderEventProfitSummary(event) {
  const sales = event.sales || {};
  const totals = event.totals || {};
  const expenses = event.expenses || {}; // ✅ THIS WAS MISSING

  const fmtMoney = (v) =>
    v == null ? "-" : `$${Number(v || 0).toFixed(2)}`;

  return createCollapsibleCard(
    "Event Profit Summary",
    `
    <div class="profit-summary">
      <div><strong>Gross Sales:</strong> ${fmtMoney(sales.grossSales)}</div>
      <div><strong>Returns:</strong> (${fmtMoney(sales.refunds)})</div>
      <div><strong>Discounts:</strong> (${fmtMoney(sales.discounts)})</div>
      <div><strong>Net Sales:</strong> ${fmtMoney(sales.netSales)}</div>
      <hr>
      <div><strong>Tips:</strong> ${fmtMoney(sales.tips)}</div>
      <div><strong>Cash:</strong> ${fmtMoney(sales.cash)}</div>
      <div><strong>Card:</strong> ${fmtMoney(sales.card)}</div>
      <div><strong>wallet / Wallet:</strong> ${fmtMoney(sales.wallet)}</div>
      <div><strong>CashApp:</strong> ${fmtMoney(sales.cashApp)}</div>
      <div><strong>Other:</strong> ${fmtMoney(sales.other)}</div>
      <div><strong>Total Collected:</strong> ${fmtMoney(sales.totalCollected)}</div>
      <hr>
      <div><strong>State Food Tax:</strong> (${fmtMoney(sales.squareReportedTax)})</div>
      <div><strong>Square / Vendor Fees:</strong> (${fmtMoney(sales.squareFees)})</div>
      <div><strong>Total Net Revenue:</strong> ${fmtMoney(totals.totalNetRevenue)}</div>
      <hr>
      <div><strong>Total Expenses:</strong> (${fmtMoney(event.totals.totalExpenses)})</div>
      <div class="profit-final">
        <strong>Gross Profit:</strong>
        <strong>${fmtMoney(totals.grossProfit)}</strong>
      </div>
    </div>
    `
  );
}


  function renderExpensesCard(expenses = {}) {
  const content = expensesEditMode
    ? renderExpensesEditMode(expenses)
    : renderExpensesViewMode(expenses);

  return createCollapsibleCard("Expenses", content);
}


function renderExpensesViewMode(expenses) {
  const fmtMoney = (v) =>
    v == null ? "$0.00" : `$${Number(v).toFixed(2)}`;

  return `
    <div class="expenses-card">

      <div>Health Dept Fee: ${fmtMoney(expenses.healthDeptFee)}</div>
      <div>Event Fee: ${fmtMoney(expenses.eventFee)}</div>
      <div>Mileage: ${fmtMoney(expenses.mileageReimbursement)}</div>
      <div>Employee Bonus: ${fmtMoney(expenses.employeeBonus)}</div>
      <div>Event Runner Fees: ${fmtMoney(expenses.eventRunnerFees)}</div>
      <hr>
      <div>Additional Fees (auto): ${fmtMoney(expenses.additionalFees)}</div>
      <div>Labor Fees (auto): ${fmtMoney(expenses.laborFees)}</div>
      <div>Supply Costs (auto): ${fmtMoney(expenses.supplyFees)}</div>
      <hr>
      <strong>Total Expenses: ${fmtMoney(expenses.totalExpenses)}</strong>
      <button class="btn-secondary" onclick="enterExpensesEditMode()">
        ✏️ Edit Expenses
      </button>
    </div>
  `;
}

function renderExpensesEditMode(expenses) {
  return `
    <div class="expenses-card">

      <label>Health Dept Fee</label>
      <input type="number" data-field="healthDeptFee"
        value="${expenses.healthDeptFee ?? 0}">

      <label>Event Fee</label>
      <input type="number" data-field="eventFee"
        value="${expenses.eventFee ?? 0}">

      <label>Mileage Reimbursement</label>
      <input type="number" data-field="mileageReimbursement"
        value="${expenses.mileageReimbursement ?? 0}">

      <label>Employee Bonus</label>
      <input type="number" data-field="employeeBonus"
        value="${expenses.employeeBonus ?? 0}">

      <label>Event Runner Fees</label>
      <input type="number" data-field="eventRunnerFees"
        value="${expenses.eventRunnerFees ?? 0}">

      <hr>

      <button class="btn-primary" onclick="saveExpenses()">💾 Save</button>
      <button class="btn-secondary" onclick="cancelExpensesEdit()">Cancel</button>
    </div>
  `;
}

function enterExpensesEditMode() {
  expensesEditMode = true;
  reloadEventDashboard();
}

function cancelExpensesEdit() {
  expensesEditMode = false;
  reloadEventDashboard();
}


async function saveExpenses() {
 if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
}
  const inputs = document.querySelectorAll(".expenses-card input");
  const payload = {};

  inputs.forEach(input => {
    payload[input.dataset.field] = Number(input.value) || 0;
  });

  try {
    await fetch(`${API_BASE}/api/events/${window.currentEventId}/expenses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expensesEditMode = false;
    reloadEventDashboard();

  } catch (err) {
    console.error("Failed to save expenses", err);
    alert("Failed to save expenses");
  }
}


// ---------------------------
// 📊 Clean Event Dashboard Loader (Sheet-Style Cards, no IDs)
// ---------------------------

function renderAdditionalFeesCard(fees = []) {
  const total = fees.reduce(
    (sum, f) => sum + (Number(f.feeAmount) || 0),
    0
  );

  const rows = fees.map(f => `
    <div class="row">
      <input type="text"
             value="${f.feeName}"
             onchange="updateAdditionalFee(${f.id}, this.value, null)">
      <input type="number"
             value="${f.feeAmount}"
             onchange="updateAdditionalFee(${f.id}, null, this.value)">
      <button onclick="deleteAdditionalFee(${f.id})">🗑</button>
    </div>
  `).join("");

  const html = `
    ${rows || "<p>No additional fees.</p>"}

    <div class="row">
      <input id="newFeeName" placeholder="Fee name">
      <input id="newFeeAmount" type="number" placeholder="Amount">
      <button onclick="addAdditionalFee()">➕ Add</button>
    </div>

    <hr>
    <div><strong>Total Additional Fees:</strong> ${fmt(total)}</div>
  `;

  return createCollapsibleCard("Additional Fees", html);
}

async function addAdditionalFee() {
  const name = document.getElementById("newFeeName").value;
  const amt  = document.getElementById("newFeeAmount").value;

  await fetch(`${API_BASE}/api/events/${currentEventId}/additional-fees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feeName: name, feeAmount: amt })
  });

  reloadEventDashboard();
}

async function updateAdditionalFee(id, name, amt) {
  const payload = {};
  if (name !== null) payload.feeName = name;
  if (amt !== null) payload.feeAmount = amt;

  await fetch(`${API_BASE}/api/additional-fees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  reloadEventDashboard();
}

async function deleteAdditionalFee(id) {
  await fetch(`${API_BASE}/api/additional-fees/${id}`, {
    method: "DELETE"
  });

  reloadEventDashboard();
}

function renderSupplyCostsCard(items = []) {
  const total = items.reduce(
    (sum, r) => sum + (Number(r.totalCost) || 0),
    0
  );

  const rows = items.map(r => `
    <div class="row">
      <input type="text"
             value="${r.itemName}"
             onchange="updateSupply(${r.id}, { itemName: this.value })">

      <input type="number"
             value="${r.unitCost}"
             onchange="updateSupply(${r.id}, { unitCost: this.value })">

      <input type="number"
             value="${r.quantityUsed}"
             onchange="updateSupply(${r.id}, { quantityUsed: this.value })">

      <span>${fmt(r.totalCost)}</span>

      <button onclick="deleteSupply(${r.id})">🗑</button>
    </div>
  `).join("");

  const html = `
    ${rows || "<p>No supply costs recorded.</p>"}

    <div class="row">
      <input id="newSupplyName" placeholder="Item">
      <input id="newSupplyUnitCost" type="number" placeholder="Unit Cost">
      <input id="newSupplyQty" type="number" placeholder="Qty Used">
      <button onclick="addSupply()">➕ Add</button>
    </div>

    <hr>
    <div><strong>Total Supply Cost:</strong> ${fmt(total)}</div>
  `;

  return createCollapsibleCard("Supply Costs", html);
}

async function addSupply() {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  const payload = {
    itemName: document.getElementById("newSupplyName").value,
    unitCost: Number(document.getElementById("newSupplyUnitCost").value) || 0,
    quantityUsed: Number(document.getElementById("newSupplyQty").value) || 0
  };

  await fetch(`${API_BASE}/api/events/${currentEventId}/supplies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  reloadEventDashboard();
}

async function updateSupply(id, changes) {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  await fetch(`${API_BASE}/api/supplies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes)
  });

  reloadEventDashboard();
}

async function deleteSupply(id) {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
}
  await fetch(`${API_BASE}/api/supplies/${id}`, {
    method: "DELETE"
  });

  reloadEventDashboard();
}




async function loadEventIntoDashboard(evt) {
  if (!evt) {
    console.warn("⚠️ loadEventIntoDashboard called with no event");
    return;
  }

  const event = normalizeEvent(evt);

  /*console.log("🧪 Dashboard event object:", {
  hasExpenses: !!event.expenses,
  hasTotals: !!event.totals,
  expenses: event.expenses,
  Testtotals: event.totals
});*/
  console.log("Dashboard event Object", event);

  window.activeEvent = event;
  window.currentEventId = event.eventID;

  const eventID = event.eventID;
  const eventName = event.eventName || "Unnamed Event";
  const eventDate = event.eventDate || "";
  const coordinator = event.coordinator || "";
  const eventLocation = event.eventLocation || "";
  const status = event.status || "";

  // Navigate to dashboard
  if (typeof navigateTo === "function") {
    navigateTo("eventDashboardSection");
  }

  // Load labor UI if available
  if (typeof loadEmployeesForDropdown === "function") loadEmployeesForDropdown();
  
  const container = document.getElementById("eventDashboardContainer");
  if (!container) {
    console.warn("⚠️ #eventDashboardContainer not found");
    return;
  }
  container.innerHTML = "";

  // HEADER (top of dashboard)
  const headerTitle = document.getElementById("dashEventName");
  const headerDate = document.getElementById("dashEventDate");
  const finalizedIndicator = document.getElementById("dashFinalizedIndicator");

  if (headerTitle) headerTitle.textContent = eventName;
  if (headerDate) headerDate.textContent = eventDate;
  if (finalizedIndicator) finalizedIndicator.innerHTML = "";

  if (event.isFinalized === 1) {
    const badge = document.createElement("div");
    badge.classList.add("finalized-badge-large");
    badge.textContent = "FINALIZED";
    finalizedIndicator.appendChild(badge);

    if (event.finalizedDate) {
      const fd = document.createElement("div");
      fd.classList.add("finalized-date-label");
      fd.textContent = `Finalized on: ${event.finalizedDate}`;
      finalizedIndicator.appendChild(fd);
    }
  }

  // DASHBOARD BUTTONS
  // DASHBOARD BUTTONS
const buttonContainer = document.querySelector(".dashboard-buttons");
if (buttonContainer) {
  buttonContainer.innerHTML = "";

  // Pull Square
  const squareBtn = document.createElement("button");
  squareBtn.textContent = "🔄 Pull Square Sales";
  squareBtn.classList.add("btn-primary");
  squareBtn.addEventListener("click", async () => {
    try {
      await pullSquareSales(eventID);
      await reloadEventDashboard();
    } catch (err) {
      console.error("Square pull error:", err);
      alert("Failed to pull Square sales.");
    }
  });

  // Finalize
  //Set # of events to display
  const finalizeBtn = document.createElement("button");
  finalizeBtn.textContent = "✅ Finalize Event";
  finalizeBtn.classList.add("btn-primary");
  finalizeBtn.addEventListener("click", async () => {
    if (window.USER_PLAN === "starter" && event.isFinalized === 0) {
      const finalizedCount = getFinalizedEventCount();
      if (finalizedCount >= 1) {
        showUpgradeModal(
          "Starter includes 1 finalized event.",
          "Upgrade to Pro to finalize more events."
        );
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/events/${eventID}/finalize`, { method: "PUT" });
      const out = await res.json();
      if (!res.ok) return alert(out.error || "Could not finalize.");

      alert("Event finalized!");
      await reloadEventDashboard();
    } catch (err) {
      console.error("Finalize error:", err);
      alert("Error finalizing event.");
    }
  });

  // Report (Pro only)
   
    const reportBtn = document.createElement("button");
    reportBtn.textContent = "📊 Open Post-Event Report";
    reportBtn.classList.add("btn-primary");
    
    reportBtn.addEventListener("click", () => {
      if (window.USER_PLAN !== "pro") {
        showStarterUpgrade("Post-Event Reports are a Pro feature.");
        return;
      }
      openPostEventReport(event);
    });
    buttonContainer.appendChild(reportBtn);

  // Edit
  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Edit Event";
  editBtn.classList.add("btn-secondary");
  editBtn.addEventListener("click", () => editEvent(event));

  buttonContainer.appendChild(squareBtn);
  buttonContainer.appendChild(finalizeBtn);

  buttonContainer.appendChild(editBtn);
    
  }

  // ======================
  // 1) EVENT SUMMARY CARD
  // ======================
  const summaryData = {
    EventID: eventID,
    Date: eventDate,
    Location: eventLocation,
    Coordinator: coordinator,
    Status: status,
    EventType: event.eventType || "",
    NumDays: event.numDays ?? "",
  };

  const summaryHTML = Object.entries(summaryData)
    .map(([k, v]) => `<div><strong>${k}:</strong> ${v ?? ""}</div>`)
    .join("");

  container.appendChild(
    createCollapsibleCard("Event Summary", summaryHTML)
  );

  // ======================
  // 2) CUSTOM FIELDS CARD (if any)
  // ======================
  if (event.customFields && Object.keys(event.customFields).length) {
    const customHTML = Object.entries(event.customFields)
      .map(([k, v]) => `<div><strong>${k}:</strong> ${v ?? ""}</div>`)
      .join("");

    container.appendChild(
      createCollapsibleCard("Custom Fields", customHTML)
    );
  }

  // ======================
  // 3) DRINK SALES CARD
  // ======================
  let drinkHTML = "";
  if (!event.drinkSales || event.drinkSales.length === 0) {
    drinkHTML = "<p>No drink sales recorded.</p>";
  } else {
    const totalRevenue = event.drinkSales.reduce(
      (sum, r) => sum + (Number(r.totalCost) || 0),
      0
    );
    const totalQty = event.drinkSales.reduce(
      (sum, r) => sum + (Number(r.quantitySold) || 0),
      0
    );

    drinkHTML = `
      <div><strong>Total Drinks Sold:</strong> ${totalQty}</div>
      <div><strong>Total Drink Revenue:</strong> ${fmt(totalRevenue)}</div>
      <hr>
      ${buildTableHTMLString(event.drinkSales)}
    `;
  }
  container.appendChild(
    createCollapsibleCard("Itemized Drink Sales", drinkHTML)
  );


  // ======================
// 💰 FEES CARD (Editable)
// ======================
container.appendChild(
  createCollapsibleCard("Additional Fees", buildFeesEditor(event))
  );
// ======================
// 5) DISCOUNTS CARD (Editable)
// ======================
  const discountEditorHTML = buildDiscountsEditor(event);

  let discHTML = "";
  if (!event.discounts || event.discounts.length === 0) {
    discHTML = "<p>No discounts recorded.</p>";
  } else {
    const totalDiscounts = event.discounts.reduce(
      (sum, r) => sum + (Number(r.discountAmount) || 0),
      0
    );
    discHTML = `
      <div><strong>Total Discounts:</strong> ${fmt(totalDiscounts)}</div>
      <hr>
      ${buildTableHTMLString(event.discounts)}
    `;
  }
 
   container.appendChild(
    createCollapsibleCard("Discounts", buildDiscountsEditor(event))
   );

  // ======================
  // 6) TIPS CARD
  // ======================
  let tipsHTML = "";
  if (!event.tips || event.tips.length === 0) {
    tipsHTML = "<p>No tips recorded.</p>";
  } else {
    const totalTips = event.tips.reduce(
      (sum, r) => sum + (Number(r.tipAmount) || 0),
      0
    );
    tipsHTML = `
      <div><strong>Total Tips:</strong> ${fmt(totalTips)}</div>
      <hr>
      ${buildTableHTMLString(event.tips)}
    `;
  }
  container.appendChild(
  createCollapsibleCard("Tips", buildTipsEditor(event))
);
  
  // ======================
  // 7) SUPPLIES CARD
  // ======================
 container.appendChild(
  renderSupplyCostsCard(event.supplies || [])
);

  // ======================
  // 8) EMPLOYEES / LABOR CARD
  // ======================
 // Labor card host
const laborHostId = "laborTableHost";
container.appendChild(
  createCollapsibleCard("Labor", `<div id="${laborHostId}"></div>`)
);

// Now load labor into THIS host
loadLaborForEvent(eventID, document.getElementById(laborHostId));




  // ======================
  // 8)EXPENSES / COST CARD
  // ======================

if (event.expenses && Object.keys(event.expenses).length) {
  container.appendChild(renderExpensesCard(event.expenses));
}


// ===============================
// Profit Summary Calculation FIX
// ===============================
if (event.sales && event.expenses ) {
  container.appendChild(
    renderEventProfitSummary(event)
  );
}
}


async function pullSquareSales(eventId) {
  try {
    const res = await fetch(`http://localhost:3000/api/square/sales/${eventId}`, {
      method: "PUT"
    });

    // 🔑 Always read the body FIRST
    const text = await res.text();

    if (!res.ok) {
      console.error("❌ Square sync failed (raw response):", text);
      throw new Error(text || `HTTP ${res.status}`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      console.warn("⚠️ Non-JSON response from Square sync:", text);
      payload = {};
    }

    console.log("✅ Square sync success:", payload);
    return payload;

  } catch (err) {
    console.error("❌ Error pulling Square data:", err);
    throw err;
  }
}


/* ============================================================
   🟢 FINAL — Option B
   Unified Post-Event Report Loader + Renderer
   (Duplicate definitions removed)
   ============================================================ */

function normalizeReportPayload(raw) {
  const eventInfo = raw.eventInfo || raw.EventInfo || raw.event || raw.Event || {};

  return {
    eventInfo,
    customFields: raw.customFields || raw.CustomFields || {},
    sales: raw.sales || raw.Sales || null,
    employees: raw.employees || raw.labor || raw.Labor || [],
    supplies: raw.supplies || raw.Supplies || [],
    discountsList: raw.discountsList || raw.Discounts || [],
    tipsList: raw.tipsList || raw.Tips || [],
    totals: raw.totals || raw.Totals || null
  };
}

async function openPostEventReport(eventData) {
  if (window.USER_PLAN === "starter") {
    showUpgradeModal(
      "Post-Event Reports are a Pro feature.",
      "Upgrade to unlock full reports and comparisons."
    );
    return;
  }
  try {
    const eventID =
      eventData.eventID ||
      eventData.EventID ||
      eventData.EventInfo?.["Event ID"];

    if (!eventID) {
      alert("Cannot determine eventID for report.");
      console.warn("No eventID in eventData:", eventData);
      return;
    }

    const res = await fetch(`http://localhost:3000/api/events/${eventID}/report`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const raw = await res.json();
    console.log("🔎 Raw report payload:", raw);

    const report = normalizeReportPayload(raw);
    window.currentPostEventReport = report;

    const titleEl = document.getElementById("postEventTitle");
    if (titleEl && report.eventInfo?.eventName) {
      titleEl.textContent = report.eventInfo.eventName;
    } else if (titleEl) {
      titleEl.textContent = "Post Event Report";
    }

    renderPostEventReport(report);
    navigateTo("postEventReportSection");

  } catch (err) {
    console.error("❌ Error loading post-event report:", err);
    alert("Failed to load post-event report. Check console for details.");
  }
}

function renderPostEventReport(report) {
  const container = document.getElementById("postEventReportContent");
  if (!container) {
    console.error("❌ postEventReportContent not found");
    return;
  }

  // Sanitize KV rows
  const renderKV = (obj) => {
    const rows = Object.entries(obj)
      .filter(([k, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `
        <div class="kv-row">
          <div class="kv-label">${k.replace(/([A-Z])/g, " $1")}</div>
          <div class="kv-value">${v}</div>
        </div>
      `)
      .join("");

    return rows || `<div class="kv-empty">No data available</div>`;
  };

  // Pretty section header
  const sectionHeader = (title, icon = "📄") =>
    `
    <div class="report-section-title">
      <span class="report-icon">${icon}</span>
      <span>${title}</span>
    </div>
    `;

  let html = "";

  // EVENT SUMMARY
  if (report.eventInfo) {
    html += `
      <section class="report-block">
        ${sectionHeader("Event Summary", "📅")}
        ${renderKV(report.eventInfo)}
      </section>
    `;
  }

  // SALES SUMMARY
  if (report.sales) {
    html += `
      <section class="report-block">
        ${sectionHeader("Sales Summary", "💲")}
        ${renderKV(report.sales)}
      </section>
    `;
  }

  // LABOR
  if (report.employees?.length) {
    html += `
      <section class="report-block">
        ${sectionHeader("Labor Summary", "👥")}
        <table class="report-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Hours</th>
              <th>Wage</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${report.employees
              .map(
                (e) => `
              <tr>
                <td>${e.employeeName || e.name}</td>
                <td>${e.hours}</td>
                <td>$${e.wage}</td>
                <td class="money">$${e.totalPay}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  // SUPPLIES
  if (report.supplies?.length) {
    html += `
      <section class="report-block">
        ${sectionHeader("Supplies Used", "📦")}
        <table class="report-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${report.supplies
              .map(
                (s) => `
              <tr>
                <td>${s.itemName}</td>
                <td>${s.quantityUsed}</td>
                <td>$${s.unitCost}</td>
                <td class="money">$${s.totalCost}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }
  //EXPENSES


  

  // TOTALS
  if (report.totals) {
    html += `
      <section class="report-block totals-block">
        ${sectionHeader("Final Totals", "📘")}
        ${renderKV(report.totals)}
      </section>
    `;
  }

  container.innerHTML = html;
  document.getElementById("postEventReportSection").scrollIntoView({ behavior: "smooth" });
}



//---------------------------------------------------
// Helper Functions
//-----------------------------------------------------
// Pure HTML table builder for dashboard cards (DOES NOT touch the DOM)
function buildTableHTMLString(rows) {
  if (!rows || rows.length === 0) {
    return "<p>No data available.</p>";
  }

  const cols = Object.keys(rows[0]);
  let html = `<table class="lemondrip-table card-table"><thead><tr>`;

  html += cols.map(col => `<th>${col}</th>`).join("");
  html += `</tr></thead><tbody>`;

  for (const row of rows) {
    html += "<tr>";
    html += cols.map(col => `<td>${row[col] ?? ""}</td>`).join("");
    html += "</tr>";
  }

  html += "</tbody></table>";
  return html;
}

function buildCustomFieldsTable(custom) {
  if (!custom || typeof custom !== "object" || !Object.keys(custom).length) {
    return { text: "No custom fields", italics: true, margin: [0, 5, 0, 10] };
  }

  return {
    table: {
      widths: ["35%", "*"],
      body: Object.entries(custom).map(([key, value]) => [
        { text: key, bold: true },
        String(value ?? "")
      ])
    },
    margin: [0, 5, 0, 15]
  };
}
function renderKeyValueTable(obj) {
  return `
    <table class="lemondrip-table">
      <tbody>
        ${Object.entries(obj).map(([key, val]) => `
          <tr>
            <td><strong>${key}</strong></td>
            <td>${val ?? ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTable(rows) {
  if (!rows.length) return "<p>No data</p>";

  const columns = Object.keys(rows[0]);

  return `
    <table class="lemondrip-table">
      <thead>
        <tr>
          ${columns.map(col => `<th>${col}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${columns.map(col => `<td>${row[col]}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function downloadPostEventPDF() {
  if (window.USER_PLAN === "starter") {
  showUpgradeModal(
    "PDF reports are a Pro feature.",
    "Upgrade to export and share event reports."
  );
  return;
  }


  if (!window.currentPostEventReport) {
    alert("No report data available.");
    return;
  }

  const report = window.currentPostEventReport;

  const doc = new jspdf.jsPDF({ unit: "pt", format: "letter" });
  const marginLeft = 40;
  let y = 40;

  // =============================
  // HEADER
  // =============================
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(report.eventInfo.eventName || "Post Event Report", marginLeft, y);
  y += 30;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Event Date: ${report.eventInfo.eventDate || ""}`, marginLeft, y);
  y += 20;

  // ---- helper: section header ----
  const sectionHeader = (title) => {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, marginLeft, y);
    y += 12;
  };

  // ---- helper: key/value detail block ----
  const renderKeyValueBlock = (obj) => {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    Object.entries(obj).forEach(([key, val]) => {
      doc.text(`${key}: ${val ?? ""}`, marginLeft, y);
      y += 14;

      // auto page break
      if (y > 700) {
        doc.addPage();
        y = 40;
      }
    });

    y += 10; // spacing between sections
  };

  // =============================
  // EVENT SUMMARY
 //=============================
  sectionHeader("Event Summary");
  renderKeyValueBlock(report.eventInfo);

  // =============================
  // SALES SUMMARY
  //=============================
  if (report.sales) {
    sectionHeader("Sales Summary");
    renderKeyValueBlock(report.sales);
  }

  // =============================
  // CUSTOM FIELDS
  //=============================
  if (report.customFields && Object.keys(report.customFields).length) {
    sectionHeader("Custom Fields");
    renderKeyValueBlock(report.customFields);
  }

  // ---- helper: render table via autoTable ----
  const renderTable = (rows, columns, title) => {
    if (!rows || !rows.length) return;

    sectionHeader(title);

    doc.autoTable({
      startY: y,
      margin: { left: marginLeft },
      head: [columns],
      body: rows.map(row => columns.map(c => row[c] ?? "")),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 171, 226] }, // LemonDrip blue (#00ABE2)
      theme: "grid"
    });

    y = doc.lastAutoTable.finalY + 20;
  };

  // =============================
  // LABOR SUMMARY
  //=============================
  if (report.employees?.length) {
    renderTable(
      report.employees,
      ["employeeName", "hours", "wage", "totalPay"],
      "Labor Summary"
    );
  }

  // =============================
  // SUPPLIES
  //=============================
  if (report.supplies?.length) {
    renderTable(
      report.supplies,
      ["itemName", "quantityUsed", "unitCost", "totalCost"],
      "Supplies Used"
    );
  }

  // =============================
  // DISCOUNTS
  //=============================
  if (report.discountsList?.length) {
    const cols = Object.keys(report.discountsList[0]);
    renderTable(report.discountsList, cols, "Discounts");
  }

  // =============================
  // TIPS
  //=============================
  if (report.tipsList?.length) {
    const cols = Object.keys(report.tipsList[0]);
    renderTable(report.tipsList, cols, "Tips");
  }

  // =============================
  // TOTALS
  //=============================
  if (report.totals) {
    sectionHeader("Totals");
    renderKeyValueBlock(report.totals);
  }

  // =============================
  // SAVE PDF
  //=============================
  doc.save(`PostEventReport_${report.eventInfo.eventName || "Event"}.pdf`);
}




// ---------- HELPERS ----------
function formatLabel(str) {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

function money(v) {
  return `$${Number(v ?? 0).toFixed(2)}`;
}

function sectionHeader(text) {
  return { text, style: "sectionHeader" };
}

async function uploadEventPermits(eventID) {
  const files = document.getElementById("permitFilesReport").files;
  if (!files.length) return; // nothing to upload

  const fd = new FormData();
  fd.append("eventID", eventID);

  [...files].forEach((f) => fd.append("permits", f));

  const res = await fetch(
    "http://localhost:3000/api/events/upload-permits",
    {
      method: "POST",
      body: fd
    }
  );

  const result = await res.json();
  console.log("Permit upload result:", result);
}




window.addEventListener("DOMContentLoaded", () => {
  if (window.USER_PLAN === "starter") {
    const eventDashboard = document.getElementById("eventDashboardSection");
      if (eventDashboard) {
      eventDashboard.classList.add("hidden");
    }
    document.getElementById("btnDesign")?.remove();
    document.getElementById("btnCompany")?.remove();
  }
});


function clearTemplate() {
  formTemplate.fields = [];
  renderFormPreview();
}

document
  .getElementById("builderType")
  .addEventListener("change", (e) => {
    document.getElementById("optionsLabel").style.display =
      ["select", "multiselect"].includes(e.target.value)
        ? "block"
        : "none";
  });
// -----------------------------
// 👷 Labor / Employee Hours Module
// -----------------------------

async function loadEmployeesForDropdown() {
  const select = document.getElementById("laborEmployeeSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Select employee...</option>';

  try {
    const res = await fetch(`${API_BASE}/api/employees`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rows = Array.isArray(data) ? data : (data.employees || []);
    rows.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.EmployeeID || emp.employeeID;
      opt.textContent = emp.EmployeeName || emp.name;
      if (emp.defaultWage || emp.DefaultWage) {
        opt.dataset.wage = emp.defaultWage || emp.DefaultWage;
      }
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("❌ loadEmployeesForDropdown error:", err);
  }
}

async function loadLaborForEvent(
  eventID,
  hostEl = document.getElementById("laborTableContainer")
) {
  if (!eventID) {
    console.warn("loadLaborForEvent called with no eventID");
    return;
  }

  if (!hostEl) {
    console.warn("No labor host element found.");
    return;
  }

  hostEl.innerHTML = "<p>Loading labor...</p>";

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/employees`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rows = await res.json();

    if (!rows || !rows.length) {
      hostEl.innerHTML = "<p>No shifts recorded.</p>";
      return;
    }

    let html = `
      <table class="labor-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Role</th>
            <th>Hours</th>
            <th>Wage</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      html += `
        <tr>
          <td>${r.employeeName || r.EmployeeName || ""}</td>
          <td>${r.role || ""}</td>
          <td>${r.hoursWorked ?? ""}</td>
          <td>${fmt(r.hourlyRate ?? 0)}</td>
          <td>${fmt(r.totalPay ?? 0)}</td>
          <td>
            <button
              class="delete-btn"
              onclick="deleteLaborShift(${r.eventEmployeeID})"
            >✕</button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    hostEl.innerHTML = html;

  } catch (err) {
    console.error("❌ loadLaborForEvent error:", err);
    hostEl.innerHTML = "<p>Error loading labor data.</p>";
  }
}


function updateLaborTotal() {
  const hoursEl = document.getElementById("laborHours");
  const wageEl = document.getElementById("laborWage");
  const totalEl = document.getElementById("laborTotal");
  if (!hoursEl || !wageEl || !totalEl) return;

  const hrs = Number(hoursEl.value) || 0;
  const wage = Number(wageEl.value) || 0;
  totalEl.value = (hrs * wage).toFixed(2);
}

async function saveLaborShift() {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    alert("No active event selected.");
    return;
  }

  const employeeSelect = document.getElementById("laborEmployeeSelect");
  const hoursEl = document.getElementById("laborHours");
  const wageEl = document.getElementById("laborWage");
  const roleEl = document.getElementById("laborRole");
  const notesEl = document.getElementById("laborNotes");

  if (!employeeSelect || !hoursEl) return;

  const payload = {
    employeeID: employeeSelect.value,
    hoursWorked: hoursEl.value,
    hourlyRate: wageEl ? wageEl.value : 0,
    role: roleEl ? roleEl.value : "",
    notes: notesEl ? notesEl.value : ""
	};

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // reset inputs
    hoursEl.value = "";
    if (wageEl) wageEl.value = "";
    if (roleEl) roleEl.value = "";
    if (notesEl) notesEl.value = "";
    updateLaborTotal();

    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveLaborShift error:", err);
    alert("Could not save labor shift.");
  }
}

async function saveAdjustmentsForCurrentEvent() {
  const eventID = window.currentEventId;
  if (!eventID) {
    alert("No active event selected.");
    return;
  }

  // TODO: build these from your UI (see next subsection)
  const payload = collectAdjustmentsFromUI();

  const res = await fetch(`${API_BASE}/api/events/${eventID}/adjustments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    console.error("🚨 Adjustments save error:", json);
    alert(json.error || "Failed to save adjustments.");
    return;
  }

  alert("Adjustments saved!");

  // Optionally reload report/dashboard for fresh totals
  const updatedReport = await fetch(`${API_BASE}/api/events/${eventID}/report`)
    .then(r => r.json());

  const refreshed = normalizeEvent({
  ...updated.event,
  sales: updated.sales,
  expenses: updated.expenses,
  totals: updated.totals,
  drinkSales: updated.drinkSales,
  additionalFees: updated.additionalFees,
  discounts: updated.discounts,
  tips: updated.tips,
  supplies: updated.supplies,
  labor: updated.labor
});


  loadEventIntoDashboard(refreshed);
}

async function deleteLaborShift(shiftID) {
  if (window.activeEvent?.isFinalized === 1) {
  alert("This event has been finalized and can no longer be edited.");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID || !shiftID) return;

  if (!confirm("Delete this shift?")) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/events/${eventID}/employees/${shiftID}`,
      { method: "DELETE" }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // ✅ Single source of truth
    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ deleteLaborShift error:", err);
    alert("Could not delete shift.");
  }
}

function loadRecentActivity() {
  const list = document.getElementById("recentActivityList");
  if (!list) return;

  list.innerHTML = `
    <li class="activity-muted">
      Activity will appear here as events are added and finalized
    </li>
  `;
}

function showStarterUpgrade(reason = "") {
  const base = "Starter includes 1 finalized event.";
  const perks = "Pro unlocks unlimited events, reports, and exports.";
  const message = reason ? `${reason}\n\n${base}\n${perks}` : `${base}\n${perks}`;

  showUpgradeModal("Upgrade to Pro", message);
}
window.addEventListener("DOMContentLoaded", async () => {
  await populateTemplateDropdown();
});


function startActivityImageRotation() {
  const img = document.getElementById("activityImage");
  if (!img) return;

  // click to advance
  img.onclick = () => advanceActivityImage();

  // auto-rotate every 6 seconds
  clearInterval(activityImageTimer);
  activityImageTimer = setInterval(advanceActivityImage, 6000);
}

function advanceActivityImage() {
  const img = document.getElementById("activityImage");
  if (!img) return;

  activityImageIndex =
    (activityImageIndex + 1) % activityImages.length;

  img.style.opacity = 0;

  setTimeout(() => {
    img.src = activityImages[activityImageIndex];
    img.style.opacity = 1;
  }, 200);
}
