#!/usr/bin/env python3
"""
PDF Table Extractor using pdfplumber.
Called from Node.js via child_process.execFile.

Usage: python3 pdfplumber-extract.py <pdf_path>
Output: JSON to stdout with extracted LED displays from all tables.

Handles multi-column AV schedule drawings that pdftotext can't parse.
"""

import sys
import json
import pdfplumber


def extract_led_tables(pdf_path: str) -> dict:
    """Extract all LED-related tables from a PDF using pdfplumber."""
    pdf = pdfplumber.open(pdf_path)
    led_displays = []
    non_led_tables = 0

    for page_idx, page in enumerate(pdf.pages):
        tables = page.extract_tables()

        # Track whether the previous table was an LED header (for split header/data tables)
        prev_was_led_header = False

        for ti, table in enumerate(tables):
            if not table or not table[0]:
                prev_was_led_header = False
                continue

            cells_flat = ' '.join(str(c or '') for row in table for c in row).upper()

            # Detect LED-related tables
            is_interior_led = 'INTERIOR LED' in cells_flat or 'LED BOARD' in cells_flat
            is_outdoor_led = any(kw in cells_flat for kw in [
                'SCOREBOARD', 'RIBBON BOARD', 'ENTRY LED',
                'EXTERIOR LED', 'NORTH ENTRY', 'SOUTH ENTRY',
                'EAST ENTRY', 'WEST ENTRY',
            ])
            is_led_data = 'PIXEL PITCH' in cells_flat or 'BRIGHTNESS' in cells_flat

            # Check if this table has LED data rows (6 cols with nits >= 1000)
            # Handles split header/data tables AND orphaned data tables
            is_data_after_header = False
            if len(table[0]) == 6:
                first_cells = [str(c or '').strip() for c in table[0]]
                try:
                    nits_check = int(first_cells[2]) if first_cells[2].isdigit() else 0
                    if nits_check >= 1000:
                        is_data_after_header = True
                except (ValueError, IndexError):
                    pass

            # Update header tracking
            if is_outdoor_led or is_led_data:
                prev_was_led_header = True
            elif not is_data_after_header:
                prev_was_led_header = False

            if is_interior_led:
                # Interior LED Board Schedule — LED.xxx IDs with WxH sizes
                for row in table:
                    cells = [str(c or '').strip() for c in row]
                    if not cells[0].startswith('LED.'):
                        continue
                    led_id = cells[0]
                    size = cells[1] if len(cells) > 1 else None
                    nits = cells[2] if len(cells) > 2 else None
                    pitch = cells[3] if len(cells) > 3 else None
                    room = cells[4] if len(cells) > 4 else None

                    # Parse WxH from size field
                    width, height = None, None
                    if size and ('x' in size.lower()):
                        parts = size.lower().split('x')
                        width = parts[0].strip() if len(parts) > 0 else None
                        height = parts[1].strip() if len(parts) > 1 else None

                    led_displays.append({
                        'name': room or led_id,
                        'led_id': led_id,
                        'pixel_pitch_mm': float(pitch) if pitch and pitch.replace('.', '').isdigit() else None,
                        'brightness_nits': int(nits) if nits and nits.isdigit() else None,
                        'width': width,
                        'height': height,
                        'environment': 'indoor',
                        'category': 'led_display',
                        'quantity': 1,
                        'page': page_idx + 1,
                    })

            elif is_outdoor_led or is_led_data or is_data_after_header:
                # Outdoor/scoreboard/ribbon/entry LED tables
                # Format: Location | Pitch | Nits | Width | Height | Area
                for row in table:
                    cells = [str(c or '').strip() for c in row]
                    # Skip header rows
                    if not cells[0] or cells[0].upper() in ('LED ID', 'LOCATION', ''):
                        continue
                    if cells[0].upper().startswith('A/V '):
                        continue

                    # Try to parse as LED data (need at least nits)
                    try:
                        nits_val = int(cells[2]) if len(cells) > 2 and cells[2].isdigit() else None
                        if nits_val and nits_val >= 1000:
                            pitch = cells[1] if len(cells) > 1 else None
                            width = cells[3] if len(cells) > 3 else None
                            height = cells[4] if len(cells) > 4 else None

                            led_displays.append({
                                'name': cells[0],
                                'led_id': None,
                                'pixel_pitch_mm': float(pitch) if pitch and pitch.replace('.', '').isdigit() else None,
                                'brightness_nits': nits_val,
                                'width': width,
                                'height': height,
                                'environment': 'outdoor',
                                'category': 'led_display',
                                'quantity': 1,
                                'page': page_idx + 1,
                            })
                    except (ValueError, IndexError):
                        pass
            else:
                non_led_tables += 1

    pdf.close()

    # Summary
    interior = [d for d in led_displays if d['environment'] == 'indoor']
    outdoor = [d for d in led_displays if d['environment'] == 'outdoor']

    return {
        'displays': led_displays,
        'stats': {
            'total': len(led_displays),
            'interior': len(interior),
            'outdoor': len(outdoor),
            'non_led_tables_skipped': non_led_tables,
            'pages_processed': len(pdf.pages) if hasattr(pdf, 'pages') else 0,
        },
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: pdfplumber-extract.py <pdf_path>'}))
        sys.exit(1)

    try:
        result = extract_led_tables(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
