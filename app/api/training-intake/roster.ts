// ANC CRM training roster — the 27 invited trainees. Used by the intake's
// name-first lookup so typing a name surfaces "Is this you?" with the right
// team pre-filled. Source: docs/claude-memory/anc-crm-training-links.md.

export interface RosterEntry {
  name: string;
  team: string;
  sid: string;
}

export const ROSTER: RosterEntry[] = [
  // Admin
  { name: "Charlie Dinh", team: "Admin", sid: "roster-charlie-dinh" },
  { name: "Joe Occhipinti", team: "Admin", sid: "roster-joe-occhipinti" },
  { name: "Kirsten Savage", team: "Admin", sid: "roster-kirsten-savage" },
  { name: "Cuong Tran", team: "Admin", sid: "roster-cuong-tran" },
  // Technology
  { name: "Jireh Billings", team: "Technology", sid: "roster-jireh-billings" },
  { name: "Krissy Carter", team: "Technology", sid: "roster-krissy-carter" },
  { name: "Dave Compton", team: "Technology", sid: "roster-dave-compton" },
  { name: "Daniel Croci", team: "Technology", sid: "roster-daniel-croci" },
  { name: "Alex Gomez", team: "Technology", sid: "roster-alex-gomez" },
  { name: "Eric Gruner", team: "Technology", sid: "roster-eric-gruner" },
  { name: "Jackson Hart", team: "Technology", sid: "roster-jackson-hart" },
  { name: "Matt Hobbs", team: "Technology", sid: "roster-matt-hobbs" },
  { name: "Natalia Kovaleva", team: "Technology", sid: "roster-natalia-kovaleva" },
  { name: "Jack McCrossin", team: "Technology", sid: "roster-jack-mccrossin" },
  { name: "Dagan Pratt", team: "Technology", sid: "roster-dagan-pratt" },
  { name: "Jeremy Riley", team: "Technology", sid: "roster-jeremy-riley" },
  { name: "Jesse Vellucci", team: "Technology", sid: "roster-jesse-vellucci" },
  // Venue Services
  { name: "Greg Buckman", team: "Venue Services", sid: "roster-greg-buckman" },
  { name: "Brittany Deieso", team: "Venue Services", sid: "roster-brittany-deieso" },
  { name: "Nicholas Delia", team: "Venue Services", sid: "roster-nicholas-delia" },
  { name: "Steven Dohm", team: "Venue Services", sid: "roster-steven-dohm" },
  { name: "Korey Ryan", team: "Venue Services", sid: "roster-korey-ryan" },
  { name: "Gianni Strano", team: "Venue Services", sid: "roster-gianni-strano" },
  { name: "Alexis Ventarola", team: "Venue Services", sid: "roster-alexis-ventarola" },
  // Media & Sponsorship
  { name: "Grant Howard", team: "Media & Sponsorship", sid: "roster-grant-howard" },
  { name: "John Obropta", team: "Media & Sponsorship", sid: "roster-john-obropta" },
  { name: "Greg Terlizzi", team: "Media & Sponsorship", sid: "roster-greg-terlizzi" },
];

/**
 * Fuzzy-match a typed name against the roster. Matches on full name, first
 * name, or last name (case-insensitive, partial). Returns best matches first,
 * capped at `limit`.
 */
export function matchRoster(query: string, limit = 4): RosterEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = ROSTER.map((e) => {
    const name = e.name.toLowerCase();
    const [first, ...rest] = name.split(/\s+/);
    const last = rest[rest.length - 1] || "";
    let score = 0;
    if (name === q) score = 100;
    else if (first === q || last === q) score = 80;
    else if (name.startsWith(q) || first.startsWith(q) || last.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 40;
    return { e, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}
