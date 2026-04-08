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
import re
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

SERVICE_LABELS = ("FRONT/REAR", "FRONT", "TOP", "REAR", "N/A", "--")

FLAT_ROW_PATTERN = re.compile(
    r"^(?P<left>.+?)\s+"
    r"(?P<qty>\d+)\s+"
    r"(?P<pitch>(?:\d+(?:\.\d+)?\s*MM|\d+(?:\.\d+)?MM|N/A|--))\s+"
    r"(?P<height>(?:TBD|N/A|--|[\d'\"./-]+))\s+"
    r"(?P<width>(?:TBD|N/A|--|[\d'\"./-]+))\s+"
    r"(?P<sqft>(?:TBD|N/A|--|\d+(?:\.\d+)?))\s+"
    r"(?P<nits>(?:N/A|--|\d{3,4}))\s+"
    r"(?P<service>FRONT/REAR|FRONT|TOP|REAR|N/A|--)\s+"
    r"(?P<bid>YES|ALT|--)\s+"
    r"(?P<budget>[A-Z][A-Z ]+?)(?:\s{2,}.*)?$"
)


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


def looks_like_item_number(value):
    value = (value or "").strip().upper()
    if not value:
        return False
    return (
        value.startswith("ALT ")
        or value.startswith("BOARD ")
        or bool(re.match(r"^[A-Z]?\d+(?:\.\d+)*[A-Z]?$", value))
    )


def parse_pitch_value(raw):
    raw = (raw or "").strip().upper().replace(" ", "")
    if raw in ("N/A", "--", ""):
        return None
    raw = raw.replace("MM", "")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_nits_value(raw):
    raw = (raw or "").strip().upper()
    if raw in ("N/A", "--", ""):
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def dedupe_displays(displays):
    unique = {}
    for display in displays:
        key = (
            display.get("led_id") or "",
            display.get("name") or "",
            display.get("width") or "",
            display.get("height") or "",
            display.get("brightness_nits"),
            display.get("pixel_pitch_mm"),
        )
        unique[key] = display
    return list(unique.values())


def parse_flat_schedule_line(line, table_context="", page_num=None):
    line = (line or "").replace("“", '"').replace("”", '"').replace("’", "'").strip()
    if not line:
        return None
    if "ARENA LED" not in line and "N/A" not in line:
        return None
    if re.match(r"^(DISPLAY|ID|ITEM|NOTES?:|REFER TO|PROVIDE |DESIGN |DEPTH |ON ARENA|EXTERIOR,|CUSTOM LED|ENCLOSURE |LETTERING |MOUNTED |CONICAL |BACK LIT |RE-INSTALLATION |ALTERNATE:)", line, re.I):
        return None

    parts = [part.strip() for part in re.split(r"\s{2,}", line) if part and part.strip()]

    service_idx = -1
    for idx, part in enumerate(parts):
        if part not in SERVICE_LABELS:
            continue
        if idx < 6 or idx + 2 >= len(parts):
            continue
        if parts[idx + 1] not in ("YES", "ALT", "--"):
            continue
        if "LED" not in parts[idx + 2] and parts[idx + 2] != "N/A":
            continue
        service_idx = idx
        break

    if service_idx >= 0:
        left_parts = parts[: service_idx - 6]
        qty_raw = parts[service_idx - 6]
        pitch_raw = parts[service_idx - 5]
        height = parts[service_idx - 4]
        width = parts[service_idx - 3]
        nits = parse_nits_value(parts[service_idx - 1])
    else:
        match = FLAT_ROW_PATTERN.match(line)
        if not match:
            return None
        left_parts = [part.strip() for part in re.split(r"\s{2,}", match.group("left").strip()) if part and part.strip()]
        qty_raw = match.group("qty")
        pitch_raw = match.group("pitch").strip()
        height = match.group("height").strip()
        width = match.group("width").strip()
        nits = parse_nits_value(match.group("nits"))

    try:
        qty = int(qty_raw)
    except ValueError:
        return None

    # Category/header rows masquerading as data always use placeholder specs.
    if pitch_raw.upper() in ("N/A", "--") and height.upper() in ("N/A", "--") and width.upper() in ("N/A", "--", "TBD"):
        return None

    if len(left_parts) < 2:
        return None

    led_id = left_parts[0]
    item_no = None
    name = ""
    location = ""

    if len(left_parts) >= 4 and looks_like_item_number(left_parts[1]):
        item_no = left_parts[1]
        name = left_parts[2]
        location = left_parts[3]
    elif len(left_parts) >= 3:
        name = left_parts[1]
        location = left_parts[2]
    else:
        name = left_parts[1]
        location = left_parts[1]

    if not name:
        return None

    context = f"{table_context} {location} {name}".lower()
    environment = "outdoor" if ("outdoor" in context or "exterior" in context or nits and nits >= 4000) else "indoor"

    display = {
        "name": name,
        "led_id": led_id,
        "pixel_pitch_mm": parse_pitch_value(pitch_raw),
        "brightness_nits": nits,
        "width": width,
        "height": height,
        "environment": environment,
        "category": "led_display",
        "quantity": qty,
    }
    if item_no:
        display["item_no"] = item_no
    if page_num is not None:
        display["page"] = page_num
    if table_context:
        display["source_table"] = table_context
    return display


def extract_flattened_rows(text_block, table_context="", page_num=None):
    displays = []
    for raw_line in (text_block or "").splitlines():
        parsed = parse_flat_schedule_line(raw_line, table_context=table_context, page_num=page_num)
        if parsed:
            displays.append(parsed)
    return displays


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

            flat_table_text = "\n".join(
                " ".join(str(c or "") for c in row).strip()
                for row in data
                if any(str(c or "").strip() for c in row)
            )

            # Some large schedules collapse into a single giant text cell instead of real columns.
            # Parse those line-by-line rather than treating them as empty/invalid tables.
            if flat_table_text and len(data) <= 4:
                flattened = extract_flattened_rows(flat_table_text, current_table_name or "LED DISPLAY SCHEDULE", page_num)
                if flattened:
                    all_displays.extend(flattened)

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

        # Full-page text fallback for flattened schedule sheets that defeat table cell extraction.
        page_text = page.extract_text(layout=True) or ""
        if page_text:
            all_displays.extend(extract_flattened_rows(page_text, current_table_name or "LED DISPLAY SCHEDULE", page_num))

    pdf.close()
    all_displays = dedupe_displays(all_displays)

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
