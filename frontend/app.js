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


// ---------------------------
// checkSession | Date: 2026-03-06
// Purpose: On page load, checks whether a SuperTokens session already exists.
//          Routes to authenticated or unauthenticated UI accordingly.
// ---------------------------
async function checkSession() {
  const exists = await supertokens.doesSessionExist();
  if (exists) {
    showAuthenticatedUI();
  } else {
    showUnauthenticatedUI();
  }
}

// ---------------------------
// showAuthenticatedUI | Date: 2026-03-06
// Purpose: Reveals the main app nav and content after a successful login or session check.
//          Fetches the user's plan and admin status, applies plan-based restrictions,
//          and conditionally shows the alerts bell and Admin nav button.
// ---------------------------
async function showAuthenticatedUI() {
  document.getElementById("authSection").classList.add("hidden");
  document.querySelectorAll("#btnAdd, #btnCompany, #btnDesign, #btnManage, #btnInventory, #btnRecipes, #btnLogout")
    .forEach(b => { if (b) b.style.display = ""; });

  // Fetch the user's plan from the server
  try {
    const res = await fetch(`${API_BASE}/api/me`);
    if (res.ok) {
      const data = await res.json();
      window.USER_PLAN = data.plan || "starter";
      window.USER_ID   = data.userId || "";
      window.IS_ADMIN  = data.isAdmin === true;
      console.log("📋 Plan loaded:", window.USER_PLAN, window.IS_ADMIN ? "(admin)" : "");
    }
  } catch (err) {
    console.warn("⚠️ Failed to fetch plan, defaulting to starter");
  }

  // Show alerts bell for all users
  document.getElementById("btnAlerts")?.classList.remove("hidden");
  loadInventoryAlerts();

  // Admin: show admin nav button if this user is an admin
  if (window.IS_ADMIN) {
    document.getElementById("btnAdmin")?.classList.remove("hidden");
  }

  // Show welcome modal on first login
  if (window.USER_ID && !localStorage.getItem(`venview_welcome_seen_${window.USER_ID}`)) {
    showWelcomeModal();
  }

  loadAppState();
}

// ---------------------------
// showUnauthenticatedUI | Date: 2026-03-06
// Purpose: Hides all app content and nav buttons, then shows the login/signup form.
//          Called on logout or when no active session is detected.
// ---------------------------
function showUnauthenticatedUI() {
  document.querySelectorAll(".app-shell > section")
    .forEach(sec => sec.classList.add("hidden"));
  document.getElementById("authSection").classList.remove("hidden");
  document.querySelectorAll("#btnAdd, #btnCompany, #btnDesign, #btnManage, #btnInventory, #btnRecipes, #btnLogout")
    .forEach(b => { if (b) b.style.display = "none"; });
  document.getElementById("btnAdmin")?.classList.add("hidden");
  document.getElementById("btnAlerts")?.classList.add("hidden");
}

// ---------------------------
// withSpinner | Date: 2026-03-06
// Purpose: Wraps an async operation with button loading state — disables the button,
//          shows a spinner, then restores the original label when the operation completes.
// ---------------------------
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

// ---------------------------
// showToast | Date: 2026-03-06
// Purpose: Displays a temporary slide-in toast notification at the bottom of the screen.
//          Supports info/success/warning/error types and an optional Retry button
//          that re-invokes the failed operation when clicked.
// ---------------------------
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

// ---------------------------
// showInlineError | Date: 2026-03-06
// Purpose: Renders an error banner inside a specific content container (e.g., a table area).
//          Used when a data fetch fails — shows the error message in-place with
//          an optional Retry button.
// ---------------------------
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

// ---------------------------
// 📝 Post-Finalize Feedback Banner
// ---------------------------
function showPostFinalizeFeedbackBanner() {
  if (localStorage.getItem(`venview_feedback_dismissed_${window.USER_ID || ""}`)) return;

  const existing = document.getElementById("feedback-banner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "feedback-banner";
  banner.className = "feedback-banner";
  banner.innerHTML = `
    <span>📝 How's your beta experience? <a href="https://docs.google.com/forms/d/e/1FAIpQLSfS_BRqEMyCYWdAEwdKY4EgpNxQkksuV-m04U4Orrvl9GLdsg/viewform?usp=publish-editor" target="_blank" rel="noopener">Share your feedback</a> — 5 quick questions!</span>
    <button class="feedback-banner-close" aria-label="Dismiss">&times;</button>
  `;

  banner.querySelector(".feedback-banner-close").addEventListener("click", () => {
    localStorage.setItem(`venview_feedback_dismissed_${window.USER_ID || ""}`, "true");
    banner.classList.remove("feedback-banner-visible");
    banner.addEventListener("transitionend", () => banner.remove());
  });

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("feedback-banner-visible"));
}

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
  "Square Location": "squareLocationId"
};


// ---------------------------
// safeLabelFromText | Date: 2026-03-06
// Purpose: Converts a human-readable field label into a safe alphanumeric key
//          by replacing spaces with underscores and stripping special characters.
//          Used to generate consistent form field IDs from template labels.
// ---------------------------
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

// ---------------------------
// 🔌Builds Event from Template
// ---------------------------

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


// ---------------------------
// getFinalizedEventCount | Date: 2026-03-06
// Purpose: Returns the number of finalized events in the current session's event cache.
//          Used to enforce the Starter plan limit of one finalized event.
// ---------------------------
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
  multiday: { icon: '📅', text: 'Starter supports up to 2-day events. Upgrade to Pro for longer festivals and multi-day markets.' },
};

function showUpgradeModal(context) {
  const ctx = upgradeContexts[context] || { icon: '🔒', text: context };
  document.getElementById('triggerReasonText').textContent = ctx.text;
  document.querySelector('.trigger-reason .reason-icon').textContent = ctx.icon;

  const overlay = document.getElementById('upgradeOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ---------------------------
// closeUpgradeModal | Date: 2026-03-06
// Purpose: Dismisses the plan upgrade modal and restores page scrolling.
// ---------------------------
function closeUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ---------------------------
// handleUpgradeClick | Date: 2026-03-06
// Purpose: Handles the "Upgrade" button inside the upgrade modal — closes the modal
//          and redirects the user to the upgrade/pricing page.
// ---------------------------
function handleUpgradeClick() {
  closeUpgradeModal();
  window.location.href = '/upgrade';
}

// Close modal on overlay click or Escape key
document.addEventListener('click', (e) => {
  if (e.target === document.getElementById('upgradeOverlay')) closeUpgradeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUpgradeModal();
    closeWelcomeModal();
  }
});

//---------------------
// Welcome Beta Modal
//---------------------
function showWelcomeModal() {
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

// ---------------------------
// closeWelcomeModal | Date: 2026-03-06
// Purpose: Dismisses the first-login welcome modal and permanently records the
//          dismissal in localStorage so it does not reappear for this user.
// ---------------------------
function closeWelcomeModal() {
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (window.USER_ID) localStorage.setItem(`venview_welcome_seen_${window.USER_ID}`, "true");
}

document.addEventListener('click', (e) => {
  if (e.target === document.getElementById('welcomeOverlay')) closeWelcomeModal();
});

// ---------------------------
// saveAppState | Date: 2026-03-06
// Purpose: Persists the current navigation state (active section, active event, edit mode)
//          to localStorage so it can be restored on next page load.
// ---------------------------
function saveAppState() {
  const state = {
    activeAction: currentAction,
    activeEvent: activeEvent,
    editMode: document.getElementById("btnEdit")?.classList.contains("active")
  };
  localStorage.setItem("lemon_app_state", JSON.stringify(state));
}

// ---------------------------
// loadAppState | Date: 2026-03-06
// Purpose: Restores the app to its last known state from localStorage on login or page refresh.
//          If no saved state exists, defaults to the Manage Events section.
// ---------------------------
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
// ---------------------------
// getSafeEventID | Date: 2026-03-06
// Purpose: Extracts the event ID from an event object regardless of which key name
//          the server returned (eventID, EventID, "Event ID", or nested in EventInfo).
// ---------------------------
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

// ---------------------------
// formatEvent | Date: 2026-03-06
// Purpose: Converts a raw API event object into the flat, minimal shape used
//          by the event list table and search results display.
// ---------------------------
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



// ---------------------------
// createStarRating | Date: 2026-03-06
// Purpose: Builds an interactive 1–5 star rating widget as a DOM element.
//          Clicking a star fills stars up to that value. Read-only mode is
//          supported by passing editable = false.
// ---------------------------
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

      if (col.key === "eventDate") {
        td.textContent = formatDateRange(val, event.numDays);
      } else if (col.key === "grossSales" || col.key === "netProfit") {
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

// ---------------------------
// renderPaginationControls | Date: 2026-03-06
// Purpose: Appends Previous/Next pagination buttons and a page counter to the bottom
//          of a container element. Calls the provided loadFn with the target page number.
// ---------------------------
function renderPaginationControls(containerId, currentPage, totalPages, loadFn) {
  if (totalPages <= 1) return;
  const container = document.getElementById(containerId);
  if (!container) return;

  const nav = document.createElement("div");
  nav.className = "pagination-controls";
  nav.style.cssText = "display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 0;";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "← Previous";
  prevBtn.className = "btn-secondary";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.onclick = () => loadFn(currentPage - 1);

  const pageInfo = document.createElement("span");
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  pageInfo.style.cssText = "font-weight:600;";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next →";
  nextBtn.className = "btn-secondary";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.onclick = () => loadFn(currentPage + 1);

  nav.appendChild(prevBtn);
  nav.appendChild(pageInfo);
  nav.appendChild(nextBtn);
  container.appendChild(nav);
}

// ---------------------------
// filterEvents | Date: 2026-03-06
// Purpose: Filters the already-loaded events list by finalization status
//          ("finalized", "notfinalized", or all) and re-renders the manage table.
// ---------------------------
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

// ---------------------------
// clearEventForm | Date: 2026-03-06
// Purpose: Resets all input, select, and textarea fields inside the Add/Edit Event form
//          back to their default empty state.
// ---------------------------
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

// ---------------------------
// loadAllEvents | Date: 2026-03-06
// Purpose: Fetches the paginated list of events from the API and renders them
//          in the Manage Events table. Starter users are limited to one non-finalized event.
// ---------------------------
window.eventsCurrentPage = 1;
window.eventsPageLimit = 10;

async function loadAllEvents(page = 1) {
  try {
    const params = new URLSearchParams({ page, limit: window.eventsPageLimit });
    const res = await fetch(`${API_BASE}/api/events?${params}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    const events = data.Events || [];

    window.eventsCurrentPage = data.page || 1;
    const totalPages = data.totalPages || 1;

    const formatted = events.map(formatEvent);
    const displayEvents = formatted;

    lastLoadedEvents = displayEvents;
    buildTableHTML(displayEvents, "manageResults");
    loadManageKpis();
    renderPaginationControls("manageResults", window.eventsCurrentPage, totalPages, loadAllEvents);

  } catch (err) {
    console.error("loadAllEvents error:", err);
    showInlineError("manageResults", "Could not load events. The server may be unavailable.", loadAllEvents);
  }
}


// ---------------------------
// manageSearch | Date: 2026-03-06
// Purpose: Searches events by name, date, or ID using query parameters and renders
//          paginated results in the Manage Events table.
// ---------------------------
async function manageSearch(page = 1) {
  const name = document.getElementById("manageSearchName").value.trim();
  const date = document.getElementById("manageSearchDate").value.trim();
  const id = document.getElementById("manageSearchID").value.trim();

  if (!name && !date && !id) {
    showToast("Please enter a search term.", "warning");
    return;
  }

  const params = new URLSearchParams({ page, limit: window.eventsPageLimit });
  if (name) params.set("name", name);
  if (date) params.set("date", date);
  if (id) params.set("id", id);

  try {
    const res = await fetch(`${API_BASE}/api/events?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Search error:", data);
      showToast("Search failed: " + (data.error || res.statusText), "error", 3500, manageSearch);
      return;
    }
    const data = await res.json();
    const results = (data.Events || []).map(formatEvent);
    buildTableHTML(results, "manageResults");
    renderPaginationControls("manageResults", data.page || 1, data.totalPages || 1, manageSearch);
  } catch (err) {
    console.error("Search network error:", err);
    showInlineError("manageResults", "Search failed. The server may be unavailable.", manageSearch);
  }
}

// ---------------------------
// exportEventsCSV | Date: 2026-03-06
// Purpose: Triggers a CSV download of all events by navigating to the export endpoint.
// ---------------------------
function exportEventsCSV() {
  window.location.href = `${API_BASE}/api/events/export/csv`;
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

// ---------------------------
// initNumDaysField | Date: 2026-03-06
// Purpose: Wires up the Number of Days input in the Add/Edit Event form.
//          Calculates and displays the event end date as the user types.
//          Enforces the Starter plan cap of 2 days by showing the upgrade modal
//          if the user tries to enter 3 or more.
// ---------------------------
function initNumDaysField(existingNumDays) {
  const input = document.getElementById("form_Number_of_Days");
  const endDateSpan = document.getElementById("endDateDisplay");
  if (!input) return;

  input.disabled = false;
  input.value = existingNumDays || 1;

  const updateEndDate = () => {
    const dateInput = document.getElementById("form_Event_Date");
    const days = Number(input.value) || 1;
    if (dateInput?.value && days > 1 && endDateSpan) {
      const end = new Date(dateInput.value + "T00:00:00");
      end.setDate(end.getDate() + days - 1);
      endDateSpan.textContent = `→ ends ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (endDateSpan) {
      endDateSpan.textContent = "";
    }
  };
  input.addEventListener("input", updateEndDate);
  setTimeout(() => {
    const dateInput = document.getElementById("form_Event_Date");
    if (dateInput) dateInput.addEventListener("change", updateEndDate);
    updateEndDate();
  }, 0);

}

// ---------------------------
// loadSquareLocationsIntoForm | Date: 2026-03-06
// Purpose: Fetches the vendor's Square POS locations from the API and populates
//          the Square Location dropdown in the Add/Edit Event form.
//          Hidden entirely for Starter plan users.
// ---------------------------
async function loadSquareLocationsIntoForm() {
  const proFields = document.getElementById("proAddEventFields");
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

// ---------------------------
// editEvent | Date: 2026-03-06
// Purpose: Opens the Add/Edit Event form pre-filled with data from an existing event.
//          Fetches the full event from the API, rebuilds the form from the active
//          template, and populates all fields including Square location and num days.
// ---------------------------
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

  // Show Add/Edit form (awaited so templates are loaded before we use them)
  await openAddEventForUser();

  // openAddEventForUser already rebuilt the form with Default Template;
  // re-find it to pre-fill values below
  const template = window.availableTemplates?.find(t => t.templateName === "Default Template")
    || window.availableTemplates?.[0];
  if (!template) {
    showToast("Template not found.", "warning");
    return;
  }

  // Load Square locations, then select this event's location
  await loadSquareLocationsIntoForm();
  const sqSelect = document.getElementById("form_squareLocationId");
  if (sqSelect && info.squareLocationId) {
    sqSelect.value = info.squareLocationId;
  }

  // Pre-fill Number of Days for editing
  initNumDaysField(info.numDays);

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

// ---------------------------
// loadEvents | Date: 2026-03-06
// Purpose: Loads all events from the server into window.events (no pagination).
//          Used as a prerequisite for client-side search filtering in searchEvents().
// ---------------------------
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
// ---------------------------
// renderTableArray | Date: 2026-03-06
// Purpose: Renders an array of objects as an HTML table inside the element with the given ID.
//          Shows "No data" if the array is empty.
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

// ---------------------------
// coerceForApi | Date: 2026-03-06
// Purpose: Converts raw form string values into the correct types expected by the API
//          (numeric fields to numbers, boolean fields to booleans, string fields to strings).
//          Run on the event payload just before POST/PUT to the server.
// ---------------------------
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


// ---------------------------
// submitEvent | Date: 2026-03-06
// Purpose: Handles the Add/Edit Event form submission. Enforces plan gating,
//          reads all form values, maps them to canonical API fields via the
//          active template, coerces types, then POSTs (new) or PUTs (edit) to the server.
// ---------------------------
async function submitEvent(e) {
  if (e) e.preventDefault();

  const submitBtn = document.querySelector('#eventForm button[type="submit"]');
  if (submitBtn?.disabled) return;

  const runSubmit = async () => {
  // --------------------------------------------------
  const formEl = document.getElementById("eventForm");
  if (!formEl) {
    showToast("Form not found.", "error");
    return;
  }

  // --------------------------------------------------
  // 1️⃣ Resolve active template
  // --------------------------------------------------
  const templateName = "Default Template";
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
  // 4️⃣ Attach auxiliary known fields (outside template form)
  // --------------------------------------------------
  const sq = document.getElementById("form_squareLocationId");
  if (sq) canonical.squareLocationId = sq.value || null;

  const numDaysInput = document.getElementById("form_Number_of_Days");
  if (numDaysInput) canonical.numDays = Number(numDaysInput.value) || 1;

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

// ---------------------------
// populateEmployeeDropdown | Date: 2026-03-06
// Purpose: Fetches the employee list from the API and populates a given <select> element
//          with employee options. Used in the labor shift entry form.
// ---------------------------
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

// ---------------------------
// addFieldToTemplate | Date: 2026-03-06
// Purpose: Reads the field builder inputs (label, type, required, options) and appends
//          a new field definition to the in-memory formTemplate object, then refreshes the preview.
// ---------------------------
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

// ---------------------------
// renderFormPreview | Date: 2026-03-06
// Purpose: Renders a live preview of the custom event form template being built,
//          showing each field as an actual HTML input element.
// ---------------------------
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

// ---------------------------
// saveTemplate | Date: 2026-03-06
// Purpose: Prompts for a template name, then POSTs the current formTemplate definition
//          to the server so it can be reused when creating or editing events.
// ---------------------------
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

// ---------------------------
// clearManageSearch | Date: 2026-03-06
// Purpose: Resets all search inputs and clears the Manage Events results table.
// ---------------------------
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
// ---------------------------
// getDefaultStarterTemplate | Date: 2026-03-06
// Purpose: Returns the "Default Template" from the available templates list,
//          falling back to any template named "default" or the first available one.
//          Used to auto-select a template for Starter users.
// ---------------------------
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


// ---------------------------
// waitForTemplates | Date: 2026-03-06
// Purpose: Polls until window.availableTemplates is populated or a timeout is reached.
//          Prevents race conditions when opening the Add Event form before templates load.
// ---------------------------
async function waitForTemplates(timeout = 3000) {
  const start = Date.now();
  while (!window.availableTemplates?.length) {
    if (Date.now() - start > timeout) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}


// ---------------------------
// openAddEventForUser | Date: 2026-03-06
// Purpose: Opens the Add Event section, loads available templates into the dropdown,
//          and auto-selects the default template for Starter users.
//          Also initializes Square location dropdown and the Number of Days field.
// ---------------------------
async function openAddEventForUser() {
  navigateTo("addSection");

  // Always refresh templates to ensure Default Template fields load
  await populateTemplateDropdown();

  const templates = window.availableTemplates;
  if (!Array.isArray(templates) || templates.length === 0) {
    document.getElementById("eventForm").innerHTML =
      '<p style="color:red">No form templates found. Go to 🧩 Design Event Form to create a Default Template.</p>';
    loadSquareLocationsIntoForm();
    return;
  }

  const defaultTpl = templates.find(t => t.templateName === "Default Template")
    || templates[0];

  console.log("🟡 Loading template:", defaultTpl?.templateName, "fields:", defaultTpl?.fields?.length);
  rebuildAddEventForm(stripEventColorFromTemplate(defaultTpl));

  loadSquareLocationsIntoForm();
  initNumDaysField();
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

// ---------------------------
// populateTemplateDropdown | Date: 2026-03-06
// Purpose: Fetches all saved event form templates from the API and populates
//          the template selector dropdown. Stores the full template list in
//          window.availableTemplates for use by the form builder.
// ---------------------------
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


// ---------------------------
// stripEventColorFromTemplate | Date: 2026-03-06
// Purpose: Returns a copy of the template with the deprecated "Event Color" field removed.
//          Prevents it from being rendered in the Add Event form.
// ---------------------------
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


// ---------------------------
// useSelectedTemplate | Date: 2026-03-06
// Purpose: Reads the currently selected template from the dropdown and rebuilds
//          the Add Event form using that template's field definitions.
// ---------------------------
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
  initNumDaysField();

 showToast(`Loaded template: "${tpl.templateName}"`, "success");

}



// ---------------------------
// activateTemplate | Date: 2026-03-06
// Purpose: Legacy version of useSelectedTemplate — activates a template by its TemplateName
//          from the selector. Rebuilds the form and shows a success toast.
// ---------------------------
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
  initNumDaysField();
  showToast(`"${tpl.TemplateName}" activated!`, "success");
}

// ---------------------------
// rebuildAddEventForm | Date: 2026-03-06
// Purpose: Clears and completely re-renders the Add Event form based on a template's
//          field definitions. Builds each field as a labeled HTML input, select,
//          textarea, or star rating widget, with appropriate IDs and validation attributes.
// ---------------------------
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
      // Skip deprecated "Event Color" and "Number of Days" (injected outside template)
      if (
        field &&
        typeof field.label === "string" &&
        (/^event\s*color$/i.test(field.label) || /^number\s*of\s*days$/i.test(field.label))
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

      // Inject Number of Days field right after Application Date
      if (/^application\s*date$/i.test(field.label)) {
        const ndLabel = document.createElement("label");
        ndLabel.textContent = "Number of Days";
        const ndInput = document.createElement("input");
        ndInput.type = "number";
        ndInput.id = "form_Number_of_Days";
        ndInput.value = existing.numDays || existing.Number_of_Days || 1;
        ndInput.min = "1";
        ndInput.max = "30";
        const endSpan = document.createElement("span");
        endSpan.id = "endDateDisplay";
        endSpan.style.cssText = "font-size:0.85rem;color:#666;margin-left:8px;";
        ndLabel.appendChild(ndInput);
        ndLabel.appendChild(endSpan);
        formContainer.appendChild(ndLabel);
      }
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
// Helper: Format event date range
//------------------------
// ---------------------------
// formatDateRange | Date: 2026-03-06
// Purpose: Formats a single event date (or date range for multi-day events)
//          into a human-readable string like "Mar 5–7, 2026".
// ---------------------------
function formatDateRange(eventDate, numDays) {
  const days = Number(numDays) || 1;
  if (!eventDate || days <= 1) return eventDate || "";
  const start = new Date(eventDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  const opts = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endOpts = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
    ? { day: "numeric" }
    : opts;
  const endStr = end.toLocaleDateString("en-US", endOpts);
  return `${startStr}–${endStr}, ${end.getFullYear()}`;
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
// ---------------------------
// createCollapsibleCard | Date: 2026-03-06
// Purpose: Creates a collapsible "sheet card" DOM element with a toggle header button
//          and a hidden/visible content area. Used throughout the event dashboard for
//          fees, tips, discounts, supplies, and labor cards.
// ---------------------------
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

// ---------------------------
// reloadEventDashboard | Date: 2026-03-06
// Purpose: Re-fetches the full event report from the server and re-renders the
//          entire event dashboard in-place. Called after saving fees, tips, supplies,
//          or any other sub-section to keep the dashboard in sync.
// ---------------------------
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


// ---------------------------
// addFeeRow | Date: 2026-03-06
// Purpose: Appends a blank fee row to the additional fees editor table.
// ---------------------------
function addFeeRow() {
  const tbody = document.querySelector("#feesEditor tbody");
  if (!tbody) return;

  tbody.insertAdjacentHTML("beforeend", feeRowHTML());
}

// ---------------------------
// collectFeesFromUI | Date: 2026-03-06
// Purpose: Reads all rows in the fees editor table and returns them as an
//          array of { feeName, feeAmount } objects, skipping any incomplete rows.
// ---------------------------
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

// ---------------------------
// saveFees | Date: 2026-03-06
// Purpose: Collects all rows from the fees editor and PUTs them to the server
//          as the event's additional fees. Blocks saves on finalized events.
//          Reloads the dashboard after a successful save.
// ---------------------------
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


// ---------------------------
// buildFeesEditor | Date: 2026-03-06
// Purpose: Generates the HTML for the Additional Fees editable card, pre-populated
//          with the event's existing fee rows. Includes Add Fee and Save Fees buttons.
// ---------------------------
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

// ---------------------------
// buildTipsEditor | Date: 2026-03-06
// Purpose: Generates the HTML for the Tips editable card, showing the Square-imported
//          tip total and a manual tips editor table. Includes Add Tip and Save Tips buttons.
// ---------------------------
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

// ---------------------------
// tipRowHTML | Date: 2026-03-06
// Purpose: Returns the HTML string for a single editable tip row in the tips editor table.
// ---------------------------
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

// ---------------------------
// addTipRow | Date: 2026-03-06
// Purpose: Appends a blank tip row to the tips editor table.
// ---------------------------
function addTipRow() {
  const tbody = document.querySelector("#tipsEditor tbody");
  if (!tbody) return;

  tbody.insertAdjacentHTML("beforeend", tipRowHTML());
}

// ---------------------------
// collectTipsFromUI | Date: 2026-03-06
// Purpose: Reads all rows in the tips editor table and returns them as an array
//          of { tipAmount } objects, skipping rows with zero or invalid amounts.
// ---------------------------
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


// ---------------------------
// saveTips | Date: 2026-03-06
// Purpose: Collects tips from the editor table and PUTs them to the server.
//          Blocks saves on finalized events. Reloads the dashboard on success.
// ---------------------------
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


// ---------------------------
// buildDiscountsEditor | Date: 2026-03-06
// Purpose: Generates the HTML for the Discounts editable card, pre-populated with
//          the event's existing discount rows. Includes Add Discount and Save Discounts buttons.
// ---------------------------
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

// ---------------------------
// discountRowHTML | Date: 2026-03-06
// Purpose: Returns the HTML string for a single editable discount row in the discounts editor table.
// ---------------------------
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

// ---------------------------
// collectDiscountsFromUI | Date: 2026-03-06
// Purpose: Reads all rows from the discounts editor table and returns them as an
//          array of { discountName, discountAmount } objects, skipping incomplete rows.
// ---------------------------
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

// ---------------------------
// saveDiscounts | Date: 2026-03-06
// Purpose: Collects discounts from the editor table and PUTs them to the server.
//          Blocks saves on finalized events. Reloads the dashboard on success.
// ---------------------------
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


// ---------------------------
// addDiscountRow | Date: 2026-03-06
// Purpose: Appends a new editable discount row (optionally pre-filled) to the
//          discounts editor table.
// ---------------------------
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


// ---------------------------
// renderManualSalesEntryCard | Date: 2026-03-06
// Purpose: Builds a collapsible card with editable inputs for manually entering
//          gross sales, refunds, discounts, and total collected. Used when Square
//          POS integration is not connected.
// ---------------------------
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

// ---------------------------
// saveManualSales | Date: 2026-03-06
// Purpose: Reads the manual sales entry inputs and PUTs the values to the server.
//          Reloads the dashboard to update profit calculations after saving.
// ---------------------------
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

// ---------------------------
// renderEventProfitSummary | Date: 2026-03-06
// Purpose: Renders the full Profit Summary card for an event dashboard — showing
//          gross sales, Square fees, taxes, all expense categories, and net profit.
//          Handles both Square-connected (Pro) and manual sales entry (Starter) modes.
// ---------------------------
function renderEventProfitSummary(report) {
  const sales    = report.sales    || {};
  const expenses = report.expenses || {};
  const taxes    = report.taxes    || {};
  const summary  = report.summary  || {};

  const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

  // Core profit figures — all from server-computed summary
  const posFees       = Number(summary.posFees       || 0);
  const cogs          = Number(summary.cogs          || 0);
  const grossProfit   = Number(summary.grossProfit   ?? (Number(sales.netSales || 0) - cogs));
  const totalExpenses = Number(summary.totalExpenses || 0);
  const netProfit     = Number(summary.netProfit     || 0);

  // Informational lines — do NOT affect profit
  const tips         = Number(summary.tips         || sales.tips || 0);
  const stateFoodTax = Number(summary.stateFoodTax || taxes.stateFoodTax || 0);
  const stateRate    = Number(taxes.stateRate || 0);
  const stateRatePct = (stateRate * 100).toFixed(2);
  const stateName    = taxes.taxDetail?.state || "";
  const salesTaxLabel = stateName
    ? `Sales Tax Collected — Remit to ${stateName} (${stateRatePct}%)`
    : `Sales Tax Collected — Remit to State (${stateRatePct}%)`;

  const grossProfitClass = grossProfit >= 0 ? "profit-positive" : "profit-negative";
  const netProfitClass   = netProfit   >= 0 ? "profit-positive" : "profit-negative";

  return createCollapsibleCard(
    "Event Profit Summary",
    `
    <div class="profit-summary">

      <!-- TIER 1: Revenue → Net Sales -->
      <div class="section-title">Revenue</div>
      <div class="ledger-row"><span class="ledger-label">Gross Sales</span><span class="ledger-amount">${fmt(sales.grossSales)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Returns</span><span class="ledger-amount">-${fmt(sales.refunds)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Discounts</span><span class="ledger-amount">-${fmt(sales.discounts)}</span></div>
      <div class="ledger-row total-row"><span class="ledger-label">Net Sales</span><span class="ledger-amount">${fmt(sales.netSales)}</span></div>
      <div class="section-divider"></div>

      <!-- TIER 2: COGS → Gross Profit -->
      <div class="section-title">Cost of Goods Sold (COGS) - Supply Fees</div>
      <div class="ledger-row"><span class="ledger-label">Ingredient Costs</span><span class="ledger-amount">-${fmt(cogs)}</span></div>
      <div class="section-divider"></div>
      <div class="ledger-row total-row ${grossProfitClass}"><span class="ledger-label">Gross Profit</span><span class="ledger-amount">${fmt(grossProfit)}</span></div>
      <div class="section-divider"></div>

      <!-- TIER 3: Operating Expenses → Net Profit -->
      <div class="section-title">Operating Expenses</div>
      <div class="ledger-row"><span class="ledger-label">Health Dept Fee</span><span class="ledger-amount">-${fmt(expenses.healthDeptFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Event Fee</span><span class="ledger-amount">-${fmt(expenses.eventFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Additional Fees</span><span class="ledger-amount">-${fmt(expenses.additionalFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Mileage Reimbursement</span><span class="ledger-amount">-${fmt(expenses.mileageReimbursement)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Employee Bonus</span><span class="ledger-amount">-${fmt(expenses.employeeBonus)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Event Runner Fees</span><span class="ledger-amount">-${fmt(expenses.eventRunnerFees)}</span></div>
      
      <div class="ledger-row"><span class="ledger-label">Labor Fees</span><span class="ledger-amount">-${fmt(expenses.laborFees)}</span></div>
      <div class="ledger-row"><span class="ledger-label">Coordinator Fee</span><span class="ledger-amount">-${fmt(expenses.coordinatorFee)}</span></div>
      <div class="ledger-row"><span class="ledger-label">POS Fees</span><span class="ledger-amount">-${fmt(posFees)}</span></div>
      <div class="section-divider"></div>
      <div class="ledger-row total-row"><span class="ledger-label">Total Operating Expenses</span><span class="ledger-amount">-${fmt(totalExpenses)}</span></div>

      <div class="section-divider"></div>
      <div class="ledger-row final-row ${netProfitClass}"><span class="ledger-label">Net Profit</span><span class="ledger-amount gross-profit">${fmt(netProfit)}</span></div>

      <div class="section-divider"></div>
      <div class="section-title">For Your Records</div>
      <div class="ledger-row ledger-row-info"><span class="ledger-label">Tips (pass-through to staff)</span><span class="ledger-amount">${fmt(tips)}</span></div>
      <div class="ledger-row ledger-row-info"><span class="ledger-label">${salesTaxLabel}</span><span class="ledger-amount">${fmt(stateFoodTax)}</span></div>
      <div class="ledger-note">ⓘ Income taxes are calculated annually — consult your accountant.</div>

    </div>
    `
  );
}

// ---------------------------
// updateManualPosFee | Date: 2026-03-06
// Purpose: Saves a manually entered POS fee value for the current event.
//          Used for non-Square users who want to record their POS processing cost.
// ---------------------------
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

// ---------------------------
// updateExpensesDOM | Date: 2026-03-06
// Purpose: Patches the labor fees and total expenses values in the expenses card DOM
//          without re-rendering the entire card. Called after a labor shift is saved.
// ---------------------------
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

  // Sales tax (stateFoodTax) is NOT a business expense — it is collected from customers
  // and remitted to the state. Excluded here to match server-side calculation.
  expenses.totalExpenses =
    (expenses.healthDeptFee || 0) +
    (expenses.eventFee || 0) +
    (expenses.mileageReimbursement || 0) +
    (expenses.employeeBonus || 0) +
    (expenses.coordinatorFee || 0) +
    (expenses.eventRunnerFees || 0) +
    (expenses.additionalFees || 0) +
    (expenses.laborFees || 0) +
    (expenses.posFee || 0);

  window.activeEvent.expenses = expenses;

  // Re-render Expenses card
  updateExpensesDOM(expenses);
  updateProfitSummary();

}

function updateProfitSummary() {
  if (!window.activeEvent) return;

  const { sales, expenses } = window.activeEvent;

  // Use Net Sales (earned revenue) as the profit base — not totalCollected,
  // which includes tips (a pass-through to staff, not business revenue).
  const netSales      = Number(sales?.netSales      || 0);
  const totalExpenses = Number(expenses?.totalExpenses || 0);
  const netProfit     = netSales - totalExpenses;

  // Keep totals in sync for any other consumers
  if (window.activeEvent.totals) {
    window.activeEvent.totals.grossProfit = netProfit;
  }

  // Update the profit figure in the DOM
  const el = document.querySelector(".profit-summary .gross-profit");
  if (el) el.textContent = `$${netProfit.toFixed(2)}`;
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
  const isSquare = !!event.squareLocationId;
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
    <div>State Food Tax (auto): ${fmtMoney(stateFoodTax)}</div>
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




// ---------------------------
// updateProfitSummaryDOM | Date: 2026-03-06
// Purpose: Updates the gross profit value in the profit summary card DOM in-place
//          without a full re-render. Called after labor or expense changes.
// ---------------------------
function updateProfitSummaryDOM(totals) {
  const el = document.querySelector(".profit-summary");
  if (!el) return;

  const grossProfit1 = el.querySelector(".gross-profit");
  if (grossProfit1) {
    grossProfit1.textContent = fmt(totals.grossProfit);
  }
}


// ---------------------------
// renderLaborCard | Date: 2026-03-06
// Purpose: Renders the Labor card for an event dashboard, showing all labor shifts
//          in an editable table (employee, hours, rate, flat rate, subtotal) and
//          a form to add new shifts. Calculates shift subtotals inline.
// ---------------------------
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




// ---------------------------
// wireLaborCard | Date: 2026-03-06
// Purpose: Attaches all event listeners to the Labor card — row removal, live subtotal
//          recalculation on input, Add Row button, and Save button with server PUT.
//          Updates the Expenses and Profit Summary cards after saving.
// ---------------------------
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




// ---------------------------
// enterExpensesEditMode | Date: 2026-03-06
// Purpose: Switches the Expenses card from read-only view to an editable form.
// ---------------------------
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

// ---------------------------
// cancelExpensesEdit | Date: 2026-03-06
// Purpose: Discards any unsaved changes in the Expenses edit form and reverts
//          the card back to read-only view mode.
// ---------------------------
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


// ---------------------------
// saveExpenses | Date: 2026-03-06
// Purpose: Reads the expenses edit form fields, builds a partial-update payload
//          (only changed fields), and PUTs it to the server. Reloads the dashboard on success.
//          Blocks saves on finalized events.
// ---------------------------
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
// renderAdditionalFeesCard | Date: 2026-03-06
// Purpose: Renders the legacy Additional Fees card with inline-editable fields and
//          an Add fee row. Each fee is saved independently via API on change.
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

// ---------------------------
// addAdditionalFee | Date: 2026-03-06
// Purpose: POSTs a new additional fee (from the inline name/amount inputs) for the
//          current event and reloads the dashboard.
// ---------------------------
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

// ---------------------------
// updateAdditionalFee | Date: 2026-03-06
// Purpose: PUTs updated name or amount for an individual additional fee row.
//          Called inline when the user changes a fee name or amount input.
// ---------------------------
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

// ---------------------------
// deleteAdditionalFee | Date: 2026-03-06
// Purpose: DELETEs an additional fee by ID and reloads the dashboard.
// ---------------------------
async function deleteAdditionalFee(id) {
  await fetch(`${API_BASE}/api/additional-fees/${id}`, {
    method: "DELETE"
  });

  reloadEventDashboard();
}

// ---------------------------
// renderSupplyCostsCard | Date: 2026-03-06
// Purpose: Renders the Supply Fees card on the event dashboard — shows all supply
//          rows with inline editable name, unit cost, and quantity fields.
//          Includes the "Pick from Inventory" button and "Calculate Supply Fees" action.
// ---------------------------
function renderSupplyCostsCard(items = []) {
  const total = items.reduce(
    (sum, r) => sum + (Number(r.totalCost) || 0),
    0
  );

  const rows = items.map(r => `
    <div class="supply-row" data-supply-id="${r.id}" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
      <input type="text" class="supply-name" value="${r.itemName}" style="flex:2;min-width:0;">
      <input type="number" class="supply-unit-cost" step="0.01" value="${r.unitCost}" style="flex:1;min-width:0;">
      <input type="number" class="supply-qty" step="1" value="${r.quantityUsed}" style="flex:1;min-width:0;">
      <span class="supply-line-total" style="flex:1;text-align:right;white-space:nowrap;">${fmt(r.totalCost)}</span>
      <button onclick="deleteSupply(${r.id})">🗑</button>
    </div>
  `).join("");

  const html = `
    <div style="display:flex;gap:8px;margin-bottom:6px;font-weight:600;font-size:0.85em;">
      <span style="flex:2;">Item</span>
      <span style="flex:1;">Unit Cost</span>
      <span style="flex:1;">Qty Used</span>
      <span style="flex:1;text-align:right;">Total</span>
      <span style="width:32px;"></span>
    </div>
    ${rows || '<div class="empty-state-inline"><span class="empty-state-icon">📦</span> No supply fees recorded — add items below.</div>'}

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
      <input id="newSupplyName" placeholder="Item" style="flex:2;min-width:0;">
      <input id="newSupplyUnitCost" type="number" step="0.01" placeholder="Unit Cost" style="flex:1;min-width:0;">
      <input id="newSupplyQty" type="number" step="1" placeholder="Qty Used" style="flex:1;min-width:0;">
      <button onclick="addSupply()">➕ Add</button>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;margin-bottom:8px;cursor:pointer;">
      <input type="checkbox" id="addToInventoryCheck"> Also save to my Inventory
    </label>

    <hr>
    <div><strong>Total Supply Fees:</strong> <span id="supplyTotal">${fmt(total)}</span></div>

    <div class="supply-actions">
      <button class="btn-secondary" onclick="openInventoryPicker()">📦 Pick from Inventory</button>
      <button class="btn-primary" onclick="withSpinner(this, calculateSupplyCosts)">🧮 Calculate Supply Fees</button>
    </div>
  `;

  return createCollapsibleCard("Supply Fees", html);
}

// ---------------------------
// addSupply | Date: 2026-03-06
// Purpose: POSTs a new supply item for the current event. Optionally also saves
//          the item to the vendor's inventory if the "Also save to my Inventory"
//          checkbox is checked. Reloads the dashboard after save.
// ---------------------------
async function addSupply() {
  if (window.activeEvent?.isFinalized === 1) {
    showToast("This event has been finalized and can no longer be edited.", "warning");
    return;
  }

  const addToInventory = document.getElementById("addToInventoryCheck")?.checked || false;
  const payload = {
    itemName: document.getElementById("newSupplyName").value,
    unitCost: Number(document.getElementById("newSupplyUnitCost").value) || 0,
    quantityUsed: Number(document.getElementById("newSupplyQty").value) || 0,
    addToInventory
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
    showToast("Failed to add supply item.", "error");
    return;
  }

  showToast("Supply added!", "success");
  if (addToInventory) _inventoryCache = [];
  await reloadEventDashboard();
}


// ---------------------------
// calculateSupplyCosts | Date: 2026-03-06
// Purpose: Reads all supply rows from the DOM, saves each one's name/unit cost/quantity
//          to the server via PUT, then triggers a server-side supply fee recalculation.
//          Reloads the dashboard to show the updated total.
// ---------------------------
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

// ---------------------------
// deleteSupply | Date: 2026-03-06
// Purpose: DELETEs a supply item by ID for the current event and reloads the dashboard.
//          Blocked on finalized events.
// ---------------------------
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

// ---------------------------
// safeAppend | Date: 2026-03-06
// Purpose: Safely appends a DOM node to a container, guarding against null values.
// ---------------------------
function safeAppend(container, node) {
  if (!container || !node) return;
  container.appendChild(node);
}


// ---------------------------
// loadEventIntoDashboard | Date: 2026-03-06
// Purpose: The main event dashboard loader. Normalizes the event, fetches the full
//          financial report, then builds and mounts the entire dashboard — header, action
//          buttons (Square pull, edit, delete, finalize), profit summary, manual sales entry,
//          expenses, fees, tips, discounts, supplies, and labor cards.
// ---------------------------
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
  if (headerDate) headerDate.textContent = formatDateRange(eventDate, event.numDays);
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
          showPostFinalizeFeedbackBanner();
          await reloadEventDashboard();

        } catch (err) {
          console.error("Finalize error:", err);
          showToast("Unexpected error finalizing event.", "error", 3500, () => finalizeBtn.click());
        }
      });
    }); 

    const reportBtn = document.createElement("button");
    reportBtn.textContent = "📊 Open Post-Event Report";
    reportBtn.classList.add("btn-primary");
    reportBtn.addEventListener("click", () => {
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

    safeAppend(buttonContainer, squareSalesBtn);
    safeAppend(buttonContainer, squareLaborBtn);
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
    //"Square Location": ev.squareLocationId || "",
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
  // 6) TIPS CARD
  // ======================
  safeAppend(
    container,
    createCollapsibleCard("Tips", buildTipsEditor(report))
  );

  // Supply Fees card removed — ingredient costs tracked via Ingredient Costs (Recipe Matching)

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

  // ======================
  // 11) INGREDIENT COSTS CARD
  // ======================
  safeAppend(container, createCollapsibleCard("🍋 Ingredient Costs (Recipe Matching)", '<div id="salesFeesTab"></div>'));
  loadSalesFeesTab(eventID);

  }




// ---------------------------
// deleteEvent | Date: 2026-03-06
// Purpose: Confirms with the user, then DELETEs an event and all its associated data.
//          Returns to the Manage Events section and refreshes the list on success.
// ---------------------------
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

// ---------------------------
// pullSquareSales | Date: 2026-03-06
// Purpose: Calls the server-side Square Sales sync endpoint for a given event,
//          which pulls sales data from the Square API and stores it in the database.
// ---------------------------
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
// ---------------------------
// loadEventLabor | Date: 2026-03-06
// Purpose: Calls the Square Labor sync endpoint to pull timeclock data for an event
//          into the database, then reloads the dashboard.
// ---------------------------
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

// ---------------------------
// pullSquareLabor | Date: 2026-03-06
// Purpose: Pulls Square timeclock labor data for the currently active event
//          and saves it to the database. Shows a toast on success or failure.
// ---------------------------
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

// ---------------------------
// normalizeReportPayload | Date: 2026-03-06
// Purpose: Normalizes a raw post-event report API response into a consistent shape,
//          handling both camelCase and PascalCase key variations from the server.
// ---------------------------
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

// ---------------------------
// openPostEventReport | Date: 2026-03-06
// Purpose: Opens the Post-Event Report section for a given event.
//          Fetches the full financial report from the server and renders it.
// ---------------------------
async function openPostEventReport(eventData) {
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

// ---------------------------
// renderPostEventReport | Date: 2026-03-06
// Purpose: Renders the full Post-Event Report into the report section — event info,
//          sales summary, expenses, labor, supplies, discounts, tips, custom fields,
//          and totals. Each section is rendered as a labeled table.
// ---------------------------
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
      supplyFees: "Supply Fees",
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
// ---------------------------
// buildTableHTMLString | Date: 2026-03-06
// Purpose: Builds an HTML table string from an array of objects.
//          Returns "No data available" if the array is empty. Does NOT touch the DOM.
// ---------------------------
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

// ---------------------------
// buildCustomFieldsTable | Date: 2026-03-06
// Purpose: Returns a pdfmake table definition for custom event fields.
//          Used when generating the Post-Event PDF report.
// ---------------------------
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
// ---------------------------
// renderKeyValueTable | Date: 2026-03-06
// Purpose: Renders a two-column key/value HTML table from an object.
//          Used in the Post-Event Report for displaying structured data.
// ---------------------------
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

// ---------------------------
// renderTable | Date: 2026-03-06
// Purpose: Renders a generic HTML table from an array of objects, auto-detecting
//          column headers from the first row's keys.
// ---------------------------
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

// ---------------------------
// downloadPostEventPDF | Date: 2026-03-06
// Purpose: Generates and downloads a formatted PDF of the Post-Event Report using jsPDF.
//          Includes event header, sales, expenses, labor, and supplies sections with
//          auto page breaks.
// ---------------------------
async function downloadPostEventPDF() {


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
      supplyFees: "Supply Fees",
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




// ---------------------------
// formatLabel | Date: 2026-03-06
// Purpose: Converts a camelCase field name into a human-readable label
//          by inserting spaces before capital letters (e.g. "eventName" → "Event Name").
// ---------------------------
function formatLabel(str) {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------
// money | Date: 2026-03-06
// Purpose: Formats a numeric value as a dollar string with two decimal places (e.g. "$12.50").
// ---------------------------
function money(v) {
  return `$${Number(v ?? 0).toFixed(2)}`;
}

// ---------------------------
// sectionHeader | Date: 2026-03-06
// Purpose: Returns a pdfmake section header object with the "sectionHeader" style.
//          Used when building the Post-Event PDF layout.
// ---------------------------
function sectionHeader(text) {
  return { text, style: "sectionHeader" };
}

// ---------------------------
// uploadEventPermits | Date: 2026-03-06
// Purpose: Uploads one or more permit files for a given event using multipart form data.
//          Attached to the permit file input in the Post-Event Report section.
// ---------------------------
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
      window.USER_ID = data.userId || "";
      console.log("📋 Plan loaded:", window.USER_PLAN);
    }
  } catch (err) {
    console.warn("⚠️ Failed to fetch plan, defaulting to starter");
  }

}
});


// ---------------------------
// clearTemplate | Date: 2026-03-06
// Purpose: Resets the in-memory form template to an empty field list and clears the preview.
// ---------------------------
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
// ---------------------------
// loadEmployeesForDropdown | Date: 2026-03-06
// Purpose: Fetches the employee list from the API and populates the labor shift
//          employee dropdown. Stores the employee's default wage as a data attribute
//          so it can be auto-filled when the employee is selected.
// ---------------------------
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

// ---------------------------
// loadLaborForEvent | Date: 2026-03-06
// Purpose: Fetches all labor shift records for an event and renders them in the
//          labor table container. Renders both the card view and the raw hours table.
// ---------------------------
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


// ---------------------------
// updateLaborTotal | Date: 2026-03-06
// Purpose: Recalculates the labor shift total (hours × wage) and updates the
//          read-only total field in the Add Labor Shift form.
// ---------------------------
function updateLaborTotal() {
  const hoursEl = document.getElementById("laborHours");
  const wageEl = document.getElementById("laborWage");
  const totalEl = document.getElementById("laborTotal");
  if (!hoursEl || !wageEl || !totalEl) return;

  const hrs = Number(hoursEl.value) || 0;
  const wage = Number(wageEl.value) || 0;
  totalEl.value = (hrs * wage).toFixed(2);
}

// ---------------------------
// saveLaborShift | Date: 2026-03-06
// Purpose: Reads the Add Labor Shift form and POSTs a new labor shift record for the
//          current event. Reloads the labor table and updates the expenses/profit cards.
//          Blocked on finalized events.
// ---------------------------
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

// ---------------------------
// saveAdjustmentsForCurrentEvent | Date: 2026-03-06
// Purpose: Collects fees, tips, and discounts from the UI and PUTs all adjustments
//          for the current event in a single request. Reloads the dashboard on success.
// ---------------------------
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

// ---------------------------
// deleteLaborShift | Date: 2026-03-06
// Purpose: Confirms and DELETEs a labor shift record by ID. Reloads the dashboard.
//          Blocked on finalized events.
// ---------------------------
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

/*function loadRecentActivity() {
  const list = document.getElementById("recentActivityList");
  if (!list) return;

  list.innerHTML = `
    <li class="activity-muted">
      Activity will appear here as events are added and finalized
    </li>
  `;
}*/

// ---------------------------
// showStarterUpgrade | Date: 2026-03-06
// Purpose: Convenience wrapper that opens the upgrade modal with a given context key.
//          Called from inline HTML onclick handlers in plan-gated sections.
// ---------------------------
function showStarterUpgrade(context = "report") {
  showUpgradeModal(context);
}

// ============================================================
// 📊 Manage Events KPI Cards (Pro only)
// ============================================================

// ---------------------------
// loadManageKpis | Date: 2026-03-06
// Purpose: Fetches aggregate KPI data from the server and renders 4 stat cards
//          above the Manage Events table.
//          Cards: Total Events, Gross Revenue, Net Profit, Best Event.
// ---------------------------
async function loadManageKpis() {
  const row = document.getElementById("manageKpiRow");
  if (!row) return;

  try {
    const res = await fetch(`${API_BASE}/api/events/kpi`);
    if (!res.ok) return; // silently skip on error
    const kpi = await res.json();

    const fmt = (v) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const isProfit = Number(kpi.totalNetProfit) >= 0;
    const bestName = kpi.bestEvent ? kpi.bestEvent.eventName : "—";
    const bestAmt  = kpi.bestEvent ? fmt(kpi.bestEvent.netProfit) : "—";

    row.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Total Events</div>
        <div class="kpi-value">${Number(kpi.totalEvents)}</div>
        <div class="kpi-sub">${Number(kpi.finalizedEvents)} finalized</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Gross Revenue</div>
        <div class="kpi-value">${fmt(kpi.totalGrossSales)}</div>
        <div class="kpi-sub">across all events</div>
      </div>
      <div class="kpi-card ${isProfit ? "kpi-positive" : "kpi-negative"}">
        <div class="kpi-label">Net Profit</div>
        <div class="kpi-value">${fmt(kpi.totalNetProfit)}</div>
        <div class="kpi-sub">after all expenses</div>
      </div>
      <div class="kpi-card kpi-best">
        <div class="kpi-label">Best Event</div>
        <div class="kpi-value kpi-best-name">${bestName}</div>
        <div class="kpi-sub">${bestAmt} net profit</div>
      </div>
    `;
    row.classList.remove("hidden");
  } catch (_) { /* non-fatal */ }
}

// ============================================================
// 📦 Vendor Inventory Module (Part A)
// ============================================================

// In-memory cache of the user's inventory for the picker
let _inventoryCache = [];

// ---- Section navigation hook ----
// Extend navigateTo so that visiting inventorySection auto-loads items
const _origNavigateTo = navigateTo;
window.navigateTo = function(sectionId) {
  _origNavigateTo(sectionId);
  if (sectionId === "inventorySection") loadInventorySection();
  if (sectionId === "adminSection")     loadAdminSection();
  if (sectionId === "manageSection")    loadManageKpis();
  if (sectionId === "recipesSection")   loadRecipesSection();
};

// Wire up the CSV file input label
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("inventoryCsvFile");
  const fileLabel = document.getElementById("inventoryCsvFileName");
  if (fileInput && fileLabel) {
    fileInput.addEventListener("change", () => {
      fileLabel.textContent = fileInput.files[0]?.name || "No file chosen";
    });
  }
});

// ---------------------------
// loadInventorySection | Date: 2026-03-06
// Purpose: Fetches the user's vendor inventory from the API, caches it in _inventoryCache,
//          and renders the inventory table with category filter options.
// ---------------------------
async function loadInventorySection() {
  const container = document.getElementById("inventoryTableContainer");
  if (!container) return;
  container.innerHTML = '<p class="inv-empty">Loading…</p>';

  try {
    const res = await fetch(`${API_BASE}/api/inventory`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    _inventoryCache = items;
    renderInventoryTable(items);
    populateInventoryCategoryFilter(items, "inventoryCategoryFilter");
  } catch (err) {
    console.error("❌ loadInventorySection:", err);
    container.innerHTML = '<p class="inv-empty">Failed to load inventory.</p>';
  }
}

// ---------------------------
// renderInventoryTable | Date: 2026-03-06
// Purpose: Renders the full inventory table from an array of items. Each row has inline
//          editable fields for name, cost, category, and SKU. Pro users also see stock
//          tracking columns (on hand, threshold, reorder qty) and a Restock button.
//          Low-stock rows are highlighted with inv-row-low class.
// ---------------------------
function renderInventoryTable(items) {
  const container = document.getElementById("inventoryTableContainer");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="inv-empty">No inventory items yet — upload a CSV to get started.</p>';
    return;
  }

  const isPro = true;

  const rows = items.map(item => {
    const isLow = isPro && Number(item.reorderThreshold) > 0 &&
                  Number(item.quantityOnHand) <= Number(item.reorderThreshold);
    return `
    <tr class="inv-row${isLow ? " inv-row-low" : ""}" data-id="${item.id}">
      <td><input class="inv-cell-input inv-name"     value="${escInv(item.itemName)}"  data-field="itemName"></td>
      <td><input class="inv-cell-input inv-cost"     value="${Number(item.unitCost).toFixed(2)}" type="number" step="0.01" data-field="unitCost"></td>
      <td><input class="inv-cell-input inv-category" value="${escInv(item.category || "")}" data-field="category"></td>
      <td><input class="inv-cell-input inv-sku"      value="${escInv(item.sku || "")}" data-field="sku"></td>
      ${isPro ? `
      <td><input class="inv-cell-input inv-stock" type="number" step="1" value="${Number(item.quantityOnHand ?? 0)}" data-field="quantityOnHand" title="Quantity on hand">${isLow ? '<span class="inv-low-flag" title="Below reorder threshold">⚠</span>' : ""}</td>
      <td><input class="inv-cell-input inv-stock" type="number" step="1" value="${Number(item.reorderThreshold ?? 0)}" data-field="reorderThreshold" title="Reorder when on-hand falls to this level"></td>
      <td><input class="inv-cell-input inv-stock" type="number" step="1" value="${Number(item.reorderQty ?? 0)}" data-field="reorderQty" title="Suggested reorder quantity"></td>
      <td>
        <button class="inv-restock-btn" onclick="quickRestock(${item.id})" title="Set restocked amount">📦 Restock</button>
      </td>` : ""}
      <td>
        <button class="inv-save-btn"   onclick="saveInventoryItem(${item.id}, this)">💾</button>
        <button class="inv-delete-btn" onclick="deleteInventoryItem(${item.id}, this)">🗑</button>
      </td>
    </tr>`;
  }).join("");

  const proHeaders = isPro ? `<th title="Qty on hand">On Hand</th><th title="Alert when on-hand reaches this">Threshold</th><th title="How many to order">Reorder Qty</th><th></th>` : "";

  container.innerHTML = `
    <table class="inv-table">
      <thead>
        <tr>
          <th>Item Name</th>
          <th>Unit Cost</th>
          <th>Category</th>
          <th>SKU</th>
          ${proHeaders}
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ---------------------------
// escInv | Date: 2026-03-06
// Purpose: Escapes a string for safe use inside HTML attribute values in the inventory table.
// ---------------------------
function escInv(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ---------------------------
// populateInventoryCategoryFilter | Date: 2026-03-06
// Purpose: Populates a category filter dropdown from the unique categories in the
//          inventory item list. Preserves the currently selected value.
// ---------------------------
function populateInventoryCategoryFilter(items, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>' +
    categories.map(c => `<option value="${escInv(c)}" ${c === current ? "selected" : ""}>${escInv(c)}</option>`).join("");
}

// ---------------------------
// filterInventoryTable | Date: 2026-03-06
// Purpose: Filters the cached inventory by the search text and category dropdown,
//          then re-renders the table with the matching subset.
// ---------------------------
function filterInventoryTable() {
  const q   = (document.getElementById("inventorySearch")?.value || "").toLowerCase();
  const cat = document.getElementById("inventoryCategoryFilter")?.value || "";
  const filtered = _inventoryCache.filter(item =>
    (!q   || item.itemName.toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q)) &&
    (!cat || item.category === cat)
  );
  renderInventoryTable(filtered);
}

// ---------------------------
// uploadInventoryCSV | Date: 2026-03-06
// Purpose: Uploads the selected CSV file to the server's inventory import endpoint.
//          The server deduplicates by SKU (or item name) and returns the count imported.
//          Reloads the inventory table on success.
// ---------------------------
async function uploadInventoryCSV() {
  const fileInput = document.getElementById("inventoryCsvFile");
  if (!fileInput?.files?.length) {
    showToast("Please choose a CSV file first.", "warning");
    return;
  }

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);

  const res = await fetch(`${API_BASE}/api/inventory/upload`, { method: "POST", body: fd });
  const json = await res.json();

  if (!res.ok) {
    showToast(json.error || "Upload failed.", "error");
    return;
  }

  showToast(`Imported ${json.count} item${json.count !== 1 ? "s" : ""} successfully.`, "success");
  fileInput.value = "";
  document.getElementById("inventoryCsvFileName").textContent = "No file chosen";
  await loadInventorySection();
}

// ---------------------------
// downloadInventoryTemplate | Date: 2026-03-06
// Purpose: Triggers a download of the CSV template file with the correct column headers
//          (itemName, unitCost, category, sku) for importing inventory.
// ---------------------------
function downloadInventoryTemplate() {
  window.location.href = `${API_BASE}/api/inventory/template`;
}

// ---------------------------
// clearAllInventory | Date: 2026-03-06
// Purpose: Permanently deletes all inventory items for the current user after confirmation.
//          Clears the local cache and replaces the table with an empty state message.
// ---------------------------
async function clearAllInventory() {
  if (!confirm("This will permanently delete all inventory items for your account. Continue?")) return;

  const res  = await fetch(`${API_BASE}/api/inventory`, { method: "DELETE" });
  const json = await res.json();

  if (!res.ok) { showToast(json.error || "Clear failed.", "error"); return; }

  _inventoryCache = [];
  showToast(`Cleared ${json.deleted} item${json.deleted !== 1 ? "s" : ""}.`, "success");
  document.getElementById("inventoryTableContainer").innerHTML =
    '<p class="inv-empty">No inventory items yet — upload a CSV to get started.</p>';
}

// ---------------------------
// saveInventoryItem | Date: 2026-03-06
// Purpose: Reads the inline-edited fields from an inventory table row and PUTs the
//          updated item to the server. Pro users also save stock tracking fields.
//          Reloads the full inventory section on success.
// ---------------------------
async function saveInventoryItem(id, btn) {
  const row = btn.closest("tr.inv-row");
  if (!row) return;

  const itemName        = row.querySelector('[data-field="itemName"]')?.value?.trim();
  const unitCost        = Number(row.querySelector('[data-field="unitCost"]')?.value) || 0;
  const category        = row.querySelector('[data-field="category"]')?.value?.trim() || null;
  const sku             = row.querySelector('[data-field="sku"]')?.value?.trim() || null;
  const qohEl           = row.querySelector('[data-field="quantityOnHand"]');
  const rthEl           = row.querySelector('[data-field="reorderThreshold"]');
  const rqEl            = row.querySelector('[data-field="reorderQty"]');
  const quantityOnHand   = qohEl ? Number(qohEl.value) : undefined;
  const reorderThreshold = rthEl ? Number(rthEl.value) : undefined;
  const reorderQty       = rqEl  ? Number(rqEl.value)  : undefined;

  if (!itemName) { showToast("Item name is required.", "warning"); return; }

  const res  = await fetch(`${API_BASE}/api/inventory/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName, unitCost, category, sku, quantityOnHand, reorderThreshold, reorderQty })
  });
  const json = await res.json();

  if (!res.ok) { showToast(json.error || "Save failed.", "error"); return; }

  // Update cache
  const idx = _inventoryCache.findIndex(i => i.id === id);
  if (idx !== -1) _inventoryCache[idx] = json;

  showToast("Item saved.", "success");
}

// ---------------------------
// deleteInventoryItem | Date: 2026-03-06
// Purpose: Confirms and DELETEs a single inventory item by ID. Removes the row from the DOM
//          and the local cache. Shows an empty state message if no items remain.
// ---------------------------
async function deleteInventoryItem(id, btn) {
  if (!confirm("Delete this item from your inventory?")) return;

  const res  = await fetch(`${API_BASE}/api/inventory/${id}`, { method: "DELETE" });
  const json = await res.json();

  if (!res.ok) { showToast(json.error || "Delete failed.", "error"); return; }

  _inventoryCache = _inventoryCache.filter(i => i.id !== id);
  btn.closest("tr.inv-row")?.remove();

  if (!document.querySelector(".inv-row")) {
    document.getElementById("inventoryTableContainer").innerHTML =
      '<p class="inv-empty">No inventory items yet — upload a CSV to get started.</p>';
  }

  showToast("Item deleted.", "success");
}

// ============================================================
// 🛒 Inventory Picker (used from Supply Fees card)
// ============================================================

// ---------------------------
// openInventoryPicker | Date: 2026-03-06
// Purpose: Opens the inventory picker modal for the current event's Supply Fees card.
//          Refreshes the inventory cache if empty, resets search/filter state,
//          and renders the checkable item list. Blocked on finalized events.
// ---------------------------
async function openInventoryPicker() {
  if (window.activeEvent?.isFinalized === 1) {
    showToast("This event has been finalized and can no longer be edited.", "warning");
    return;
  }
  if (!window.currentEventId) {
    showToast("No active event selected.", "warning");
    return;
  }

  
  // Refresh cache if empty
  if (!_inventoryCache.length) {
    try {
      const res = await fetch(`${API_BASE}/api/inventory`);
      if (res.ok) _inventoryCache = await res.json();
    } catch (_) { /* non-fatal */ }
  }

  renderPickerList(_inventoryCache);
  populateInventoryCategoryFilter(_inventoryCache, "pickerCategoryFilter");
  document.getElementById("pickerSearch").value = "";
  const pickerCatEl = document.getElementById("pickerCategoryFilter");
  if (pickerCatEl) pickerCatEl.value = "";
  document.getElementById("inventoryPickerOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

// ---------------------------
// closeInventoryPicker | Date: 2026-03-06
// Purpose: Closes the inventory picker modal and restores page scrolling.
// ---------------------------
function closeInventoryPicker() {
  document.getElementById("inventoryPickerOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

// Close on backdrop click
document.addEventListener("click", e => {
  if (e.target === document.getElementById("inventoryPickerOverlay")) closeInventoryPicker();
});

// ---------------------------
// renderPickerList | Date: 2026-03-06
// Purpose: Renders the list of checkable inventory items inside the picker modal.
//          Each row shows item name, category badge, unit cost, and a quantity input.
// ---------------------------
function renderPickerList(items) {
  const container = document.getElementById("pickerListContainer");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="inv-picker-empty">No items match — try a different search or <a onclick="closeInventoryPicker(); navigateTo(\'inventorySection\')">upload your inventory</a>.</p>';
    updatePickerCount();
    return;
  }

  container.innerHTML = items.map(item => `
    <label class="picker-row" data-id="${item.id}">
      <input type="checkbox" class="picker-check" value="${item.id}" onchange="updatePickerCount()">
      <span class="picker-name">${escInv(item.itemName)}</span>
      ${item.category ? `<span class="picker-cat">${escInv(item.category)}</span>` : ""}
      <span class="picker-cost">${fmt(item.unitCost)} ea.</span>
      <input type="number" class="picker-qty" min="1" step="1" value="1" placeholder="Qty">
    </label>
  `).join("");
}

// ---------------------------
// filterPickerList | Date: 2026-03-06
// Purpose: Filters the inventory picker list by the search text and category dropdown,
//          then re-renders the picker rows with the matching subset.
// ---------------------------
function filterPickerList() {
  const q   = (document.getElementById("pickerSearch")?.value || "").toLowerCase();
  const cat = document.getElementById("pickerCategoryFilter")?.value || "";
  const filtered = _inventoryCache.filter(item =>
    (!q   || item.itemName.toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q)) &&
    (!cat || item.category === cat)
  );
  renderPickerList(filtered);
}

// ---------------------------
// updatePickerCount | Date: 2026-03-06
// Purpose: Updates the "N items selected" counter in the picker modal footer
//          each time a checkbox is toggled.
// ---------------------------
function updatePickerCount() {
  const count = document.querySelectorAll(".picker-check:checked").length;
  const el = document.getElementById("pickerSelectedCount");
  if (el) el.textContent = `${count} item${count !== 1 ? "s" : ""} selected`;
}

// ---------------------------
// addPickedItemsToEvent | Date: 2026-03-06
// Purpose: Posts each checked picker item as a supply entry for the current event,
//          using the inventory item's unit cost and the user-entered quantity.
//          Passes vendorInventoryId so Pro plan stock deduction fires server-side.
//          Reloads the dashboard and refreshes the alert badge on completion.
// ---------------------------
async function addPickedItemsToEvent() {
  const eventID = window.currentEventId;
  if (!eventID) return;

  const checked = document.querySelectorAll(".picker-check:checked");
  if (!checked.length) {
    showToast("Select at least one item.", "warning");
    return;
  }

  let added = 0;
  for (const cb of checked) {
    const itemId   = Number(cb.value);
    const row      = cb.closest(".picker-row");
    const qty      = Number(row?.querySelector(".picker-qty")?.value) || 1;
    const invItem  = _inventoryCache.find(i => i.id === itemId);
    if (!invItem) continue;

    const res = await fetch(`${API_BASE}/api/events/${eventID}/supplies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemName:          invItem.itemName,
        unitCost:          invItem.unitCost,
        quantityUsed:      qty,
        vendorInventoryId: invItem.id   // enables Pro stock deduction
      })
    });

    if (res.ok) added++;
    else console.error("❌ Failed to add supply from picker:", await res.json());
  }

  closeInventoryPicker();

  if (added) {
    showToast(`Added ${added} item${added !== 1 ? "s" : ""} to supply costs.`, "success");
    await reloadEventDashboard();
    loadInventoryAlerts();
  } else {
    showToast("No items were added.", "error");
  }
}

// ============================================================
// 🔔 Inventory Alerts Module (Part B — Pro)
// ============================================================

let _alertsOpen = false;

// ---------------------------
// loadInventoryAlerts | Date: 2026-03-06
// Purpose: Fetches all unread low-stock alerts from the server and updates the
//          alerts bell badge and drop-down panel. Silently skips if the user is not Pro.
// ---------------------------
async function loadInventoryAlerts() {
  try {
    const res = await fetch(`${API_BASE}/api/inventory/alerts`);
    if (!res.ok) return; // silently skip if not pro or error
    const alerts = await res.json();
    updateAlertBadge(alerts.length);
    renderAlertsPanel(alerts);
  } catch (_) { /* non-fatal */ }
}

// ---------------------------
// updateAlertBadge | Date: 2026-03-06
// Purpose: Updates the numeric badge on the alerts bell and toggles the bell's
//          active animation class based on whether there are unread alerts.
// ---------------------------
function updateAlertBadge(count) {
  const badge = document.getElementById("alertsBadge");
  const bell  = document.getElementById("btnAlerts");
  if (!badge || !bell) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.classList.remove("hidden");
    bell.classList.add("alerts-bell-active");
  } else {
    badge.classList.add("hidden");
    bell.classList.remove("alerts-bell-active");
  }
}

// ---------------------------
// renderAlertsPanel | Date: 2026-03-06
// Purpose: Renders the list of low-stock alert rows in the alerts drop-down panel.
//          Each row shows item name, message, a Restock button, and a Dismiss button.
// ---------------------------
function renderAlertsPanel(alerts) {
  const list = document.getElementById("alertsPanelList");
  if (!list) return;

  if (!alerts.length) {
    list.innerHTML = '<p class="alerts-empty">No reorder alerts — stock levels are good.</p>';
    return;
  }

  list.innerHTML = alerts.map(a => `
    <div class="alert-row" data-alert-id="${a.id}">
      <div class="alert-icon">⚠</div>
      <div class="alert-body">
        <strong>${escInv(a.itemName)}</strong>
        <span class="alert-msg">${escInv(a.message)}</span>
      </div>
      <div class="alert-actions">
        <button class="inv-restock-btn" onclick="quickRestockFromAlert(${a.itemId}, ${a.id}, this)">📦 Restock</button>
        <button class="alert-dismiss" onclick="markAlertRead(${a.id}, this)" title="Dismiss">✕</button>
      </div>
    </div>
  `).join("");
}

// ---------------------------
// toggleAlertsPanel | Date: 2026-03-06
// Purpose: Toggles the alerts drop-down panel open/closed. Refreshes alert data
//          from the server each time the panel is opened.
// ---------------------------
function toggleAlertsPanel() {
  const panel = document.getElementById("alertsPanel");
  if (!panel) return;
  _alertsOpen = !_alertsOpen;
  panel.classList.toggle("hidden", !_alertsOpen);
  if (_alertsOpen) loadInventoryAlerts(); // refresh on open
}

// ---------------------------
// markAlertRead | Date: 2026-03-06
// Purpose: Marks a single alert as read on the server, removes its row from the panel,
//          and updates the badge count.
// ---------------------------
async function markAlertRead(alertId, btn) {
  await fetch(`${API_BASE}/api/inventory/alerts/${alertId}/read`, { method: "PUT" });
  btn?.closest(".alert-row")?.remove();
  const remaining = document.querySelectorAll(".alert-row").length;
  updateAlertBadge(remaining);
  if (!remaining) {
    document.getElementById("alertsPanelList").innerHTML =
      '<p class="alerts-empty">No reorder alerts — stock levels are good.</p>';
  }
}

// ---------------------------
// markAllAlertsRead | Date: 2026-03-06
// Purpose: Marks all unread alerts as read in a single server call, clears the
//          badge, and shows the empty state in the alerts panel.
// ---------------------------
async function markAllAlertsRead() {
  await fetch(`${API_BASE}/api/inventory/alerts/read-all`, { method: "PUT" });
  updateAlertBadge(0);
  document.getElementById("alertsPanelList").innerHTML =
    '<p class="alerts-empty">No reorder alerts — stock levels are good.</p>';
}

// ---------------------------
// quickRestockFromAlert | Date: 2026-03-06
// Purpose: Prompts for a new quantity on hand from the alerts panel Restock button,
//          PUTs it to the server, dismisses the alert, and refreshes the inventory table
//          if it is currently visible.
// ---------------------------
async function quickRestockFromAlert(itemId, alertId, btn) {
  const qtyStr = prompt("Enter new quantity on hand:");
  if (qtyStr === null) return;
  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty < 0) { showToast("Invalid quantity.", "warning"); return; }

  const res  = await fetch(`${API_BASE}/api/inventory/${itemId}/stock`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantityOnHand: qty })
  });
  if (!res.ok) { showToast("Restock failed.", "error"); return; }

  showToast("Stock updated!", "success");
  // Remove this alert row and refresh badge
  await markAlertRead(alertId, btn.closest(".alert-row")?.querySelector(".alert-dismiss"));
  // Refresh inventory table if open
  if (!document.getElementById("inventorySection")?.classList.contains("hidden")) {
    await loadInventorySection();
  }
}

// ---------------------------
// quickRestock | Date: 2026-03-06
// Purpose: Prompts for a new quantity on hand from the inventory table Restock button,
//          PUTs it to the server, then reloads the inventory section to reflect the
//          updated stock level and any cleared alerts.
// ---------------------------
async function quickRestock(itemId) {
  const qtyStr = prompt("Enter new quantity on hand:");
  if (qtyStr === null) return;
  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty < 0) { showToast("Invalid quantity.", "warning"); return; }

  const res  = await fetch(`${API_BASE}/api/inventory/${itemId}/stock`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantityOnHand: qty })
  });
  const json = await res.json();
  if (!res.ok) { showToast(json.error || "Restock failed.", "error"); return; }

  showToast("Stock updated!", "success");
  // Update cache and refresh
  const idx = _inventoryCache.findIndex(i => i.id === itemId);
  if (idx !== -1) _inventoryCache[idx] = json;
  await loadInventorySection();
  await loadInventoryAlerts();
}

// Close alerts panel when clicking outside it
document.addEventListener("click", e => {
  if (_alertsOpen &&
      !e.target.closest("#alertsPanel") &&
      !e.target.closest("#btnAlerts")) {
    _alertsOpen = false;
    document.getElementById("alertsPanel")?.classList.add("hidden");
  }
});

// ============================================================
// ⚙ Admin Module
// ============================================================

let _adminUsers = []; // full user list cache

// ---------------------------
// loadAdminSection | Date: 2026-03-06
// Purpose: Fetches all users and their plan data from the admin API endpoint and
//          renders the stats chips and user table. Returns an "unauthorized" message
//          if the current user is not an admin.
// ---------------------------
async function loadAdminSection() {
  const container = document.getElementById("adminTableContainer");
  if (!container) return;
  container.innerHTML = '<p class="admin-empty">Loading…</p>';
  document.getElementById("adminStats").innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    if (res.status === 403) {
      container.innerHTML = '<p class="admin-empty">⛔ Not authorized.</p>';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    _adminUsers = data.users || [];
    renderAdminStats(_adminUsers);
    renderAdminTable(_adminUsers);
  } catch (err) {
    console.error("❌ loadAdminSection:", err);
    container.innerHTML = '<p class="admin-empty">Failed to load users.</p>';
  }
}

// ---------------------------
// renderAdminStats | Date: 2026-03-06
// Purpose: Renders the summary stat chips (Total users, Pro count, Starter count)
//          at the top of the Admin section.
// ---------------------------
function renderAdminStats(users) {
  const total   = users.length;
  const pro     = users.filter(u => u.plan === "pro").length;
  const starter = total - pro;
  document.getElementById("adminStats").innerHTML = `
    <div class="admin-stat-chip">👥 <strong>${total}</strong> Total</div>
    <div class="admin-stat-chip admin-chip-pro">⚡ <strong>${pro}</strong> Pro</div>
    <div class="admin-stat-chip">📋 <strong>${starter}</strong> Starter</div>
  `;
}

// ---------------------------
// renderAdminTable | Date: 2026-03-06
// Purpose: Renders the admin user management table — showing email, truncated user ID,
//          plan badge, join date, and an Upgrade/Downgrade action button per row.
// ---------------------------
function renderAdminTable(users) {
  const container = document.getElementById("adminTableContainer");
  if (!container) return;

  if (!users.length) {
    container.innerHTML = '<p class="admin-empty">No users found.</p>';
    return;
  }

  const rows = users.map(u => {
    const isPro   = u.plan === "pro";
    const joined  = u.timeJoined ? new Date(u.timeJoined).toLocaleDateString() : "—";
    const shortId = u.userId.slice(0, 8) + "…";
    return `
      <tr class="admin-row" data-user-id="${u.userId}">
        <td class="admin-email">${escInv(u.email)}</td>
        <td class="admin-id" title="${u.userId}">${shortId}</td>
        <td>
          <span class="admin-plan-badge ${isPro ? "badge-pro" : "badge-starter"}">
            ${isPro ? "⚡ Pro" : "📋 Starter"}
          </span>
        </td>
        <td class="admin-joined">${joined}</td>
        <td class="admin-actions">
          ${isPro
            ? `<button class="admin-btn admin-btn-downgrade" onclick="setUserPlan('${u.userId}','starter',this)">Downgrade to Starter</button>`
            : `<button class="admin-btn admin-btn-upgrade"   onclick="setUserPlan('${u.userId}','pro',this)">Upgrade to Pro ⚡</button>`
          }
        </td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>User ID</th>
          <th>Plan</th>
          <th>Joined</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ---------------------------
// filterAdminUsers | Date: 2026-03-06
// Purpose: Filters the cached admin user list by search text (email or user ID)
//          and plan dropdown, then re-renders the admin table.
// ---------------------------
function filterAdminUsers() {
  const q    = (document.getElementById("adminSearch")?.value || "").toLowerCase();
  const plan = document.getElementById("adminPlanFilter")?.value || "";
  const filtered = _adminUsers.filter(u =>
    (!q    || u.email.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)) &&
    (!plan || u.plan === plan)
  );
  renderAdminTable(filtered);
}

// ---------------------------
// setUserPlan | Date: 2026-03-06
// Purpose: Confirms, then PUTs the new plan (pro/starter) for a given user ID via the
//          admin API. Updates the row badge and action button in-place without a full
//          reload. Revokes the user's sessions server-side so the change takes effect
//          on their next login.
// ---------------------------
async function setUserPlan(userId, newPlan, btn) {
  const label = newPlan === "pro" ? "Upgrade to Pro" : "Downgrade to Starter";
  if (!confirm(`${label} for this user?`)) return;

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const res  = await fetch(`${API_BASE}/api/admin/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan: newPlan })
    });
    const json = await res.json();

    if (!res.ok) {
      showToast(json.error || "Failed to update plan.", "error");
      btn.disabled = false;
      btn.textContent = orig;
      return;
    }

    // Update cache and re-render in-place
    const user = _adminUsers.find(u => u.userId === userId);
    if (user) user.plan = newPlan;
    renderAdminStats(_adminUsers);

    // Swap the row visually without full reload
    const row    = btn.closest("tr.admin-row");
    const isPro  = newPlan === "pro";
    row.querySelector(".admin-plan-badge").className = `admin-plan-badge ${isPro ? "badge-pro" : "badge-starter"}`;
    row.querySelector(".admin-plan-badge").textContent = isPro ? "⚡ Pro" : "📋 Starter";
    btn.className   = `admin-btn ${isPro ? "admin-btn-downgrade" : "admin-btn-upgrade"}`;
    btn.textContent = isPro ? "Downgrade to Starter" : "Upgrade to Pro ⚡";
    btn.onclick     = () => setUserPlan(userId, isPro ? "starter" : "pro", btn);
    btn.disabled    = false;

    showToast(`Plan updated to ${newPlan}.`, "success");
  } catch (err) {
    console.error("❌ setUserPlan:", err);
    showToast("Network error.", "error");
    btn.disabled    = false;
    btn.textContent = orig;
  }
}



