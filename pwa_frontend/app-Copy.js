// ---------------------------
// 🧭 Simple Client Router (cleaned)
// activeEvent -placeholder for the current event being acted upon
// currentAction - whatever the current action is. The default is the Search action
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

function loadAppState() {
  const saved = localStorage.getItem("lemon_app_state");
  if (!saved) {
    // default: show Manage Events
    navigateTo("manageSection");
    return;
  }
  try {
    const state = JSON.parse(saved);
    const sectionId = (state.activeAction ? state.activeAction : "manage") + "Section";
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
  const action = event.state?.action || location.hash.replace("#/", "");
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
  } else if (obj !== null && typeof obj === 'object') {
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
  document.querySelectorAll("section").forEach(sec => sec.classList.add("hidden"));
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth" });
	if (sectionId === "addSection") {
      /*populateTemplateDropdown(); // 🔹 Populate templates when Add Event opens
	  setTimeout(() => {
    const dropdown = document.getElementById("templateSelect");
    if (dropdown) {
      populateTemplateDropdown();
    } else {
      console.warn("⚠️ Template dropdown not found yet, retrying...");*/
      setTimeout(populateTemplateDropdown, 300); // retry once after 300ms
    }
  } else {
    console.warn(`⚠️ Section "${sectionId}" not found`);
  }
}

// ✅ Removed old showSection() entirely

// ---------------------------
// 🟡 LemonDrip Expandable Table Builder
// modified 10-17-25 8:30 am.
// ---------------------------
function buildTableHTML(results, containerId = "searchResults") {
  const container = document.getElementById(containerId) || document.body;
  container.innerHTML = '';

  if (!results.length) {
    container.textContent = 'No matching events found.';
    return;
  }

  const table = document.createElement('table');
  table.classList.add('results-table', 'lemondrip-table');

  const header = table.createTHead();
  const headerRow = header.insertRow();
  Object.keys(results[0]).forEach(key => {
    const th = document.createElement('th');
    th.textContent = key;
    headerRow.appendChild(th);
  });

  const body = table.createTBody();
  results.forEach(event => {
    const tr = body.insertRow();
    Object.values(event).forEach(val => {
      const td = tr.insertCell();
      td.textContent = val ?? '';
    });

    tr.addEventListener('click', async () => {
  try {
    const eventId = event["Event ID"] || event.EventID;
    if (!eventId) {
      console.warn("⚠️ No EventID found for clicked row:", event);
      alert("Event ID missing — cannot load details.");
      return;
    }

        const res = await fetch(`http://localhost:3000/api/events/${eventId}`);
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const fullEvent = await res.json();
        loadEventIntoDashboard(fullEvent);
      } catch (err) {
        console.error("❌ Error loading event details:", err);
        alert("Could not load event details.");
      }
    });
  });

  container.appendChild(table);
}


function clearEventForm() {
  const formEl = document.getElementById('eventForm');
  if (!formEl) return;

  // Reset all input, select, and textarea elements
  const inputs = formEl.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    // For text, date, number, etc.
    if (input.type !== 'checkbox' && input.type !== 'radio') {
      input.value = '';
    }
    // For checkboxes and radios
    else {
      input.checked = false;
    }
  });
}

			
// List all
async function loadAllEvents() {
  const res = await fetch("http://localhost:3000/api/events");
  const data = await res.json();
  const events = data.Events || [];
  const formatted = events.map(e => ({
  "Event ID": e["Event ID"] ?? e.EventID,
  "Event Name": e["Event Name"] ?? e.EventName,
  "Event Date": e["Event Date"] ?? e.EventDate,
  "Event Coordinator": e["Event Coordinator"] ?? e.EventCoordinator,
  "Event Location": e["Event Location"] ?? e.Location,
  "Status": e["Event Status"] ?? e.Status
}));
  buildTableHTML(formatted, "manageResults");
}

// Search
async function manageSearch() {
  const name = document.getElementById("manageSearchName").value.trim();
  const date = document.getElementById("manageSearchDate").value.trim();
  const id   = document.getElementById("manageSearchID").value.trim();

  const qs = new URLSearchParams();
  if (name) qs.set("name", name);
  if (date) qs.set("date", date);
  if (id)   qs.set("id", id);

  const url = qs.toString()
    ? `http://localhost:3000/api/events?${qs.toString()}`
    : `http://localhost:3000/api/events`;

  const res = await fetch(url);
  const data = await res.json();
  const events = data.Events || [];
  const formatted = events.map(e => ({
  "Event ID": e["Event ID"] ?? e.EventID,
  "Event Name": e["Event Name"] ?? e.EventName,
  "Event Date": e["Event Date"] ?? e.EventDate,
  "Event Coordinator": e["Event Coordinator"] ?? e.EventCoordinator,
  "Event Location": e["Event Location"] ?? e.Location,
  "Status": e["Event Status"] ?? e.Status
}));
  buildTableHTML(formatted, "manageResults");
}


//---------------
// Add Company - get company information for potential SASS down the road.
//----------------
async function addCompany(event) {
 const data = {
    companyName: document.getElementById("companyName").value.trim(),
    address: document.getElementById("address").value.trim(),
    city: document.getElementById("city").value.trim(),
    state: document.getElementById("state").value.trim(),
    postalCode: document.getElementById("postalCode").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    vendorCategory: document.getElementById("vendorCategory").value.trim()
  };

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
// ---------------------------
async function buildExpandedDetails(event) {
  const sections = [];
  // (Unchanged from your logic)
}

// ---------------------------
// ✅ Safe Dashboard Loader
// ---------------------------
function loadEventIntoDashboard(event) {
  const dashSection = document.getElementById("dashboardSection");
  const dash = document.getElementById("dashboard");
  if (!dashSection || !dash) return;

  dashSection.classList.remove("hidden");
  dash.style.display = "block";
  dash.innerHTML = ""; // Clear old content

  const info = event.EventInfo || event;

  // 🌟 Main event summary card
  const summary = document.createElement("div");
  summary.classList.add("event-card");
  summary.innerHTML = `
    <h2>${info["Event Name"] || "Unnamed Event"}</h2>
    <p><strong>Date:</strong> ${info["Event Date"] || "N/A"}</p>
    <p><strong>Application Date:</strong> ${info["App Date"] || "N/A"}</p>
    <p><strong>Event Color:</strong> ${info["Event Color"] || "N/A"}</p>
    <p><strong>Coordinator:</strong> ${info["Event Coordinator"] || "N/A"}</p>
    <p><strong>Event Fee:</strong> ${info["Event Fee"] || "N/A"}</p>
    <p><strong>Location:</strong> ${info["Event Location"] || "N/A"}</p>
    <p><strong>Time:</strong> ${info["Event Time(s)"] || "N/A"}</p>
    <p><strong>Permits:</strong> ${info["Event Docs"] || "N/A"}</p>
    <p><strong>Employees:</strong> ${info["Event Employees"] || "N/A"}</p>
    <p><strong>Event Rating:</strong> ${info["Event Rating"] || "N/A"}</p>
    <p><strong>Event Host:</strong> ${info["Event Host"] || "N/A"}</p>
    <p><strong>Notes:</strong> ${info["Event Notes"] || "N/A"}</p>
    <p><strong>Status:</strong> ${info["Event Status"] || "N/A"}</p>
  `;
  dash.appendChild(summary);

  // 🪄 Helper: create collapsible card
  function createCollapsibleCard(title, dataArray) {
    if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) return null;
    const card = document.createElement("div");
    card.classList.add("collapsible-card");

    const header = document.createElement("div");
    header.classList.add("collapsible-header");
    header.innerHTML = `<strong>${title}</strong> <span>▼</span>`;

    const content = document.createElement("div");
    content.classList.add("collapsible-content");

    const table = document.createElement("table");
    table.classList.add("sub-table");

    const keys = Object.keys(dataArray[0]);
    const thead = table.createTHead();
    const headRow = thead.insertRow();
    keys.forEach(k => {
      const th = document.createElement("th");
      th.textContent = k;
      headRow.appendChild(th);
    });

    const tbody = table.createTBody();
    dataArray.forEach(row => {
      const tr = tbody.insertRow();
      keys.forEach(k => {
        const td = tr.insertCell();
        td.textContent = row[k] ?? "";
      });
    });

    content.appendChild(table);
    content.style.display = "none";

    header.addEventListener("click", () => {
      const isOpen = content.style.display === "block";
      content.style.display = isOpen ? "none" : "block";
      header.querySelector("span").textContent = isOpen ? "▼" : "▲";
    });

    card.appendChild(header);
    card.appendChild(content);
    return card;
  }

  // 🎯 Add collapsible cards for each major dataset
  const subSections = [
    ["Employees", event.Employees || event.EmployeeTracker?.Data],
    ["Drink Sales", event.DrinksSold || event.DrinkSales?.Data],
    ["Additional Fees", event.AdditionalFees || event.AdditionalFees?.Data],
    ["Discounts", event.Discounts || event.Discounts?.Data],
    ["Supply Cost", event.SupplyCost || event.SupplyCost?.Data],
    ["Tip Tracker", event.TipTracker || event.TipTracker?.Data],
    ["Event Runner Fees", event.EventRunnerFees || event.EventRunnerFees?.Data]
  ];

  subSections.forEach(([title, data]) => {
    const card = createCollapsibleCard(title, data);
    if (card) dash.appendChild(card);
  });

  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Edit This Event";
  editBtn.classList.add("edit-btn");
  editBtn.addEventListener("click", () => editEvent(event));
  summary.appendChild(editBtn);

  dash.scrollIntoView({ behavior: "smooth" });
}



async function editEvent(event) {
  const info = event.EventInfo || event;

  // 🔹 Show Add/Edit form
  navigateTo('addSection');

  // 🔹 Determine which template is active (Default Template or otherwise)
  const activeTemplateName = document.getElementById('templateSelect')?.value || "Default Template";
  const template = window.availableTemplates?.find(t => t.templateName === activeTemplateName);

  if (!template) {
    alert("⚠️ Template not found. Please load a template first.");
    return;
  }

  // 🔹 Rebuild the form from the template
  rebuildAddEventForm(template);

  // 🔹 Loop through all inputs and prefill with existing event data
  const formContainer = document.getElementById('eventForm');
  const inputs = formContainer.querySelectorAll('input, select, textarea');

  inputs.forEach(input => {
    const label = input.id.replace(/^form_/, '').replace(/_/g, ' ');
    const match = Object.keys(info).find(k => k.toLowerCase() === label.toLowerCase());
    if (match) {
      const val = info[match];
      if (input.multiple && Array.isArray(val)) {
        // For multiselects, mark selected options
        Array.from(input.options).forEach(opt => {
          opt.selected = val.includes(opt.value);
        });
      } else {
        input.value = val ?? "";
      }
    }
  });

  // 🔹 Remember which event is being edited
  window.editingEventID = event.EventID;
  console.log("Editing event:", window.editingEventID);
}



// ---------------------------
// 🔍 Search Events Function (Fixed for Flat or Nested JSON)
// modified by: Steve Woodis 10-17-25
// ---------------------------

// ---------------------------
// 🔍 Search Events (Safe for Manage Events)
// ---------------------------
async function searchEvents() {
  const nameEl = document.getElementById("searchName");
  const dateEl = document.getElementById("searchDate");
  const idEl   = document.getElementById("searchID");

  const name = nameEl ? nameEl.value.trim().toLowerCase() : "";
  const date = dateEl ? dateEl.value.trim() : "";
  const id   = idEl   ? idEl.value.trim() : "";

  // Load events if not already loaded
  if (!Array.isArray(window.events) || !window.events.length) {
    await loadEvents();
  }

  let results = window.events.filter(e => {
    const info = e.EventInfo || e;
    const eventName = (info["Event Name"] || "").toLowerCase();
    const eventDate = info["Event Date"] || "";
    const eventID = e.EventID?.toString() || info["Event ID"]?.toString() || "";
    return (
      (!name || eventName.includes(name)) &&
      (!date || eventDate === date) &&
      (!id || eventID.includes(id))
    );
  });

  const formatted = results.map(e => {
    const info = e.EventInfo || e;
    return {
      "Event ID": e.EventID,
      "Event Name": info["Event Name"] || "",
      "Event Date": info["Event Date"] || "",
      "Event Coordinator": info["Event Coordinator"] || info["Coordinator"] || "",
      "Event Location": info["Event Location"] || info["Location"] || "",
      "Event Host": info["Event Host"] || info["Host"] || ""
    };
  });

  // 🔹 Decide where to render results
  const targetContainer = document.getElementById("manageResults") 
                       || document.getElementById("searchResults");

  if (!targetContainer) {
    console.warn("⚠️ No valid container (#manageResults or #searchResults) found for search results.");
    return;
  }

  buildTableHTML(formatted, targetContainer.id);
  console.log(`Rendered ${formatted.length} event(s) into ${targetContainer.id}.`);
}


// ---------------------------
// 📝 Add / Submit New Event (Auto-Navigate Back to Search)
// modified by: Steve Woodis 10-17-25
// ---------------------------
async function submitEvent() {
  const formEl = document.getElementById('eventForm');
  const inputs = formEl.querySelectorAll('input, select, textarea');
  
  const newEvent = {};
  inputs.forEach(input => {
    const key = input.id.replace(/^form_/, '').replace(/_/g, ' ');
    newEvent[key] = input.value.trim();
  });

  if (!newEvent["Event Name"] || !newEvent["Event Date"]) {
    alert("Please provide at least an event name and date.");
    return;
  }

  console.log("📤 Sending data to backend:", JSON.stringify(newEvent, null, 2));

  try {
    const response = await fetch("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEvent)
    });

    console.log("Server response", response.status);

    if (!response.ok) throw new Error(`Server error ${response.status}`);
    const result = await response.json();
    console.log("✅ Saved:", result);
    alert("New event added successfully!");

    clearEventForm();
    await loadEvents();

    // ✅ Redirect user to Manage Events if available
    if (document.getElementById("manageSection")) {
      navigateTo("manageSection");
      loadAllEvents();
    } else {
      // fallback for legacy mode
      navigateTo("searchSection");
      searchEvents();
    }

  } catch (err) {
    console.error("❌ Error saving event:", err.message || err);
    alert("Failed to save event. See console for details.");
  }
}


async function loadEvents() {
  try {
    const res = await fetch("http://localhost:3000/api/events");
    const newEvent = await res.json();
    window.events = newEvent.Events || [];
    console.log(`✅ Loaded ${window.events.length} events from backend`);
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

  const summaryCard = document.getElementById("summaryCard");
  if (summaryCard) summaryCard.style.display = "none";

  const dashboard = document.getElementById("dashboard");
  if (dashboard) dashboard.style.display = "none";

  console.log("🔄 Search fields and results cleared.");
}


function addFieldToTemplate() {
  const label = document.getElementById('builderLabel').value.trim();
  const type = document.getElementById('builderType').value;
  const required = document.getElementById('builderRequired').checked;
  const optionsInput = document.getElementById('builderOptions').value.trim();

  if (!label) {
    alert("Please enter a field label.");
    return;
  }

  const newField = { label, type, required };
  if (['select', 'multiselect'].includes(type)) {
    if (!optionsInput) {
      alert("Please enter options for dropdowns or multiselects.");
      return;
    }
    newField.options = optionsInput.split(',').map(o => o.trim());
  }

  formTemplate.fields.push(newField);
  renderFormPreview();
  document.getElementById('builderLabel').value = '';
  document.getElementById('builderOptions').value = '';
}

function renderFormPreview() {
  const preview = document.getElementById('formPreview');
  preview.innerHTML = '';

  formTemplate.fields.forEach(field => {
    const labelEl = document.createElement('label');
    labelEl.textContent = field.label + (field.required ? ' *' : '');
    let input;

    switch (field.type) {
      case 'select':
      case 'multiselect':
        input = document.createElement('select');
        if (field.type === 'multiselect') input.multiple = true;
        field.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          input.appendChild(option);
        });
        break;
      case 'textarea':
        input = document.createElement('textarea');
        break;
      default:
        input = document.createElement('input');
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
    const response = await fetch("http://localhost:3000/api/formtemplates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

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
    selector.innerHTML = '<option value="">-- Select Template --</option>';

    templates.forEach(tpl => {
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
    addDropdown.innerHTML = '<option value="">-- Select Template --</option>';
    templates.forEach(tpl => {
      const opt = document.createElement("option");
      opt.value = tpl.templateName;
      opt.textContent = tpl.templateName;
      addDropdown.appendChild(opt);
    });

    // Fill Design Form dropdown (if visible)
    const designDropdown = document.getElementById("templateSelector");
    if (designDropdown) {
      designDropdown.innerHTML = '<option value="">-- Select Template --</option>';
      templates.forEach(tpl => {
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
function useSelectedTemplate() {
  const selected = document.getElementById("templateSelect").value;
  if (!selected) {
    alert("Please select a template first.");
    return;
  }
console.log('Template value', selected);


  const template = window.availableTemplates.find(t => t.templateName === selected);
  if (!template) {
    alert("Template not found!");
    return;
  }
  
  
  console.log("📋 Loading template into Add Event form:", template);
  rebuildAddEventForm(template);
  alert(`✅ Loaded template: "${template.templateName}"`);
}

function activateTemplate() {
  const selector = document.getElementById("templateSelector");
  if (!selector) {
    console.warn("activateTemplate called but #templateSelector not found");
    return;
  }

  const selectedName = selector.value;
  if (!selectedName) {
    alert("Please select a template to activate.");
    return;
  }
  const tpl = window.availableTemplates.find(t => t.templateName === selectedName);
	  if (!tpl) {
		alert("Template not found!");
		return;
	  }
  console.log("Activating template:", tpl.templateName);
  rebuildAddEventForm(tpl);
  alert(`✅ "${tpl.TemplateName}" activated!`);
}


function rebuildAddEventForm(template) {
  const formContainer = document.getElementById("eventForm");
  formContainer.innerHTML = ""; // clear old fields

  if (!template || !template.fields || !Array.isArray(template.fields)) {
    console.error("❌ Invalid template structure:", template);
    formContainer.innerHTML = "<p>Template could not be loaded.</p>";
    return;
  }

  template.fields.forEach(field => {
    // Create label
    const labelEl = document.createElement("label");
    labelEl.textContent = field.label + (field.required ? " *" : "");

    // Create input
    let input;
    switch (field.type) {
      case "select":
      case "multiselect":
        input = document.createElement("select");
        if (field.type === "multiselect") input.multiple = true;
        (field.options || []).forEach(optVal => {
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
    input.id = "form_" + field.label.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

    labelEl.appendChild(input);
    formContainer.appendChild(labelEl);
  });

  // Add buttons
  const btnContainer = document.createElement("div");
  btnContainer.classList.add("form-buttons");
  btnContainer.innerHTML = `
    <button type="submit">💾 Save New Event</button>
    <button type="button" onclick="clearEventForm()">⬅️ Cancel</button>
  `;
  formContainer.appendChild(btnContainer);
}


window.addEventListener("DOMContentLoaded", () => {
  loadTemplates(); // populate dropdown on startup
  loadEvents();
});

function clearTemplate() {
  formTemplate.fields = [];
  renderFormPreview();
}

document.getElementById('builderType').addEventListener('change', (e) => {
  document.getElementById('optionsLabel').style.display =
    ['select', 'multiselect'].includes(e.target.value) ? 'block' : 'none';
});
