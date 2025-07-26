import os
import json
from pathlib import Path
from build_pdf import generate_pdf  # or whatever your file is named

# Load JSON for 1 Peter 5:7 ESV
json_path = Path("output/1_peter_5_7_esv.json")
with open(json_path, "r") as f:
    data = json.load(f)

# Define output path
output_path = Path("worksheets/1_peter_5_7_esv.pdf")
output_path.parent.mkdir(parents=True, exist_ok=True)

# Generate the worksheet
generate_pdf(data, output_path)
