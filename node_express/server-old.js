import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const dataPath = path.join(__dirname, 'Master_EventData_Full.json');

// 🧠 Safe JSON loader
let db;
try {
  db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (err) {
  console.error("❌ Error reading Master_EventData_Full.json:", err.message);
  db = { Events: [] };
}

// ------------------------------
// Base data endpoints
// ------------------------------
app.get('/api/event', (req, res) => res.json(db.EventInfo || {}));
app.get('/api/employee-tracker', (req, res) =>
  res.json(db["Employee Tracker"]?.Data || db.EmployeeTracker?.Data || [])
);
app.get('/api/supply-costs', (req, res) => res.json(db.SupplyCosts?.Data || []));
app.get('/api/tip-tracker', (req, res) => res.json(db.TipTracker?.Data || []));
app.get('/api/drink-sales', (req, res) => res.json(db.DrinkSales?.Data || []));
app.get('/api/additional-fees', (req, res) => res.json(db.AdditionalFees?.Data || []));
app.get('/api/event-runner-fees', (req, res) => res.json(db.EventRunnerFees?.Data || []));
app.get('/api/discounts', (req, res) => res.json(db.Discounts?.Data || []));
app.get('/api/all', (req, res) => res.json(db));

// ------------------------------
// MULTI-EVENT SUPPORT
// ------------------------------
if (!db.Events) db.Events = [];

// 🔍 Search by name, date, or EventID
/*app.get('/api/events', (req, res) => {
  const { name, date, id } = req.query;
  let events = db.Events;

  // --- Filter by EventID ---
  if (id) {
    const queryId = id.trim();
    events = events.filter(e => e.EventID?.toString() === queryId);
  }

  // --- Filter by event name ---
  if (name) {
    const queryName = name.toLowerCase().trim();
    events = events.filter(e => {
      const eventName =
        e.EventInfo?.["Event Name"] ||
        e.EventInfo?.["EventName"] ||
        e.EventInfo?.["Name"];
      return eventName?.toLowerCase().includes(queryName);
    });
  }

  // --- Filter by event date ---
  if (date) {
    const queryDate = date.trim();
    events = events.filter(e => {
      const eventDate =
        e.EventInfo?.["Event Dates"] ||
        e.EventInfo?.["Event Date"] ||
        e.EventInfo?.["Date"];
      if (!eventDate) return false;

      // Normalize MM/DD/YY vs YYYY-MM-DD
      const normalized = eventDate
        .replace(/-/g, '/')
        .replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$2/$3/$1');
      const searchEnd = queryDate.slice(-5).replace('-', '/');
      return (
        normalized.includes(searchEnd) ||
        normalized === queryDate ||
        normalized === searchEnd
      );
    });
  }

  res.json(events);
});*/

app.get('/api/events', (req, res) => {
  fs.readFile('Master_EventData_Full.json', 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading data');
    const jsonData = JSON.parse(data);
    res.json(jsonData.Events || []);
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));




// ➕ Add new event
app.post('/api/events', (req, res) => {
  const newEvent = req.body;
  if (!db.Events) db.Events = [];

  newEvent.EventID = (db.Events.length + 1).toString().padStart(3, '0');
  db.Events.push(newEvent);

  try {
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
    res.json({ success: true, message: "✅ Event added successfully!", event: newEvent });
  } catch (err) {
    console.error("❌ Error writing to JSON:", err.message);
    res.status(500).json({ success: false, message: "Failed to save event." });
  }
});
// ✏️ Update existing event by ID
app.put('/api/events/:id', (req, res) => {
  const eventId = req.params.id;
  const updatedEvent = req.body;

  const index = db.Events.findIndex(e => e.EventID === eventId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }

  db.Events[index] = updatedEvent;

  try {
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
    res.json({ success: true, message: "✅ Event updated successfully" });
  } catch (err) {
    console.error("❌ Error saving file:", err);
    res.status(500).json({ success: false, message: "Failed to save event" });
  }
});

// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ LemonDrip API running on http://localhost:${PORT}`)
);
