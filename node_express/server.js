//--------------------------------------------------------------
// LemonDrip Event Data Server
//--------------------------------------------------------------
import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'Master_EventData_Full.json');

//--------------------------------------------------------------
// Middleware
//--------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // optional, for serving your PWA files

//--------------------------------------------------------------
// GET /api/events  — return all events (with optional filters)
//--------------------------------------------------------------
app.get('/api/events', (req, res) => {
  const { name, date, id } = req.query;

  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Error reading JSON file:', err);
      return res.status(500).json({ error: 'Failed to read data' });
    }

    let jsonData;
    try {
      jsonData = JSON.parse(data || '{}');
    } catch (e) {
      console.error('⚠️ JSON parse error:', e);
      return res.status(500).json({ error: 'Invalid JSON structure' });
    }

    let events = jsonData.Events || [];

    // Optional filtering
    if (id) {
      events = events.filter(e => e.EventID?.toLowerCase() === id.toLowerCase());
    }
    if (name) {
      events = events.filter(e =>
        e.EventInfo?.["Event Name"]?.toLowerCase().includes(name.toLowerCase())
      );
    }
    if (date) {
      events = events.filter(e =>
        e.EventInfo?.["Event Dates"]?.includes(date) ||
        e.EventInfo?.["Event Date"]?.includes(date)
      );
    }

    res.json(events);
  });
});

//--------------------------------------------------------------
// GET /api/events/:id — get single event by ID
//--------------------------------------------------------------
app.get('/api/events/:id', (req, res) => {
  const id = req.params.id;
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading data');
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch {
      return res.status(500).send('Invalid JSON');
    }
    const event = jsonData.Events?.find(e => e.EventID === id);
    if (!event) return res.status(404).send('Event not found');
    res.json(event);
  });
});

//--------------------------------------------------------------
// POST /api/events — add a new event
//--------------------------------------------------------------
app.post('/api/events', (req, res) => {
  const newEvent = req.body;

  if (!newEvent || !newEvent.EventInfo || !newEvent.EventInfo["Event Name"]) {
    return res.status(400).json({ error: 'Invalid event data' });
  }

  // Auto-generate a unique ID if missing
  newEvent.EventID = newEvent.EventID || 'EVT-' + Date.now().toString(36);

  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    let jsonData = { Events: [] };

    if (!err && data) {
      try {
        jsonData = JSON.parse(data);
        if (!Array.isArray(jsonData.Events)) jsonData.Events = [];
      } catch {
        console.warn('⚠️ Could not parse existing file, resetting structure.');
        jsonData = { Events: [] };
      }
    }

    jsonData.Events.push(newEvent);

    fs.writeFile(DATA_FILE, JSON.stringify(jsonData, null, 2), (err) => {
      if (err) {
        console.error('❌ Error writing JSON file:', err);
        return res.status(500).json({ error: 'Failed to save event' });
      }

      console.log(`✅ Added new event: ${newEvent.EventInfo["Event Name"]}`);
      res.status(201).json({ message: 'Event added successfully', event: newEvent });
    });
  });
});

//--------------------------------------------------------------
// Start server
//--------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 LemonDrip Server running on http://localhost:${PORT}`);
});
