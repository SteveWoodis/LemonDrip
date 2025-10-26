from flask import Flask, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

# Load JSON at startup
DATA_PATH = os.path.join(os.path.dirname(__file__), "Master_EventData.json")
with open(DATA_PATH, "r") as f:
    db = json.load(f)

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "endpoints": ["/api/event","/api/employees","/api/supplies","/api/all"]})

@app.get("/api/event")
def event():
    return jsonify(db.get("EventInfo", {}))

@app.get("/api/employees")
def employees():
    return jsonify(db.get("Employees", []))

@app.get("/api/supplies")
def supplies():
    return jsonify(db.get("Supplies", []))

@app.get("/api/all")
def all_data():
    return jsonify(db)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
