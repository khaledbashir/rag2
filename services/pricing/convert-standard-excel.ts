/**
 * Smart Excel Proposal Converter
 * 
 * PRIMARY PATH: Standard format with "Margin Analysis" tab (90% of proposals)
 * FALLBACK PATH: Smart Keyword Detection for one-offs (Moody Center, etc.)
 * 
 * Smart Detection scans all sheets for:
 * - High-value keywords: "Total Sell", "Grand Total", "Investment", "Price", "Total Cost"
 * - Currency formats: $X,XXX.XX or X,XXX.XX USD
 * - Screen indicators: "LED", "Display", "Screen", "mm pitch"
 */

import * as XLSX from 'xlsx';

interface StandardProposal {
  clientName: string;
  projectName: string;
  screens: {
    name: string;
    pitchMm: number;
    quantity: number;
    heightM: number;
    widthM: number;
    areaSqM: number;
    ledCost: number;
    ledSell: number;
    margin: number;
  }[];
  lineItems: {
    description: string;
    cost: number;
    sell: number;
    category: string;
  }[];
  totals: {
    subtotal: number;
    tax: number;
    taxRate: number;
    grandTotal: number;
    currency: string;
  };
  detectionMethod: 'standard' | 'smart_keyword';
}

// Keywords that indicate total/pricing rows
const TOTAL_KEYWORDS = [
  'total sell', 'grand total', 'total investment', 'project total',
  'total price', 'total cost', 'sum total', 'final total',
  'contract amount', 'proposal total', 'bid total'
];

// Keywords that indicate screen/display rows
const SCREEN_KEYWORDS = [
  'led', 'display', 'screen', 'video wall', 'ribbon board',
  'center hung', 'scoreboard', 'videoboard', 'jumbotron'
];

// Pitch patterns
const PITCH_PATTERNS = [
  /(\d+\.?\d*)\s*mm/i,
  /p\s*(\d+\.?\d*)/i,
  /pitch\s*(\d+\.?\d*)/i
];

// Dimension patterns
const DIMENSION_PATTERNS = [
  /(\d+\.?\d*)\s*['\u2032]\s*x\s*(\d+\.?\d*)\s*['\u2032]/i,  // 20' x 10'
  /(\d+\.?\d*)\s*m\s*(?:h|w)?\s*x\s*(\d+\.?\d*)\s*m\s*(?:h|w)?/i,  // 5.06m h x 5.40m w
  /(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*(?:ft|feet|m|meters)/i,  // 20 x 10 ft
];

// Currency extraction patterns
const CURRENCY_PATTERNS = [
  /\$\s*([\d,]+\.?\d*)/,  // $1,234.56
  /([\d,]+\.?\d*)\s*(?:USD|CAD|EUR)/i,  // 1,234.56 USD
  /([\d,]+\.?\d*)\s*\$/,  // 1,234.56 $
];

/**
 * Check if this is a standard format we can handle
 */
export function isStandardFormat(workbook: XLSX.WorkBook): boolean {
  const sheets = workbook.SheetNames;
  return sheets.some(s => s.toLowerCase().includes('margin analysis'));
}

/**
 * Extract currency value from a cell value
 */
function extractCurrency(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  // If it's already a number, return it
  if (typeof value === 'number') return value;
  
  // Convert to string and try to extract
  const str = String(value).trim();
  
  for (const pattern of CURRENCY_PATTERNS) {
    const match = str.match(pattern);
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) return num;
    }
  }
  
  // Try plain number extraction
  const plainMatch = str.match(/([\d,]+\.?\d*)/);
  if (plainMatch) {
    const num = parseFloat(plainMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 1000) return num; // Likely a price if > 1000
  }
  
  return null;
}

/**
 * Check if a row contains total keywords and extract value
 */
function detectTotalRow(row: any[]): { isTotal: boolean; value: number | null; label: string } {
  const rowText = row.map(c => String(c || '').toLowerCase()).join(' ');
  
  for (const keyword of TOTAL_KEYWORDS) {
    if (rowText.includes(keyword)) {
      // Look for currency value in this row
      for (const cell of row) {
        const val = extractCurrency(cell);
        if (val && val > 1000) {
          return { isTotal: true, value: val, label: keyword };
        }
      }
    }
  }
  
  return { isTotal: false, value: null, label: '' };
}

/**
 * Detect if a row describes a screen/display
 */
function detectScreenRow(row: any[]): { isScreen: boolean; name: string; pitchMm: number; dims: {w: number, h: number} | null } {
  const rowText = row.map(c => String(c || '')).join(' ');
  const lowerText = rowText.toLowerCase();
  
  // Check for screen keywords
  const hasScreenKeyword = SCREEN_KEYWORDS.some(kw => lowerText.includes(kw));
  if (!hasScreenKeyword) return { isScreen: false, name: '', pitchMm: 0, dims: null };
  
  // Extract pitch
  let pitchMm = 2.5; // default
  for (const pattern of PITCH_PATTERNS) {
    const match = rowText.match(pattern);
    if (match) {
      pitchMm = parseFloat(match[1]);
      break;
    }
  }
  
  // Extract dimensions
  let dims: {w: number, h: number} | null = null;
  for (const pattern of DIMENSION_PATTERNS) {
    const match = rowText.match(pattern);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      dims = { w, h };
      break;
    }
  }
  
  // Extract name (first cell that looks like a name)
  let name = 'Display';
  for (const cell of row) {
    const str = String(cell || '').trim();
    if (str && str.length > 2 && str.length < 50 && !str.match(/^\d/)) {
      name = str;
      break;
    }
  }
  
  return { isScreen: true, name, pitchMm, dims };
}

/**
 * SMART FALLBACK: Parse any Excel by scanning for keywords
 */
export function parseWithSmartDetection(workbook: XLSX.WorkBook): StandardProposal {
  console.log('[Smart Excel] No Margin Analysis tab found, activating keyword detection...');
  
  let grandTotal: number | null = null;
  let subtotal: number | null = null;
  let currency = 'USD';
  let projectName = 'Unknown Project';
  let clientName = 'Unknown Client';
  const screens: StandardProposal['screens'] = [];
  const lineItems: StandardProposal['lineItems'] = [];
  
  // Scan all sheets
  for (const sheetName of workbook.SheetNames) {
    // Skip hidden/system sheets
    if (sheetName.startsWith('_') || sheetName.toLowerCase().includes('print area')) continue;
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    console.log(`[Smart Excel] Scanning sheet: "${sheetName}" (${data.length} rows)`);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // Try to detect total row
      const totalDetection = detectTotalRow(row);
      if (totalDetection.isTotal && totalDetection.value) {
        console.log(`[Smart Excel] Found total: "${totalDetection.label}" = $${totalDetection.value.toLocaleString()} (row ${i + 1})`);
        
        // Prefer "Grand Total" or "Total Investment" over "Sub Total"
        const rowText = row.map(c => String(c || '').toLowerCase()).join(' ');
        if (rowText.includes('grand') || rowText.includes('investment') || rowText.includes('final')) {
          grandTotal = totalDetection.value;
        } else if (!subtotal && rowText.includes('sub')) {
          subtotal = totalDetection.value;
        } else if (!grandTotal) {
          grandTotal = totalDetection.value;
        }
      }
      
      // Try to detect screen row
      const screenDetection = detectScreenRow(row);
      if (screenDetection.isScreen && screenDetection.dims) {
        // Skip if this looks like a duplicate (same dimensions as existing)
        const isDuplicate = screens.some(s => 
          Math.abs(s.widthM - screenDetection.dims!.w) < 0.1 && 
          Math.abs(s.heightM - screenDetection.dims!.h) < 0.1 &&
          Math.abs(s.pitchMm - screenDetection.pitchMm) < 0.1
        );
        
        if (isDuplicate) {
          continue;
        }
        
        console.log(`[Smart Excel] Found screen: "${screenDetection.name}" ${screenDetection.dims.w}x${screenDetection.dims.h}, ${screenDetection.pitchMm}mm (row ${i + 1})`);
        
        // Try to extract pricing from nearby cells
        let sellPrice = 0;
        for (const cell of row) {
          const val = extractCurrency(cell);
          if (val && val > 1000) {
            sellPrice = val;
            break;
          }
        }
        
        // Parse quantity from text
        const rowText = row.map(c => String(c || '')).join(' ');
        const qtyMatch = rowText.match(/\(Qty\s*(\d+)\)/i) || rowText.match(/qty[\s:]*(\d+)/i);
        const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
        
        screens.push({
          name: screenDetection.name,
          pitchMm: screenDetection.pitchMm,
          quantity,
          heightM: screenDetection.dims.h,
          widthM: screenDetection.dims.w,
          areaSqM: screenDetection.dims.w * screenDetection.dims.h,
          ledCost: sellPrice * 0.7, // Estimate
          ledSell: sellPrice,
          margin: sellPrice > 0 ? ((sellPrice - (sellPrice * 0.7)) / sellPrice) * 100 : 30
        });
      }
      
      // Try to extract project name from first few rows
      if (i < 5 && !projectName || projectName === 'Unknown Project') {
        const rowText = row.map(c => String(c || '')).join(' ');
        if (rowText.toLowerCase().includes('project') || rowText.toLowerCase().includes('proposal')) {
          const match = rowText.match(/(?:project|proposal)[\s:]*([^\n]+)/i);
          if (match) projectName = match[1].trim();
        }
      }
    }
  }
  
  // If we found a grand total but no screens, create a placeholder screen
  if (grandTotal && screens.length === 0) {
    console.log('[Smart Excel] No screens detected, creating placeholder from total');
    screens.push({
      name: 'LED Display System',
      pitchMm: 2.5,
      quantity: 1,
      heightM: 10,
      widthM: 20,
      areaSqM: 200,
      ledCost: grandTotal * 0.5,
      ledSell: grandTotal * 0.7,
      margin: 30
    });
  }
  
  // Calculate final values
  const finalSubtotal = subtotal || (grandTotal ? grandTotal * 0.9 : 0);
  const finalGrandTotal = grandTotal || finalSubtotal;
  const tax = finalGrandTotal - finalSubtotal;
  const taxRate = finalSubtotal > 0 ? tax / finalSubtotal : 0;
  
  console.log(`[Smart Excel] Detection complete:`);
  console.log(`  - Screens: ${screens.length}`);
  console.log(`  - Grand Total: $${finalGrandTotal.toLocaleString()}`);
  console.log(`  - Method: Smart Keyword Detection`);
  
  return {
    clientName,
    projectName,
    screens,
    lineItems,
    totals: {
      subtotal: finalSubtotal,
      tax,
      taxRate,
      grandTotal: finalGrandTotal,
      currency
    },
    detectionMethod: 'smart_keyword'
  };
}

/**
 * Parse standard format (Margin Analysis sheet)
 */
export function parseStandardFormat(workbook: XLSX.WorkBook): StandardProposal {
  // Find Margin Analysis sheet (could be "Margin Analysis (CAD)" or "Margin Analysis (USD)")
  const marginSheetName = workbook.SheetNames.find(s => s.includes('Margin Analysis'));
  const marginSheet = workbook.Sheets[marginSheetName!];
  const data = XLSX.utils.sheet_to_json(marginSheet, { header: 1 }) as any[][];
  
  // Extract project info from row 2 (index 1)
  const projectInfo = String(data[1]?.[1] || '');
  const clientName = projectInfo.split('-')[0]?.trim() || 'Unknown Client';
  const projectName = projectInfo || 'Unknown Project';
  
  // Detect currency from sheet name
  const currency = marginSheetName?.includes('CAD') ? 'CAD' : 'USD';
  
  const screens: StandardProposal['screens'] = [];
  const lineItems: StandardProposal['lineItems'] = [];
  let subtotal = 0;
  
  // Parse rows starting from row 7 (index 6)
  // Note: xlsx library reads Scotia Bank format with data in column A (index 0)
  let currentSection = '';
  
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    
    const colA = String(row[0] || '');
    const colB = String(row[1] || '');
    
    // Skip empty rows
    if (!colA && !colB) continue;
    
    // Section header (e.g., "G9 Ceiling LED Displays")
    if (colA && !colB && !colA.includes('mm') && !colA.includes('Cost')) {
      currentSection = colA;
      continue;
    }
    
    // LED Display line
    if (colA.includes('LED') && colA.includes('mm')) {
      const description = colA;
      const cost = parseFloat(row[1]) || 0;
      const sell = parseFloat(row[2]) || 0;
      const margin = parseFloat(row[4]) || 0;
      
      // Parse dimensions: "5.06m h x 5.40m w"
      const dimMatch = description.match(/(\d+\.?\d*)m\s*h\s*x\s*(\d+\.?\d*)m\s*w/);
      const heightM = dimMatch ? parseFloat(dimMatch[1]) : 0;
      const widthM = dimMatch ? parseFloat(dimMatch[2]) : 0;
      const areaSqM = heightM * widthM;
      
      // Parse pitch
      const pitchMatch = description.match(/(\d+\.?\d*)mm/);
      const pitchMm = pitchMatch ? parseFloat(pitchMatch[1]) : 2.5;
      
      // Parse quantity: "(Qty 2)"
      const qtyMatch = description.match(/\(Qty\s*(\d+)\)/);
      const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
      
      // Extract location name
      const locationMatch = description.match(/^([^-:]+)/);
      const name = locationMatch ? locationMatch[1].trim() : `Screen ${screens.length + 1}`;
      
      screens.push({
        name,
        pitchMm,
        quantity,
        heightM,
        widthM,
        areaSqM,
        ledCost: cost,
        ledSell: sell,
        margin
      });
    }
    
    // Other line items (Structure, Install, etc.)
    else if (colA && (colA.includes('Structural') || colA.includes('Install') || 
                      colA.includes('Electrical') || colA.includes('Project Management') ||
                      colA.includes('Warranty') || colA.includes('Submittals'))) {
      const cost = parseFloat(row[1]) || 0;
      const sell = parseFloat(row[2]) || 0;
      
      let category = 'other';
      if (colA.includes('Structural')) category = 'structure';
      else if (colA.includes('Install')) category = 'install';
      else if (colA.includes('Electrical')) category = 'electrical';
      else if (colA.includes('Project Management')) category = 'pm';
      else if (colA.includes('Warranty')) category = 'warranty';
      else if (colA.includes('Submittals')) category = 'engineering';
      
      lineItems.push({
        description: colA,
        cost,
        sell,
        category
      });
    }
    
    // Totals
    else if (colA === 'SUB TOTAL (BID FORM)' || colA.includes('SUB TOTAL')) {
      // Capture subtotal from this row
      subtotal = parseFloat(row[2]) || parseFloat(row[3]) || 0;
    }
  }
  
  // Find totals in last few rows (using column A for Scotia Bank format)
  let tax = 0;
  let taxRate = currency === 'CAD' ? 0.13 : 0.095; // HST vs default
  let grandTotal = 0;
  
  for (let i = data.length - 10; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    
    const colA = String(row[0] || '');
    
    if (colA === 'TAX' || colA === 'HST' || colA === 'GST') {
      taxRate = parseFloat(row[1]) || taxRate;
      tax = parseFloat(row[2]) || 0;
    }
    if (colA.includes('GRAND TOTAL') || (colA.includes('TOTAL') && !colA.includes('SUB'))) {
      grandTotal = parseFloat(row[2]) || parseFloat(row[3]) || 0;
    }
  }
  
  // If no grand total found, calculate
  if (grandTotal === 0 && subtotal > 0) {
    grandTotal = subtotal + tax;
  }
  
  return {
    clientName,
    projectName,
    screens,
    lineItems,
    totals: {
      subtotal,
      tax,
      taxRate,
      grandTotal,
      currency
    },
    detectionMethod: 'standard'
  };
}

/**
 * Main entry point: Parse standard Excel with smart fallback
 */
export function parseStandardExcel(fileBuffer: Buffer): StandardProposal {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // PRIMARY PATH: Check for standard format
  if (isStandardFormat(workbook)) {
    console.log('[Excel Parser] Standard format detected (Margin Analysis tab)');
    return parseStandardFormat(workbook);
  }
  
  // FALLBACK PATH: Smart keyword detection
  console.log('[Excel Parser] Standard format not found, trying smart detection...');
  return parseWithSmartDetection(workbook);
}

/**
 * Generate ANC Proposal Engine JSON
 */
export function generateANCProposal(standard: StandardProposal): any {
  return {
    receiver: {
      name: standard.clientName,
      address: ''
    },
    details: {
      proposalName: standard.projectName,
      venue: standard.projectName,
      proposalDate: new Date().toISOString().split('T')[0],
    },
    screens: standard.screens.map(s => ({
      name: s.name,
      description: `${s.name} - ${s.heightM}m h x ${s.widthM}m w - ${s.pitchMm}mm (Qty ${s.quantity})`,
      widthFt: s.widthM * 3.28084,
      heightFt: s.heightM * 3.28084,
      quantity: s.quantity,
      pitchMm: s.pitchMm,
      desiredMargin: s.margin,
      formFactor: 'Straight',
      serviceType: 'Front/Rear',
      // Preserve exact pricing from Natalia's Excel
      nataliaPricing: {
        ledCost: s.ledCost,
        ledSell: s.ledSell
      }
    })),
    lineItems: standard.lineItems.map(item => ({
      description: item.description,
      cost: item.cost,
      sellPrice: item.sell,
      category: item.category
    })),
    pricing: {
      subtotal: standard.totals.subtotal,
      tax: standard.totals.tax,
      taxRate: standard.totals.taxRate,
      grandTotal: standard.totals.grandTotal,
      currency: standard.totals.currency
    },
    source: 'natalia_excel_import',
    detectionMethod: standard.detectionMethod,
    importNotes: standard.detectionMethod === 'standard' 
      ? 'Standard format: Margin Analysis + LED Cost Sheet'
      : 'Smart detection: Keyword scanning across all sheets'
  };
}

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  
  if (!path) {
    console.error('Usage: npx tsx scripts/convert-standard-excel.ts <path-to-excel>');
    console.error('');
    console.error('This smart converter handles:');
    console.error('1. STANDARD: Margin Analysis sheet (90% of proposals)');
    console.error('2. SMART FALLBACK: Keyword detection for one-offs (Moody Center, etc.)');
    console.error('');
    console.error('Keywords detected: "Total Sell", "Grand Total", "Investment", "Price"');
    process.exit(1);
  }
  
  try {
    const buffer = fs.readFileSync(path);
    const standard = parseStandardExcel(buffer);
    const ancProposal = generateANCProposal(standard);
    
    console.log(JSON.stringify(ancProposal, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
