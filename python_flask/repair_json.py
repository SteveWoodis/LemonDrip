import json, re
from pathlib import Path

src = Path("Master_EventData_Full-old4.json")
raw = src.read_text(encoding="utf-8", errors="ignore")

# --- Fix "Discounts" structure ---
# Move Totals inside same Discounts object if misplaced
fixed = re.sub(
    r'("Discounts"\s*:\s*\{\s*"Data"\s*:\s*\[[^\]]*\])\s*\],\s*"Totals"',
    r'\1,\n    "Totals"',
    raw,
    flags=re.DOTALL
)

# Remove stray commas or blank lines before next event
fixed = re.sub(r'\},\s*\n\s*\n\s*\{', r'},\n  {', fixed)

# Validate
data = json.loads(fixed)
print("✅ JSON validated successfully, events:", len(data.get("Events", [])))

# Save pretty-printed
out = Path("Master_EventData_Full_REBUILT.json")
out.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("✨ Saved:", out)
