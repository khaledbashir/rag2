
export interface LedModule {
    id: string;
    manufacturer: string;
    name: string;
    widthMm: number;
    heightMm: number;
    widthInches: number; // For easy math
    heightInches: number;
    pitch: number;
    nits: number;
    weightLbs: number;
    maxPowerWatts: number;
    supportsHalfModule: boolean;
}

export interface Catalog {
    [key: string]: LedModule;
}

/**
 * REQ-126: Expanded LED Module Catalog (Pro-Tool Building Blocks)
 * 
 * Per Eric Gruner's mandate: "module-by-module building blocks" with
 * specific attributes for Pitch, Height (mm), Width (mm), and Half-Module support.
 * 
 * Catalog organized by:
 * - Indoor Fine Pitch (≤4mm) - Conference rooms, lobbies
 * - Indoor Standard (4-10mm) - Arenas, concourses  
 * - Outdoor (≥10mm) - Stadiums, facades
 */
export const LED_MODULES: Catalog = {
    // ============================================
    // DEFAULT FALLBACK
    // ============================================
    "DEFAULT": {
        id: "default-1",
        manufacturer: "Generic",
        name: "Standard 500x500",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 3.9,
        nits: 5000,
        weightLbs: 15,
        maxPowerWatts: 150,
        supportsHalfModule: false
    },

    // ============================================
    // LG PRODUCTS (Ferrari-Grade)
    // ============================================
    
    // LG GSQA Series - Indoor Fine Pitch
    "LG-GSQA-039": {
        id: "lg-gsqa-039",
        manufacturer: "LG",
        name: "GSQA 3.9mm Indoor",
        widthMm: 250,
        heightMm: 250,
        widthInches: 9.84,
        heightInches: 9.84,
        pitch: 3.9,
        nits: 7500,
        weightLbs: 4.5,
        maxPowerWatts: 85,
        supportsHalfModule: true
    },
    "LG-GSQA-027": {
        id: "lg-gsqa-027",
        manufacturer: "LG",
        name: "GSQA 2.7mm Fine Pitch",
        widthMm: 250,
        heightMm: 250,
        widthInches: 9.84,
        heightInches: 9.84,
        pitch: 2.7,
        nits: 1200,
        weightLbs: 4.2,
        maxPowerWatts: 75,
        supportsHalfModule: true
    },
    "LG-GSQA-019": {
        id: "lg-gsqa-019",
        manufacturer: "LG",
        name: "GSQA 1.9mm Ultra Fine",
        widthMm: 250,
        heightMm: 250,
        widthInches: 9.84,
        heightInches: 9.84,
        pitch: 1.9,
        nits: 800,
        weightLbs: 4.0,
        maxPowerWatts: 65,
        supportsHalfModule: true
    },
    
    // LG LAA Series - Outdoor
    "LG-LAA-100": {
        id: "lg-laa-100",
        manufacturer: "LG",
        name: "LAA 10mm Outdoor",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 10,
        nits: 8000,
        weightLbs: 22,
        maxPowerWatts: 280,
        supportsHalfModule: false
    },
    "LG-LAA-060": {
        id: "lg-laa-060",
        manufacturer: "LG",
        name: "LAA 6mm Outdoor",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 6,
        nits: 7000,
        weightLbs: 20,
        maxPowerWatts: 250,
        supportsHalfModule: false
    },

    // ============================================
    // YAHAM PRODUCTS (Value-Grade)
    // ============================================
    
    // Yaham S3 Series - Indoor/Outdoor Versatile
    "YAHAM-S3-100": {
        id: "yaham-s3-100",
        manufacturer: "Yaham",
        name: "S3 10mm Standard",
        widthMm: 320,
        heightMm: 320,
        widthInches: 12.6,
        heightInches: 12.6,
        pitch: 10,
        nits: 5000,
        weightLbs: 12,
        maxPowerWatts: 200,
        supportsHalfModule: true
    },
    "YAHAM-S3-060": {
        id: "yaham-s3-060",
        manufacturer: "Yaham",
        name: "S3 6mm Indoor",
        widthMm: 320,
        heightMm: 320,
        widthInches: 12.6,
        heightInches: 12.6,
        pitch: 6,
        nits: 3000,
        weightLbs: 11,
        maxPowerWatts: 180,
        supportsHalfModule: true
    },
    "YAHAM-S3-039": {
        id: "yaham-s3-039",
        manufacturer: "Yaham",
        name: "S3 3.9mm Fine Pitch",
        widthMm: 320,
        heightMm: 320,
        widthInches: 12.6,
        heightInches: 12.6,
        pitch: 3.9,
        nits: 1500,
        weightLbs: 10,
        maxPowerWatts: 160,
        supportsHalfModule: true
    },
    
    // Yaham Outdoor Series
    "YAHAM-OUT-160": {
        id: "yaham-out-160",
        manufacturer: "Yaham",
        name: "Outdoor 16mm Stadium",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 16,
        nits: 10000,
        weightLbs: 25,
        maxPowerWatts: 350,
        supportsHalfModule: false
    },
    "YAHAM-OUT-100": {
        id: "yaham-out-100",
        manufacturer: "Yaham",
        name: "Outdoor 10mm Stadium",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 10,
        nits: 8000,
        weightLbs: 23,
        maxPowerWatts: 300,
        supportsHalfModule: false
    },

    // ============================================
    // ABSEN PRODUCTS (Mid-Tier)
    // ============================================
    "ABSEN-A27": {
        id: "absen-a27",
        manufacturer: "Absen",
        name: "A Series 2.7mm",
        widthMm: 300,
        heightMm: 300,
        widthInches: 11.81,
        heightInches: 11.81,
        pitch: 2.7,
        nits: 1000,
        weightLbs: 6,
        maxPowerWatts: 90,
        supportsHalfModule: true
    },
    "ABSEN-A39": {
        id: "absen-a39",
        manufacturer: "Absen",
        name: "A Series 3.9mm",
        widthMm: 300,
        heightMm: 300,
        widthInches: 11.81,
        heightInches: 11.81,
        pitch: 3.9,
        nits: 1500,
        weightLbs: 6.5,
        maxPowerWatts: 100,
        supportsHalfModule: true
    },

    // ============================================
    // UNILUMIN PRODUCTS (Premium)
    // ============================================
    "UNILUMIN-UTV-P19": {
        id: "unilumin-utv-p19",
        manufacturer: "Unilumin",
        name: "UTV 1.9mm Broadcast",
        widthMm: 250,
        heightMm: 250,
        widthInches: 9.84,
        heightInches: 9.84,
        pitch: 1.9,
        nits: 600,
        weightLbs: 4,
        maxPowerWatts: 60,
        supportsHalfModule: true
    },
    "UNILUMIN-UTV-P27": {
        id: "unilumin-utv-p27",
        manufacturer: "Unilumin",
        name: "UTV 2.7mm Indoor",
        widthMm: 250,
        heightMm: 250,
        widthInches: 9.84,
        heightInches: 9.84,
        pitch: 2.7,
        nits: 1000,
        weightLbs: 4.2,
        maxPowerWatts: 70,
        supportsHalfModule: true
    },

    // ============================================
    // LG/YAHAM CAPITAL ONE PRODUCTS (March 2026)
    // ============================================

    // Mesh P10 FM1921 — from Eric Gruner's spec sheet
    "LG-MESH-P10-039": {
        id: "lg-mesh-p10-039",
        manufacturer: "LG/Yaham",
        name: "Mesh P10 FM1921 3.9mm",
        widthMm: 1000,
        heightMm: 500,
        widthInches: 39.37,
        heightInches: 19.69,
        pitch: 3.9,
        nits: 6000,
        weightLbs: 16.5,
        maxPowerWatts: 300, // 600 W/sqm × 0.5 sqm per panel
        supportsHalfModule: false
    },

    // GSQA083 — 8mm Outdoor (Capital One exterior)
    "LG-GSQA-083": {
        id: "lg-gsqa-083",
        manufacturer: "LG",
        name: "GSQA 8mm Outdoor",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 8,
        nits: 10000,
        weightLbs: 45.7, // 8.5 lbs/sqft × 5.38 sqft
        maxPowerWatts: 425, // 850 W/sqm × 0.5 sqm
        supportsHalfModule: false
    },

    // GSCF026 — 2.6mm Outdoor
    "LG-GSCF-026": {
        id: "lg-gscf-026",
        manufacturer: "LG",
        name: "GSCF 2.6mm Outdoor",
        widthMm: 500,
        heightMm: 500,
        widthInches: 19.685,
        heightInches: 19.685,
        pitch: 2.6,
        nits: 5500,
        weightLbs: 22,
        maxPowerWatts: 200,
        supportsHalfModule: false
    },

    // LG LSCC Series — Capital One Indoor (from LGE-466 spec)
    "LG-LSCC-012": {
        id: "lg-lscc-012",
        manufacturer: "LG",
        name: "LSCC 1.2mm Indoor",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 1.2,
        nits: 900,
        weightLbs: 11,
        maxPowerWatts: 112,
        supportsHalfModule: false
    },

    "LG-LSCC-018": {
        id: "lg-lscc-018",
        manufacturer: "LG",
        name: "LSCC 1.8mm Indoor",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 1.875,
        nits: 900,
        weightLbs: 11,
        maxPowerWatts: 96,
        supportsHalfModule: false
    },

    "LG-LSCC-025": {
        id: "lg-lscc-025",
        manufacturer: "LG",
        name: "LSCC 2.5mm Indoor",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 2.5,
        nits: 900,
        weightLbs: 11,
        maxPowerWatts: 84,
        supportsHalfModule: false
    },

    // ============================================
    // LG/YAHAM MIP ALTERNATES (Capital One 2026)
    // Higher brightness (2,000 NITS) alternatives
    // Nationstar MIP-A1010WN diode, 5G Fiber Novastar
    // ============================================

    "LG-C12-MIP": {
        id: "lg-c12-mip",
        manufacturer: "LG/Yaham",
        name: "C1.2-MIP 1.2mm Indoor (Alt)",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 1.2,
        nits: 2000,
        weightLbs: 11,
        maxPowerWatts: 120,
        supportsHalfModule: false
    },

    "LG-C18-MIP": {
        id: "lg-c18-mip",
        manufacturer: "LG/Yaham",
        name: "C1.8-MIP 1.8mm Indoor/VisiBowl (Alt)",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 1.8,
        nits: 2000,
        weightLbs: 11,
        maxPowerWatts: 110,
        supportsHalfModule: false
    },

    "LG-C25-MIP": {
        id: "lg-c25-mip",
        manufacturer: "LG/Yaham",
        name: "C2.5-MIP 2.5mm Indoor (Alt)",
        widthMm: 600,
        heightMm: 337.5,
        widthInches: 23.62,
        heightInches: 13.29,
        pitch: 2.5,
        nits: 2000,
        weightLbs: 11,
        maxPowerWatts: 100,
        supportsHalfModule: false
    }
};

export type ModuleSize = typeof LED_MODULES["DEFAULT"];
