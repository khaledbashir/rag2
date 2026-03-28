"""
Spike: Deterministic LED display extraction using pdfplumber.

Tests 3 documents:
1. BofA AV Schedule (1 page, 6 tables, 47 displays)
2. Panthers Indoor (23 pages, 1 table, 25 displays)
3. Panthers Outdoor (20 pages, 1 table, 18 displays)

Outputs: extracted displays in canonical schema, compared against expected counts.
"""

import pdfplumber
import json
import sys
import os

# LED schedule table identifiers — headers that indicate a display table
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

# Column schemas for different table types
INTERIOR_COLS = ["device_id", "size", "brightness", "pitch", "room", "description"]
OUTDOOR_COLS = ["led_id", "pitch", "brightness", "width", "height", "area"]


def is_led_table_header(row):
    """Check if a row is a LED schedule table header."""
    text = " ".join(str(c or "") for c in row).lower()
    return any(h in text for h in LED_TABLE_HEADERS)


def is_column_header(row):
    """Check if a row is a column header (not data).
    Checks individual cell values — avoids matching 'TEAM ROOM' data as 'Room' header."""
    cells = [str(c or "").strip().lower() for c in row]
    header_labels = {
        "av device no.", "av device no", "led id", "pixel pitch", "pixel pitch [mm]",
        "brightness", "brightness [nits]", "led brightness", "led pixel pitch",
        "room", "description", "led size", "display width", "display height",
        "approximate total area", "mee av display width", "mee av display height",
    }
    matches = sum(1 for c in cells if c in header_labels)
    return matches >= 3


def is_data_row(row):
    """Check if a row contains actual display data (not header/empty)."""
    non_empty = [c for c in row if c and str(c).strip()]
    if len(non_empty) < 2:
        return False
    text = " ".join(str(c or "") for c in row).lower()
    # Skip if it's a header
    if is_led_table_header(row) or is_column_header(row):
        return False
    return True


def parse_interior_row(row):
    """Parse an interior LED board schedule row."""
    if len(row) < 6:
        return None
    device_id = str(row[0] or "").strip()
    size_raw = str(row[1] or "").strip()
    brightness = str(row[2] or "").strip()
    pitch = str(row[3] or "").strip()
    room = str(row[4] or "").strip()
    desc = str(row[5] or "").strip()

    if not room or not size_raw:
        return None

    # Parse size "320' x 3'" or "14' X 8'"
    width_raw, height_raw = "", ""
    for sep in ["x", "X"]:
        if sep in size_raw:
            parts = size_raw.split(sep, 1)
            width_raw = parts[0].strip()
            height_raw = parts[1].strip()
            break

    return {
        "name": room,
        "deviceId": device_id,
        "widthRaw": width_raw,
        "heightRaw": height_raw,
        "pixelPitchMm": float(pitch) if pitch else None,
        "brightnessNits": int(brightness) if brightness.isdigit() else None,
        "environment": "indoor",
        "description": desc,
        "parseMethod": "pdfplumber",
    }


def parse_outdoor_row(row, table_context=""):
    """Parse an outdoor schedule row (ribbons, scoreboards, entries, exterior)."""
    if len(row) < 6:
        return None
    led_id = str(row[0] or "").strip()
    pitch = str(row[1] or "").strip()
    brightness = str(row[2] or "").strip()
    width_raw = str(row[3] or "").strip()
    height_raw = str(row[4] or "").strip()
    area = str(row[5] or "").strip()

    if not led_id:
        return None

    # Determine name from context
    name = led_id
    if "entry" in table_context.lower():
        name = f"EAST ENTRY {led_id}" if "east" in table_context.lower() else led_id
    elif "exterior" in table_context.lower() or "ne" == led_id.lower() or "se" == led_id.lower():
        direction = "NORTH EAST" if "north" in table_context.lower() else "SOUTH EAST"
        name = f"{direction} EXTERIOR {led_id}"
    elif "north entry" in table_context.lower():
        name = f"NORTH ENTRY {led_id}"
    elif led_id in ("EAST", "WEST"):
        name = f"SCOREBOARD {led_id}" if "scoreboard" in table_context.lower() else led_id
    elif led_id in ("NW", "SW"):
        name = f"RIBBON {led_id}"

    return {
        "name": name,
        "deviceId": led_id,
        "widthRaw": width_raw,
        "heightRaw": height_raw,
        "pixelPitchMm": float(pitch) if pitch else None,
        "brightnessNits": int(brightness) if brightness.isdigit() else None,
        "environment": "outdoor",
        "description": None,
        "parseMethod": "pdfplumber",
    }


def extract_displays(pdf_path):
    """Extract all LED displays from a PDF using pdfplumber."""
    pdf = pdfplumber.open(pdf_path)
    all_displays = []
    tables_found = []

    for page_num, page in enumerate(pdf.pages, 1):
        tables = page.find_tables()

        current_table_name = ""
        current_schema = None

        for table in tables:
            data = table.extract()
            if not data:
                continue

            # Process every row in the table
            for row in data:
                row_text = " ".join(str(c or "") for c in row).lower().strip()

                # Check if this row is a table title header
                if is_led_table_header(row):
                    current_table_name = " ".join(str(c or "") for c in row).strip()
                    tables_found.append(current_table_name)
                    if "interior" in row_text or "led board schedule" in row_text:
                        current_schema = "interior"
                    else:
                        current_schema = "outdoor"
                    continue

                # Check if this row is a column header (skip)
                if is_column_header(row):
                    if "av device" in row_text and "room" in row_text:
                        current_schema = "interior"
                    elif "led id" in row_text or "display width" in row_text:
                        current_schema = "outdoor"
                    continue

                # Skip non-data rows
                if not is_data_row(row):
                    continue

                # Parse data row
                display = None
                if current_schema == "interior":
                    display = parse_interior_row(row)
                elif current_schema == "outdoor":
                    display = parse_outdoor_row(row, current_table_name)
                else:
                    # Auto-detect from content
                    if len(row) >= 6:
                        first_cell = str(row[0] or "")
                        if first_cell.startswith("LED."):
                            display = parse_interior_row(row)
                        else:
                            display = parse_outdoor_row(row, current_table_name)

                if display:
                    display["sourcePage"] = page_num
                    display["sourceTable"] = current_table_name
                    all_displays.append(display)

    return {
        "file": os.path.basename(pdf_path),
        "pages": len(pdf.pages),
        "tablesFound": tables_found,
        "displayCount": len(all_displays),
        "displays": all_displays,
    }


def main():
    test_files = [
        ("/root/rag2/AV002 - AUDIO-VIDEO SCHEDULES.pdf", 47, "BofA AV Schedule"),
    ]

    # Check if Panthers files exist
    for f in os.listdir("/root/rag2/natexcel/"):
        if "indoor" in f.lower() and "panthers" in f.lower() and f.endswith(".pdf"):
            test_files.append((f"/root/rag2/natexcel/{f}", 25, "Panthers Indoor"))
        if "outdoor" in f.lower() and "panthers" in f.lower() and f.endswith(".pdf"):
            test_files.append((f"/root/rag2/natexcel/{f}", 18, "Panthers Outdoor"))

    for pdf_path, expected, label in test_files:
        if not os.path.exists(pdf_path):
            print(f"\n{'='*60}")
            print(f"SKIP: {label} — file not found: {pdf_path}")
            continue

        print(f"\n{'='*60}")
        print(f"TEST: {label}")
        print(f"File: {os.path.basename(pdf_path)}")
        print(f"Expected: {expected} displays")
        print(f"{'='*60}")

        result = extract_displays(pdf_path)

        print(f"Pages: {result['pages']}")
        print(f"Tables found: {len(result['tablesFound'])}")
        for t in result["tablesFound"]:
            print(f"  - {t}")
        print(f"Displays extracted: {result['displayCount']}")

        indoor = [d for d in result["displays"] if d["environment"] == "indoor"]
        outdoor = [d for d in result["displays"] if d["environment"] == "outdoor"]
        print(f"Indoor: {len(indoor)}, Outdoor: {len(outdoor)}")

        # Show all displays
        for i, d in enumerate(result["displays"]):
            print(f"  {i+1:2d}. {d['name']:30s} | {d['widthRaw']:15s} x {d['heightRaw']:10s} | {d['pixelPitchMm']}mm | {d['brightnessNits']} nits | {d['environment']}")

        # Verdict
        status = "PASS" if result["displayCount"] == expected else "FAIL"
        print(f"\n{'='*60}")
        print(f"RESULT: {status} — {result['displayCount']}/{expected}")
        if status == "FAIL":
            delta = result["displayCount"] - expected
            print(f"Delta: {'+' if delta > 0 else ''}{delta}")


if __name__ == "__main__":
    main()
