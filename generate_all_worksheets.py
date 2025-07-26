import os
import json
from pathlib import Path
from build_pdf import generate_pdf  # Or the name of your PDF script if different

input_dir = Path("output")
output_dir = Path("worksheets")
output_dir.mkdir(parents=True, exist_ok=True)

for json_file in input_dir.glob("*.json"):
    with open(json_file, "r") as f:
        data = json.load(f)
    slug = json_file.stem  # filename without .json
    pdf_path = output_dir / f"{slug}.pdf"
    generate_pdf(data, str(pdf_path))
