// =============================================================
// RECIPES & SALES FEES — Frontend Module
// Paste this entire block into app.js
// =============================================================


// ==============================================================
// 🍋 RECIPES SECTION
// ==============================================================

async function loadRecipesSection() {
  const section = document.getElementById('recipesSection');
  if (!section) return;
  section.innerHTML = `
    <div class="section-header">
      <h2>Recipe Cards</h2>
      <div class="header-actions">
        <a href="/api/recipes/template" class="btn btn-secondary btn-sm">⬇ Download CSV Template</a>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
          ⬆ Upload CSV
          <input type="file" accept=".csv" style="display:none" onchange="handleRecipeCSVUpload(event)">
        </label>
        <button class="btn btn-primary btn-sm" onclick="showNewRecipeForm()">+ New Recipe</button>
      </div>
    </div>
    <div id="recipeUploadStatus" style="margin-bottom:12px;"></div>
    <div id="recipesList"><div class="loading-spinner">Loading recipes…</div></div>
  `;
  await renderRecipesList();
}

async function renderRecipesList() {
  const container = document.getElementById('recipesList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/recipes`);
    const cards = await res.json();

    if (!cards.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No recipe cards yet. Upload a CSV or create your first recipe.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Recipe Name</th>
            <th>Square Alias</th>
            <th style="text-align:center">Ingredients</th>
            <th style="text-align:right">Cost / Unit</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${cards.map(card => `
            <tr>
              <td><strong>${escHtml(card.name)}</strong></td>
              <td style="color:#888;font-size:0.85em">${escHtml(card.squareName || '—')}</td>
              <td style="text-align:center">${card.ingredientCount}</td>
              <td style="text-align:right">$${Number(card.costPerUnit).toFixed(2)}</td>
              <td style="text-align:center">
                <button class="btn btn-sm btn-secondary" onclick="showRecipeDetail(${card.id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecipe(${card.id}, '${escHtml(card.name).replace(/'/g,"\\'")}')">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;padding-top:8px;color:#888;font-size:0.85em">
              ${cards.length} recipe${cards.length !== 1 ? 's' : ''} total
            </td>
          </tr>
        </tfoot>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="error-state">Failed to load recipes.</div>`;
  }
}

async function handleRecipeCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('recipeUploadStatus');
  statusEl.innerHTML = `<div class="info-banner">⏳ Uploading ${escHtml(file.name)}…</div>`;

  const formData = new FormData();
  formData.append('file', file);
  event.target.value = '';

  try {
    const res = await fetch(`${API_BASE}/api/recipes/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.innerHTML = `<div class="error-banner">❌ ${escHtml(data.error)}</div>`;
      return;
    }

    statusEl.innerHTML = `
      <div class="success-banner">
        ✅ Import complete —
        ${data.recipesCreated} recipe${data.recipesCreated !== 1 ? 's' : ''} created,
        ${data.recipesUpdated} updated,
        ${data.ingredientsUpserted} ingredients processed.
      </div>`;
    await renderRecipesList();
  } catch (err) {
    statusEl.innerHTML = `<div class="error-banner">❌ Upload failed. Please try again.</div>`;
  }
}

function showNewRecipeForm() {
  const modal = createModal('New Recipe Card', `
    <div class="form-group">
      <label>Recipe Name <span style="color:red">*</span></label>
      <input id="newRecipeName" class="form-input" placeholder="e.g. Regular Lemonade" autofocus>
    </div>
    <div class="form-group">
      <label>Square Item Name (if different)</label>
      <input id="newRecipeSquareName" class="form-input" placeholder="e.g. Reg Lemonade — leave blank if same">
      <small style="color:#888">This is the name Square reports. Used for auto-matching.</small>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewRecipe()">Create & Add Ingredients</button>
    </div>
  `);
}

async function submitNewRecipe() {
  const name = document.getElementById('newRecipeName')?.value?.trim();
  const squareName = document.getElementById('newRecipeSquareName')?.value?.trim();
  if (!name) { alert('Recipe name is required.'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, squareName: squareName || null }),
    });
    const data = await res.json();
    closeModal();
    if (data.id) {
      await showRecipeDetail(data.id);
      await renderRecipesList();
    }
  } catch (err) {
    alert('Failed to create recipe. Please try again.');
  }
}

async function showRecipeDetail(recipeId) {
  try {
    const res = await fetch(`${API_BASE}/api/recipes/${recipeId}`);
    const card = await res.json();
    renderRecipeDetailModal(card);
  } catch (err) {
    alert('Failed to load recipe.');
  }
}

function renderRecipeDetailModal(card) {
  const costPerUnit = card.ingredients.reduce(
    (s, i) => s + Number(i.quantityUsed) * Number(i.unitCost), 0
  );

  const modal = createModal(`Recipe: ${escHtml(card.name)}`, `
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
      <span style="font-size:0.85em;color:#888">Square alias: <strong>${escHtml(card.squareName || 'same as recipe name')}</strong></span>
      <button class="btn btn-sm btn-secondary" onclick="showEditRecipeNameForm(${card.id}, '${escHtml(card.name).replace(/'/g,"\\'")}', '${escHtml(card.squareName || '').replace(/'/g,"\\'")}')">Edit Name</button>
    </div>

    <table class="data-table" id="ingredientsTable_${card.id}">
      <thead>
        <tr>
          <th>Ingredient</th>
          <th style="text-align:center">Qty</th>
          <th>Unit Type</th>
          <th style="text-align:right">Unit Cost</th>
          <th style="text-align:right">Line Cost</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${card.ingredients.map(ing => ingredientRow(ing, card.id)).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:bold;background:#f9f9f9">
          <td colspan="3" style="text-align:right">Cost Per Drink:</td>
          <td></td>
          <td style="text-align:right" id="costPerUnit_${card.id}">$${costPerUnit.toFixed(2)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:16px;padding:12px;background:#f0f8ff;border-radius:6px" id="addIngredientForm_${card.id}">
      <strong style="font-size:0.9em">Add Ingredient</strong>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;margin-top:8px;align-items:end">
        <div>
          <label style="font-size:0.8em">Ingredient Name</label>
          <input id="ing_name_${card.id}" class="form-input form-input-sm" placeholder="e.g. Lemon">
        </div>
        <div>
          <label style="font-size:0.8em">Qty Used</label>
          <input id="ing_qty_${card.id}" class="form-input form-input-sm" type="number" step="0.01" value="1" placeholder="1">
        </div>
        <div>
          <label style="font-size:0.8em">Unit Type</label>
          <input id="ing_unit_${card.id}" class="form-input form-input-sm" placeholder="Per Cup">
        </div>
        <div>
          <label style="font-size:0.8em">Unit Cost ($)</label>
          <input id="ing_cost_${card.id}" class="form-input form-input-sm" type="number" step="0.001" placeholder="0.00">
        </div>
        <button class="btn btn-primary btn-sm" onclick="addIngredient(${card.id})">Add</button>
      </div>
    </div>
  `, { wide: true });
}

function ingredientRow(ing, recipeId) {
  const lineCost = Number(ing.quantityUsed) * Number(ing.unitCost);
  return `
    <tr id="ing_row_${ing.id}">
      <td><input class="form-input form-input-sm" id="ing_edit_name_${ing.id}" value="${escHtml(ing.ingredientName)}"></td>
      <td><input class="form-input form-input-sm" type="number" step="0.01" id="ing_edit_qty_${ing.id}" value="${ing.quantityUsed}" style="width:60px;text-align:center"></td>
      <td><input class="form-input form-input-sm" id="ing_edit_unit_${ing.id}" value="${escHtml(ing.unitType || '')}"></td>
      <td><input class="form-input form-input-sm" type="number" step="0.001" id="ing_edit_cost_${ing.id}" value="${ing.unitCost}" style="width:75px;text-align:right" onchange="refreshLineCost(${ing.id},${recipeId})"></td>
      <td style="text-align:right" id="ing_line_${ing.id}">$${lineCost.toFixed(2)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-secondary" onclick="saveIngredient(${ing.id},${recipeId})">Save</button>
        <button class="btn btn-sm btn-danger" onclick="deleteIngredient(${ing.id},${recipeId})">✕</button>
      </td>
    </tr>`;
}

function refreshLineCost(ingId, recipeId) {
  const qty = Number(document.getElementById(`ing_edit_qty_${ingId}`)?.value) || 0;
  const cost = Number(document.getElementById(`ing_edit_cost_${ingId}`)?.value) || 0;
  const lineEl = document.getElementById(`ing_line_${ingId}`);
  if (lineEl) lineEl.textContent = '$' + (qty * cost).toFixed(2);
  recalcModalTotal(recipeId);
}

function recalcModalTotal(recipeId) {
  // Sum all visible line cost cells
  const table = document.getElementById(`ingredientsTable_${recipeId}`);
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  let total = 0;
  rows.forEach(row => {
    const lineCell = row.querySelector('td:nth-child(5)');
    if (lineCell) total += parseFloat(lineCell.textContent.replace('$', '')) || 0;
  });
  const totalEl = document.getElementById(`costPerUnit_${recipeId}`);
  if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

async function saveIngredient(ingId, recipeId) {
  const name = document.getElementById(`ing_edit_name_${ingId}`)?.value?.trim();
  const qty = Number(document.getElementById(`ing_edit_qty_${ingId}`)?.value);
  const unit = document.getElementById(`ing_edit_unit_${ingId}`)?.value?.trim();
  const cost = Number(document.getElementById(`ing_edit_cost_${ingId}`)?.value);

  if (!name) { alert('Ingredient name required'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/recipes/ingredients/${ingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredientName: name, quantityUsed: qty, unitType: unit, unitCost: cost }),
    });
    if (res.ok) {
      showToast('✅ Ingredient saved');
      refreshLineCost(ingId, recipeId);
      await renderRecipesList(); // update cost-per-unit in list
    }
  } catch (err) {
    alert('Failed to save ingredient.');
  }
}

async function addIngredient(recipeId) {
  const name = document.getElementById(`ing_name_${recipeId}`)?.value?.trim();
  const qty = Number(document.getElementById(`ing_qty_${recipeId}`)?.value) || 1;
  const unit = document.getElementById(`ing_unit_${recipeId}`)?.value?.trim();
  const cost = Number(document.getElementById(`ing_cost_${recipeId}`)?.value) || 0;

  if (!name) { alert('Ingredient name is required'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredientName: name, quantityUsed: qty, unitType: unit, unitCost: cost }),
    });
    const ing = await res.json();
    if (!res.ok) { alert(ing.error || 'Failed to add'); return; }

    // Insert new row into table
    const tbody = document.querySelector(`#ingredientsTable_${recipeId} tbody`);
    if (tbody) {
      const row = document.createElement('tr');
      row.id = `ing_row_${ing.id}`;
      row.innerHTML = ingredientRow(ing, recipeId);
      tbody.appendChild(row);
    }

    // Clear add form
    ['ing_name_', 'ing_qty_', 'ing_unit_', 'ing_cost_'].forEach((prefix, i) => {
      const el = document.getElementById(prefix + recipeId);
      if (el) el.value = i === 1 ? '1' : '';
    });

    recalcModalTotal(recipeId);
    await renderRecipesList();
  } catch (err) {
    alert('Failed to add ingredient.');
  }
}

async function deleteIngredient(ingId, recipeId) {
  if (!confirm('Remove this ingredient?')) return;
  try {
    await fetch(`${API_BASE}/api/recipes/ingredients/${ingId}`, { method: 'DELETE' });
    document.getElementById(`ing_row_${ingId}`)?.remove();
    recalcModalTotal(recipeId);
    await renderRecipesList();
  } catch (err) {
    alert('Failed to delete ingredient.');
  }
}

async function deleteRecipe(recipeId, name) {
  if (!confirm(`Delete recipe "${name}" and all its ingredients? This cannot be undone.`)) return;
  try {
    await fetch(`${API_BASE}/api/recipes/${recipeId}`, { method: 'DELETE' });
    showToast('Recipe deleted');
    await renderRecipesList();
  } catch (err) {
    alert('Failed to delete recipe.');
  }
}

function showEditRecipeNameForm(id, currentName, currentAlias) {
  createModal('Edit Recipe Names', `
    <div class="form-group">
      <label>Recipe Name <span style="color:red">*</span></label>
      <input id="editRecipeName" class="form-input" value="${escHtml(currentName)}">
    </div>
    <div class="form-group">
      <label>Square Item Name (alias)</label>
      <input id="editRecipeAlias" class="form-input" value="${escHtml(currentAlias)}">
      <small style="color:#888">The exact name Square uses for this item.</small>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRecipeName(${id})">Save</button>
    </div>
  `);
}

async function saveRecipeName(id) {
  const name = document.getElementById('editRecipeName')?.value?.trim();
  const squareName = document.getElementById('editRecipeAlias')?.value?.trim();
  if (!name) { alert('Name required'); return; }
  try {
    await fetch(`${API_BASE}/api/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, squareName: squareName || null }),
    });
    closeModal();
    showToast('✅ Recipe name updated');
    await renderRecipesList();
  } catch (err) {
    alert('Failed to update.');
  }
}


// ==============================================================
// 💰 SALES FEES TAB — on event detail page
// ==============================================================

async function loadSalesFeesTab(eventID) {
  const container = document.getElementById('salesFeesTab');
  if (!container) return;

  container.innerHTML = `<div class="loading-spinner">Loading sales fees…</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/sales-fees`);
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `<div class="error-state">Failed to load sales fees.</div>`;
      return;
    }

    const { rows, totalSalesFees, unmatchedCount, isLocked, isFinalized, calculatedAt } = data;

    const hasData = rows.length > 0;
    const matchedRows = rows.filter(r => r.matchType !== 'unmatched');
    const unmatchedRows = rows.filter(r => r.matchType === 'unmatched');

    const lockBtnHtml = isFinalized
      ? isLocked
        ? `<button class="btn btn-sm btn-warning" onclick="unlockSalesFees(${eventID})">🔓 Unlock & Recalculate</button>`
        : `<button class="btn btn-sm btn-secondary" onclick="triggerSalesFeesCalc(${eventID})">🔗 Recalculate Fees</button>`
      : `<button class="btn btn-sm btn-primary" onclick="triggerSalesFeesCalc(${eventID})">🔗 Link Recipes & Calculate</button>`;

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0">🍋 Ingredient Costs (Recipe Matching)</h3>
          ${calculatedAt ? `<small style="color:#888">Last calculated: ${new Date(calculatedAt).toLocaleString()}</small>` : ''}
          ${isLocked ? `<span class="badge badge-warning" style="margin-left:8px">🔒 Locked</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${lockBtnHtml}
        </div>
      </div>

      ${!hasData ? `
        <div class="empty-state">
          <p>No sales fees calculated yet.</p>
          <p style="color:#888;font-size:0.9em">Pull Square sales or enter manual sales first, then click "Link Recipes & Calculate".</p>
        </div>
      ` : `
        ${matchedRows.length ? `
          <div class="card-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Item Sold</th>
                  <th>Matched Recipe</th>
                  <th style="text-align:center">Match</th>
                  <th style="text-align:center">Qty Sold</th>
                  <th style="text-align:right">Cost / Unit</th>
                  <th style="text-align:right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                ${matchedRows.map(r => `
                  <tr>
                    <td>${escHtml(r.itemName)}</td>
                    <td style="color:#555">${escHtml(r.matchedName || '—')}</td>
                    <td style="text-align:center">${matchBadge(r.matchType)}</td>
                    <td style="text-align:center">${r.quantitySold}</td>
                    <td style="text-align:right">$${Number(r.costPerUnit).toFixed(4)}</td>
                    <td style="text-align:right"><strong>$${Number(r.totalCost).toFixed(2)}</strong></td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr style="font-weight:bold;background:#f5f5f5">
                  <td colspan="5" style="text-align:right">Total Ingredient Cost:</td>
                  <td style="text-align:right">$${Number(totalSalesFees).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ` : ''}

        ${unmatchedRows.length ? `
          <div class="warning-banner" style="margin-bottom:12px;margin-top:12px">
            <strong>⚠️ ${unmatchedRows.length} item${unmatchedRows.length !== 1 ? 's' : ''} could not be matched to a recipe.</strong>
            Link them below to include their costs.
          </div>
          <div class="card-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Unmatched Item</th>
                  <th style="text-align:center">Qty Sold</th>
                  <th>Link to Recipe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${unmatchedRows.map(r => `
                  <tr id="unmatched_row_${r.id}">
                    <td>${escHtml(r.itemName)}</td>
                    <td style="text-align:center">${r.quantitySold}</td>
                    <td>
                      <select id="manual_match_${r.id}" class="form-input form-input-sm" style="min-width:180px">
                        <option value="">— Select recipe —</option>
                      </select>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-primary" onclick="saveManualMatch(${eventID}, ${r.id})">Link</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      `}
    `;

    // Populate recipe dropdowns for unmatched items
    if (unmatchedRows.length) {
      await populateRecipeDropdowns(unmatchedRows.map(r => r.id));
    }

  } catch (err) {
    container.innerHTML = `<div class="error-state">Failed to load sales fees.</div>`;
  }
}

async function populateRecipeDropdowns(ids) {
  try {
    const res = await fetch(`${API_BASE}/api/recipes`);
    const recipes = await res.json();
    ids.forEach(id => {
      const sel = document.getElementById(`manual_match_${id}`);
      if (!sel) return;
      recipes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name}${r.squareName ? ` (${r.squareName})` : ''} — $${Number(r.costPerUnit).toFixed(2)}/unit`;
        sel.appendChild(opt);
      });
    });
  } catch (err) {
    console.warn('Could not populate recipe dropdowns', err);
  }
}

function matchBadge(matchType) {
  const badges = {
    exact:     `<span style="color:#22c55e;font-size:0.8em" title="Exact name match">✅ Exact</span>`,
    fuzzy:     `<span style="color:#f59e0b;font-size:0.8em" title="Fuzzy/partial name match">🔶 Fuzzy</span>`,
    manual:    `<span style="color:#3b82f6;font-size:0.8em" title="Manually linked">🔗 Manual</span>`,
    unmatched: `<span style="color:#ef4444;font-size:0.8em">❓ None</span>`,
  };
  return badges[matchType] || '—';
}

async function triggerSalesFeesCalc(eventID) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Calculating…'; }

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/sales-fees`, { method: 'PUT' });
    const data = await res.json();

    if (!res.ok) {
      if (data.locked) {
        alert('Sales fees are locked. Use "Unlock & Recalculate" to update.');
      } else {
        alert(data.error || 'Calculation failed.');
      }
      return;
    }

    showToast(`✅ Sales fees calculated — $${Number(data.totalSalesFees || 0).toFixed(2)} total`);
    await loadSalesFeesTab(eventID);
  } catch (err) {
    alert('Failed to calculate sales fees. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

async function unlockSalesFees(eventID) {
  const confirmed = confirm(
    'Unlock sales fees for this finalized event?\n\n' +
    'This will allow recalculation using CURRENT ingredient costs, ' +
    'which may differ from the original calculation.\n\n' +
    'The event will be re-locked automatically after recalculation.'
  );
  if (!confirmed) return;

  try {
    // Unlock
    await fetch(`${API_BASE}/api/events/${eventID}/sales-fees/unlock`, { method: 'PUT' });
    // Immediately recalculate
    const res = await fetch(`${API_BASE}/api/events/${eventID}/sales-fees`, { method: 'PUT' });
    const data = await res.json();
    // Re-lock
    await fetch(`${API_BASE}/api/events/${eventID}/sales-fees/lock`, { method: 'PUT' });

    showToast(`✅ Sales fees recalculated and re-locked — $${Number(data.totalSalesFees || 0).toFixed(2)}`);
    await loadSalesFeesTab(eventID);
  } catch (err) {
    alert('Unlock/recalculate failed. Please try again.');
  }
}

async function saveManualMatch(eventID, salesFeeId) {
  const sel = document.getElementById(`manual_match_${salesFeeId}`);
  const recipeId = sel?.value;
  if (!recipeId) { alert('Please select a recipe first.'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventID}/sales-fees/manual-match`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salesFeeId, recipeId }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to save match.'); return; }

    showToast('✅ Recipe linked. This item will auto-match in future events.');
    await loadSalesFeesTab(eventID);
  } catch (err) {
    alert('Failed to save match.');
  }
}


// ==============================================================
// 🔗 INTEGRATION HOOKS
// ==============================================================

// Call this function when adding the Recipes nav button in your HTML/app.js
// Example: document.getElementById('btnRecipes').addEventListener('click', () => showSection('recipesSection'));

// Call this when building out the event detail tabs.
// Add a "Sales Fees" tab that calls loadSalesFeesTab(activeEvent.eventID)

// If you have a tab-switching function, add a case like:
//   case 'salesFees': loadSalesFeesTab(activeEvent.eventID); break;


// ==============================================================
// UTILITY — safe HTML escape (add if not already in your app.js)
// ==============================================================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Simple modal helper — adapt to match your existing modal system if different
function createModal(title, bodyHtml, opts = {}) {
  closeModal(); // close any existing
  const overlay = document.createElement('div');
  overlay.id = 'appModal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);
    display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:10px;padding:24px;
                width:100%;max-width:${opts.wide ? '860px' : '480px'};
                max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">${escHtml(title)}</h3>
        <button onclick="closeModal()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#888">×</button>
      </div>
      ${bodyHtml}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  return overlay;
}

function closeModal() {
  document.getElementById('appModal')?.remove();
}
