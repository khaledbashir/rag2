#!/bin/bash
# Test MiMo V2 Pro vs GLM-5.1 on RFP extraction
# Uses the same prompt and text input, compares display counts

Z_AI_KEY=$(docker exec abc_ancapp.1.a86savhrfzqdozde8vsn1n6fy printenv Z_AI_API_KEY 2>/dev/null)
Z_AI_BASE=$(docker exec abc_ancapp.1.a86savhrfzqdozde8vsn1n6fy printenv Z_AI_BASE_URL 2>/dev/null)
MIMO_KEY=$(docker exec abc_ancapp.1.a86savhrfzqdozde8vsn1n6fy printenv MIMO_API_KEY 2>/dev/null)
MIMO_BASE="https://api.xiaomimimo.com/v1"

PDF_FILE="$1"
if [ -z "$PDF_FILE" ]; then
  echo "Usage: $0 <pdf-file>"
  exit 1
fi

echo "=== Extracting text from: $PDF_FILE ==="
TEXT=$(pdftotext -layout "$PDF_FILE" - 2>/dev/null)
CHARS=${#TEXT}
echo "Text length: $CHARS chars"

# Truncate if too long
if [ $CHARS -gt 60000 ]; then
  TEXT="${TEXT:0:60000}"
  echo "Truncated to 60KB"
fi

PROMPT='Extract ALL LED displays from this RFP document. Return ONLY a JSON object with: {"displays": [{"name": "location name", "pixel_pitch_mm": 3.9, "brightness_nits": 8000, "width_ft": "14'\''", "height_ft": "8'\''", "environment": "indoor", "quantity": 1}]}. Every row in the source table = one row in output. Never use quantity > 1. Only LED displays, no clocks/racks/equipment.'

echo ""
echo "============================================"
echo "  TEST 1: MiMo V2 Pro"
echo "============================================"
START=$(date +%s%N)

MIMO_RESULT=$(curl -s --max-time 120 "$MIMO_BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MIMO_KEY" \
  -d "$(jq -n --arg model "mimo-v2-pro" --arg prompt "$PROMPT" --arg text "$TEXT" '{
    model: $model,
    messages: [{role: "user", content: ($prompt + "\n\n" + $text)}],
    temperature: 0,
    max_tokens: 32768
  }')")

END=$(date +%s%N)
MIMO_MS=$(( (END - START) / 1000000 ))

MIMO_CONTENT=$(echo "$MIMO_RESULT" | jq -r '.choices[0].message.content // "ERROR"' 2>/dev/null)
MIMO_DISPLAYS=$(echo "$MIMO_CONTENT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
start = text.find('{')
end = text.rfind('}') + 1
if start >= 0 and end > start:
    data = json.loads(text[start:end])
    displays = data.get('displays', [])
    print(f'Count: {len(displays)}')
    for d in displays:
        name = d.get('name', '?')
        w = d.get('width_ft', '?')
        h = d.get('height_ft', '?')
        pitch = d.get('pixel_pitch_mm', '?')
        qty = d.get('quantity', 1)
        print(f'  {name}: {w} x {h}, {pitch}mm, qty={qty}')
else:
    print('Failed to parse JSON')
" 2>/dev/null)

echo "Time: ${MIMO_MS}ms"
echo "$MIMO_DISPLAYS"

echo ""
echo "============================================"
echo "  TEST 2: GLM-5.1 (Z.AI)"
echo "============================================"
START=$(date +%s%N)

# First try glm-5.1, if not available fall back to checking error
GLM_RESULT=$(curl -s --max-time 120 "$Z_AI_BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $Z_AI_KEY" \
  -d "$(jq -n --arg model "glm-5.1" --arg prompt "$PROMPT" --arg text "$TEXT" '{
    model: $model,
    messages: [{role: "user", content: ($prompt + "\n\n" + $text)}],
    temperature: 0,
    max_tokens: 32768
  }')")

END=$(date +%s%N)
GLM_MS=$(( (END - START) / 1000000 ))

# Check for error
GLM_ERROR=$(echo "$GLM_RESULT" | jq -r '.error.message // empty' 2>/dev/null)
if [ -n "$GLM_ERROR" ]; then
  echo "GLM-5.1 error: $GLM_ERROR"
  echo "Trying glm-4.7 instead..."

  START=$(date +%s%N)
  GLM_RESULT=$(curl -s --max-time 120 "$Z_AI_BASE/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $Z_AI_KEY" \
    -d "$(jq -n --arg model "glm-4.7" --arg prompt "$PROMPT" --arg text "$TEXT" '{
      model: $model,
      messages: [{role: "user", content: ($prompt + "\n\n" + $text)}],
      temperature: 0,
      max_tokens: 32768
    }')")
  END=$(date +%s%N)
  GLM_MS=$(( (END - START) / 1000000 ))
fi

GLM_CONTENT=$(echo "$GLM_RESULT" | jq -r '.choices[0].message.content // "ERROR"' 2>/dev/null)
GLM_DISPLAYS=$(echo "$GLM_CONTENT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
start = text.find('{')
end = text.rfind('}') + 1
if start >= 0 and end > start:
    data = json.loads(text[start:end])
    displays = data.get('displays', [])
    print(f'Count: {len(displays)}')
    for d in displays:
        name = d.get('name', '?')
        w = d.get('width_ft', '?')
        h = d.get('height_ft', '?')
        pitch = d.get('pixel_pitch_mm', '?')
        qty = d.get('quantity', 1)
        print(f'  {name}: {w} x {h}, {pitch}mm, qty={qty}')
else:
    print('Failed to parse JSON')
    print(text[:500])
" 2>/dev/null)

echo "Time: ${GLM_MS}ms"
echo "$GLM_DISPLAYS"

echo ""
echo "============================================"
echo "  SUMMARY"
echo "============================================"
echo "MiMo V2 Pro: ${MIMO_MS}ms"
echo "GLM-5.1:     ${GLM_MS}ms"
