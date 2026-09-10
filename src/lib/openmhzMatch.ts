const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function normalizeStateCode(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()];
}

export interface RawOpenMhzSystem {
  name?: string;
  shortName?: string;
  city?: string;
  county?: string;
  state?: string;
  active?: boolean;
  callAvg?: number;
  lastActive?: string;
  description?: string;
}

function scoreSystem(
  sys: RawOpenMhzSystem,
  city?: string,
  county?: string,
): number {
  const c = city?.toLowerCase().trim();
  const co = county?.replace(/\s+County$/i, "").toLowerCase().trim();
  const name = (sys.name || "").toLowerCase();
  const desc = (sys.description || "").toLowerCase();
  const sysCity = (sys.city || "").toLowerCase();
  const sysCounty = (sys.county || "").toLowerCase();
  const hay = `${name} ${desc} ${sysCity} ${sysCounty}`;
  let score = 0;
  if (c) {
    if (sysCity && (sysCity.includes(c) || c.includes(sysCity))) score += 1000;
    else if (hay.includes(c)) score += 800;
  }
  if (co) {
    if (sysCounty.includes(co) || hay.includes(co)) score += 400;
    if (hay.includes(`${co} county`)) score += 100;
  }
  if (sys.active) score += 50;
  score += Math.min(40, Number(sys.callAvg) || 0);
  return score;
}

export function pickOpenMhzSystems(
  all: RawOpenMhzSystem[],
  opts: { stateCode: string; city?: string; county?: string },
) {
  const inState = all.filter(
    (s) => s.shortName && normalizeStateCode(s.state) === opts.stateCode,
  );
  return inState
    .map((s) => ({ s, score: scoreSystem(s, opts.city, opts.county) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aa = a.s.active ? 1 : 0;
      const bb = b.s.active ? 1 : 0;
      if (bb !== aa) return bb - aa;
      return (Number(b.s.callAvg) || 0) - (Number(a.s.callAvg) || 0);
    })
    .slice(0, 8)
    .map(({ s }) => ({
      shortName: String(s.shortName),
      name: s.name || String(s.shortName),
      city: s.city || s.county || undefined,
      state: normalizeStateCode(s.state) || s.state || opts.stateCode,
      active: Boolean(s.active),
      callAvg: Number(s.callAvg) || 0,
      lastActive: s.lastActive || undefined,
    }));
}
