// =============================================================
// recipes.js — Recipe Cards & Sales Fees API Module
// Drop this file next to server.js and add:
//   const recipes = require('./recipes.js');
//   recipes.init(app, pool);
// in server.js after initDb() completes.
// Also call: recipes.calculateEventSalesFees(eventID)
// at the end of saveInventorySales() in server.js.
// =============================================================

'use strict';

let _pool;

function init(app, pool) {
  _pool = pool;
  registerRoutes(app);
}

// ─── DB helpers ──────────────────────────────────────────────
async function dbGet(sql, params = []) {
  const r = await _pool.query(sql, params);
  return r.rows[0] || null;
}
async function dbAll(sql, params = []) {
  const r = await _pool.query(sql, params);
  return r.rows;
}
async function dbRun(sql, params = []) {
  const r = await _pool.query(sql, params);
  return { rowCount: r.rowCount, rows: r.rows };
}

// ─── Org helper ──────────────────────────────────────────────
async function getUserOrgId(userId) {
  const row = await dbGet(
    `SELECT "orgId" FROM "OrgMembers" WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  return row?.orgId || null;
}

// ─── Run migration at startup ────────────────────────────────
async function runMigration() {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS "RecipeCards" (
      "id"         SERIAL PRIMARY KEY,
      "userId"     TEXT NOT NULL,
      "name"       TEXT NOT NULL,
      "squareName" TEXT,
      "createdAt"  TIMESTAMP DEFAULT NOW(),
      "updatedAt"  TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "RecipeCards_userId_idx" ON "RecipeCards" ("userId")`,
    `CREATE INDEX IF NOT EXISTS "RecipeCards_name_idx"   ON "RecipeCards" ("userId", "name")`,
    `CREATE TABLE IF NOT EXISTS "RecipeIngredients" (
      "id"             SERIAL PRIMARY KEY,
      "recipeId"       INTEGER NOT NULL REFERENCES "RecipeCards"("id") ON DELETE CASCADE,
      "ingredientName" TEXT NOT NULL,
      "quantityUsed"   REAL NOT NULL DEFAULT 1,
      "unitType"       TEXT,
      "unitCost"       REAL NOT NULL DEFAULT 0,
      "updatedAt"      TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "RecipeIngredients_recipeId_idx" ON "RecipeIngredients" ("recipeId")`,
    `CREATE TABLE IF NOT EXISTS "EventSalesFees" (
      "id"           SERIAL PRIMARY KEY,
      "eventID"      INTEGER NOT NULL REFERENCES "EventInfo"("eventID") ON DELETE CASCADE,
      "itemName"     TEXT NOT NULL,
      "recipeId"     INTEGER REFERENCES "RecipeCards"("id") ON DELETE SET NULL,
      "matchType"    TEXT,
      "matchedName"  TEXT,
      "quantitySold" INTEGER NOT NULL DEFAULT 0,
      "costPerUnit"  REAL NOT NULL DEFAULT 0,
      "totalCost"    REAL NOT NULL DEFAULT 0,
      "calculatedAt" TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "EventSalesFees_eventID_idx" ON "EventSalesFees" ("eventID")`,
    `ALTER TABLE "EventInfo" ADD COLUMN IF NOT EXISTS "salesFeesLocked" BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE "RecipeCards" ADD COLUMN IF NOT EXISTS "orgId" UUID REFERENCES "Organizations"("orgId")`,
  ];

  for (const sql of migrations) {
    try {
      await _pool.query(sql);
    } catch (err) {
      if (err.code !== '42701' && err.code !== '42P07') {
        console.warn(`⚠️  Recipe migration warning: ${err.message}`);
      }
    }
  }
  console.log('✅ Recipe Cards schema ready');
}

// ─── Fuzzy match engine ───────────────────────────────────────
// Returns a score 0–1 based on token overlap between two strings.
function fuzzyScore(a, b) {
  const normalize = s =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (!tokensA.size || !tokensB.size) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  // Jaccard-style: intersection / union
  const union = new Set([...tokensA, ...tokensB]).size;
  return overlap / union;
}

// Find best matching recipe card for a Square item name.
// Returns { recipe, matchType, score } or null if no acceptable match.
function findBestMatch(squareName, recipeCards) {
  let bestRecipe = null;
  let bestScore = 0;
  let bestMatchType = 'unmatched';

  for (const rc of recipeCards) {
    // Check exact match against canonical name or stored squareName alias
    const candidateNames = [rc.name];
    if (rc.squareName) candidateNames.push(rc.squareName);

    for (const candidate of candidateNames) {
      if (candidate.toLowerCase().trim() === squareName.toLowerCase().trim()) {
        return { recipe: rc, matchType: 'exact', score: 1.0 };
      }
    }

    // Fuzzy match against both names
    for (const candidate of candidateNames) {
      const score = fuzzyScore(squareName, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestRecipe = rc;
        bestMatchType = 'fuzzy';
      }
    }
  }

  const FUZZY_THRESHOLD = 0.45; // at least ~45% token overlap required
  if (bestScore >= FUZZY_THRESHOLD) {
    return { recipe: bestRecipe, matchType: 'fuzzy', score: bestScore };
  }

  return null;
}

// ─── Core calculation function (exported for use in server.js) ─
async function calculateEventSalesFees(eventID) {
  try {
    // 1️⃣ Check if event exists and if fees are locked
    const event = await dbGet(
      `SELECT "eventID", "salesFeesLocked", "userId", "isFinalized" FROM "EventInfo" WHERE "eventID" = $1`,
      [eventID]
    );
    if (!event) return { skipped: true, reason: 'event not found' };
    if (event.salesFeesLocked) return { skipped: true, reason: 'locked' };

    // 2️⃣ Get all sold items for this event
    const soldItems = await dbAll(
      `SELECT "name", "quantitySold" FROM "InventorySales" WHERE "eventID" = $1`,
      [eventID]
    );
    if (!soldItems.length) return { skipped: true, reason: 'no sold items' };

    // 3️⃣ Load all recipe cards for this user/org (with ingredients)
    const userId = event.userId;
    const recipeCards = await dbAll(
      `SELECT rc."id", rc."name", rc."squareName" FROM "RecipeCards" rc
       WHERE rc."userId" = $1
          OR (rc."orgId" IS NOT NULL AND EXISTS (
            SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = rc."orgId" AND _om."userId" = $1
          ))`,
      [userId]
    );

    // 4️⃣ Match each sold item to a recipe and calculate cost
    const feeRows = [];

    for (const item of soldItems) {
      const match = findBestMatch(item.name, recipeCards);

      if (!match) {
        feeRows.push({
          itemName: item.name,
          recipeId: null,
          matchType: 'unmatched',
          matchedName: null,
          quantitySold: item.quantitySold,
          costPerUnit: 0,
          totalCost: 0,
        });
        continue;
      }

      // Sum ingredient costs for this recipe (snapshot at current prices)
      const ingredients = await dbAll(
        `SELECT "quantityUsed", "unitCost" FROM "RecipeIngredients" WHERE "recipeId" = $1`,
        [match.recipe.id]
      );
      const costPerUnit = ingredients.reduce(
        (sum, ing) => sum + (Number(ing.quantityUsed) * Number(ing.unitCost)),
        0
      );

      feeRows.push({
        itemName: item.name,
        recipeId: match.recipe.id,
        matchType: match.matchType,
        matchedName: match.recipe.name,
        quantitySold: item.quantitySold || 0,
        costPerUnit: Math.floor(costPerUnit * 100) / 100,
        totalCost: (Math.floor(costPerUnit * 100) / 100) * (item.quantitySold || 0),
      });
    }

    // 5️⃣ Upsert results atomically
    const client = await _pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "EventSalesFees" WHERE "eventID" = $1`, [eventID]);

      for (const row of feeRows) {
        await client.query(
          `INSERT INTO "EventSalesFees"
           ("eventID","itemName","recipeId","matchType","matchedName","quantitySold","costPerUnit","totalCost","calculatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [eventID, row.itemName, row.recipeId, row.matchType, row.matchedName,
           row.quantitySold, row.costPerUnit, row.totalCost]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const totalSalesFees = feeRows.reduce((s, r) => s + r.totalCost, 0);
    console.log(`✅ Sales Fees calculated for event ${eventID}: $${totalSalesFees.toFixed(2)}`);
    return { success: true, rows: feeRows, totalSalesFees };

  } catch (err) {
    console.error('❌ calculateEventSalesFees failed:', err);
    throw err;
  }
}

// ─── CSV parser for recipe import ────────────────────────────
// Handles the multi-column spreadsheet layout exported from Google Sheets.
// The CSV may contain two recipe tables side-by-side:
//
//   LEFT-style block (standard):
//     Header:  recipename | Ingredient Name | Quantity Used | Unit Type | Unit Cost | …
//     Data:    Recipe A   | Straw           | 1             | Per Cup   | 0.01      | …
//              (empty)    | Cup & Lid       | 1             | Per Cup   | 0.21      | …
//
//   RIGHT-style block (title-in-header layout):
//     Header:  Cherry Lemonade | Ingredient Name | Quantity Used | Unit Type | Unit Cost | …
//     Data:    Straw           | 1               | Per Cup       | 0.01      | …
//     (new recipe detected when next column = "Ingredient Name")
function parseRecipeCSV(text) {
  // Full RFC-4180 CSV parser: handles quoted fields with embedded commas and newlines.
  function parseAllRows(src) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          // Escaped quote "" → literal "
          if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false;
          i++;
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ',') {
          row.push(field.trim());
          field = '';
          i++;
        } else if (ch === '\r' && src[i + 1] === '\n') {
          row.push(field.trim());
          rows.push(row);
          row = []; field = ''; i += 2;
        } else if (ch === '\n') {
          row.push(field.trim());
          rows.push(row);
          row = []; field = ''; i++;
        } else {
          field += ch;
          i++;
        }
      }
    }
    // Last field/row
    if (field || row.length) { row.push(field.trim()); rows.push(row); }
    return rows;
  }

  const allRows = parseAllRows(text);
  if (allRows.length < 2) throw new Error('CSV must have a header and at least one row');

  const rawHeader = allRows[0];

  // Detect recipe blocks by scanning for "Ingredient Name" in the header row.
  //
  // At header index i, rawHeader[i] === "Ingredient Name":
  //   • rawHeader[i-1] === "recipename"  → LEFT-style block
  //       recipe name comes from data col i-1 (carry forward when empty)
  //       ingredient is at data col i, qty at i+1, unit at i+2, cost at i+3
  //   • rawHeader[i-1] is an actual recipe name → RIGHT-style block
  //       initial recipe name = rawHeader[i-1]
  //       ingredient is at data col i-1, qty at i, unit at i+1, cost at i+2
  //       new recipe detected when data[qtyCol] === "Ingredient Name"
  const blocks = [];
  for (let i = 1; i < rawHeader.length; i++) {
    if (rawHeader[i].trim().toLowerCase() !== 'ingredient name') continue;
    const prev = rawHeader[i - 1].trim().toLowerCase().replace(/\s+/g, '');
    if (prev === 'recipename') {
      // Left-style block
      blocks.push({
        style: 'left',
        recipeNameCol: i - 1,
        ingCol: i,
        qtyCol: i + 1,
        unitCol: i + 2,
        costCol: i + 3,
        currentRecipeName: '',
      });
    } else if (rawHeader[i - 1].trim()) {
      // Right-style block — recipe name is in the header cell at i-1
      blocks.push({
        style: 'right',
        ingCol: i - 1,
        qtyCol: i,
        unitCol: i + 1,
        costCol: i + 2,
        currentRecipeName: rawHeader[i - 1].trim(),
      });
    }
  }

  if (blocks.length === 0) throw new Error('No recipe columns found in CSV header');

  const recipes = new Map(); // recipeName → ingredient[]

  for (let lineIdx = 1; lineIdx < allRows.length; lineIdx++) {
    const cols = allRows[lineIdx];
    if (!cols.length || cols.every(c => !c)) continue;

    for (const block of blocks) {
      const ingCell  = (cols[block.ingCol]  || '').trim();
      const qtyCell  = (cols[block.qtyCol]  || '').trim();
      const unitCell = (cols[block.unitCol] || '').trim();
      const costCell = (cols[block.costCol] || '').trim();

      if (block.style === 'left') {
        const recipeCell = (cols[block.recipeNameCol] || '').trim();

        // Inline header row — update recipe name if present, then skip
        if (ingCell.toLowerCase() === 'ingredient name') {
          if (recipeCell && recipeCell.toLowerCase() !== 'ingredient name') {
            block.currentRecipeName = recipeCell;
          }
          continue;
        }

        // Update recipe name on the first ingredient row of each recipe
        if (recipeCell && recipeCell.toLowerCase() !== 'ingredient name') {
          block.currentRecipeName = recipeCell;
        }
      } else {
        // Right-style: new recipe detected when the qty cell reads "Ingredient Name"
        if (qtyCell.toLowerCase() === 'ingredient name') {
          if (ingCell) block.currentRecipeName = ingCell;
          continue;
        }
      }

      const recipeName = block.currentRecipeName;
      if (!recipeName || !ingCell) continue;

      // Skip totals and summary rows
      const ingLower = ingCell.toLowerCase();
      if (ingLower.startsWith('cost per') || ingLower === 'ingredient name') continue;

      const rawCost = costCell.replace(/[$,\s]/g, '');
      const unitCost = Number(rawCost) || 0;
      const rawQty = qtyCell.replace(/[$,\s]/g, '');
      const quantityUsed = Number(rawQty) || 1;
      const unitType = unitCell || null;

      if (!recipes.has(recipeName)) recipes.set(recipeName, []);
      recipes.get(recipeName).push({ ingredientName: ingCell, quantityUsed, unitType, unitCost });
    }
  }

  // Deduplicate: if the same recipe name appeared in multiple blocks (left + right),
  // ingredients from both blocks were merged into one Map entry, doubling them.
  // Keep only the first occurrence of each ingredient name per recipe.
  for (const [name, ings] of recipes) {
    const seen = new Set();
    recipes.set(name, ings.filter(ing => {
      const key = ing.ingredientName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  }

  return recipes; // Map<recipeName, ingredient[]>
}

// ─── Route registration ───────────────────────────────────────
function registerRoutes(app) {
  const multer = require('multer');
  const uploadCsv = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only .csv files are accepted'));
      }
    },
  });

  // ── Helper: assert recipe ownership (org-aware) ──────────────
  async function assertOwnsRecipe(req, recipeId) {
    const userId = req.user.id;
    const row = await dbGet(
      `SELECT 1 FROM "RecipeCards" rc WHERE rc."id" = $1 AND (
        rc."userId" = $2 OR (rc."orgId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = rc."orgId" AND _om."userId" = $2
        ))
      )`,
      [recipeId, userId]
    );
    return !!row;
  }

  // ── Helper: assert event ownership (org-aware) ───────────────
  async function assertOwnsEvent(req, eventID) {
    const userId = req.user.id;
    const row = await dbGet(
      `SELECT 1 FROM "EventInfo" e WHERE e."eventID" = $1 AND (
        e."userId" = $2 OR (e."orgId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = e."orgId" AND _om."userId" = $2
        ))
      )`,
      [eventID, userId]
    );
    return !!row;
  }

  // ── Helper: costPerUnit for a recipe ─────────────────────────
  async function getRecipeCostPerUnit(recipeId) {
    const ingredients = await dbAll(
      `SELECT "quantityUsed", "unitCost" FROM "RecipeIngredients" WHERE "recipeId" = $1`,
      [recipeId]
    );
    return ingredients.reduce(
      (sum, ing) => sum + Number(ing.quantityUsed) * Number(ing.unitCost), 0
    );
  }

  // ==============================================================
  // RECIPE CARD ROUTES
  // ==============================================================

  // GET /api/recipes — list all recipe cards for current user
  app.get('/api/recipes', async (req, res) => {
    try {
      const userId = req.user.id;
      const cards = await dbAll(
        `SELECT rc.*,
          COUNT(ri."id")::int AS "ingredientCount",
          COALESCE(SUM(ri."quantityUsed" * ri."unitCost"), 0) AS "costPerUnit"
         FROM "RecipeCards" rc
         LEFT JOIN "RecipeIngredients" ri ON ri."recipeId" = rc."id"
         WHERE rc."userId" = $1
            OR (rc."orgId" IS NOT NULL AND EXISTS (
              SELECT 1 FROM "OrgMembers" _om WHERE _om."orgId" = rc."orgId" AND _om."userId" = $1
            ))
         GROUP BY rc."id"
         ORDER BY rc."name" ASC`,
        [userId]
      );
      res.json(cards);
    } catch (err) {
      console.error('❌ GET /api/recipes:', err);
      res.status(500).json({ error: 'Failed to load recipes' });
    }
  });

  // GET /api/recipes/:id — single recipe card with full ingredient list
  app.get('/api/recipes/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      if (!(await assertOwnsRecipe(req, id))) return res.status(404).json({ error: 'Recipe not found' });

      const card = await dbGet(`SELECT * FROM "RecipeCards" WHERE "id" = $1`, [id]);
      const ingredients = await dbAll(
        `SELECT * FROM "RecipeIngredients" WHERE "recipeId" = $1 ORDER BY "id" ASC`,
        [id]
      );
      const costPerUnit = ingredients.reduce(
        (s, i) => s + Number(i.quantityUsed) * Number(i.unitCost), 0
      );
      res.json({ ...card, ingredients, costPerUnit });
    } catch (err) {
      console.error('❌ GET /api/recipes/:id:', err);
      res.status(500).json({ error: 'Failed to load recipe' });
    }
  });

  // POST /api/recipes — create a new (empty) recipe card
  app.post('/api/recipes', async (req, res) => {
    try {
      const userId = req.user.id;
      const orgId  = await getUserOrgId(userId);
      const { name, squareName } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

      const result = await dbRun(
        `INSERT INTO "RecipeCards" ("userId","orgId","name","squareName")
         VALUES ($1,$2,$3,$4) RETURNING "id"`,
        [userId, orgId, name.trim(), squareName?.trim() || null]
      );
      res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error('❌ POST /api/recipes:', err);
      res.status(500).json({ error: 'Failed to create recipe' });
    }
  });

  // PUT /api/recipes/:id — update recipe name / squareName alias
  app.put('/api/recipes/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      if (!(await assertOwnsRecipe(req, id))) return res.status(404).json({ error: 'Recipe not found' });

      const { name, squareName } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

      await dbRun(
        `UPDATE "RecipeCards" SET "name"=$1,"squareName"=$2,"updatedAt"=NOW() WHERE "id"=$3`,
        [name.trim(), squareName?.trim() || null, id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('❌ PUT /api/recipes/:id:', err);
      res.status(500).json({ error: 'Failed to update recipe' });
    }
  });

  // DELETE /api/recipes/:id — delete recipe and all its ingredients
  app.delete('/api/recipes/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      if (!(await assertOwnsRecipe(req, id))) return res.status(404).json({ error: 'Recipe not found' });

      // Ingredients cascade-delete via FK
      await dbRun(`DELETE FROM "RecipeCards" WHERE "id" = $1`, [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('❌ DELETE /api/recipes/:id:', err);
      res.status(500).json({ error: 'Failed to delete recipe' });
    }
  });

  // ==============================================================
  // INGREDIENT ROUTES
  // ==============================================================

  // GET /api/recipes/:id/ingredients
  app.get('/api/recipes/:id/ingredients', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      if (!(await assertOwnsRecipe(req, id))) return res.status(404).json({ error: 'Recipe not found' });

      const rows = await dbAll(
        `SELECT * FROM "RecipeIngredients" WHERE "recipeId"=$1 ORDER BY "id" ASC`,
        [id]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load ingredients' });
    }
  });

  // POST /api/recipes/:id/ingredients — add an ingredient
  app.post('/api/recipes/:id/ingredients', async (req, res) => {
    try {
      const recipeId = Number(req.params.id);
      if (!Number.isFinite(recipeId)) return res.status(400).json({ error: 'Invalid id' });
      if (!(await assertOwnsRecipe(req, recipeId))) return res.status(404).json({ error: 'Recipe not found' });

      const { ingredientName, quantityUsed, unitType, unitCost } = req.body;
      if (!ingredientName?.trim()) return res.status(400).json({ error: 'ingredientName is required' });

      const result = await dbRun(
        `INSERT INTO "RecipeIngredients" ("recipeId","ingredientName","quantityUsed","unitType","unitCost")
         VALUES ($1,$2,$3,$4,$5) RETURNING "id"`,
        [recipeId, ingredientName.trim(), Number(quantityUsed) || 1,
         unitType?.trim() || null, Number(unitCost) || 0]
      );
      const newRow = await dbGet(`SELECT * FROM "RecipeIngredients" WHERE "id"=$1`, [result.rows[0].id]);
      res.json(newRow);
    } catch (err) {
      console.error('❌ POST /api/recipes/:id/ingredients:', err);
      res.status(500).json({ error: 'Failed to add ingredient' });
    }
  });

  // PUT /api/recipes/ingredients/:id — edit an ingredient (especially unitCost)
  app.put('/api/recipes/ingredients/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

      // Verify ownership via parent recipe
      const ing = await dbGet(`SELECT "recipeId" FROM "RecipeIngredients" WHERE "id"=$1`, [id]);
      if (!ing) return res.status(404).json({ error: 'Ingredient not found' });
      if (!(await assertOwnsRecipe(req, ing.recipeId))) return res.status(403).json({ error: 'Forbidden' });

      const { ingredientName, quantityUsed, unitType, unitCost } = req.body;
      if (!ingredientName?.trim()) return res.status(400).json({ error: 'ingredientName is required' });

      await dbRun(
        `UPDATE "RecipeIngredients"
         SET "ingredientName"=$1,"quantityUsed"=$2,"unitType"=$3,"unitCost"=$4,"updatedAt"=NOW()
         WHERE "id"=$5`,
        [ingredientName.trim(), Number(quantityUsed) || 1,
         unitType?.trim() || null, Number(unitCost) || 0, id]
      );
      const updated = await dbGet(`SELECT * FROM "RecipeIngredients" WHERE "id"=$1`, [id]);
      res.json(updated);
    } catch (err) {
      console.error('❌ PUT /api/recipes/ingredients/:id:', err);
      res.status(500).json({ error: 'Failed to update ingredient' });
    }
  });

  // DELETE /api/recipes/ingredients/:id
  app.delete('/api/recipes/ingredients/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

      const ing = await dbGet(`SELECT "recipeId" FROM "RecipeIngredients" WHERE "id"=$1`, [id]);
      if (!ing) return res.status(404).json({ error: 'Ingredient not found' });
      if (!(await assertOwnsRecipe(req, ing.recipeId))) return res.status(403).json({ error: 'Forbidden' });

      await dbRun(`DELETE FROM "RecipeIngredients" WHERE "id"=$1`, [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('❌ DELETE /api/recipes/ingredients/:id:', err);
      res.status(500).json({ error: 'Failed to delete ingredient' });
    }
  });

  // ==============================================================
  // CSV BULK IMPORT
  // ==============================================================

  // POST /api/recipes/upload — bulk import from CSV
  app.post('/api/recipes/upload', uploadCsv.single('file'), async (req, res) => {
    try {
      const userId = req.user.id;
      const orgId  = await getUserOrgId(userId);
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const text = req.file.buffer.toString('utf8');
      let recipeMap;
      try {
        recipeMap = parseRecipeCSV(text);
      } catch (parseErr) {
        return res.status(400).json({ error: parseErr.message });
      }

      let created = 0, updated = 0, ingredientsUpserted = 0;

      const client = await _pool.connect();
      try {
        await client.query('BEGIN');

        for (const [recipeName, ingredients] of recipeMap) {
          // Find or create recipe card
          let card = (await client.query(
            `SELECT "id" FROM "RecipeCards" WHERE "userId"=$1 AND LOWER("name")=LOWER($2)`,
            [userId, recipeName]
          )).rows[0] || null;

          if (!card) {
            const r = await client.query(
              `INSERT INTO "RecipeCards" ("userId","orgId","name") VALUES ($1,$2,$3) RETURNING "id"`,
              [userId, orgId, recipeName]
            );
            card = r.rows[0];
            created++;
          } else {
            updated++;
          }

          // Full replace: delete all existing ingredients then re-insert from CSV.
          // This ensures removed or renamed ingredients don't linger and inflate costs.
          await client.query(
            `DELETE FROM "RecipeIngredients" WHERE "recipeId"=$1`,
            [card.id]
          );

          for (const ing of ingredients) {
            await client.query(
              `INSERT INTO "RecipeIngredients" ("recipeId","ingredientName","quantityUsed","unitType","unitCost")
               VALUES ($1,$2,$3,$4,$5)`,
              [card.id, ing.ingredientName, ing.quantityUsed, ing.unitType, ing.unitCost]
            );
            ingredientsUpserted++;
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        recipesCreated: created,
        recipesUpdated: updated,
        ingredientsUpserted,
        total: recipeMap.size,
      });
    } catch (err) {
      console.error('❌ POST /api/recipes/upload:', err);
      res.status(500).json({ error: 'Failed to import CSV: ' + err.message });
    }
  });

  // ==============================================================
  // SALES FEES ROUTES
  // ==============================================================

  // GET /api/events/:eventID/sales-fees — get results + summary
  app.get('/api/events/:eventID/sales-fees', async (req, res) => {
    try {
      const eventID = Number(req.params.eventID);
      if (!Number.isFinite(eventID)) return res.status(400).json({ error: 'Invalid eventID' });
      if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: 'Event not found' });

      const rows = await dbAll(
        `SELECT * FROM "EventSalesFees" WHERE "eventID"=$1 ORDER BY "totalCost" DESC`,
        [eventID]
      );

      const event = await dbGet(
        `SELECT "salesFeesLocked","isFinalized" FROM "EventInfo" WHERE "eventID"=$1`,
        [eventID]
      );

      const totalSalesFees = rows.reduce((s, r) => s + Number(r.totalCost), 0);
      const unmatchedCount = rows.filter(r => r.matchType === 'unmatched').length;

      res.json({
        rows,
        totalSalesFees: Math.round(totalSalesFees * 100) / 100,
        unmatchedCount,
        isLocked: event?.salesFeesLocked || false,
        isFinalized: event?.isFinalized === 1,
        calculatedAt: rows[0]?.calculatedAt || null,
      });
    } catch (err) {
      console.error('❌ GET /api/events/:eventID/sales-fees:', err);
      res.status(500).json({ error: 'Failed to load sales fees' });
    }
  });

  // PUT /api/events/:eventID/sales-fees — trigger (re)calculation
  app.put('/api/events/:eventID/sales-fees', async (req, res) => {
    try {
      const eventID = Number(req.params.eventID);
      if (!Number.isFinite(eventID)) return res.status(400).json({ error: 'Invalid eventID' });
      if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: 'Event not found' });

      const event = await dbGet(
        `SELECT "salesFeesLocked","isFinalized" FROM "EventInfo" WHERE "eventID"=$1`,
        [eventID]
      );

      if (event?.salesFeesLocked) {
        return res.status(403).json({
          error: 'Sales fees are locked for this finalized event. Use the unlock endpoint first.',
          locked: true,
        });
      }

      const result = await calculateEventSalesFees(eventID);
      res.json(result);
    } catch (err) {
      console.error('❌ PUT /api/events/:eventID/sales-fees:', err);
      res.status(500).json({ error: 'Failed to calculate sales fees' });
    }
  });

  // PUT /api/events/:eventID/sales-fees/lock — lock fees after finalizing
  app.put('/api/events/:eventID/sales-fees/lock', async (req, res) => {
    try {
      const eventID = Number(req.params.eventID);
      if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: 'Event not found' });

      await dbRun(
        `UPDATE "EventInfo" SET "salesFeesLocked"=TRUE WHERE "eventID"=$1`,
        [eventID]
      );
      res.json({ success: true, locked: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to lock sales fees' });
    }
  });

  // PUT /api/events/:eventID/sales-fees/unlock — unlock for recalculation
  app.put('/api/events/:eventID/sales-fees/unlock', async (req, res) => {
    try {
      const eventID = Number(req.params.eventID);
      if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: 'Event not found' });

      await dbRun(
        `UPDATE "EventInfo" SET "salesFeesLocked"=FALSE WHERE "eventID"=$1`,
        [eventID]
      );
      res.json({ success: true, locked: false });
    } catch (err) {
      res.status(500).json({ error: 'Failed to unlock sales fees' });
    }
  });

  // PUT /api/events/:eventID/sales-fees/manual-match — save a manual recipe link
  // Body: { salesFeeId, recipeId }
  app.put('/api/events/:eventID/sales-fees/manual-match', async (req, res) => {
    try {
      const eventID = Number(req.params.eventID);
      if (!(await assertOwnsEvent(req, eventID))) return res.status(404).json({ error: 'Event not found' });

      const { salesFeeId, recipeId } = req.body;
      if (!salesFeeId || !recipeId) return res.status(400).json({ error: 'salesFeeId and recipeId required' });

      // Verify recipe ownership
      if (!(await assertOwnsRecipe(req, Number(recipeId)))) {
        return res.status(403).json({ error: 'Recipe not found' });
      }

      // Get current item name to save squareName alias on the recipe
      const feeRow = await dbGet(
        `SELECT "itemName" FROM "EventSalesFees" WHERE "id"=$1 AND "eventID"=$2`,
        [salesFeeId, eventID]
      );
      if (!feeRow) return res.status(404).json({ error: 'Sales fee row not found' });

      // Save alias so future auto-matching works
      await dbRun(
        `UPDATE "RecipeCards" SET "squareName"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        [feeRow.itemName, recipeId]
      );

      // Recalculate cost for this item using new recipe
      const costPerUnit = await getRecipeCostPerUnit(Number(recipeId));
      const qty = (await dbGet(
        `SELECT "quantitySold" FROM "EventSalesFees" WHERE "id"=$1`,
        [salesFeeId]
      ))?.quantitySold || 0;

      const recipe = await dbGet(`SELECT "name" FROM "RecipeCards" WHERE "id"=$1`, [recipeId]);

      await dbRun(
        `UPDATE "EventSalesFees"
         SET "recipeId"=$1,"matchType"='manual',"matchedName"=$2,
             "costPerUnit"=$3,"totalCost"=$4,"calculatedAt"=NOW()
         WHERE "id"=$5`,
        [recipeId, recipe.name, Math.floor(costPerUnit * 100) / 100,
         (Math.floor(costPerUnit * 100) / 100) * qty, salesFeeId]
      );

      const flooredCost = Math.floor(costPerUnit * 100) / 100;
      res.json({ success: true, costPerUnit: flooredCost, totalCost: flooredCost * qty });
    } catch (err) {
      console.error('❌ manual-match:', err);
      res.status(500).json({ error: 'Failed to save manual match' });
    }
  });

  // GET /api/recipes/template — download blank CSV template
  app.get('/api/recipes/template', (_req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="recipes_template.csv"');
    res.send(
      'recipeName,ingredientName,quantityUsed,unitType,unitCost\n' +
      'Regular Lemonade,Straw,1,Per Cup,0.01\n' +
      'Regular Lemonade,Cup & Lid,1,Per Cup,0.21\n' +
      'Regular Lemonade,Lemon,1,Per Cup,0.28\n' +
      'Regular Lemonade,Simple Syrup,3,Per Oz,0.03\n' +
      'Regular Lemonade,Ice,1,per lb,0.19\n'
    );
  });

  console.log('✅ Recipe routes registered');
}

module.exports = { init, runMigration, calculateEventSalesFees, findBestMatch };
