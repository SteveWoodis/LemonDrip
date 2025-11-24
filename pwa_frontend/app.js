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

// ---------------------------
// 💾 Persistent State (localStorage)
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
    // ...rest unchanged
  } catch (err) {
    console.warn("⚠️ Failed to restore app state:", err);
    navigateTo("manageSection");
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

  // ⭐ AUTO-LOAD EVENTS ON MANAGE PAGE
  if (sectionId === "manageSection") {
    loadAllEvents();     // <-- FIX EVERYTHING
  }
}

window.navigateTo = navigateTo; // <-- FIX

function formatEvent(e) {
  return {
    eventID: e.eventID ?? e.EventID ?? e["Event ID"],
    eventName: e.eventName ?? e.EventName ?? e["Event Name"],
    eventDate: e.eventDate ?? e.EventDate ?? e["Event Date"],
    coordinator: e.coordinator ?? e.EventCoordinator ?? e["Event coordinator"],
    eventLocation: e.eventLocation ?? e.EventLocation ?? e["Event Location"],
    squareLocationId: e.squareLocationId ?? e["squareLocationId"] ?? e.squareLocationID,
    isFinalized: Number(e.isFinalized) === 1 ? 1 : 0,
    finalizedDate: e.finalizedDate ?? e.FinalizedDate ?? e["finalizedDate"] ?? null,
    status: e.status ?? e.Status ?? e["Event status"],
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

    // If this is the Event Name column, attach finalized badge
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
        const eventID = event["eventID"] || event.eventID;

        if (!eventID) {
          console.warn("⚠️ No eventID found for clicked row:", event);
          alert("eventID missing — cannot load details.");
          return;
        }

        const res = await fetch(
          `http://localhost:3000/api/events/${eventID}`
        );
        if (!res.ok)
          throw new Error(`Server responded with ${res.status}`);

        const fullEvent = await res.json();

        const empRes = await fetch(
          `http://localhost:3000/api/events/${eventID}/employees`
        );
        const empData = await empRes.json();

        fullEvent.eventEmployees = empData;

        console.log("FullEvent is:", fullEvent);
        loadEventIntoDashboard(fullEvent);
      } catch (err) {
        console.error("❌ Error loading event details:", err);
        alert("Could not load event details.");
      }
    });
  });

  container.appendChild(table);
}
let lastLoadedEvents = [];

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

    lastLoadedEvents = formatted;
    buildTableHTML(formatted, "manageResults");

  } catch (err) {
    console.error("loadAllEvents error:", err);
  }
}


// Search
async function manageSearch() {
  const name = document.getElementById("manageSearchName")?.value.trim() || "";
  const date = document.getElementById("manageSearchDate")?.value.trim() || "";
  const id = document.getElementById("manageSearchID")?.value.trim() || "";

  const query = new URLSearchParams();
  if (name) query.append("eventName", name);
  if (date) query.append("eventDate", date);
  if (id) query.append("eventID", id);

  try {
    const res = await fetch(
      `http://localhost:3000/api/events/search?${query.toString()}`
    );
    const data = await res.json();
    const results = data.Events || [];

    // ✔ Apply unified formatter *here*, AFTER results exists
    const formatted = results.map(formatEvent);
    lastLoadedEvents = formatted;

    buildTableHTML(formatted, "manageResults");
  } catch (err) {
    console.error("manageSearch error:", err);
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
  navigateTo("addSection");

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
  const num = (k) =>
    obj[k] === "" || obj[k] == null ? null : Number(obj[k]);
  const int = (k) =>
    obj[k] === "" || obj[k] == null ? null : parseInt(obj[k], 10);
  const str = (k) =>
    obj[k] == null || obj[k] === "" ? null : String(obj[k]);
  const bool = (k) =>
    obj[k] === true ||
    obj[k] === "true" ||
    obj[k] === "1"
      ? true
      : false;

  // normalize every canonical field
  obj["eventFee"] = int("eventFee");
  obj["numDays"] = int("numDays");
  obj["grossSales"] = num("grossSales");
  obj["tips"] = num("tips");
  obj["netSales"] = num("netSales");
  obj["totalSales"] = num("totalSales");
  obj["isFinalized"] = bool("isFinalized");
  return obj;
}

async function submitEvent(e) {
  if (e) e.preventDefault();

  const formEl = document.getElementById("eventForm");
  const inputs = formEl.querySelectorAll("input, select, textarea");

  // 1️⃣ Load the active template (required for canonical/custom separation)
  const templateName = document.getElementById("templateSelect")?.value;
  const template = window.availableTemplates?.find(t => t.templateName === templateName);

  if (!template || !Array.isArray(template.fields)) {
    alert("Template not found or invalid. Please load a template first.");
    return;
  }

  // 2️⃣ Build raw values from the DOM
  const rawValues = {};
  inputs.forEach((input) => {
    const id = input.id || "";
    if (!id.startsWith("form_")) return;

    const formKey = id.replace(/^form_/, ""); // e.g. "Event_Name"
    if (input.multiple) {
      rawValues[formKey] = Array.from(input.selectedOptions).map(o => o.value);
    } else {
      rawValues[formKey] = input.value.trim();
    }
  });

  // Square Location (optional)
  const sq = document.getElementById("form_squareLocationId");
  if (sq) rawValues.squareLocationId = sq.value || null;

  // 3️⃣ Known canonical fields in your database schema
  const CANONICAL_KEYS = new Set([
    "eventName",
    "eventDate",
    "applicationDate",
    "finalizedDate",
    "eventFee",
    "squareLocationId",
    "time",
    "employees",
    "eventRating",
    "eventHost",
    "notes",
    "status",
    "eventType",
    "numDays",
    "coordinator",
    "grossSales",
    "tips",
    "netSales",
    "totalSales",
    "isFinalized"
  ]);

  // 4️⃣ Split rawValues → canonical + custom using template
  const canonical = {};
  const custom = {};

  template.fields.forEach((field) => {
    // normalize template field identifier
    const safeKey = String(field.label)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "");

    const value = rawValues[safeKey];

    // If the template explicitly mapped dbKey (future extension)
    if (field.dbKey && CANONICAL_KEYS.has(field.dbKey)) {
      canonical[field.dbKey] = value ?? null;
      return;
    }

    // If the label *itself* matches a canonical DB column (current behavior)
    const lower = field.label.toLowerCase().replace(/\s+/g, "");
    const matches = [...CANONICAL_KEYS].find(k => k.toLowerCase() === lower);

    if (matches) {
      canonical[matches] = value ?? null;
    } else {
      // Otherwise treat as vendor-custom field
      custom[field.label] = value ?? null;
    }
  });

  // Attach custom fields object
  canonical.customFields = Object.keys(custom).length ? custom : null;

  // 5️⃣ Validation (eventName + eventDate are required)
  if (!canonical.eventName || !canonical.eventDate) {
    alert("Please provide at least an event name and date.");
    return;
  }

  // 6️⃣ Type coercion (uses your existing helper)
  const payload = coerceForApi(canonical);

  // 7️⃣ Determine POST vs PUT
  const isEditing = window.isEditing === true && window.activeeventID;
  const url = isEditing
    ? `http://localhost:3000/api/events/${window.activeeventID}`
    : "http://localhost:3000/api/events";

  const method = isEditing ? "PUT" : "POST";

  console.log("📨 Final Submit Payload:", { method, url, payload });

  // 8️⃣ Send to backend
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const responseJSON = await res.json();

  if (!res.ok) {
    console.error("🚨 Backend error:", responseJSON);
    alert(responseJSON.error || "Error saving event.");
    return;
  }

  // Determine eventID
  const savedID = isEditing
    ? window.activeeventID
    : responseJSON.eventID || responseJSON.EventID;

  if (!savedID) {
    alert("Could not determine EventID from server response.");
    return;
  }

  // 9️⃣ Upload permits if any
  await uploadEventPermits(savedID);

  alert(isEditing ? "Event updated!" : "Event created!");

  // Reset editing globals
  window.isEditing = false;
  window.activeeventID = null;
  window.activeEvent = null;

  // Navigate back & refresh
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
      "http://localhost:3000/api/formtemplates",
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

async function loadTemplates() {
  try {
    const res = await fetch("http://localhost:3000/api/formTemplates");
    const templates = await res.json();

    const selector = document.getElementById("templateSelector");
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
    const res = await fetch("http://localhost:3000/api/formtemplates");
    let templates = await res.json();

    templates = toCamelCaseKeys(templates);

    window.availableTemplates = templates;

    const addDropdown = document.getElementById("templateSelect");
    addDropdown.innerHTML =
      '<option value="">-- Select Template --</option>';
    templates.forEach((tpl) => {
      const opt = document.createElement("option");
      opt.value = tpl.templateName;
      opt.textContent = tpl.templateName;
      addDropdown.appendChild(opt);
    });

    // Fill Design Form dropdown (if visible)
    const designDropdown =
      document.getElementById("templateSelector");
    if (designDropdown) {
      designDropdown.innerHTML =
        '<option value="">-- Select Template --</option>';
      templates.forEach((tpl) => {
        const opt = document.createElement("option");
        opt.value = tpl.templateName;
        opt.textContent = tpl.templateName;
        designDropdown.appendChild(opt);
      });
    }
    console.log(`✅ ${templates.length} templates loaded.`);
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
  const selector = document.getElementById("templateSelector");
  if (!selector) {
    console.warn(
      "activateTemplate called but #templateSelector not found"
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
}

// ---------------------------
// 📊 Clean Event Dashboard Loader
// ---------------------------
function loadEventIntoDashboard(fullEvent) {
  if (!fullEvent) {
    console.warn("⚠️ loadEventIntoDashboard called with no event");
    return;
  }

  // Store globally for Edit / Report / Finalize
  window.activeEvent = fullEvent;

  // -----------------------------
  // 🔍 Normalize Event Fields 
  // -----------------------------
  const eventID =
    fullEvent.eventID ||
    fullEvent.EventID ||
    fullEvent["Event ID"];

  const eventName =
    fullEvent.eventName ||
    fullEvent.EventName ||
    fullEvent.EventInfo?.eventName ||
    "Unnamed Event";

  const eventDate =
    fullEvent.eventDate ||
    fullEvent.EventDate ||
    fullEvent.EventInfo?.eventDate ||
    "";

  const coordinator =
    fullEvent.coordinator ||
    fullEvent.EventCoordinator ||
    fullEvent.EventInfo?.EventCoordinator ||
    "";

  const eventLocation =
    fullEvent.eventLocation ||
    fullEvent.EventLocation ||
    fullEvent.EventInfo?.EventLocation ||
    "";

  const status =
    fullEvent.status ||
    fullEvent.Status ||
    fullEvent.EventInfo?.Status ||
    "";

  // -----------------------------
  // 🧭 Navigate to dashboard
  // -----------------------------
  navigateTo("eventDashboardSection");

  const container = document.getElementById("eventDashboardContainer");
  if (!container) {
    console.warn("⚠️ #eventDashboardContainer not found");
    return;
  }
  container.innerHTML = "";

  // -----------------------------
  // 🏷 HEADER SETUP
  // -----------------------------
  const headerTitle = document.getElementById("dashEventName");
  const headerDate = document.getElementById("dashEventDate");
  const finalizedIndicator = document.getElementById("dashFinalizedIndicator");

  headerTitle.textContent = eventName;
  headerDate.textContent = eventDate;
  finalizedIndicator.innerHTML = "";

  // Finalized badge
  if (fullEvent.isFinalized === 1) {
    const finalBadge = document.createElement("div");
    finalBadge.classList.add("finalized-badge-large");
    finalBadge.textContent = "FINALIZED";
    finalizedIndicator.appendChild(finalBadge);

    if (fullEvent.finalizedDate) {
      const finalDate = document.createElement("div");
      finalDate.style.fontSize = "0.85rem";
      finalDate.style.color = "#444";
      finalDate.style.marginTop = "4px";
      finalDate.textContent = `Finalized on: ${fullEvent.finalizedDate}`;
      finalizedIndicator.appendChild(finalDate);
    }
  }

  // -----------------------------
  // 🟦 BUTTONS AT TOP OF DASHBOARD
  // -----------------------------
  const buttonContainer = document.querySelector(".dashboard-buttons");
  buttonContainer.innerHTML = ""; // Clear previous

  // --- Pull Square Sales ---
  const squareBtn = document.createElement("button");
  squareBtn.textContent = "🔄 Pull Square Sales";
  squareBtn.classList.add("btn-primary");
  squareBtn.addEventListener("click", async () => {
    await pullSquareSales(eventID);
  });

  // --- Finalize Event ---
  const finalizeBtn = document.createElement("button");
  finalizeBtn.textContent = "✔️ Finalize Event";
  finalizeBtn.classList.add("btn-primary");
  finalizeBtn.addEventListener("click", async () => {
    if (!confirm("Finalize this event? This will save all calculations.")) return;

    try {
      const res = await fetch(
        `http://localhost:3000/api/events/${eventID}/finalize`,
        { method: "PUT" }
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not finalize event.");
        return;
      }

      alert("Event is finalized!");

      const updatedEventRes = await fetch(
        `http://localhost:3000/api/events/${eventID}`
      );
      const updatedEvent = await updatedEventRes.json();
      loadEventIntoDashboard(updatedEvent);
    } catch (err) {
      console.error("Finalize error:", err);
      alert("Error finalizing event.");
    }
  });

  // --- Edit Event ---
  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Edit Event";
  editBtn.classList.add("btn-secondary");
  editBtn.addEventListener("click", () => {
    editEvent(fullEvent);
  });

  // --- Open Post Event Report ---
  const reportBtn = document.createElement("button");
  reportBtn.textContent = "📊 Open Post-Event Report";
  reportBtn.classList.add("btn-primary");
  reportBtn.addEventListener("click", () => {
    openPostEventReport(fullEvent);
  });

  // Append buttons in clean order
  buttonContainer.appendChild(finalizeBtn);
  buttonContainer.appendChild(squareBtn);
  buttonContainer.appendChild(editBtn);
  buttonContainer.appendChild(reportBtn);

  // -----------------------------
  // 🗂 EVENT SUMMARY CARD
  // -----------------------------
  const summaryData = {
    EventID: eventID ?? "",
    Date: eventDate || "",
    eventLocation: eventLocation || "",
    Coordinator: coordinator || "",
    Status: status || "",
    EventType: fullEvent.eventType || fullEvent.EventType || "",
    NumDays: fullEvent.numDays ?? fullEvent.NumDays ?? ""
  };

  const summaryCard = createCollapsiblecard("Event Summary", summaryData);
  if (summaryCard) container.appendChild(summaryCard);
	// -----------------------------
	// 🟨 CUSTOM FIELDS CARD
	// -----------------------------
	if (fullEvent.customFields) {
	  try {
		const parsed = typeof fullEvent.customFields === "string"
		  ? JSON.parse(fullEvent.customFields)
		  : fullEvent.customFields;

		if (parsed && Object.keys(parsed).length) {
		  const customCard = createCollapsiblecard("Custom Fields", parsed);
		  container.appendChild(customCard);
		}
	  } catch (err) {
		console.error("❌ Failed to parse customFields:", err);
	  }
	}

  // -----------------------------
  // 👥 EMPLOYEE CARD (if any)
  // -----------------------------
  if (Array.isArray(fullEvent.eventEmployees) && fullEvent.eventEmployees.length) {
    const empCard = createCollapsiblecard("Employees", fullEvent.eventEmployees);
    if (empCard) container.appendChild(empCard);
  }
}

async function pullSquareSales(eventID) {
  if (!eventID) {
    alert("Missing Event ID — cannot pull Square data.");
    return;
  }

  if (!confirm("Pull Square sales for this event?")) return;

  try {
    const res = await fetch(`http://localhost:3000/api/square/sales/${eventID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Square sync failed.");
      return;
    }

    alert("Square Sales Updated!");
    console.log("Square data:", data);

    // Reload dashboard with fresh numbers
    const updatedEventRes = await fetch(`http://localhost:3000/api/events/${eventID}`);
    const updatedEvent = await updatedEventRes.json();

    loadEventIntoDashboard(updatedEvent);

  } catch (err) {
    console.error("Error pulling Square data:", err);
    alert("Error pulling Square data. Check console.");
  }
}

// ---------------------------
// 📊 Post-Event Report Viewer
// ---------------------------
async function openPostEventReport(eventData) {
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

    const res = await fetch(
      `http://localhost:3000/api/events/${eventID}/report`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const report = await res.json();
    window.currentPostEventReport = report;
    renderPostEventReport(report);
    navigateTo("postEventReportSection");
  } catch (err) {
    console.error(
      "❌ Error loading post-event report:",
      err
    );
    alert(
      "Failed to load post-event report. Check console for details."
    );
  }
}

function formatMoney(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

function Report(report) {
  const container = document.getElementById(
    "postEventReportContainer"
  );
  if (!container) return;

  const ev = report.eventInfo || {};
  const rev = report.revenue || {};
  const lab = report.labor || {};
  const exp = report.expenses || {};
  const prof = report.profit || {};

  const laborRows = lab.laborRows || [];

  container.innerHTML = `
    <div class="event-card">
      <h3>${ev.eventName || "Unnamed Event"}</h3>
      <p><strong>Date:</strong> ${
        ev.eventDate || "N/A"
      }</p>
      <p><strong>Application Date:</strong> ${
        ev.applicationDate || "N/A"
      }</p>
      <p><strong>Type:</strong> ${
        ev.eventType || "N/A"
      }</p>
      <p><strong>eventLocation:</strong> ${
        ev.eventLocation || "N/A"
      }</p>
      <p><strong>Coordinator:</strong> ${
        ev.coordinator || "N/A"
      }</p>
      <p><strong>Number of Days:</strong> ${
        ev.numDays ?? "N/A"
      }</p>
    </div>
	    <!-- 🟨 Custom Fields (dynamic) -->
    ${
      report.eventInfo.customFields &&
      Object.keys(report.eventInfo.customFields).length
        ? `
      <h3>Custom Fields</h3>
      <table class="lemondrip-table">
        <tbody>
          ${Object.entries(report.eventInfo.customFields)
            .map(
              ([key, value]) => `
            <tr>
              <td><strong>${key}</strong></td>
              <td>${value ?? ""}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `
        : ""
    }

    <h3>Revenue Summary</h3>
    <table class="lemondrip-table">
      <tbody>
        <tr><td>Gross Sales (Square)</td><td>${formatMoney(
          rev.grossSales
        )}</td></tr>
        <tr><td>Returns</td><td>${formatMoney(
          rev.refunds
        )}</td></tr>
        <tr><td>Discounts</td><td>${formatMoney(
          rev.discounts
        )}</td></tr>
        <tr><td><strong>Net Sales</strong></td><td><strong>${formatMoney(
          rev.netSales
        )}</strong></td></tr>
        <tr><td>Tips</td><td>${formatMoney(
          rev.tips
        )}</td></tr>
        <tr><td><strong>Total Collected</strong></td><td><strong>${formatMoney(
          rev.totalCollected
        )}</strong></td></tr>
        <tr><td>Food Tax</td><td>${formatMoney(
          rev.foodTax
        )}</td></tr>
        <tr><td>Square Event Charge</td><td>${formatMoney(
          rev.squareEventCharge
        )}</td></tr>
        <tr><td><strong>Total Net Revenue</strong></td><td><strong>${formatMoney(
          rev.totalNetRevenue
        )}</strong></td></tr>
      </tbody>
    </table>

    <h3>Labor</h3>
    ${
      laborRows.length
        ? `
      <table class="lemondrip-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Role</th>
            <th>Hours Worked</th>
            <th>Hourly Rate</th>
            <th>Total Pay</th>
            <th>Tips Earned</th>
          </tr>
        </thead>
        <tbody>
          ${laborRows
            .map(
              (r) => `
            <tr>
              <td>${r.employeeName || ""}</td>
              <td>${r.role || ""}</td>
              <td>${r.hoursWorked ?? ""}</td>
              <td>${
                r.hourlyRate != null
                  ? formatMoney(r.hourlyRate)
                  : ""
              }</td>
              <td>${
                r.totalPay != null
                  ? formatMoney(r.totalPay)
                  : ""
              }</td>
              <td>${
                r.tipsEarned != null
                  ? formatMoney(r.tipsEarned)
                  : ""
              }</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <p><strong>Total Labor:</strong> ${formatMoney(
        lab.laborTotal
      )}</p>
      <p><strong>Total Labor Tips:</strong> ${formatMoney(
        lab.laborTipTotal
      )}</p>
    `
        : `<p>No labor records for this event.</p>`
    }

    <h3>Expenses</h3>
    <table class="lemondrip-table">
      <tbody>
        <tr><td>Event Fee</td><td>${formatMoney(
          exp.eventFee
        )}</td></tr>
        <tr><td>Supply Fees</td><td>${formatMoney(
          exp.supplyFees
        )}</td></tr>
        <tr><td>Additional Fees</td><td>${formatMoney(
          exp.additionalFeesTotal
        )}</td></tr>
        <tr><td>Event Runner Fee</td><td>${formatMoney(
          exp.eventRunnerFee
        )}</td></tr>
        <tr><td><strong>Total Expenses</strong></td><td><strong>${formatMoney(
          exp.totalExpenses
        )}</strong></td></tr>
      </tbody>
    </table>

    <h3>Profit</h3>
    <table class="lemondrip-table">
      <tbody>
        <tr><td><strong>Net Profit before Taxes</strong></td><td><strong>${formatMoney(
          prof.profitBeforeTaxes
        )}</strong></td></tr>
        <tr><td>Utah State Tax</td><td>${formatMoney(
          prof.utahTax
        )}</td></tr>
        <tr><td>Federal Tax</td><td>${formatMoney(
          prof.federalTax
        )}</td></tr>
        <tr><td><strong>Event Profit</strong></td><td><strong>${formatMoney(
          prof.finalProfit
        )}</strong></td></tr>
      </tbody>
    </table>
  `;
}

async function downloadPostEventPDF() {
  try {
    const report = window.currentPostEventReport;
    if (!report) return alert("Report data not loaded yet.");

    // -------------------------------
    //  Event Header Information
    // -------------------------------
    const eventInfoTable = {
      table: {
        widths: ["30%", "*"],
        body: Object.entries(report.eventInfo).map(
          ([k, v]) => [
            { text: formatLabel(k), bold: true },
            String(v ?? "")
          ]
        )
      },
      margin: [0, 5, 0, 15]
    };

    // -------------------------------
    //  Revenue Table
    // -------------------------------
    const revenueTable = {
      table: {
        widths: ["30%", "*"],
        body: Object.entries(report.revenue).map(
          ([k, v]) => [
            { text: formatLabel(k), bold: true },
            money(v)
          ]
        )
      },
      margin: [0, 5, 0, 15]
    };

    // -------------------------------
    // Labor details table
    // -------------------------------
    const laborRoster = report.labor.laborRows.length
      ? {
          table: {
            widths: [
              "25%",
              "20%",
              "15%",
              "15%",
              "15%",
              "15%"
            ],
            body: [
              [
                "Employee",
                "Role",
                "Hours",
                "Rate",
                "Pay",
                "Tips"
              ].map((h) => ({ text: h, bold: true })),

              ...report.labor.laborRows.map((row) => [
                row.employeeName ?? "",
                row.role ?? "",
                row.hoursWorked ?? "",
                money(row.hourlyRate),
                money(row.totalPay),
                money(row.tipsEarned)
              ])
            ]
          },
          margin: [0, 5, 0, 15],
          layout: "lightHorizontalLines"
        }
      : {
          text: "No labor entries",
          italics: true,
          margin: [0, 10]
        };

    // Labor summary row
    const laborSummaryTable = {
      table: {
        widths: ["50%", "50%"],
        body: [
          ["Total Labor Pay", money(report.labor.laborTotal)],
          ["Total Tips Paid", money(report.labor.laborTipTotal)]
        ]
      },
      margin: [0, 5, 0, 20]
    };

    // -------------------------------
    // Expense Summary Table
    // -------------------------------
    const expenseTable = {
      table: {
        widths: ["40%", "*"],
        body: Object.entries(report.expenses).map(
          ([k, v]) => [
            { text: formatLabel(k), bold: true },
            money(v)
          ]
        )
      },
      margin: [0, 10, 0, 20]
    };

    // -------------------------------
    // Profit Summary Table
    // -------------------------------
    const profitTable = {
      table: {
        widths: ["40%", "*"],
        body: Object.entries(report.profit).map(
          ([k, v]) => [
            { text: formatLabel(k), bold: true },
            money(v)
          ]
        )
      },
      margin: [0, 5, 0, 20]
    };

    // -------------------------------
    // FINAL DOCUMENT DEFINITION
    // -------------------------------
    const docDefinition = {
      content: [
        {
          text: "🍋 LemonDrip Post-Event Report",
          style: "reportTitle"
        },
        {
          text: `Generated: ${new Date().toLocaleString()}`,
          style: "generated"
        },
        { text: " " },

        sectionHeader("Event Information"),
        eventInfoTable,

        sectionHeader("Revenue Summary"),
        revenueTable,

        sectionHeader("Labor Detail"),
        laborRoster,
        laborSummaryTable,

        sectionHeader("Expense Summary"),
        expenseTable,

        sectionHeader("Profit Summary"),
        profitTable
      ],

      styles: {
        reportTitle: {
          fontSize: 18,
          bold: true,
          alignment: "center"
        },
        generated: {
          fontSize: 9,
          italics: true,
          alignment: "center"
        },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 5]
        }
      },

      defaultStyle: { fontSize: 10 },

      pageMargins: [40, 40, 40, 40]
    };

    pdfMake
      .createPdf(docDefinition)
      .download(
        `PostEventReport_${report.eventInfo.eventName}.pdf`
      );
  } catch (err) {
    console.error("PDF export failed:", err);
    alert("PDF generation failed. Check console.");
  }
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
  const files = document.getElementById("permitFiles").files;
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

function createCollapsiblecard(title, data) {
  if (!data) return null;

  const wrapper = document.createElement("div");
  wrapper.classList.add("collapsible-card");

  const header = document.createElement("button");
  header.classList.add("collapsible-header");
  header.innerHTML = title;

  const content = document.createElement("div");
  content.classList.add("collapsible-content");
  content.style.display = "none";

  // Render table if data is array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      content.textContent = "No data available.";
    } else {
      const table = document.createElement("table");
      table.classList.add("lemondrip-table");

      const headerRow = table.createTHead().insertRow();
      Object.keys(data[0]).forEach((key) => {
        const th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
      });

      const tbody = table.createTBody();
      data.forEach((row) => {
        const tr = tbody.insertRow();
        Object.values(row).forEach((v) => {
          const td = tr.insertCell();
          if (String(v).startsWith("http")) {
            // File download links
            td.innerHTML = `<a href="${v}" target="_blank">Download</a>`;
          } else {
            td.textContent = v ?? "";
          }
        });
      });

      content.appendChild(table);
    }
  } else {
    const infoList = document.createElement("div");
    infoList.classList.add("info-list");

    Object.entries(data).forEach(([key, value]) => {
      const row = document.createElement("div");
      row.classList.add("info-row");

      row.innerHTML = `
        <span class="info-key">${key.replace(
          /([A-Z])/g,
          " $1"
        )}</span>
        <span class="info-value">${value ?? ""}</span>
      `;

      infoList.appendChild(row);
    });

    content.appendChild(infoList);
  }

  header.addEventListener("click", () => {
    content.style.display =
      content.style.display === "none" ? "block" : "none";
  });

  wrapper.appendChild(header);
  wrapper.appendChild(content);

  return wrapper;
}

window.addEventListener("DOMContentLoaded", () => {
  populateTemplateDropdown(); // populate dropdown on startup
  loadEvents();
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
