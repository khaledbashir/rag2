#!/usr/bin/env python3
"""
Deterministic PDF Table Extractor using pdfplumber.
Called from Node.js via child_process.execFile.

Usage: python3 pdfplumber-extract.py <pdf_path>
Output: JSON to stdout with extracted LED displays.

Uses find_tables() with cell boundaries for accurate extraction.
No AI. No model. Same input = same output, every time.
"""

import sys
import json
import pdfplumber

# LED schedule table identifiers
LED_TABLE_HEADERS = [
    "led board schedule",
    "scoreboard",
    "ribbon board",
    "entry led",
    "exterior led",
    "display schedule",
    "display matrix",
    "led videoboard",
]

# Column header labels (exact cell matches, not substring)
COLUMN_HEADER_LABELS = {
    "av device no.", "av device no", "led id", "pixel pitch", "pixel pitch [mm]",
    "brightness", "brightness [nits]", "led brightness", "led pixel pitch",
    "room", "description", "led size", "display width", "display height",
    "approximate total area", "mee av display width", "mee av display height",
}


def is_led_table_header(row):
    text = " ".join(str(c or "") for c in row).lower()
    return any(h in text for h in LED_TABLE_HEADERS)


def is_column_header(row):
    cells = [str(c or "").strip().lower() for c in row]
    matches = sum(1 for c in cells if c in COLUMN_HEADER_LABELS)
    return matches >= 3


def is_data_row(row):
    non_empty = [c for c in row if c and str(c).strip()]
    if len(non_empty) < 2:
        return False
    if is_led_table_header(row) or is_column_header(row):
        return False
    return True


def parse_interior_row(row):
    if len(row) < 6:
        return None
    device_id = str(row[0] or "").strip()
    size_raw = str(row[1] or "").strip()
    brightness = str(row[2] or "").strip()
    pitch = str(row[3] or "").strip()
    room = str(row[4] or "").strip()

    if not room or not size_raw:
        return None

    width, height = "", ""
    for sep in ["x", "X"]:
        if sep in size_raw:
            parts = size_raw.split(sep, 1)
            width = parts[0].strip()
            height = parts[1].strip()
            break

    return {
        "name": room,
        "led_id": device_id,
        "pixel_pitch_mm": float(pitch) if pitch and pitch.replace(".", "").isdigit() else None,
        "brightness_nits": int(brightness) if brightness.isdigit() else None,
        "width": width,
        "height": height,
        "environment": "indoor",
        "category": "led_display",
        "quantity": 1,
    }


def parse_outdoor_row(row, table_context=""):
    if len(row) < 6:
        return None
    led_id = str(row[0] or "").strip()
    pitch = str(row[1] or "").strip()
    brightness = str(row[2] or "").strip()
    width = str(row[3] or "").strip()
    height = str(row[4] or "").strip()

    if not led_id:
        return None

    # Skip non-numeric brightness
    try:
        nits = int(brightness)
        if nits < 100:
            return None
    except ValueError:
        return None

    # Build name from context
    name = led_id
    ctx = table_context.lower()
    if "entry" in ctx and "east" in ctx:
        name = f"EAST ENTRY {led_id}"
    elif "north entry" in ctx:
        name = f"NORTH ENTRY {led_id}"
    elif "north" in ctx and "exterior" in ctx:
        name = f"NORTH EAST EXTERIOR {led_id}"
    elif "south" in ctx and "exterior" in ctx:
        name = f"SOUTH EAST EXTERIOR {led_id}"
    elif "scoreboard" in ctx and led_id in ("EAST", "WEST"):
        name = f"SCOREBOARD {led_id}"
    elif led_id in ("NW", "SW"):
        name = f"RIBBON {led_id}"

    return {
        "name": name,
        "led_id": led_id,
        "pixel_pitch_mm": float(pitch) if pitch and pitch.replace(".", "").isdigit() else None,
        "brightness_nits": nits,
        "width": width,
        "height": height,
        "environment": "outdoor",
        "category": "led_display",
        "quantity": 1,
    }


def extract_led_tables(pdf_path):
    pdf = pdfplumber.open(pdf_path)
    all_displays = []
    tables_found = []
    current_table_name = ""
    current_schema = None

    for page_num, page in enumerate(pdf.pages, 1):
        tables = page.find_tables()

        for table in tables:
            data = table.extract()
            if not data:
                continue

            for row in data:
                row_text = " ".join(str(c or "") for c in row).lower().strip()

                # Table title header
                if is_led_table_header(row):
                    current_table_name = " ".join(str(c or "") for c in row).strip()
                    tables_found.append(current_table_name)
                    if "interior" in row_text or "led board schedule" in row_text:
                        current_schema = "interior"
                    else:
                        current_schema = "outdoor"
                    continue

                # Column header
                if is_column_header(row):
                    if "av device" in row_text and "room" in row_text:
                        current_schema = "interior"
                    elif "led id" in row_text or "display width" in row_text:
                        current_schema = "outdoor"
                    continue

                if not is_data_row(row):
                    continue

                # Parse data row
                display = None
                if current_schema == "interior":
                    display = parse_interior_row(row)
                elif current_schema == "outdoor":
                    display = parse_outdoor_row(row, current_table_name)
                else:
                    first_cell = str(row[0] or "")
                    if first_cell.startswith("LED."):
                        display = parse_interior_row(row)
                    elif len(row) >= 6:
                        display = parse_outdoor_row(row, current_table_name)

                if display:
                    display["page"] = page_num
                    display["source_table"] = current_table_name
                    all_displays.append(display)

    pdf.close()

    interior = [d for d in all_displays if d["environment"] == "indoor"]
    outdoor = [d for d in all_displays if d["environment"] == "outdoor"]

    return {
        "displays": all_displays,
        "tables_found": tables_found,
        "stats": {
            "total": len(all_displays),
            "interior": len(interior),
            "outdoor": len(outdoor),
            "pages_processed": len(pdf.pages) if hasattr(pdf, "pages") else 0,
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdfplumber-extract.py <pdf_path>"}))
        sys.exit(1)

    try:
        result = extract_led_tables(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
