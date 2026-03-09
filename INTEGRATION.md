# VenView — Recipe Cards & Sales Fees Integration Guide

## Files Delivered
- `recipes.js`          → New API module (drop next to server.js)
- `recipes_frontend.js` → New frontend JS (paste into app.js or load as separate script)
- `migration_recipes.sql` → Reference only; migration runs automatically via recipes.js

---

## Step 1 — Copy recipes.js into your project

Place `recipes.js` in the same directory as `server.js`.

---

## Step 2 — server.js changes (4 small edits)

### 2a. Require the module (near the top, after your other requires)
```js
const recipes = require('./recipes.js');
```

### 2b. Run migration at startup — add inside initDb(), after your existing migrations loop
```js
await recipes.runMigration();
```

### 2c. Register routes — add after initDb() completes, inside the startup IIFE
```js
recipes.init(app, pool);
```

The startup block should look like:
```js
(async () => {
  try {
    await initDb();
    recipes.init(app, pool);   // ← add this line

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () =>
      console.log(`🚀 PostgreSQL backend running on port ${PORT}`)
    );
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
})();
```

### 2d. Auto-trigger after Square sales pull — in saveInventorySales(), add at the end:
```js
async function saveInventorySales(eventID, rows) {
  // ... your existing code ...
  
  // ← Add these lines at the very end, after the COMMIT:
  try {
    await recipes.calculateEventSalesFees(eventID);
  } catch (err) {
    console.warn('⚠️ Sales fees auto-calc skipped:', err.message);
    // Non-fatal — sales data still saved correctly
  }
}
```

### 2e. Auto-lock when event is finalized — in PUT /api/events/:id/finalize, add after the UPDATE:
```js
// After the isFinalized update succeeds, auto-lock sales fees
try {
  await pool.query(
    `UPDATE "EventInfo" SET "salesFeesLocked"=TRUE WHERE "eventID"=$1`,
    [eventID]
  );
} catch (lockErr) {
  console.warn('⚠️ Could not lock sales fees:', lockErr.message);
}
```

### 2f. Include sales fees in buildPostEventReport — add to the Promise.all() data loading:
```js
const [
  expenses,
  manualLaborRows,
  // ... your existing destructured vars ...
  salesFeeRows          // ← add this
] = await Promise.all([
  // ... your existing queries ...
  dbAll(`SELECT * FROM "EventSalesFees" WHERE "eventID" = $1`, [eventID]),  // ← add this
]);

// Then in the report object:
report.salesFees = salesFeeRows || [];
report.totalSalesFees = (salesFeeRows || []).reduce((s, r) => s + Number(r.totalCost), 0);

// And update netProfit calculation:
const totalExpenses =
  // ... your existing expense sum ...
  + report.totalSalesFees;  // ← add this line
```

---

## Step 3 — Frontend (app.js / HTML changes)

### 3a. Add the recipes_frontend.js script
Either paste the entire contents of `recipes_frontend.js` into your `app.js`,
or load it as a separate script in your HTML:
```html
<script src="/recipes_frontend.js"></script>
```

### 3b. Add a Recipes nav button in your HTML
```html
<button id="btnRecipes" onclick="showSection('recipesSection')">Recipes</button>
```
Add it alongside your existing nav buttons (#btnInventory, etc.)

### 3c. Add the recipes section container in your HTML
```html
<section id="recipesSection" class="hidden">
  <!-- content rendered by loadRecipesSection() -->
</section>
```

### 3d. Hook loadRecipesSection() into your section-switching logic
In your existing section-switching function (wherever you handle btnManage, btnInventory etc.):
```js
case 'recipesSection':
  loadRecipesSection();
  break;
```

### 3e. Add the Sales Fees tab to the event detail view
In your event detail HTML template, add a tab alongside existing tabs:
```html
<button class="tab-btn" onclick="switchEventTab('salesFees', EVENT_ID)">💰 Sales Fees</button>
```

And a tab panel:
```html
<div id="salesFeesTab" class="tab-panel hidden">
  <!-- rendered by loadSalesFeesTab(eventID) -->
</div>
```

In your tab-switching function:
```js
case 'salesFees':
  loadSalesFeesTab(activeEvent.eventID);
  break;
```

---

## Step 4 — CSV Template Format

Download the blank template from `/api/recipes/template`.

Your Google Sheets export should have these column headers (case-insensitive):
```
recipeName, ingredientName, quantityUsed, unitType, unitCost
```

Example rows:
```
Regular Lemonade, Straw, 1, Per Cup, 0.01
Regular Lemonade, Cup & Lid, 1, Per Cup, 0.21
Regular Lemonade, Lemon, 1, Per Cup, 0.28
Regular Lemonade, Simple Syrup, 3, Per Oz, 0.03
Strawberry Lemonade, Straw, 1, Per Cup, 0.01
Strawberry Lemonade, Cup & Lid, 1, Per Cup, 0.21
```

Each unique `recipeName` becomes one recipe card.
Re-uploading the same CSV updates costs without duplicating ingredients.

---

## How the Freeze/Unlock Flow Works

| Event State       | Sales Fees Button         | Behavior |
|-------------------|---------------------------|----------|
| Not finalized     | 🔗 Link Recipes & Calculate | Recalculates freely |
| Just finalized    | (auto-locked by server)   | Fees snapshot frozen |
| Finalized + locked | 🔓 Unlock & Recalculate  | Confirms → recalcs with current costs → re-locks |

---

## Fuzzy Match Threshold

The default is 45% Jaccard token overlap. If you find it's matching incorrectly
(e.g. "Lemonade" matching "Strawberry Lemonade" when it shouldn't), raise the
threshold in `recipes.js`:

```js
const FUZZY_THRESHOLD = 0.55; // raise for stricter matching
```

---

## New API Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/recipes | List all recipe cards |
| GET | /api/recipes/:id | Single card + ingredients |
| POST | /api/recipes | Create recipe card |
| PUT | /api/recipes/:id | Update name/alias |
| DELETE | /api/recipes/:id | Delete card + ingredients |
| GET | /api/recipes/template | Download CSV template |
| POST | /api/recipes/upload | Bulk import CSV |
| GET | /api/recipes/:id/ingredients | List ingredients |
| POST | /api/recipes/:id/ingredients | Add ingredient |
| PUT | /api/recipes/ingredients/:id | Edit ingredient |
| DELETE | /api/recipes/ingredients/:id | Delete ingredient |
| GET | /api/events/:id/sales-fees | Get fee results for event |
| PUT | /api/events/:id/sales-fees | Trigger (re)calculation |
| PUT | /api/events/:id/sales-fees/lock | Lock fees |
| PUT | /api/events/:id/sales-fees/unlock | Unlock fees |
| PUT | /api/events/:id/sales-fees/manual-match | Save manual recipe link |
