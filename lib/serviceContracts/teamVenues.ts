/**
 * Team → home venue + address lookup for Service Contracts.
 *
 * Natalia (2026-07-10) wanted the contract to pick up the stadium from the team
 * name, not sit on a template default. When a service contract's purchaser
 * matches a known team, the venue and the venue's address are filled
 * automatically; the user can still override both in the setup panel.
 *
 * Matching is intentionally conservative: it matches a full "City Nickname"
 * (e.g. "Carolina Panthers") or an unambiguous nickname, so a stray "Panthers"
 * only resolves when that nickname is unique across this dataset.
 */

export interface TeamVenue {
    team: string;
    venue: string;
    /** Full one-line venue address: "street, city, ST zip". */
    address: string;
}

// Curated for ANC's markets. NFL is complete (their core stadium business);
// NBA / MLB / NHL / MLS / WNBA cover the teams ANC most commonly quotes.
export const TEAM_VENUES: TeamVenue[] = [
    // ---- NFL ----
    { team: "Arizona Cardinals", venue: "State Farm Stadium", address: "1 Cardinals Dr, Glendale, AZ 85305" },
    { team: "Atlanta Falcons", venue: "Mercedes-Benz Stadium", address: "1 AMB Dr NW, Atlanta, GA 30313" },
    { team: "Baltimore Ravens", venue: "M&T Bank Stadium", address: "1101 Russell St, Baltimore, MD 21230" },
    { team: "Buffalo Bills", venue: "Highmark Stadium", address: "1 Bills Dr, Orchard Park, NY 14127" },
    { team: "Carolina Panthers", venue: "Bank of America Stadium", address: "800 S Mint St, Charlotte, NC 28202" },
    { team: "Chicago Bears", venue: "Soldier Field", address: "1410 Special Olympics Dr, Chicago, IL 60605" },
    { team: "Cincinnati Bengals", venue: "Paycor Stadium", address: "1 Paul Brown Stadium, Cincinnati, OH 45202" },
    { team: "Cleveland Browns", venue: "Huntington Bank Field", address: "100 Alfred Lerner Way, Cleveland, OH 44114" },
    { team: "Dallas Cowboys", venue: "AT&T Stadium", address: "1 AT&T Way, Arlington, TX 76011" },
    { team: "Denver Broncos", venue: "Empower Field at Mile High", address: "1701 Bryant St, Denver, CO 80204" },
    { team: "Detroit Lions", venue: "Ford Field", address: "2000 Brush St, Detroit, MI 48226" },
    { team: "Green Bay Packers", venue: "Lambeau Field", address: "1265 Lombardi Ave, Green Bay, WI 54304" },
    { team: "Houston Texans", venue: "NRG Stadium", address: "1 NRG Pkwy, Houston, TX 77054" },
    { team: "Indianapolis Colts", venue: "Lucas Oil Stadium", address: "500 S Capitol Ave, Indianapolis, IN 46225" },
    { team: "Jacksonville Jaguars", venue: "EverBank Stadium", address: "1 EverBank Stadium Dr, Jacksonville, FL 32202" },
    { team: "Kansas City Chiefs", venue: "GEHA Field at Arrowhead Stadium", address: "1 Arrowhead Dr, Kansas City, MO 64129" },
    { team: "Las Vegas Raiders", venue: "Allegiant Stadium", address: "3333 Al Davis Way, Las Vegas, NV 89118" },
    { team: "Los Angeles Chargers", venue: "SoFi Stadium", address: "1001 Stadium Dr, Inglewood, CA 90301" },
    { team: "Los Angeles Rams", venue: "SoFi Stadium", address: "1001 Stadium Dr, Inglewood, CA 90301" },
    { team: "Miami Dolphins", venue: "Hard Rock Stadium", address: "347 Don Shula Dr, Miami Gardens, FL 33056" },
    { team: "Minnesota Vikings", venue: "U.S. Bank Stadium", address: "401 Chicago Ave, Minneapolis, MN 55415" },
    { team: "New England Patriots", venue: "Gillette Stadium", address: "1 Patriot Pl, Foxborough, MA 02035" },
    { team: "New Orleans Saints", venue: "Caesars Superdome", address: "1500 Sugar Bowl Dr, New Orleans, LA 70112" },
    { team: "New York Giants", venue: "MetLife Stadium", address: "1 MetLife Stadium Dr, East Rutherford, NJ 07073" },
    { team: "New York Jets", venue: "MetLife Stadium", address: "1 MetLife Stadium Dr, East Rutherford, NJ 07073" },
    { team: "Philadelphia Eagles", venue: "Lincoln Financial Field", address: "1 Lincoln Financial Field Way, Philadelphia, PA 19148" },
    { team: "Pittsburgh Steelers", venue: "Acrisure Stadium", address: "100 Art Rooney Ave, Pittsburgh, PA 15212" },
    { team: "San Francisco 49ers", venue: "Levi's Stadium", address: "4900 Marie P DeBartolo Way, Santa Clara, CA 95054" },
    { team: "Seattle Seahawks", venue: "Lumen Field", address: "800 Occidental Ave S, Seattle, WA 98134" },
    { team: "Tampa Bay Buccaneers", venue: "Raymond James Stadium", address: "4201 N Dale Mabry Hwy, Tampa, FL 33607" },
    { team: "Tennessee Titans", venue: "Nissan Stadium", address: "1 Titans Way, Nashville, TN 37213" },
    { team: "Washington Commanders", venue: "Northwest Stadium", address: "1600 Fedex Way, Landover, MD 20785" },

    // ---- NBA ----
    { team: "Atlanta Hawks", venue: "State Farm Arena", address: "1 State Farm Dr, Atlanta, GA 30303" },
    { team: "Boston Celtics", venue: "TD Garden", address: "100 Legends Way, Boston, MA 02114" },
    { team: "Brooklyn Nets", venue: "Barclays Center", address: "620 Atlantic Ave, Brooklyn, NY 11217" },
    { team: "Chicago Bulls", venue: "United Center", address: "1901 W Madison St, Chicago, IL 60612" },
    { team: "Cleveland Cavaliers", venue: "Rocket Arena", address: "1 Center Ct, Cleveland, OH 44115" },
    { team: "Dallas Mavericks", venue: "American Airlines Center", address: "2500 Victory Ave, Dallas, TX 75219" },
    { team: "Denver Nuggets", venue: "Ball Arena", address: "1000 Chopper Cir, Denver, CO 80204" },
    { team: "Detroit Pistons", venue: "Little Caesars Arena", address: "2645 Woodward Ave, Detroit, MI 48201" },
    { team: "Golden State Warriors", venue: "Chase Center", address: "1 Warriors Way, San Francisco, CA 94158" },
    { team: "Indiana Pacers", venue: "Gainbridge Fieldhouse", address: "125 S Pennsylvania St, Indianapolis, IN 46204" },
    { team: "Miami Heat", venue: "Kaseya Center", address: "601 Biscayne Blvd, Miami, FL 33132" },
    { team: "Milwaukee Bucks", venue: "Fiserv Forum", address: "1111 Vel R. Phillips Ave, Milwaukee, WI 53203" },
    { team: "New York Knicks", venue: "Madison Square Garden", address: "4 Pennsylvania Plaza, New York, NY 10001" },
    { team: "Philadelphia 76ers", venue: "Wells Fargo Center", address: "3601 S Broad St, Philadelphia, PA 19148" },
    { team: "Phoenix Suns", venue: "Footprint Center", address: "201 E Jefferson St, Phoenix, AZ 85004" },

    // ---- WNBA ----
    { team: "Indiana Fever", venue: "Gainbridge Fieldhouse", address: "125 S Pennsylvania St, Indianapolis, IN 46204" },

    // ---- MLB ----
    { team: "New York Yankees", venue: "Yankee Stadium", address: "1 E 161 St, Bronx, NY 10451" },
    { team: "Los Angeles Dodgers", venue: "Dodger Stadium", address: "1000 Vin Scully Ave, Los Angeles, CA 90012" },
    { team: "Boston Red Sox", venue: "Fenway Park", address: "4 Jersey St, Boston, MA 02215" },
    { team: "Chicago Cubs", venue: "Wrigley Field", address: "1060 W Addison St, Chicago, IL 60613" },

    // ---- NHL ----
    { team: "Toronto Maple Leafs", venue: "Scotiabank Arena", address: "40 Bay St, Toronto, ON M5J 2X2" },

    // ---- Soccer ----
    { team: "Liverpool FC", venue: "Anfield Stadium", address: "Anfield Rd, Liverpool L4 0TH, United Kingdom" },
];

const normalize = (s: string): string =>
    (s || "")
        .toLowerCase()
        .replace(/[.'']/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

// Nicknames that appear on exactly one team are safe to match on their own.
const NICKNAME_INDEX: Record<string, TeamVenue[]> = (() => {
    const idx: Record<string, TeamVenue[]> = {};
    for (const tv of TEAM_VENUES) {
        const nick = normalize(tv.team).split(" ").pop() || "";
        (idx[nick] ||= []).push(tv);
    }
    return idx;
})();

/**
 * Resolve a purchaser/client name to its home venue + address.
 * Returns null when there is no confident match.
 */
export function matchTeamVenue(name: string): TeamVenue | null {
    const n = normalize(name);
    if (!n) return null;

    // 1) Full "City Nickname" contained in the input — most reliable.
    for (const tv of TEAM_VENUES) {
        if (n.includes(normalize(tv.team))) return tv;
    }

    // 2) Unambiguous nickname (only when exactly one team owns it).
    for (const word of n.split(" ")) {
        const hits = NICKNAME_INDEX[word];
        if (hits && hits.length === 1) return hits[0];
    }

    return null;
}
