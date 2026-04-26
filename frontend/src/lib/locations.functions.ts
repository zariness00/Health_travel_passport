import { createServerFn } from "@tanstack/react-start";

export type LocationSuggestion = {
  label: string; // "City, Country"
  city: string;
  country: string;
};

type TavilyResponse = {
  results?: Array<{ title?: string; content?: string; url?: string }>;
};

// Curated fallback list (works without network) for fast typing UX
const COMMON_LOCATIONS: LocationSuggestion[] = [
  ["Tokyo", "Japan"], ["Osaka", "Japan"], ["Kyoto", "Japan"], ["Yokohama", "Japan"], ["Sapporo", "Japan"],
  ["Budapest", "Hungary"], ["Debrecen", "Hungary"], ["Szeged", "Hungary"],
  ["Berlin", "Germany"], ["Munich", "Germany"], ["Hamburg", "Germany"], ["Frankfurt", "Germany"], ["Cologne", "Germany"],
  ["Paris", "France"], ["Lyon", "France"], ["Marseille", "France"], ["Nice", "France"],
  ["Madrid", "Spain"], ["Barcelona", "Spain"], ["Valencia", "Spain"], ["Seville", "Spain"],
  ["Rome", "Italy"], ["Milan", "Italy"], ["Florence", "Italy"], ["Naples", "Italy"], ["Turin", "Italy"],
  ["London", "United Kingdom"], ["Manchester", "United Kingdom"], ["Edinburgh", "United Kingdom"], ["Birmingham", "United Kingdom"],
  ["New York", "United States"], ["Los Angeles", "United States"], ["Chicago", "United States"], ["San Francisco", "United States"], ["Miami", "United States"], ["Boston", "United States"], ["Seattle", "United States"], ["Austin", "United States"],
  ["Toronto", "Canada"], ["Vancouver", "Canada"], ["Montreal", "Canada"],
  ["Sydney", "Australia"], ["Melbourne", "Australia"], ["Brisbane", "Australia"],
  ["Singapore", "Singapore"], ["Hong Kong", "Hong Kong"], ["Seoul", "South Korea"], ["Busan", "South Korea"],
  ["Bangkok", "Thailand"], ["Chiang Mai", "Thailand"], ["Bali", "Indonesia"], ["Jakarta", "Indonesia"],
  ["Dubai", "United Arab Emirates"], ["Abu Dhabi", "United Arab Emirates"],
  ["Amsterdam", "Netherlands"], ["Rotterdam", "Netherlands"],
  ["Vienna", "Austria"], ["Salzburg", "Austria"],
  ["Zurich", "Switzerland"], ["Geneva", "Switzerland"],
  ["Prague", "Czech Republic"], ["Warsaw", "Poland"], ["Krakow", "Poland"],
  ["Stockholm", "Sweden"], ["Copenhagen", "Denmark"], ["Oslo", "Norway"], ["Helsinki", "Finland"],
  ["Lisbon", "Portugal"], ["Porto", "Portugal"], ["Athens", "Greece"],
  ["Mexico City", "Mexico"], ["Buenos Aires", "Argentina"], ["São Paulo", "Brazil"], ["Rio de Janeiro", "Brazil"],
  ["Mumbai", "India"], ["Delhi", "India"], ["Bangalore", "India"],
  ["Cairo", "Egypt"], ["Cape Town", "South Africa"], ["Johannesburg", "South Africa"],
  ["Istanbul", "Turkey"], ["Tel Aviv", "Israel"],
].map(([city, country]) => ({ city, country, label: `${city}, ${country}` }));

function dedupe(items: LocationSuggestion[]): LocationSuggestion[] {
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];
  for (const it of items) {
    const key = it.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function localMatches(q: string): LocationSuggestion[] {
  const lower = q.toLowerCase();
  return COMMON_LOCATIONS.filter(
    (l) =>
      l.city.toLowerCase().startsWith(lower) ||
      l.country.toLowerCase().startsWith(lower) ||
      l.label.toLowerCase().includes(lower),
  ).slice(0, 8);
}

// Heuristic parse "City, Country" patterns from Tavily snippets
function parseFromText(text: string): LocationSuggestion[] {
  const out: LocationSuggestion[] = [];
  const re = /([A-Z][A-Za-zÀ-ÿ'’.\- ]{1,30}),\s*([A-Z][A-Za-zÀ-ÿ'’.\- ]{2,40})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const city = m[1].trim();
    const country = m[2].trim();
    if (city.length < 2 || country.length < 3) continue;
    if (/^(The|A|An|And|Or|In|Of|For)$/i.test(city)) continue;
    out.push({ city, country, label: `${city}, ${country}` });
    if (out.length >= 12) break;
  }
  return out;
}

export const suggestLocations = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => ({
    query: (input.query ?? "").trim().slice(0, 60),
  }))
  .handler(async ({ data }) => {
    const q = data.query;
    if (q.length < 2) return { suggestions: [] as LocationSuggestion[] };

    const local = localMatches(q);

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return { suggestions: local };

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: `major cities matching "${q}" (format: City, Country)`,
          search_depth: "basic",
          max_results: 5,
          include_answer: true,
        }),
      });
      if (!res.ok) return { suggestions: local };
      const json = (await res.json()) as TavilyResponse & { answer?: string };
      const blob = [
        json.answer ?? "",
        ...(json.results ?? []).map((r) => `${r.title ?? ""} ${r.content ?? ""}`),
      ].join(" \n ");
      const parsed = parseFromText(blob);
      const merged = dedupe([...local, ...parsed]).slice(0, 8);
      return { suggestions: merged };
    } catch {
      return { suggestions: local };
    }
  });

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lon: number }) => {
    if (
      typeof input.lat !== "number" ||
      typeof input.lon !== "number" ||
      Math.abs(input.lat) > 90 ||
      Math.abs(input.lon) > 180
    ) {
      throw new Error("Invalid coordinates");
    }
    return { lat: input.lat, lon: input.lon };
  })
  .handler(async ({ data }) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${data.lat}&lon=${data.lon}&accept-language=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HealthPassport/1.0 (find-care)" },
    });
    if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
    const json = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    };
    const a = json.address ?? {};
    const city =
      a.city || a.town || a.village || a.municipality || a.county || a.state || "";
    const country = a.country || "";
    if (!city || !country) throw new Error("Could not resolve city/country");
    return { label: `${city}, ${country}`, city, country };
  });
