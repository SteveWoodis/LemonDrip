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
window.availableTemplates = [];

window.USER_PLAN = "starter"; // default until server responds

// ---------------------------
// 🔐 SuperTokens Auth
// ---------------------------
supertokens.init({
  apiDomain: window.location.origin,
  apiBasePath: "/auth",
});

let authMode = "signin"; // "signin" or "signup"

// ---------------------------
// 🔐 SuperTokens Auth Mode
// Allows user to toggle between Sign in and Sign Up
// ---------------------------
function toggleAuthMode(e) {
  e.preventDefault();
  authMode = authMode === "signin" ? "signup" : "signin";
  document.getElementById("authTitle").textContent =
    authMode === "signin" ? "Sign In" : "Sign Up";
  document.getElementById("authSubtitle").textContent =
    authMode === "signin"
      ? "Welcome back! Sign in to manage your events."
      : "Create your account to get started.";
  document.getElementById("authSubmitBtn").textContent =
    authMode === "signin" ? "Sign In" : "Sign Up";
  document.getElementById("authToggleText").textContent =
    authMode === "signin" ? "Don't have an account?" : "Already have an account?";
  document.getElementById("authToggleLink").textContent =
    authMode === "signin" ? "Sign Up" : "Sign In";
  document.getElementById("authError").textContent = "";
}

// ---------------------------
// 🔐 SuperTokens Authentication
// Allows for passing of Username and Password
// ---------------------------
async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errorEl = document.getElementById("authError");
  errorEl.textContent = "";

  try {
    const url = authMode === "signup"
      ? "/auth/signup"
      : "/auth/signin";

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formFields: [
        { id: "email", value: email },
        { id: "password", value: password },
      ]}),
    });

    const data = await res.json();

    if (data.status === "OK") {
      showAuthenticatedUI();
    } else if (data.status === "FIELD_ERROR") {
      errorEl.textContent = data.formFields.map(f => f.error).join(". ");
    } else if (data.status === "WRONG_CREDENTIALS_ERROR") {
      errorEl.textContent = "Incorrect email or password.";
    } else {
      errorEl.textContent = data.message || "Authentication failed.";
    }
  } catch (err) {
    console.error("Auth error:", err);
    errorEl.textContent = "Unable to connect. Please try again.";
  }
}

// ---------------------------
// 🔐 SuperTokens Auth - Logout
// ---------------------------
async function handleLogout() {
  try {
    await fetch("/auth/signout", { method: "POST" });
  } catch (err) {
    console.warn("Logout request failed:", err);
  }
  showUnauthenticatedUI();
}


async function checkSession() {
  const exists = await supertokens.doesSessionExist();
  if (exists) {
    showAuthenticatedUI();
  } else {
    showUnauthenticatedUI();
  }
}

async function showAuthenticatedUI() {
  document.getElementById("authSection").classList.add("hidden");
  document.querySelectorAll("#btnAdd, #btnCompany, #btnDesign, #btnManage, #btnLogout")
    .forEach(b => { if (b) b.style.display = ""; });

  // Fetch the user's plan from the server
  try {
    const res = await fetch(`${API_BASE}/api/me`);
    if (res.ok) {
      const data = await res.json();
      window.USER_PLAN = data.plan || "starter";
      console.log("📋 Plan loaded:", window.USER_PLAN);
    }
  } catch (err) {
    console.warn("⚠️ Failed to fetch plan, defaulting to starter");
  }

  // Apply starter restrictions
  if (window.USER_PLAN === "starter") {
    document.getElementById("btnDesign")?.remove();
    document.getElementById("btnCompany")?.remove();
  }

  loadAppState();
}

function showUnauthenticatedUI() {
  document.querySelectorAll(".app-shell > section")
    .forEach(sec => sec.classList.add("hidden"));
  document.getElementById("authSection").classList.remove("hidden");
  document.querySelectorAll("#btnAdd, #btnCompany, #btnDesign, #btnManage, #btnLogout")
    .forEach(b => { if (b) b.style.display = "none"; });
}

// Button spinner helper
async function withSpinner(btn, asyncFn) {
  if (!btn || btn.disabled) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("btn-loading");
  btn.innerHTML = `<span class="spinner"></span> ${btn.textContent.trim()}`;
  try {
    await asyncFn();
  } finally {
    btn.disabled = false;
    btn.classList.remove("btn-loading");
    btn.innerHTML = original;
  }
}

// Toast notification system
function showToast(message, type = "info", duration = 3500, onRetry) {
  const container = document.getElementById("toast-container") || (() => {
    const div = document.createElement("div");
    div.id = "toast-container";
    document.body.appendChild(div);
    return div;
  })();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (onRetry) {
    duration = Math.max(duration, 6000);
    const retryBtn = document.createElement("button");
    retryBtn.className = "toast-retry";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      toast.remove();
      onRetry();
    });
    toast.appendChild(retryBtn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duration);
}

// Inline error banner for content areas
function showInlineError(containerId, message, onRetry) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="inline-error">
      <span class="inline-error-icon">⚠️</span>
      <span>${message}</span>
      ${onRetry ? '<button class="inline-error-retry">Retry</button>' : ''}
    </div>
  `;
  if (onRetry) {
    el.querySelector(".inline-error-retry")?.addEventListener("click", onRetry);
  }
}

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


//=============================================
//   HELPER SECTION
/**
 * Safely read a numeric input by data-field name
 * - Returns undefined if field not found
 * - Returns undefined if empty string
 * - Returns a Number (including 0) if valid
 */
//=============================================

function getInputNumber(fieldName) {
  const input = document.querySelector(`[data-field="${fieldName}"]`);
  if (!input) return undefined;

  const raw = input.value;

  // Treat empty as "no change"
  if (raw === "" || raw === null) return undefined;

  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

// ---------------------------
// 🔌 Global App Event Wiring
// ---------------------------

window.addEventListener("DOMContentLoaded", () => {

  document.addEventListener("labor:updated", e => {
    updateExpensesLaborRow(e.detail.laborFees);
    updateProfitSummary();
  });

});


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
const API_BASE = window.location.origin;

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

    inventorySales: e.inventorySales || [],
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
    inventorySales: Array.isArray(e.inventorySales) ? e.inventorySales : [],
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

    customFields: (() => {
      if (typeof e.customFields === "string") {
        try { return JSON.parse(e.customFields) || {}; }
        catch { return {}; }
      }
      return e.customFields || {};
    })(),
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
  totalExpenses: 0,
  coordinatorFee: 0
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
const upgradeContexts = {
  report: { icon: '📊', text: 'Post-Event Reports are a Pro feature.' },
  finalize: { icon: '✅', text: 'Starter includes 1 finalized event. Upgrade to track more.' },
  history: { icon: '📋', text: 'Viewing finalized event history requires Pro.' },
  pdf: { icon: '📄', text: 'PDF export is a Pro feature.' },
};

function showUpgradeModal(context) {
  const ctx = upgradeContexts[context] || { icon: '🔒', text: context };
  document.getElementById('triggerReasonText').textContent = ctx.text;
  document.querySelector('.trigger-reason .reason-icon').textContent = ctx.icon;

  const overlay = document.getElementById('upgradeOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleUpgradeClick() {
  closeUpgradeModal();
  window.location.href = '/upgrade';
}

// Close modal on overlay click or Escape key
document.addEventListener('click', (e) => {
  if (e.target === document.getElementById('upgradeOverlay')) closeUpgradeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUpgradeModal();
});

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
    navigateTo("manageSection");
    return;
  }
  try {
    const state = JSON.parse(saved);
    const sectionId =
      (state.activeAction ? state.activeAction : "manage") + "Section";
    if (document.getElementById(sectionId)) {
      navigateTo(sectionId);
    } else {
      navigateTo("manageSection");
    }
  } catch (err) {
    console.warn("⚠️ Failed to restore app state:", err);
    navigateTo("manageSection");
  }
}

// Handle browser back/forward
window.addEventListener("popstate", (event) => {
  const action = event.state?.action || location.hash.replace("#/", "");
  if (action) navigateTo(action + "Section"); // ✅ replaced showSection
});

// On initial page load
window.addEventListener("DOMContentLoaded", () => {
  checkSession();
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
  if (sectionId === "homeSection") {
    window.location.href = "/";
    return;
  }

  document.querySelectorAll(".app-shell > section")
    .forEach((sec) => sec.classList.add("hidden"));

  const section = document.getElementById(sectionId);
  if (!section) return console.warn(`⚠️ Section "${sectionId}" not found`);

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });

  if (sectionId === "manageSection") {
    loadAllEvents();
  }
}

window.navigateTo = navigateTo; // <-- FIX

function formatEvent(e) {
  const n = normalizeEvent(e);
  return {
    eventID: n.eventID,
    eventName: n.eventName,
    eventDate: n.eventDate,
    numDays: n.numDays,
    grossSales: n.grossSales,
    netProfit: n.netProfit,
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
    const copy = { ...ev };
    if (copy.customFields && typeof copy.customFields === "string") {
      try {
        const parsed = JSON.parse(copy.customFields);
        copy._rawCustomFields = copy.customFields;
        copy.customFields = Object.entries(parsed)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
      } catch {
        // already a display string, leave as-is
      }
    }
    return copy;
  });

  const container = document.getElementById(containerId) || document.body;
  container.innerHTML = "";

  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No events yet</h3>
        <p>Create your first event to start tracking profit.</p>
        <button class="btn-primary" onclick="openAddEventForUser()">➕ Add Your First Event</button>
      </div>`;
    return;
  }

  const displayColumns = [
    { key: "eventID", label: "Event ID" },
    { key: "eventName", label: "Event Name" },
    { key: "eventDate", label: "Event Date" },
    { key: "numDays", label: "Num Days" },
    { key: "grossSales", label: "Gross Sales" },
    { key: "netProfit", label: "Net Profit" },
  ];

  const table = document.createElement("table");
  table.classList.add("results-table", "lemondrip-table");

  const header = table.createTHead();
  const headerRow = header.insertRow();

  displayColumns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    headerRow.appendChild(th);
  });

  const body = table.createTBody();

  results.forEach((event) => {
    const tr = body.insertRow();

    displayColumns.forEach((col, colIndex) => {
      const td = tr.insertCell();
      let val = event[col.key] ?? "";

      if (col.key === "grossSales" || col.key === "netProfit") {
        const num = Number(val) || 0;
        td.textContent = `$${num.toFixed(2)}`;
      } else if (col.key === "eventName" && event.isFinalized) {
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
          showToast("eventID missing — cannot load details.", "error");
          return;
        }
        if (window.USER_PLAN === "starter" && event.isFinalized === 1) {
          showUpgradeModal("history");
          return;
        }

        const res = await fetch(`${API_BASE}/api/events/${eventID}/report`);
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const report = await res.json();

        const fullEvent = normalizeEvent({
          ...report.event,
          inventorySales: report.inventorySales,
          additionalFees: report.additionalFees,
          discounts: report.discounts,
          tips: report.tips,
          supplies: report.supplies,
          labor: report.labor,
          totals: report.totals,
          sales: report.sales,
          taxes: report.taxes
        });

       // console.log("⭐ FULL REPORT EVENT LOADED right before loadEventIntoDashboard:", report);
        loadEventIntoDashboard(report.event);
      } catch (err) {
        console.error("❌ Error loading event details:", err);
        showToast("Could not load event details. Check your connection.", "error", 3500, () => tr.click());
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
    const res = await fetch(`${API_BASE}/api/events`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
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
    showInlineError("manageResults", "Could not load events. The server may be unavailable.", loadAllEvents);
  }
}


// Search
async function manageSearch() {
  const name = document.getElementById("manageSearchName").value.trim();
  const date = document.getElementById("manageSearchDate").value.trim();
  const id = document.getElementById("manageSearchID").value.trim();

  const q = name || date || id;
  if (!q) {
    showToast("Please enter a search term.", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/events/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Search error:", data);
      showToast("Search failed: " + (data.error || res.statusText), "error", 3500, manageSearch);
      return;
    }
    const data = await res.json();
    const results = Array.isArray(data) ? data : [];
    buildTableHTML(results, "manageResults");
  } catch (err) {
    console.error("Search network error:", err);
    showInlineError("manageResults", "Search failed. The server may be unavailable.", manageSearch);
  }
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
    showToast("Company name is required.", "warning");
    return;
  }

  try {
    const res = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const result = await res.json();
    console.log("✅ Company saved:", result);
    showToast("Company added successfully!", "success");
  } catch (err) {
    console.error("❌ Error adding company:", err);
    showToast("Failed to add company. Please try again.", "error", 3500, () => addCompany(event));
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
  const proFields = document.getElementById("proAddEventFields");
  if (window.USER_PLAN === "starter") {
    if (proFields) proFields.style.display = "none";
    return;
  }
  if (proFields) proFields.style.display = "";

  try {
    const res = await fetch(
      `${API_BASE}/api/square/locations`
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
  if (!eventData) {
    showToast("No Event Data to load.", "warning");
    return;
  }

  const eventID = eventData.eventID || eventData.EventID || eventData["Event ID"];
  if (!eventID) {
    showToast("Event ID missing — cannot edit.", "error");
    return;
  }

  // Fetch the full event from the API so all fields are available
  let info;
  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}`);
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    info = await res.json();
  } catch (err) {
    console.error("❌ Failed to fetch full event for editing:", err);
    showToast("Could not load event details.", "error");
    return;
  }

  console.log("Editing Event.", info);

  window.activeEvent = info;
  window.activeeventID = eventID;
  window.isEditing = true;

  // Show Add/Edit form
  openAddEventForUser();

  // Determine active template
  const activeTemplateName =
    document.getElementById("templateSelect")?.value ||
    "Default Template";

  const template = window.availableTemplates?.find(
    (t) => t.templateName === activeTemplateName
  );
  if (!template) {
    showToast("Template not found. Please load a template first.", "warning");
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

  // Prefill dynamic fields from the full event data
  const formContainer = document.getElementById("eventForm");
  const inputs = formContainer.querySelectorAll(
    "input, select, textarea"
  );

  inputs.forEach((input) => {
    const rawKey = input.id.replace(/^form_/, "");
    const labelKey = rawKey.replace(/_/g, " ");
    // Map label to canonical DB key (e.g. "Event_Location" → "eventLocation")
    const dbKey = CANONICAL_LABEL_TO_DBKEY[labelKey] || CANONICAL_LABEL_TO_DBKEY[rawKey];
    // Try canonical DB key first, then exact match, then case-insensitive
    const match = Object.keys(info).find(
      (k) => (dbKey && k === dbKey) || k === rawKey || k.toLowerCase() === rawKey.toLowerCase()
    );
    if (!match) return;

    const val = info[match];
    if (val === null || val === undefined) return;

    if (input.multiple && Array.isArray(val)) {
      Array.from(input.options).forEach((opt) => {
        opt.selected = val.includes(opt.value);
      });
    } else {
      input.value = val;
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
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error(`Server error ${res.status}`);
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
    showToast("Could not load events from server.", "error", 3500, loadEvents);
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

  const submitBtn = document.querySelector('#eventForm button[type="submit"]');
  if (submitBtn?.disabled) return;

  const runSubmit = async () => {
  // --------------------------------------------------
  // 0️⃣ Plan gating (unchanged logic)
  // --------------------------------------------------
  if (window.USER_PLAN === "starter") {
    const finalizedCount = getFinalizedEventCount();
    if (!window.isEditing && finalizedCount >= 1) {
      showUpgradeModal("finalize");
      return;
    }
  }

  const formEl = document.getElementById("eventForm");
  if (!formEl) {
    showToast("Form not found.", "error");
    return;
  }

  // --------------------------------------------------
  // 1️⃣ Resolve active template
  // --------------------------------------------------
  const templateName = document.getElementById("templateSelect")?.value;
  
  const template = window.availableTemplates?.find(
    (t) => (t.templateName || t.TemplateName) === templateName
  );
 
const fields = template?.fields ?? template?.Fields;

if (!template || !Array.isArray(fields)) {
  showToast("Template is missing or invalid.", "warning");
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
  "squareLocationId",
  "zipCode"
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
  const REQUIRED = ["eventName", "eventDate", "zipCode"];

  for (const key of REQUIRED) {
    if (!canonical[key]) {
      showToast("Event Name, Event Date, and Zip Code are required.", "warning");
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
    showToast(json.error || "Error saving event.", "error");
    return;
  }

  // --------------------------------------------------
  // 🔟 Post-save actions
  // --------------------------------------------------
  const eventID = isEditing
    ? window.activeeventID
    : json.eventID || json.EventID;

  if (!eventID) {
    showToast("Could not determine EventID from server response.", "error");
    return;
  }

  await uploadEventPermits(eventID);

  showToast(isEditing ? "Event updated!" : "Event created!", "success");

  window.isEditing = false;
  window.activeeventID = null;
  window.activeEvent = null;

  const eventFormEl = document.getElementById("eventForm");
  if (eventFormEl) eventFormEl.innerHTML = "";

  navigateTo("manageSection");
  await loadAllEvents();
  };

  if (submitBtn) {
    await withSpinner(submitBtn, runSubmit);
  } else {
    await runSubmit();
  }
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
    const res = await fetch("/api/employees");
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
    showToast("Please enter a field label.", "warning");
    return;
  }

  const newField = { label, type, required };
  if (["select", "multiselect"].includes(type)) {
    if (!optionsInput) {
      showToast(
        "Please enter options for dropdowns or multiselects.", "warning"
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
      `${API_BASE}/api/formTemplates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    if (response.ok) {
      showToast("Template saved successfully!", "success");
    } else {
      const err = await response.json();
      console.error("Save error:", err);
      showToast("Error saving template. Check backend logs.", "error");
    }
  } catch (err) {
    console.error("Fetch failed:", err);
    showToast("Network or server error while saving template.", "error", 3500, saveTemplate);
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
      typeof t.templateName === "string" &&
      t.templateName.toLowerCase() === "default template"
    ) ||
    window.availableTemplates.find(t =>
      typeof t.templateName === "string" &&
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
  if (!window.availableTemplates) {
  await populateTemplateDropdown();
}

   navigateTo("addSection");

   if (!window.availableTemplates) {
    console.error("Templates not loaded");
    return;
  }


  await populateTemplateDropdown();

  if (window.USER_PLAN === "starter") {
    const tpl = getDefaultStarterTemplate();
    if (tpl) {
      rebuildAddEventForm(stripEventColorFromTemplate(tpl));
      const dropdown = document.getElementById("templateSelect");
      if (dropdown) dropdown.value = tpl.templateName;
    }
  }

  loadSquareLocationsIntoForm();
}

/*async function loadTemplates() {
  try {
    const res = await fetch("/api/formTemplates");
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
}*/

// 🧩 Load templates into Add Event dropdown
async function populateTemplateDropdown() {
  try {
    const res = await fetch(`${API_BASE}/api/formTemplates`);
    const templates = await res.json();

    if (!Array.isArray(templates)) {
      console.error("❌ Templates failed to load:", templates);
      return;
    }
    window.availableTemplates = templates.map(t => ({
      templateID: t.TemplateID,
      templateName: t.TemplateName,
      fields: t.Fields,
      createdAt: t.CreatedAt
    }));
    const dropdown = document.getElementById("templateSelect");
    const loadBtn = document.getElementById("loadTemplateBtn");

    if (dropdown && loadBtn) {
      loadBtn.disabled = true;

      dropdown.addEventListener("change", () => {
        loadBtn.disabled = !dropdown.value;
      });
    }

    if (dropdown) {
      dropdown.innerHTML = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "-- Select Template --";
      dropdown.appendChild(defaultOpt);
      for (const t of window.availableTemplates) {
        const opt = document.createElement("option");
        opt.value = t.templateName;
        opt.textContent = t.templateName;
        dropdown.appendChild(opt);
      }
    }

    console.log(`✅ ${templates.length} templates loaded`);
  } catch (err) {
    console.error("❌ Error loading templates:", err);
    showToast("Could not load templates.", "error", 3500, populateTemplateDropdown);
  }
}


// ⚡ When user picks a template
// Helper to strip 'Event Color' field from templates defensively
function stripEventColorFromTemplate(tpl) {
  if (!tpl || !Array.isArray(tpl.fields)) return tpl;

  return {
    ...tpl,
    fields: tpl.fields.filter(
      f =>
        !(
          f &&
          typeof f.label === "string" &&
          /^event\s*color$/i.test(f.label)
        )
    )
  };
}


function useSelectedTemplate() {
  const templates = window.availableTemplates;

  if (!Array.isArray(templates)) {
    console.error("❌ Templates not loaded yet");
    return;
  }

  const dropdown = document.getElementById("templateSelect");
  if (!dropdown) {
    console.error("❌ Template dropdown not found");
    return;
  }

  const selected = dropdown.value;
  if (!selected) {
    console.warn("ℹ️ No template selected");
    showToast("Please select a template first.", "warning");
    return;
  }

  const tpl = templates.find(t => t.templateName === selected);


  if (!tpl) {
    console.warn("❌ Template not found:", selected);
    showToast("Template not found!", "warning");
    return;
  }

  console.log("📋 Loading template into Add Event form:", tpl);

  rebuildAddEventForm(stripEventColorFromTemplate(tpl));

 showToast(`Loaded template: "${tpl.templateName}"`, "success");

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
    showToast("Please select a template to activate.", "warning");
    return;
  }
  const tpl = window.availableTemplates.find(
    (t) => t.TemplateName === selectedName
  );
  if (!tpl) {
    showToast("Template not found!", "warning");
    return;
  }
  console.log("Activating template:", tpl.TemplateName);
  rebuildAddEventForm(stripEventColorFromTemplate(tpl));
  showToast(`"${tpl.TemplateName}" activated!`, "success");
}

function rebuildAddEventForm(template) {
  const formContainer = document.getElementById("eventForm");
  
  // 🧠 Keep existing event data if present
  const existing = window.activeEvent || {};

  // Only clear the form if we’re not editing an event
  formContainer.innerHTML = "";
  const fields = template?.fields ?? template?.Fields ?? template?.FIELDS ?? null;
console.log("✅ fields resolved:", fields);


  console.log("WHAT IS TEMPLATE VALUE: ", template);
  console.log(" The Fields of Template:", fields);

  if (
    !template || !Array.isArray(fields)) {
    console.error("❌ Invalid template structure:", template);
    formContainer.innerHTML = "<p>Template could not be loaded.</p>";
    return;
  }

  (fields[0]?.fields || fields).forEach(
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
  wrapper.id = title.toLowerCase().replace(/\s+/g, "") + "Card";

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
      inventorySales: report.inventorySales,
      additionalFees: report.additionalFees,
      discounts: report.discounts,
      tips: report.tips,
      supplies: report.supplies,
      labor: report.labor
    });
    
    loadEventIntoDashboard(refreshedEvent);

  } catch (err) {
    console.error("❌ Failed to reload event dashboard", err);
    showToast("Failed to reload event data.", "error", 3500, reloadEventDashboard);
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
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    showToast("No active event.", "warning");
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
      showToast(json.error || "Failed to save fees.", "error");
      return;
    }

    showToast("Fees saved!", "success");

    // ✅ Single source of truth
    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveFees error:", err);
    showToast("Network error saving fees.", "error", 3500, saveFees);
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
      <button type="button" class="btn-primary" onclick="withSpinner(this, saveFees)">💾 Save Fees</button>
    </div>
  `;

  return html;
}

// --------------------------------------------
// 💵 Build Editable Tips Card (Event-Level)
// --------------------------------------------
function buildTipsEditor(event) {
  const rows = event.tips || [];
  const sales = event.sales || {};
  const fmtMoney = (v) =>
    v == null ? "$0.00" : `$${Number(v).toFixed(2)}`;

  let html = `
    <div><strong>Tips (Square):</strong> ${fmtMoney(sales.tips)}</div>
    <hr>
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
      <button type="button" class="btn-primary" onclick="withSpinner(this, saveTips)">💾 Save Tips</button>
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
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
  } 
  const eventID = window.currentEventId;
  if (!eventID) {
    showToast("No active event.", "warning");
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
      showToast(json.error || "Failed to save tips.", "error");
      return;
    }

    showToast("Tips saved!", "success");

    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveTips error:", err);
    showToast("Network error saving tips.", "error", 3500, saveTips);
  }
}


// --------------------------------------------
// 🧾 Build Editable Discounts Card
// --------------------------------------------
function buildDiscountsEditor(event) {
  const rows = event.discounts || [];
  const sales = event.sales || {};
  const fmtMoney = (v) =>
    v == null ? "$0.00" : `$${Number(v).toFixed(2)}`;

  let html = `
    <div><strong>Discounts (Square):</strong> ${fmtMoney(sales.discounts)}</div>
    <hr>
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
      <button type="button" class="btn-primary" onclick="withSpinner(this, saveDiscounts)">💾 Save Discounts</button>
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
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    showToast("No active event.", "warning");
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
      showToast(json.error || "Failed to save discounts.", "error");
      return;
    }

    showToast("Discounts saved!", "success");

    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ saveDiscounts error:", err);
    showToast("Network error saving discounts.", "error", 3500, saveDiscounts);
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


function renderManualSalesEntryCard(report) {
  const sales = report.sales || {};
  const eventID = report.event?.eventID || window.currentEventId;

  const fields = [
    { label: "Gross Sales", key: "grossSales" },
    { label: "Refunds", key: "refunds" },
    { label: "Discounts", key: "discounts" },
    { label: "Total Collected", key: "totalCollected" },
  ];

  const inputsHTML = fields.map(f => `
    <div class="ledger-row" style="margin-bottom:8px;">
      <label class="ledger-label" for="manual_${f.key}">${f.label}</label>
      <input type="number" step="0.01" id="manual_${f.key}"
        style="width:120px;text-align:right"
        value="${Number(sales[f.key] || 0).toFixed(2)}">
    </div>
  `).join("");

  const html = `
    <div class="profit-summary">
      ${inputsHTML}
      <div style="margin-top:12px;">
        <button class="btn-primary" onclick="withSpinner(this, saveManualSales)">💾 Save Sales Data</button>
      </div>
    </div>
  `;

  return createCollapsibleCard("Manual Sales Entry", html);
}

async function saveManualSales() {
  const eventID = window.currentEventId;
  if (!eventID) { showToast("No event selected.", "warning"); return; }

  const body = {
    grossSales: Number(document.getElementById("manual_grossSales")?.value) || 0,
    refunds: Number(document.getElementById("manual_refunds")?.value) || 0,
    discounts: Number(document.getElementById("manual_discounts")?.value) || 0,
    totalCollected: Number(document.getElementById("manual_totalCollected")?.value) || 0,
  };

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/manual-sales`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Save failed");
    }

    showToast("Sales data saved!", "success");
    await reloadEventDashboard();
  } catch (err) {
    console.error("Manual sales save error:", err);
    showToast("Failed to save sales data: " + err.message, "error", 3500, saveManualSales);
  }
}

function renderEventProfitSummary(report) {
  const event = report.event || {};
const sales = report.sales || {};
const expenses = report.expenses || {};
const discounts = report.discounts || [];
const taxes = report.taxes || {};

//console.log("PRINT OUT for taxes: ",taxes);

const discountTotal = discounts.reduce(
  (sum, d) => sum + (Number(d.discountAmount) || 0),
  0
);

  const isSquare = window.USER_PLAN === "pro" && !!event.squareLocationId;

  const posFees = isSquare
    ? Number(sales.squareFees || 0)
    : Number(expenses.posFee || 0);

  const stateFoodTax = Number(taxes.stateFoodTax || 0);

  

  const coordinatorFee = Number(expenses.coordinatorFee || 0);

  const totalExpenses =
    Number(expenses.healthDeptFee || 0) +
    Number(expenses.eventFee || 0) +
    Number(expenses.additionalFees || 0) +
    Number(expenses.mileageReimbursement || 0) +
    Number(expenses.employeeBonus || 0) +
    Number(expenses.eventRunnerFees || 0) +
    Number(expenses.supplyFees || 0) +
    Number(expenses.laborFees || 0) +
    coordinatorFee +
    posFees +
    stateFoodTax;

  const netProfit = Number(sales.totalCollected || 0) - totalExpenses;


  // Taxes — rates from server, applied to frontend's netProfit
  const stateRate = Number(taxes.stateRate || 0);
  const federalTaxRate = Number(taxes.federalTaxRate || 0.153);
  const stateTax = netProfit > 0 ? netProfit * stateRate : 0;
  const federalTax = netProfit > 0 ? netProfit * federalTaxRate : 0;
  const finalProfit = netProfit - stateTax - federalTax;
  const stateRatePct = (stateRate * 100).toFixed(2);
  const stateTaxLabel = taxes.taxDetail?.state
    ? `${taxes.taxDetail.state} State Tax (${stateRatePct}%)`
    : `State Tax (${stateRatePct}%)`;

  const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

  return createCollapsibleCard(
    "Event Profit Summary",
    `
    <div class="profit-summary">

      <div class="section-title">Revenue</div>
      <div class="ledger-row"><span class="ledger-label">Gross Sales</span><span class="ledger-amount">${fmt(sales.grossSales)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Returns</span><span class="ledger-amount">-${fmt(sales.refunds)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Discounts</span><span class="ledger-amount">-${fmt(sales.discounts)}</span></div>
      <div class="ledger-row total-row"><span class="ledger-label">Net Sales</span><span class="ledger-amount">${fmt(sales.netSales)}</span></div>
      <div class="section-divider"></div>
      <div class="ledger-row total-row"><span class="ledger-label">Total Collected</span><span class="ledger-amount">${fmt(sales.totalCollected)}</span></div>
      <div class="section-divider"></div>
      
      <div class="section-title">Expenses</div>
      <div class="ledger-row"><span class="ledger-label">Health Dept Fee</span><span class="ledger-amount">-${fmt(expenses.healthDeptFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Event Fee</span><span class="ledger-amount">-${fmt(expenses.eventFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Additional Fees</span><span class="ledger-amount">-${fmt(expenses.additionalFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Mileage Reimbursement</span><span class="ledger-amount">-${fmt(expenses.mileageReimbursement)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Employee Bonus</span><span class="ledger-amount">-${fmt(expenses.employeeBonus)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Event Runner Fees</span><span class="ledger-amount">-${fmt(expenses.eventRunnerFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Supply Costs</span><span class="ledger-amount">-${fmt(expenses.supplyFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Labor Fees</span><span class="ledger-amount">-${fmt(expenses.laborFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Coordinator Fee</span><span class="ledger-amount">-${fmt(coordinatorFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">POS Fees</span><span class="ledger-amount">-${fmt(posFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Food Tax (${(Number(taxes.stateRate || 0) * 100).toFixed(2)}%)</span><span class="ledger-amount">-${fmt(stateFoodTax)}</span></div>
      <div class="section-divider"></div>
      <div class="ledger-row total-row"><span class="ledger-label">Total Expenses</span><span class="ledger-amount">-${fmt(totalExpenses)}</span></div>

        <div class="section-divider"></div>
      <div class="ledger-row total-row"><span class="ledger-label">Net Profit</span><span class="ledger-amount">${fmt(netProfit)}</span></div>

      <div class="ledger-row"><span class="ledger-label">${stateTaxLabel}</span><span class="ledger-amount">-${fmt(stateTax)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Federal Tax (15.3%)</span><span class="ledger-amount">-${fmt(federalTax)}</span></div>
      <div class="ledger-row final-row"><span class="ledger-label">Final Profit</span><span class="ledger-amount">${fmt(finalProfit)}</span></div>

    </div>
    `
  );
}

async function updateManualPosFee(value) {
  const eventID = window.currentEventId;
  if (!eventID) return;

  const posFee = Number(value) || 0;
  try {
    await fetch(`${API_BASE}/api/events/${eventID}/expenses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posFee })
    });
    if (window.activeEvent) {
      window.activeEvent.expenses = window.activeEvent.expenses || {};
      window.activeEvent.expenses.posFee = posFee;
    }
  } catch (err) {
    console.error("Failed to save POS fee", err);
  }
}

function updateExpensesDOM(expenses) {
 const el = document.getElementById("expensesCard");
 
  if (!el) return;

  const autoLaborEl = el.querySelector(".auto-labor-fees");
if (autoLaborEl) {
  autoLaborEl.textContent = fmt(expenses.laborFees);
}

const totalExpensesEl = el.querySelector(".total-expenses");
if (totalExpensesEl) {
  totalExpensesEl.textContent = fmt(expenses.totalExpenses);
}

}


function updateExpensesLaborRow(laborFees) {
  if (!window.activeEvent) return;

  const expenses = { ...(window.activeEvent.expenses || {}) };
   const n = v => Number(v) || 0;   // ⭐ ADD THIS LINE

  expenses.laborFees = n(laborFees);

  const taxes = window.activeEvent?.taxes || {};
  const stateFoodTax = Number(taxes.stateFoodTax || 0);

  expenses.totalExpenses =
    (expenses.healthDeptFee || 0) +
    (expenses.eventFee || 0) +
    (expenses.mileageReimbursement || 0) +
    (expenses.employeeBonus || 0) +
    (expenses.coordinatorFee || 0) +
    (expenses.eventRunnerFees || 0) +
    (expenses.additionalFees || 0) +
    (expenses.supplyFees || 0) +
    (expenses.laborFees || 0) +
    (expenses.posFee || 0) +
    stateFoodTax;

  window.activeEvent.expenses = expenses;

  // Re-render Expenses card
  updateExpensesDOM(expenses);
  updateProfitSummary();

}

function updateProfitSummary() {
  if (!window.activeEvent) return;

  const { sales, expenses, totals } = window.activeEvent;

  const totalNetRevenue = Number(totals.totalNetRevenue || 0);
  const totalExpenses = Number(expenses.totalExpenses || 0);

  totals.grossProfit = totalNetRevenue - totalExpenses;

  window.activeEvent.totals = totals;

  updateProfitSummaryDOM(totals);
}



  function renderExpensesCard(expenses = {}, sales = {}, taxes = {}) {
    const content = expensesEditMode
  ? renderExpensesEditMode(expenses)
  : renderExpensesViewMode(expenses, sales, taxes);

  const card = createCollapsibleCard("Expenses", content);

  // ✅ consistent lowercase id
  card.id = "expensesCard";

  return card;   // ✅ MUST return
}



function renderExpensesViewMode(expenses, sales = {}, taxes = {}) {
  const fmtMoney = (v) =>
    v == null ? "$0.00" : `$${Number(v).toFixed(2)}`;

  const event = window.activeEvent?.event || window.activeEvent || {};
  const isSquare = window.USER_PLAN === "pro" && !!event.squareLocationId;
  const posFees = isSquare
    ? Number(sales.squareFees || 0)
    : Number(expenses.posFee || 0);

  const stateFoodTax = Number(taxes.stateFoodTax || 0);

  const totalExpenses =
    Number(expenses.healthDeptFee || 0) +
    Number(expenses.eventFee || 0) +
    Number(expenses.mileageReimbursement || 0) +
    Number(expenses.employeeBonus || 0) +
    Number(expenses.eventRunnerFees || 0) +
    Number(expenses.coordinatorFee || 0) +
    Number(expenses.additionalFees || 0) +
    Number(expenses.laborFees || 0) +
    Number(expenses.supplyFees || 0) +
    posFees +
    stateFoodTax;

  return `
  <div class="expenses-card">
    <div>Health Dept Fee: ${fmtMoney(expenses.healthDeptFee)}</div>
    <div>Event Fee: ${fmtMoney(expenses.eventFee)}</div>
    <div>Mileage: ${fmtMoney(expenses.mileageReimbursement)}</div>
    <div>Employee Bonus: ${fmtMoney(expenses.employeeBonus)}</div>
    <div>Event Runner Fees: ${fmtMoney(expenses.eventRunnerFees)}</div>
    <div>Coordinator Fee: ${fmtMoney(expenses.coordinatorFee)}</div>
    <div>POS Fees: ${fmtMoney(posFees)}</div>
    <hr>
    <div>Additional Fees (auto): ${fmtMoney(expenses.additionalFees)}</div>
    <div>
      Labor Fees (auto):
      <span class="auto-labor-fees">${fmtMoney(expenses.laborFees)}</span>
    </div>
    <div>Supply Fees (auto): ${fmtMoney(expenses.supplyFees)}</div>
    <div>State Food Tax (8.04%) (auto): ${fmtMoney(stateFoodTax)}</div>
    <hr>
    <strong>
      Total Expenses:
      <span class="total-expenses">${fmtMoney(totalExpenses)}</span>
    </strong>

    <button class="btn-secondary" onclick="enterExpensesEditMode()">
      ✏️ Edit Expenses
    </button>
  </div>
`;

  console.log("ExPENSES REPORT", expenses);
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

      <label>Coordinator Fee</label>
      <input type="number" data-field="coordinatorFee"
        value="${expenses.coordinatorFee ?? 0}">

      <label>POS Fees</label>
      <input type="number" step="0.01" data-field="posFee"
        value="${expenses.posFee ?? 0}">
      <hr>

      <button class="btn-primary" onclick="withSpinner(this, saveExpenses)">💾 Save</button>
      <button class="btn-secondary" onclick="cancelExpensesEdit()">Cancel</button>
    </div>
  `;
}




function updateProfitSummaryDOM(totals) {
  const el = document.querySelector(".profit-summary");
  if (!el) return;

  const grossProfit1 = el.querySelector(".gross-profit");
  if (grossProfit1) {
    grossProfit1.textContent = fmt(totals.grossProfit);
  }
}


function renderLaborCard(event) {
  const rows = event.labor || [];

  let html = `
    <table class="labor-table">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Hours</th>
          <th>Rate</th>
          <th>Flat Rate</th>
          <th>Subtotal</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="laborTableBody">
  `;

  // empty state
  if (!rows.length) {
    html += `
      <tr>
        <td colspan="6" class="empty-state-cell">
          <div class="empty-state-icon">👷</div>
          No labor entries yet — add a shift below.
        </td>
      </tr>
    `;
  }

  // render rows
  for (const row of rows) {
    const flat = Number(row.flatRate) || 0;
    const subtotal = flat > 0 ? flat :
      (Number(row.hoursWorked) || 0) * (Number(row.hourlyRate) || 0);

    html += `
      <tr>
        <td><input data-field="employeeName" value="${row.employeeName || ""}"></td>
        <td><input type="number" step="0.25" data-field="hoursWorked" value="${row.hoursWorked ?? ""}"></td>
        <td><input type="number" step="0.01" data-field="hourlyRate" value="${row.hourlyRate ?? ""}"></td>
        <td><input type="number" step="0.01" data-field="flatRate" value="${row.flatRate ?? ""}"></td>
        <td class="labor-subtotal">${fmt(subtotal)}</td>
        <td><button class="remove-labor-row">✖</button></td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>

    <div class="labor-footer">
      <strong>Total Labor:</strong>
      <span id="laborTotal">$0.00</span>
    </div>

    <div class="labor-actions">
      <button id="addLaborRow">➕ Add Worker</button>
      <button id="saveLabor">💾 Save Labor</button>
    </div>
  `;

  return createCollapsibleCard("Labor", html);
}




function wireLaborCard(eventID) {

  const body = document.getElementById("laborTableBody");
  const totalEl = document.getElementById("laborTotal");
  const addBtn = document.getElementById("addLaborRow");
  const saveBtn = document.getElementById("saveLabor");

  if (!body || !totalEl || !addBtn || !saveBtn) {
    console.warn("⚠️ Labor DOM not ready, skipping wireLaborCard");
    return;
  }

  function recalc() {
    let total = 0;

    body.querySelectorAll("tr").forEach(row => {
      const hours = Number(row.querySelector('[data-field="hoursWorked"]')?.value || 0);
      const rate  = Number(row.querySelector('[data-field="hourlyRate"]')?.value || 0);
      const flat  = Number(row.querySelector('[data-field="flatRate"]')?.value || 0);

      const sub = Number((flat > 0 ? flat : hours * rate).toFixed(2));
      const subEl = row.querySelector(".labor-subtotal");
      if (subEl) subEl.textContent = fmt(sub);

      total += sub;
    });

    total = Number(total.toFixed(2));
    totalEl.textContent = fmt(total);

    // ✅ push labor total into Expenses auto row + Profit Summary
    updateExpensesLaborRow(total);
    updateProfitSummary();
  }

  body.addEventListener("input", recalc);

  body.addEventListener("click", e => {
    if (e.target.classList.contains("remove-labor-row")) {
      e.target.closest("tr")?.remove();
      recalc();
    }
  });

  addBtn.onclick = () => {
    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td><input data-field="employeeName"></td>
        <td><input type="number" step="0.25" min="0" data-field="hoursWorked"></td>
        <td><input type="number" step="0.01" min="0" data-field="hourlyRate"></td>
        <td><input type="number" step="0.01" min="0" data-field="flatRate"></td>
        <td class="labor-subtotal">$0.00</td>
        <td><button class="btn-danger remove-labor-row">✖</button></td>
      </tr>
    `);
    recalc();
  };

  saveBtn.onclick = () => {
    if (window.activeEvent?.isFinalized === 1) {
      showToast("This event is finalized and labor cannot be edited.", "warning");
      return;
    }

    withSpinner(saveBtn, async () => {
      const laborRows = [];
      body.querySelectorAll("tr").forEach(row => {
        const employeeName = row.querySelector('[data-field="employeeName"]')?.value || "";
        const hoursWorked  = Number(row.querySelector('[data-field="hoursWorked"]')?.value || 0);
        const hourlyRate   = Number(row.querySelector('[data-field="hourlyRate"]')?.value || 0);
        const flatRate     = Number(row.querySelector('[data-field="flatRate"]')?.value || 0);

        if (!employeeName && hoursWorked === 0 && hourlyRate === 0 && flatRate === 0) return;
        laborRows.push({ employeeName, hoursWorked, hourlyRate, flatRate });
      });

      const res = await fetch(`${API_BASE}/api/events/${eventID}/labor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laborRows })
      });

      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        showToast(out.error || "Failed to save labor.", "error");
        return;
      }

      await reloadEventDashboard();
    });
  };

  recalc();
}




function enterExpensesEditMode() {
  expensesEditMode = true;
  const card = document.getElementById("expensesCard");
  if (card) {
    const contentEl = card.querySelector(".sheet-content");
    if (contentEl) {
      contentEl.innerHTML = renderExpensesEditMode(window.activeEvent?.expenses || {});
    }
  }
}

function cancelExpensesEdit() {
  expensesEditMode = false;
  const card = document.getElementById("expensesCard");
  if (card) {
    const contentEl = card.querySelector(".sheet-content");
    if (contentEl) {
      contentEl.innerHTML = renderExpensesViewMode(window.activeEvent?.expenses || {}, window.activeEvent?.sales || {}, window.activeEvent?.taxes || {});
    }
  }
}


async function saveExpenses() {
 if (window.activeEvent?.isFinalized === 1) {
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
}
  const payload = {};

  const healthDeptFee = getInputNumber("healthDeptFee");
  const eventFee = getInputNumber("eventFee");
  const mileage = getInputNumber("mileageReimbursement");
  const runnerFees = getInputNumber("eventRunnerFees");
  const employeeBonus = getInputNumber("employeeBonus");
  const coordinatorFee = getInputNumber("coordinatorFee");
  const posFee = getInputNumber("posFee");

  if (healthDeptFee !== undefined) payload.healthDeptFee = healthDeptFee;
  if (eventFee !== undefined) payload.eventFee = eventFee;
  if (mileage !== undefined) payload.mileageReimbursement = mileage;
  if (runnerFees !== undefined) payload.eventRunnerFees = runnerFees;
  if (employeeBonus !== undefined) payload.employeeBonus = employeeBonus;
  if (coordinatorFee !== undefined) payload.coordinatorFee = coordinatorFee;
  if (posFee !== undefined) payload.posFee = posFee;

  console.log("Payload length", payload);

  if (Object.keys(payload).length === 0) {
    showToast("No changes to save.", "info");
    return;
  }

  try {
    await fetch(`${API_BASE}/api/events/${window.currentEventId}/expenses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expensesEditMode = false;
    await reloadEventDashboard();

  } catch (err) {
    console.error("Failed to save expenses", err);
    showToast("Failed to save expenses.", "error", 3500, saveExpenses);
  }

 // window.activeEvent.expenses = payload;
//updateExpensesDOM(payload);
//updateProfitSummary();


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
    <div class="row supply-row" data-supply-id="${r.id}">
      <input type="text" class="supply-name" value="${r.itemName}">
      <input type="number" class="supply-unit-cost" step="0.01" value="${r.unitCost}">
      <input type="number" class="supply-qty" step="1" value="${r.quantityUsed}">
      <span class="supply-line-total">${fmt(r.totalCost)}</span>
      <button onclick="deleteSupply(${r.id})">🗑</button>
    </div>
  `).join("");

  const html = `
    ${rows || '<div class="empty-state-inline"><span class="empty-state-icon">📦</span> No supply costs recorded — add items below.</div>'}

    <div class="row">
      <input id="newSupplyName" placeholder="Item">
      <input id="newSupplyUnitCost" type="number" step="0.01" placeholder="Unit Cost">
      <input id="newSupplyQty" type="number" step="1" placeholder="Qty Used">
      <button onclick="addSupply()">➕ Add</button>
    </div>

    <hr>
    <div><strong>Total Supply Cost:</strong> <span id="supplyTotal">${fmt(total)}</span></div>

    <div class="supply-actions">
      <button class="btn-primary" onclick="withSpinner(this, calculateSupplyCosts)">🧮 Calculate Supply Costs</button>
    </div>
  `;

  return createCollapsibleCard("Supply Costs", html);
}

async function addSupply() {
  if (window.activeEvent?.isFinalized === 1) {
    showToast("This event has been finalized and can no longer be edited.", "warning");
    return;
  }

  const payload = {
    itemName: document.getElementById("newSupplyName").value,
    unitCost: Number(document.getElementById("newSupplyUnitCost").value) || 0,
    quantityUsed: Number(document.getElementById("newSupplyQty").value) || 0
  };

  const res = await fetch(
    `${API_BASE}/api/events/${window.currentEventId}/supplies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const newRow = await res.json();
  if (!res.ok) {
    console.error("❌ Failed to add supply:", newRow);
    return;
  }

  // Append new row into the card without reloading
  const card = document.getElementById("supplycostsCard");
  const firstRow = card?.querySelector(".row");
  const noItems = card?.querySelector("p");
  if (noItems) noItems.remove();

  const rowHTML = `
    <div class="row supply-row" data-supply-id="${newRow.id}">
      <input type="text" class="supply-name" value="${newRow.itemName}">
      <input type="number" class="supply-unit-cost" step="0.01" value="${newRow.unitCost}">
      <input type="number" class="supply-qty" step="1" value="${newRow.quantityUsed}">
      <span class="supply-line-total">${fmt(newRow.totalCost || 0)}</span>
      <button onclick="deleteSupply(${newRow.id})">🗑</button>
    </div>
  `;

  if (firstRow) {
    firstRow.insertAdjacentHTML("beforebegin", rowHTML);
  }

  // Clear inputs
  document.getElementById("newSupplyName").value = "";
  document.getElementById("newSupplyUnitCost").value = "";
  document.getElementById("newSupplyQty").value = "";
}


async function calculateSupplyCosts() {
  if (window.activeEvent?.isFinalized === 1) {
    showToast("This event has been finalized and can no longer be edited.", "warning");
    return;
  }

  const eventID = window.currentEventId;
  if (!eventID) return;

  // 1️⃣ Collect all supply rows from the DOM
  const supplyRows = document.querySelectorAll(".supply-row");
  const updates = [];

  for (const row of supplyRows) {
    const id = Number(row.dataset.supplyId);
    const itemName = row.querySelector(".supply-name")?.value?.trim() || "";
    const unitCost = Number(row.querySelector(".supply-unit-cost")?.value) || 0;
    const quantityUsed = Number(row.querySelector(".supply-qty")?.value) || 0;

    if (id && itemName) {
      updates.push({ id, itemName, unitCost, quantityUsed });
    }
  }

  // 2️⃣ Save each row to the server
  for (const u of updates) {
    await fetch(`${API_BASE}/api/supplies/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemName: u.itemName,
        unitCost: u.unitCost,
        quantityUsed: u.quantityUsed
      })
    });
  }

  // 3️⃣ Calculate total and save supplyFees to EventExpenses
  const supplyFees = updates.reduce(
    (sum, u) => sum + u.unitCost * u.quantityUsed, 0
  );

  await fetch(`${API_BASE}/api/events/${eventID}/expenses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supplyFees })
  });

  // 4️⃣ Reload dashboard to reflect updated totals everywhere
  await reloadEventDashboard();
}

async function deleteSupply(id) {
  if (window.activeEvent?.isFinalized === 1) {
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
}
  await fetch(`${API_BASE}/api/supplies/${id}`, {
    method: "DELETE"
  });

  reloadEventDashboard();
}

function safeAppend(container, node) {
  if (!container || !node) return;
  container.appendChild(node);
}


async function loadEventIntoDashboard(evt) {
  if (!evt) {
    console.warn("⚠️ loadEventIntoDashboard called with no event");
    return;
  }

  const event = normalizeEvent(evt);
 // console.log("Dashboard event Object", event);

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
  if (typeof loadEmployeesForDropdown === "function") {
    loadEmployeesForDropdown();
  }

  const container = document.getElementById("eventDashboardContainer");
  if (!container) {
    console.warn("⚠️ #eventDashboardContainer not found");
    return;
  }
  container.innerHTML = "";

   // ======================
// 🔥 FETCH FULL REPORT
// ======================
let report;

try {
  const reportRes = await fetch(
    `${API_BASE}/api/events/${event.eventID}/report`
  );

  if (!reportRes.ok) {
    throw new Error("Failed to load report");
  }

  report = await reportRes.json();

 // console.log("Loaded Report:", report);

} catch (err) {
  console.error("Report load failed:", err);
  showInlineError("eventDashboardContainer",
    "Could not load the financial report. The server may be unavailable.",
    () => loadEventIntoDashboard(evt));
  return;
}


  // ======================
  // HEADER (top of dashboard)
  // ======================
  const headerTitle = document.getElementById("dashEventName");
  const headerDate = document.getElementById("dashEventDate");
  const finalizedIndicator = document.getElementById("dashFinalizedIndicator");

  if (headerTitle) headerTitle.textContent = eventName;
  if (headerDate) headerDate.textContent = eventDate;
  if (finalizedIndicator) finalizedIndicator.innerHTML = "";

  if (finalizedIndicator && event.isFinalized === 1) {
    const badge = document.createElement("div");
    badge.classList.add("finalized-badge-large");
    badge.textContent = "FINALIZED";
    safeAppend(finalizedIndicator, badge);

    if (event.finalizedDate) {
      const fd = document.createElement("div");
      fd.classList.add("finalized-date-label");
      fd.textContent = `Finalized on: ${event.finalizedDate}`;
      safeAppend(finalizedIndicator, fd);
    }
  }
 window.activeEventID = event.eventID;
  window.activeEvent   = event;
  // ======================
  // DASHBOARD BUTTONS
  // ======================
  const buttonContainer = document.querySelector(".dashboard-buttons");
  if (buttonContainer) {
    buttonContainer.innerHTML = "";

    // Pull Square Sales
    const squareSalesBtn = document.createElement("button");
    squareSalesBtn.textContent = "🔄 Pull Square Sales";
    squareSalesBtn.classList.add("btn-primary");
    squareSalesBtn.addEventListener("click", () => {
      if (!event.squareLocationId) {
        showToast("No Square Location linked. Edit the event and select a Square Location first.", "warning");
        return;
      }
      withSpinner(squareSalesBtn, async () => {
        try {
          await pullSquareSales(eventID);
          await reloadEventDashboard();
        } catch (err) {
          console.error("Square Sales pull error:", err);
          showToast("Failed to pull Square sales.", "error", 3500, () => pullSquareSales(eventID).then(reloadEventDashboard));
        }
      });
    });
    // Pull Square Labor
    const squareLaborBtn = document.createElement("button");
    squareLaborBtn.textContent = "🔄 Pull Square Labor";
    squareLaborBtn.classList.add("btn-primary");
    squareLaborBtn.addEventListener("click", () => {
      if (!event.squareLocationId) {
        showToast("No Square Location linked. Edit the event and select a Square Location first.", "warning");
        return;
      }
      withSpinner(squareLaborBtn, async () => {
        try {
          await pullSquareLabor(eventID);
          await reloadEventDashboard();
        } catch (err) {
          console.error("Square Labor pull error:", err);
          showToast("Failed to pull Square Labor.", "error", 3500, () => pullSquareLabor(eventID).then(reloadEventDashboard));
        }
      });
    });
    // Finalize
    const finalizeBtn = document.createElement("button");
    finalizeBtn.textContent = "✅ Finalize Event";
    finalizeBtn.classList.add("btn-primary");
    finalizeBtn.addEventListener("click", () => {
      if (window.USER_PLAN === "starter" && event.isFinalized === 0) {
        const finalizedCount = getFinalizedEventCount();
        if (finalizedCount >= 1) {
          showUpgradeModal("finalize");
          return;
        }
      }

      withSpinner(finalizeBtn, async () => {
        try {
          const res = await fetch(`${API_BASE}/api/events/${eventID}/finalize`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });

          const out = await res.json();
          console.log("Finalize Limit", out);

          if (res.status === 403 && out.code === "FINALIZE_LIMIT_REACHED") {
            showUpgradeModal("finalize");
            return;
          }

          showToast("Event finalized!", "success");
          await reloadEventDashboard();

        } catch (err) {
          console.error("Finalize error:", err);
          showToast("Unexpected error finalizing event.", "error", 3500, () => finalizeBtn.click());
        }
      });
    }); 

    // Report (Pro only)
    const reportBtn = document.createElement("button");
    reportBtn.textContent = "📊 Open Post-Event Report";
    reportBtn.classList.add("btn-primary");
    reportBtn.addEventListener("click", () => {
      if (window.USER_PLAN !== "pro") {
        showStarterUpgrade("report");
        return;
      }
      openPostEventReport(event);
    });

    // Edit
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit Event";
    editBtn.classList.add("btn-secondary");
    editBtn.addEventListener("click", () => editEvent(event));

    // Delete
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️ Delete Event";
    deleteBtn.classList.add("btn-danger");
    deleteBtn.addEventListener("click", () => {
      withSpinner(deleteBtn, () => deleteEvent(eventID, eventName));
    });

    if (window.USER_PLAN === "pro") {
      safeAppend(buttonContainer, squareSalesBtn);
      safeAppend(buttonContainer, squareLaborBtn);
    }
    safeAppend(buttonContainer, finalizeBtn);
    safeAppend(buttonContainer, reportBtn);
    safeAppend(buttonContainer, editBtn);
    safeAppend(buttonContainer, deleteBtn);
  }

  // ======================
  // 1) EVENT SUMMARY CARD
  // ======================
  const ev = report.event || event;
  const summaryData = {
    EventID: ev.eventID ?? eventID,
    "Event Name": ev.eventName || "",
    Date: ev.eventDate || eventDate,
    "Event Type": ev.eventType || "",
    Location: ev.eventLocation || eventLocation,
    "Event Host": ev.eventHost || "",
    Coordinator: ev.coordinator || coordinator,
    Status: ev.status || status,
    "Num Days": ev.numDays ?? "",
    State: ev.state ?? "",
    "Zip Code": ev.zipCode ?? "",
    Time: ev.time || "",
    "Event Fee": ev.eventFee ? `$${Number(ev.eventFee).toFixed(2)}` : "",
    "Event Rating": ev.eventRating || "",
    "Application Date": ev.applicationDate || "",
    "Square Location": ev.squareLocationId || "",
    Notes: ev.notes || "",
  };

  const summaryHTML = Object.entries(summaryData)
    .filter(([k, v]) => v !== "" && v != null)
    .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
    .join("");

  safeAppend(container, createCollapsibleCard("Event Summary", summaryHTML));

  safeAppend(container, renderManualSalesEntryCard(report));

  // ======================
  // 2) CUSTOM FIELDS CARD
  // ======================
  // ======================
// 2) CUSTOM FIELDS CARD
// ======================
let customFieldsObj = {};

if (report.event?.customFields) {
  try {
    customFieldsObj =
      typeof report.event.customFields === "string"
        ? JSON.parse(report.event.customFields)
        : report.event.customFields;
  } catch (err) {
    console.warn("Custom fields JSON parse failed:", err);
  }
}

if (Object.keys(customFieldsObj).length) {
  const customHTML = Object.entries(customFieldsObj)
    .map(([k, v]) => `<div><strong>${k}:</strong> ${v ?? ""}</div>`)
    .join("");

  safeAppend(
    container,
    createCollapsibleCard("Custom Fields", customHTML)
  );
}


  // ======================
  // 3) INVENTORY SALES CARD
  // ======================
  let drinkHTML = "<p>No Inventory Sales recorded.</p>";

if (report.inventorySales && report.inventorySales.length) {

  const totalRevenue = report.inventorySales.reduce(
    (sum, r) => sum + (Number(r.totalCost) || 0),
    0
  );

  const totalQty = report.inventorySales.reduce(
    (sum, r) => sum + (Number(r.quantitySold) || 0),
    0
  );

  // 🚫 Columns we do NOT want displayed
  const hiddenColumns = ["eventID", "category", "metadata", "rowCost", "source"];

  // ✅ Create filtered copy for display only
  const displayInventorySales = report.inventorySales.map(row => {
    const filtered = {};
    Object.keys(row).forEach(key => {
      if (!hiddenColumns.includes(key)) {
        filtered[key] = row[key];
      }
    });
    return filtered;
  });

  drinkHTML = `
    <div><strong>Total Items Sold:</strong> ${totalQty}</div>
    <div><strong>Total Item Revenue:</strong> ${fmt(totalRevenue)}</div>
    <hr>
    <div class="card-table-wrapper">
      ${buildTableHTMLString(displayInventorySales)}
    </div>
  `;
}


  safeAppend(container, createCollapsibleCard("Inventory Sales", drinkHTML));

  // ======================
  // 4) ADDITIONAL FEES CARD
  // ======================
  safeAppend(
    container,
    createCollapsibleCard("Additional Fees", buildFeesEditor(report))
  );

  // ======================
  // 5) DISCOUNTS CARD
  // ======================
  safeAppend(
    container,
    createCollapsibleCard("Discounts", buildDiscountsEditor(report))
  );

  // ======================
  // 6) TIPS CARD (Pro only — Square-driven)
  // ======================
  if (window.USER_PLAN === "pro") {
    safeAppend(
      container,
      createCollapsibleCard("Tips", buildTipsEditor(report))
    );
  }

  // ======================
  // 7) SUPPLIES CARD
  // ======================
  safeAppend(
    container,
    renderSupplyCostsCard(report.supplies || [])
  );

  // ======================
  // 8) EMPLOYEES / LABOR CARD
  // ======================
  // ✅ Labor Card (editable)
// 8) EMPLOYEES / LABOR CARD
const laborCard = renderLaborCard(report);
safeAppend(container, laborCard);

// ⭐ WIRE ONLY AFTER IT EXISTS
wireLaborCard(eventID);


  // ======================
  // 9) EXPENSES CARD
  // ======================
  if (report.expenses && Object.keys(report.expenses).length) {
    safeAppend(container, renderExpensesCard(report.expenses, report.sales, report.taxes));
  }

  // ======================
  // 10) PROFIT SUMMARY CARD
  // ======================
 if (report && report.sales && report.expenses) {
  safeAppend(container, renderEventProfitSummary(report));
}

  }




async function deleteEvent(eventID, eventName) {
  if (!confirm(`Are you sure you want to delete "${eventName}"?\n\nThis will permanently remove the event and all associated data (sales, labor, expenses, etc.).`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Delete failed");
    }

    showToast("Event deleted.", "success");
    navigateTo("manageEventsSection");
    loadAllEvents();
  } catch (err) {
    console.error("Delete event error:", err);
    showToast("Failed to delete event: " + err.message, "error", 3500, () => deleteEvent(eventID, eventName));
  }
}

async function pullSquareSales(eventID) {
  try {
    const res = await fetch(`${API_BASE}/api/square/sales/${eventID}`, {
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
async function loadEventLabor(eventID) {
  if (!eventID) return;

  try {
    const res = await fetch(`${API_BASE}/api/square/labor/${eventID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" }
    });

    const json = await res.json();

    if (!res.ok) {
      console.error("❌ Failed to load labor:", json);
      return;
    }

    console.log("✅ Square labor pulled:", json);
    await reloadEventDashboard();

  } catch (err) {
    console.error("❌ Labor reload failed:", err);
  }
}

async function pullSquareLabor() {
  const eventID = window.activeEventID;
  console.log("🧠 Square Labor Pull → eventID:", eventID);

  if (!Number.isFinite(Number(eventID))) {
    showToast("No active event selected.", "warning");
    return;
  }

  const res = await fetch(
    `${API_BASE}/api/square/labor/${eventID}`,
    { method: "PUT" }
  );

  const json = await res.json();

  if (!res.ok) {
    console.error("❌ Square labor pull failed:", json);
    showToast(json.error || "Failed to pull Square labor.", "error");
    return;
  }

  showToast("Square labor pulled successfully.", "success");
  await loadEventLabor(eventID);
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
    expenses: raw.expenses || raw.Expenses || null,
    employees: raw.employees || raw.labor || raw.Labor || [],
    supplies: raw.supplies || raw.Supplies || [],
    discountsList: raw.discountsList || raw.Discounts || [],
    tipsList: raw.tipsList || raw.Tips || [],
    totals: raw.totals || raw.Totals || null
  };
}

async function openPostEventReport(eventData) {
  if (window.USER_PLAN === "starter") {
    showUpgradeModal("report");
    return;
  }
  try {
    const eventID =
      eventData.eventID ||
      eventData.EventID ||
      eventData.EventInfo?.["Event ID"];

    if (!eventID) {
      showToast("Cannot determine eventID for report.", "error");
      console.warn("No eventID in eventData:", eventData);
      return;
    }

    const res = await fetch(`${API_BASE}/api/events/${eventID}/report`);
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
    showToast("Failed to load post-event report.", "error", 3500, () => openPostEventReport(eventData));
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
  // EXPENSES
  if (report.expenses) {
    const expenseLabels = {
      healthDeptFee: "Health Dept Fee",
      eventFee: "Event Fee",
      mileageReimbursement: "Mileage Reimbursement",
      eventRunnerFees: "Event Runner Fees",
      employeeBonus: "Employee Bonus",
      coordinatorFee: "Coordinator Fee",
      posFee: "POS Fee",
      supplyFees: "Supply Costs",
      laborFees: "Labor Fees"
    };

    const expenseRows = Object.entries(expenseLabels)
      .filter(([key]) => Number(report.expenses[key] || 0) !== 0)
      .map(([key, label]) => `
        <div class="kv-row">
          <div class="kv-label">${label}</div>
          <div class="kv-value">$${Number(report.expenses[key] || 0).toFixed(2)}</div>
        </div>
      `)
      .join("");

    if (expenseRows) {
      html += `
        <section class="report-block">
          ${sectionHeader("Expenses", "💰")}
          ${expenseRows}
        </section>
      `;
    }
  }

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
  showUpgradeModal("pdf");
  return;
  }


  if (!window.currentPostEventReport) {
    showToast("No report data available.", "warning");
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
  // EXPENSES
  //=============================
  if (report.expenses) {
    const expenseLabels = {
      healthDeptFee: "Health Dept Fee",
      eventFee: "Event Fee",
      mileageReimbursement: "Mileage Reimbursement",
      eventRunnerFees: "Event Runner Fees",
      employeeBonus: "Employee Bonus",
      coordinatorFee: "Coordinator Fee",
      posFee: "POS Fee",
      supplyFees: "Supply Costs",
      laborFees: "Labor Fees"
    };

    const expenseKV = {};
    Object.entries(expenseLabels).forEach(([key, label]) => {
      const val = Number(report.expenses[key] || 0);
      if (val !== 0) expenseKV[label] = `$${val.toFixed(2)}`;
    });

    if (Object.keys(expenseKV).length) {
      sectionHeader("Expenses");
      renderKeyValueBlock(expenseKV);
    }
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
    "/api/events/upload-permits",
    {
      method: "POST",
      body: fd
    }
  );

  const result = await res.json();
  console.log("Permit upload result:", result);
}




window.addEventListener("DOMContentLoaded", async () => {
  const exists = await supertokens.doesSessionExist();
  if (exists){
  try {
    const res = await fetch(`${API_BASE}/api/me`);
    if (res.ok) {
      const data = await res.json();
      window.USER_PLAN = data.plan || "starter";
      console.log("📋 Plan loaded:", window.USER_PLAN);
    }
  } catch (err) {
    console.warn("⚠️ Failed to fetch plan, defaulting to starter");
  }

  if (window.USER_PLAN === "starter") {
    const eventDashboard = document.getElementById("eventDashboardSection");
    if (eventDashboard) {
      eventDashboard.classList.add("hidden");
    }
    document.getElementById("btnDesign")?.remove();
    document.getElementById("btnCompany")?.remove();
  }
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

   renderLaborCard({ eventID, labor: rows || [] });
 

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
  showToast("This event has been finalized and can no longer be edited.", "warning");
  return;
  }
  const eventID = window.currentEventId;
  if (!eventID) {
    showToast("No active event selected.", "warning");
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
    showToast("Could not save labor shift.", "error", 3500, saveLaborShift);
  }
}

async function saveAdjustmentsForCurrentEvent() {
  const eventID = window.currentEventId;
  if (!eventID) {
    showToast("No active event selected.", "warning");
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
    showToast(json.error || "Failed to save adjustments.", "error");
    return;
  }

  showToast("Adjustments saved!", "success");

  // Optionally reload report/dashboard for fresh totals
  const updatedReport = await fetch(`${API_BASE}/api/events/${eventID}/report`)
    .then(r => r.json());

  const refreshed = normalizeEvent({
  ...updatedReport.event,
  sales: updatedReport.sales,
  expenses: updatedReport.expenses,
  totals: updatedReport.totals,
  inventorySales: updatedReport.inventorySales,
  additionalFees: updatedReport.additionalFees,
  discounts: updatedReport.discounts,
  tips: updatedReport.tips,
  supplies: updatedReport.supplies,
  labor: updatedReport.labor
});


  loadEventIntoDashboard(refreshed);
}

async function deleteLaborShift(shiftID) {
  if (window.activeEvent?.isFinalized === 1) {
  showToast("This event has been finalized and can no longer be edited.", "warning");
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
    showToast("Could not delete shift.", "error", 3500, () => deleteLaborShift(shiftID));
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

function showStarterUpgrade(context = "report") {
  showUpgradeModal(context);
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
