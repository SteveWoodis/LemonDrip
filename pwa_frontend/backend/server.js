// -------------------------------
// ✅ Fix for ES Modules (__dirname)
// -------------------------------
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------
// Standard imports and setup
// -------------------------------
import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------
// ✅ Correct data directory setup
// -------------------------------
const dataDir = path.resolve(__dirname, "Data"); // note: no leading slash!
const masterFile = path.join(dataDir, "Master_EventData_Full.json");
const templatesFile = path.join(dataDir, "formTemplates.json");

// optional: ensure data folder exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// -------------------------------
// Example routes
// -------------------------------
app.get("/", (req, res) => res.send("✅ Backend running successfully!"));

app.get("/api/events", (req, res) => {
  try {
    if (!fs.existsSync(masterFile)) {
      return res.json({ Events: [] });
    }

    const jsonData = JSON.parse(fs.readFileSync(masterFile, "utf-8"));
    const events = jsonData.Events || jsonData;
    const { name, date, id } = req.query;

    const filtered = events.filter((e) => {
      const eventName =
        e.EventInfo?.["Event Name"] ||
        e["Event Name"] ||
        "";
      const eventDate =
        e.EventInfo?.["Event Date"] ||
        e["Event Date"] ||
        "";
      const eventId = e.EventID || "";

      const nameMatch = !name || eventName.toLowerCase().includes(name.toLowerCase());
      const dateMatch = !date || eventDate.includes(date);
      const idMatch = !id || String(eventId) === String(id);

      return nameMatch && dateMatch && idMatch;
    });

    console.log(`📤 Returning ${filtered.length} events`);
    res.json({ Events: filtered });
  } catch (err) {
    console.error("❌ Error reading events:", err);
    res.status(500).json({ error: "Failed to read events" });
  }
});


// Save event
app.post("/api/events", (req, res) => {
  try {
    const rawData = fs.existsSync(masterFile)
      ? fs.readFileSync(masterFile, "utf-8")
      : JSON.stringify({ Events: [] });

    const jsonData = JSON.parse(rawData);
    const events = jsonData.Events || [];
    const newEvent = req.body;

    newEvent.EventID = events.length + 1;
    newEvent.createdAt = new Date().toISOString();
    newEvent.createdDate = newEvent.createdAt.split("T")[0];

    events.push(newEvent);

    fs.writeFileSync(masterFile, JSON.stringify({ Events: events }, null, 2), "utf-8");
    res.json({ success: true, event: newEvent });
  } catch (err) {
    console.error("❌ Error saving event:", err);
    res.status(500).json({ error: "Failed to save event" });
  }
});

// Save template
app.post("/api/formTemplates", (req, res) => {
  try {
    const newTemplate = req.body;
    if (!newTemplate?.templateName)
      return res.status(400).json({ error: "Template must have a name" });

    const templates = fs.existsSync(templatesFile)
      ? JSON.parse(fs.readFileSync(templatesFile, "utf-8"))
      : [];

    const existingIndex = templates.findIndex(
      (t) => t.templateName === newTemplate.templateName
    );
    if (existingIndex >= 0) templates[existingIndex] = newTemplate;
    else templates.push(newTemplate);

    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2), "utf-8");
    res.json({ success: true, templates });
  } catch (err) {
    console.error("❌ Error saving template:", err);
    res.status(500).json({ error: "Failed to save template" });
  }
});
// 🧩 Get all templates
app.get("/api/formTemplates", (req, res) => {
  if (!fs.existsSync(templatesFile)) return res.json([]);
  const templates = JSON.parse(fs.readFileSync(templatesFile, "utf-8"));
  res.json(templates);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
