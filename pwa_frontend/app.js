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
	  settimeout(() => {
    const dropdown = document.getElementById("templateSelect");
    if (dropdown) {
      populateTemplateDropdown();
    } else {
      console.warn("⚠️ Template dropdown not found yet, retrying...");*/
      setTimeout(() => {
		const dropdown = document.getElementById("templateSelect");
		if (dropdown && dropdown.options.length > 1 && !dropdown.value) {
			dropdown.value = dropdown.options[1].value; // pick first real template
			}
		}, 500);
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
    const eventID = event["eventID"] || event.eventID;
		
    if (!eventID) {
      console.warn("⚠️ No eventID found for clicked row:", event);
      alert("eventID missing — cannot load details.");
      return;
    }

        const res = await fetch(`http://localhost:3000/api/events/${eventID}`);
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
		
		
        const fullEvent = await res.json();
		const empRes = await fetch(`http://localhost:3000/api/events/${eventID}/employees`);
		const empData = await empRes.json();
		
		fullEvent.eventEmployees = empData;
		
		console.log("Fullevent is :",fullEvent);
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
    eventID: e.eventID ?? e.EventID ?? e["Event ID"],
    eventName: e.eventName ?? e["Event Name"],
    eventDate: e.eventDate ?? e["Event Date"],
    coordinator: e.coordinator ?? e.EventCoordinator ?? e["Event coordinator"],
    location: e.location ?? e.EventLocation ?? e["Event location"],
    status: e.status ?? e.Status ?? e["Event status"]
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
  "Event ID": e["Event ID"] ?? e.eventID,
  "eventName": e["eventName"] ?? e.eventName,
  "eventDate": e["eventDate"] ?? e.eventDate,
  "Event coordinator": e["Event coordinator"] ?? e.Eventcoordinator,
  "Event location": e["Event location"] ?? e.location,
  "status": e["Event status"] ?? e.status
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
function loadEventIntoDashboard(row) {
  // when GET /api/events/:id returns the EventInfo row directly:
  const info = row.EventInfo || row; // keep backward compat with your legacy payload

  const dash = document.getElementById("dashboard");
  const dashSection = document.getElementById("dashboardSection");
  dashSection.classList.remove("hidden");
  dash.style.display = "block";
  dash.innerHTML = "";

  const summary = document.createElement("div");
  summary.classList.add("event-card");

  const yesNo = v => (v ? "Yes" : "No");

  summary.innerHTML = `
    <h2>${info["eventName"] || "Unnamed Event"}</h2>
    <p><strong>Date:</strong> ${info["eventDate"] || "N/A"}</p>
    <p><strong>applicationDate:</strong> ${info["applicationDate"] || "N/A"}</p>
    <p><strong>Finalized Date:</strong> ${info["finalizedDate"] || "N/A"}</p>
    <p><strong>coordinator:</strong> ${info["coordinator"] || "N/A"}</p>
    <p><strong>eventFee:</strong> ${info["eventFee"] ?? "N/A"}</p>
    <p><strong>location:</strong> ${info["location"] || "N/A"}</p>
    <p><strong>time:</strong> ${info["time"] || "N/A"}</p>
    <p><strong>permits:</strong> ${info["permits"] || "N/A"}</p>
    <p><strong>employees:</strong> ${info["employees"] || "N/A"}</p>
    <p><strong>eventRating:</strong> ${info["eventRating"] || "N/A"}</p>
    <p><strong>eventHost:</strong> ${info["eventHost"] || "N/A"}</p>
    <p><strong>notes:</strong> ${info["notes"] || "N/A"}</p>
    <p><strong>status:</strong> ${info["status"] || "N/A"}</p>
    <p><strong>Event Type:</strong> ${info["eventType"] || "N/A"}</p>
    <p><strong>numDays:</strong> ${info["numDays"] ?? "N/A"}</p>
    <p><strong>grossSales:</strong> ${info["grossSales"] ?? 0}</p>
    <p><strong>tips:</strong> ${info["tips"] ?? 0}</p>
    <p><strong>netSales:</strong> ${info["netSales"] ?? 0}</p>
    <p><strong>totalSales:</strong> ${info["totalSales"] ?? 0}</p>
    <p><strong>Finalized?</strong> ${yesNo(info["isFinalized"])}</p>
  `;
  dash.appendChild(summary);

  // keep your Edit button + Square button as you have them now



  // 🪄 Helper: create collapsible card
  function createCollapsiblecard(title, dataArray) {
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
    ["Employee Tracking", event.eventEmployees],
    ["Drink Sales", event.DrinksSold || event.DrinkSales?.Data],
    ["Additional Fees", event.AdditionalFees || event.AdditionalFees?.Data],
    ["discounts", event.discounts || event.discounts?.Data],
    ["Supply Cost", event.SupplyCost || event.SupplyCost?.Data],
    ["Tip Tracker", event.TipTracker || event.TipTracker?.Data],
    ["Event Runner Fees", event.EventRunnerFees || event.EventRunnerFees?.Data]
  ];

  subSections.forEach(([title, data]) => {
    const card = createCollapsiblecard(title, data);
    if (card) dash.appendChild(card);
  });

  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Edit This Event";
  editBtn.classList.add("edit-btn");
  editBtn.addEventListener("click", () => editEvent(event));
  summary.appendChild(editBtn);

	const salesBtn = document.createElement("button");
	salesBtn.textContent = "💳 Load Square Sales";
	salesBtn.classList.add("edit-btn");
	salesBtn.addEventListener("click", async () => {
  const id = event.eventID || event.EventInfo?.["Event ID"];
  if (!id) return alert("Missing eventID");

  try {
    const res = await fetch(`http://localhost:3000/api/square/sales/${id}`, {
		method: "PUT",
		headers: {"Content-Type": "application/json" }
	});
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const payload = await res.json();
	
	 console.log("📦 Square API payload:", JSON.stringify(payload, null, 2));
	
	
    let el = document.getElementById("dashSquareInfo");
    if (!el) {
      el = document.createElement("p");
      el.id = "dashSquareInfo";
      summary.appendChild(el);
    }
    const t = payload.totals || {};
    el.innerHTML = `
      <strong>Square Sales:</strong>
      Gross $${(t.gross ?? 0).toFixed(2)} |
      tips $${(t.tips ?? 0).toFixed(2)} |
      Refunds $${(t.refunds ?? 0).toFixed(2)} |
      Net $${(t.netSales ?? 0).toFixed(2)} |
      Collected $${(t.totalCollected ?? 0).toFixed(2)}
    `;
  } catch (err) {
    console.error(err);
    alert("Failed to pull Square sales. See console.");
  }
});
summary.appendChild(salesBtn);

  dash.scrollIntoView({ behavior: "smooth" });
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

  // 🔹 Show Add/Edit form
  navigateTo('addSection');

  // 🔹 Determine which template is active (Default Template or otherwise)
  const activeTemplateName = document.getElementById('templateSelect')?.value || "Default Template";
  console.log("Current template is:", activeTemplateName);
  
  const template = window.availableTemplates?.find(t => t.templateName === activeTemplateName);

  if (!template) {
    alert("⚠️ Template not found. Please load a template first.");
    return;
  }
	window.isListing = true;
	window.editingeventID = event.eventID;
	window.activeEvent = eventData;
	
  // 🔹 Rebuild the form from the template
  rebuildAddEventForm(stripEventColorFromTemplate(template));

  // 🔹 Loop through all inputs and prefill with existing event data
  const formContainer = document.getElementById('eventForm');
  const inputs = formContainer.querySelectorAll('input, select, textarea');

	console.log("Newly Edited Form:", inputs);
	
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
    const eventName = (info["eventName"] || "").toLowerCase();
    const eventDate = info["eventDate"] || "";
    const eventID = e.eventID?.toString() || info["Event ID"]?.toString() || "";
    return (
      (!name || eventName.includes(name)) &&
      (!date || eventDate === date) &&
      (!id || eventID.includes(id))
    );
  });

  const formatted = results.map(e => {
    const info = e.EventInfo || e;
    return {
      "Event ID": e.eventID,
      "eventName": info["eventName"] || "",
      "eventDate": info["eventDate"] || "",
      "Event coordinator": info["Event coordinator"] || info["coordinator"] || "",
      "Event location": info["Event location"] || info["location"] || "",
      "eventHost": info["eventHost"] || info["Host"] || ""
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
/*async function submitEvent() {
  const formEl = document.getElementById('eventForm');
  const inputs = formEl.querySelectorAll('input, select, textarea');

  const newInfo = {};
  inputs.forEach(input => {
    const label = input.id.replace(/^form_/, '').replace(/_/g, ' ');
    newInfo[label] = input.value.trim();
  });
console.log("newInfo Object data is: ", newInfo);

  // Validate minimal info
  if (!newInfo["eventName"] || !newInfo["eventDate"]) {
    alert("Please provide at least an eventName and date.");
    return;
  }

  try {
    // 🚀 Branch logic: Insert or Update
    if (window.isEditing && window.activeeventID) {
      console.log("🛠️ Editing existing event:", window.activeeventID);
	  
	  // Collect employees + hours worked
	const employeeSelects = [...formEl.querySelectorAll("select[id*='employees']")];
	const selectedEmployees = [];

	employeeSelects.forEach(sel => {
	  // hours input associated with this employee select
	  const hoursInput = formEl.querySelector(`input[data-employee-hours='${sel.id}']`);
	  const hoursWorked = hoursInput ? hoursInput.value || null : null;

	  if (sel.multiple) {
		[...sel.selectedOptions].forEach(opt => {
		  selectedEmployees.push({
			EmployeeID: opt.value,
			hoursWorked
		  });
		});
	  } else if (sel.value) {
		selectedEmployees.push({
		  EmployeeID: sel.value,
		  hoursWorked
		});
	  }
	});


      const res = await fetch(`http://localhost:3000/api/events/${window.activeeventID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInfo),
      });
      const data = await res.json();
      alert(data.message || "Event updated successfully!");
    } else {
      console.log("🆕 Creating new event...");
      const res = await fetch("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInfo),
      });
      const data = await res.json();
      alert(data.message || "Event saved successfully!");
    }
	 if (selectedEmployees.length) {
	  const eventID = method === "POST"
		? data.eventID
		: window.activeeventID;

	  await fetch(`http://localhost:3000/api/events/${eventID}/employees`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(selectedEmployees)
	  });
	}


    // ✅ Reset flags and reload
    window.isEditing = false;
    window.activeeventID = null;
    loadEvents();

  } catch (err) {
    console.error("❌ Error saving event:", err);
    alert("Error saving event: " + err.message);
  }
}
*/

async function loadEvents() {
  try {
    const res = await fetch("http://localhost:3000/api/events");
    const newEvent = await res.json();
    window.events = Array.isArray(newEvent) ? newEvent : newEvent.Events || [];
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
function coerceForApi(obj) {
  const num = k => (obj[k] === "" || obj[k] == null) ? null : Number(obj[k]);
  const int = k => (obj[k] === "" || obj[k] == null) ? null : parseInt(obj[k], 10);
  const str = k => (obj[k] == null || obj[k] === "") ? null : String(obj[k]);
  const bool = k => (obj[k] === true || obj[k] === "true" || obj[k] === "1") ? true : false;

  // normalize every canonical field
  obj["eventFee"]    = int("eventFee");
  obj["numDays"]      = int("numDays");
  obj["grossSales"]  = num("grossSales");
  obj["tips"]         = num("tips");
  obj["netSales"]    = num("netSales");
  obj["totalSales"]  = num("totalSales");
  obj["isFinalized"]  = bool("isFinalized");
  return obj;
}

async function submitEvent() {
  const formEl = document.getElementById("eventForm");
  if (!formEl) {
    alert("Form not found!");
    return;
  }

  const inputs = formEl.querySelectorAll("input, select, textarea");
  const newInfo = {};

  inputs.forEach(input => {
    const rawId = input.id || "";
    const label = rawId.startsWith("form_")
  ? rawId.replace(/^form_/, "")
        .split("_")
        .map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1))
        .join("")
  : rawId;

    if (!label) return; // skip unlabelled fields

    if (input.type === "checkbox") {
      newInfo[label] = input.checked ? 1 : 0;
    } else {
      newInfo[label] = input.value?.trim() || null;
    }
  });
	console.log("NewInfo Object: ", newInfo);
  // Basic validation
  if (!newInfo.eventName || !newInfo.eventDate) {
    alert("Please provide at least an eventName and date.");
    return;
  }

  const url = window.isEditing && window.activeeventID
    ? `http://localhost:3000/api/events/${window.activeeventID}`
    : `http://localhost:3000/api/events`;
  const method = window.isEditing ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newInfo)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("🚨 Backend error:", data);
      throw new Error(data.error || "Server error saving event.");
    }

    alert(method === "PUT"
      ? (data.message || "Event updated successfully!")
      : "Event saved successfully! New ID: " + data["eventID"]);

    // Reset state
    window.isEditing = false;
    window.activeeventID = null;

    await loadEvents();
    navigateTo("manageSection");
  } catch (err) {
    console.error("❌ Error saving event:", err);
    alert("Error saving event: " + err.message);
  }
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

  const summarycard = document.getElementById("summarycard");
  if (summarycard) summarycard.style.display = "none";

  const dashboard = document.getElementById("dashboard");
  if (dashboard) dashboard.style.display = "none";

  console.log("🔄 Search fields and results cleared.");
}
async function populateEmployeeDropdown(selectEl) {
  try {
    const res = await fetch("http://localhost:3000/api/employees");
    const employees = await res.json();

    selectEl.innerHTML = '<option value=""> -- Select Employee -- </option>';

    employees.forEach(emp => {
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
// Helper to strip 'Event Color' field from templates defensively
function stripEventColorFromTemplate(tpl){
  if (!tpl || !Array.isArray(tpl.fields)) return tpl;
  tpl.fields = tpl.fields.filter(f => !(f && typeof f.label === "string" && /^event\s*color$/i.test(f.label)));
  return tpl;
}

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
  rebuildAddEventForm(stripEventColorFromTemplate(template));
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
  rebuildAddEventForm(stripEventColorFromTemplate(tpl));
  alert(`✅ "${tpl.TemplateName}" activated!`);
}


function rebuildAddEventForm(template) {
  const formContainer = document.getElementById("eventForm");

  // 🧠 Keep existing event data if present
  const existing = window.activeEvent || {};

  // Only clear the form if we’re not editing an event
  if (!window.activeEvent) {
    formContainer.innerHTML = ""; // clear old fields
  } else {
    // If editing, just rebuild structure but preserve data
    formContainer.innerHTML = "";
  }

  if (!template || !template.fields || !Array.isArray(template.fields)) {
    console.error("❌ Invalid template structure:", template);
    formContainer.innerHTML = "<p>Template could not be loaded.</p>";
    return;
  }

  (template.fields[0]?.fields || template.fields).forEach(field => {
    // Skip deprecated "Event Color"
    if (field && typeof field.label === "string" && /^event\s*color$/i.test(field.label)) {
      return;
    }
	
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
	const safeLabel = String(field.label).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    input.id = "form_" + safeLabel;

    
	if (/^employees$/i.test(field.label) && field.type === "select") {
			// dynamically populate from EmployeeTracker
			populateEmployeeDropdown(input);
			// Add Hours Worked field linked to this employee dropdown
		if (/^employees$/i.test(field.label)) {
			const hoursInput = document.createElement("input");
			hoursInput.type = "number";
			hoursInput.min = "0";
			hoursInput.step = "0.25";
			hoursInput.placeholder = "Hours Worked";
			hoursInput.classList.add("hours-worked");
			hoursInput.setAttribute("data-employee-hours", input.id);

			formContainer.appendChild(hoursInput);
		}

	}
		const lbl = typeof field.label === "string" ? field.label : "";
		
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
          : savedVal.toString().split(",").map(v => v.trim());
        for (const opt of input.options) {
          if (values.includes(opt.value)) opt.selected = true;
        }
      } else if (input.tagName === "SELECT") {
        input.value = savedVal;
      } else if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
        input.value = savedVal;
      }
    }

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
  populateTemplateDropdown(); // populate dropdown on startup
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
