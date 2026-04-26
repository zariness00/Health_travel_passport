import { createServerFn } from "@tanstack/react-start";

export type LanguageSignal = "confirmed" | "weak" | "unknown";

export type ClinicResult = {
  name: string;
  url: string;
  domain: string;
  snippet: string;
  area: string | null;
  phone: string | null;
  rating: string | null;
  languageSignal: LanguageSignal;
  /** @deprecated kept for backwards-compat; equals languageSignal === "confirmed" */
  languageConfirmed: boolean;
  sources: string[];
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
};

const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/;

// ---------- text cleaning ----------

const NOISE_PATTERNS: RegExp[] = [
  /skip to (?:main )?content/gi,
  /toggle (?:navigation|menu)/gi,
  /(?:main )?menu\s*(?:close|open)?/gi,
  /(?:^|\s)(?:home|about(?: us)?|contact(?: us)?|services|blog|news|careers|privacy(?: policy)?|terms(?: of service)?|cookie(?:s| policy)?)(?:\s*[\|·•»>›]\s*)/gi,
  /follow us on[^.]*/gi,
  /(?:facebook|instagram|linkedin|twitter|x|youtube|tiktok|whatsapp|telegram)(?:\s*[\|·•/,]\s*(?:facebook|instagram|linkedin|twitter|x|youtube|tiktok|whatsapp|telegram))*/gi,
  /share (?:on|this)[^.]*/gi,
  /subscribe to[^.]*/gi,
  /sign up for[^.]*/gi,
  /all rights reserved[^.]*/gi,
  /©\s*\d{4}[^.]*/gi,
  /copyright\s*©?\s*\d{4}[^.]*/gi,
  /cookie(?:s)? (?:policy|preferences|settings|notice)[^.]*/gi,
  /accept (?:all )?cookies/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // emails
  /https?:\/\/\S+/g, // raw urls
  /\s{2,}/g,
];

function cleanSnippet(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  s = s
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–·•|>›»]+/, "")
    .trim();

  // Keep only complete-ish sentences, max 2.
  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 25 && /[A-Za-z]/.test(x))
    .filter((x) => !/^[A-Z\s]{6,}$/.test(x)) // drop SHOUTING menu lines
    .slice(0, 2);

  let out = sentences.join(" ");
  if (!out) out = s.slice(0, 180);
  if (out.length > 220) out = out.slice(0, 217).trimEnd() + "…";
  return out;
}

// ---------- field extraction ----------

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\-|–·»›].*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function detectArea(text: string, location: string): string | null {
  const city = location.split(",")[0]?.trim();
  if (!city) return null;
  const re = new RegExp(`([A-Z][A-Za-z-]+,?\\s+)?${city}`, "i");
  const m = text.match(re);
  return m ? m[0].trim() : city;
}

function detectRating(text: string): string | null {
  const m = text.match(/(\d\.\d)\s*(?:\/\s*5|stars?|★)/i);
  return m ? m[1] : null;
}

function detectPhone(text: string): string | null {
  const m = text.match(PHONE_REGEX);
  return m ? m[1].trim() : null;
}

function detectLanguageSignal(text: string, language: string): LanguageSignal {
  const lower = text.toLowerCase();
  const lang = language.toLowerCase();

  const strong = [
    `${lang}-speaking`,
    `${lang} speaking`,
    `we speak ${lang}`,
    `speaks ${lang}`,
    `fluent in ${lang}`,
    `${lang} available`,
    `${lang}-language`,
    `staff speak ${lang}`,
    `doctors speak ${lang}`,
    `${lang} support`,
  ];
  if (strong.some((s) => lower.includes(s))) return "confirmed";

  const weak = [
    lower.includes(lang) && /review|patient|recommend|mention/.test(lower),
    /international|expat|foreign|multilingual/.test(lower) && lower.includes(lang),
    new RegExp(`\\b${lang}\\b`).test(lower),
  ];
  if (weak.some(Boolean)) return "weak";

  return "unknown";
}

function buildSources(text: string, language: string, url: string): string[] {
  const sources: string[] = [];
  const lower = text.toLowerCase();
  if (/clinic|hospital|medical center|medical centre/.test(lower))
    sources.push("clinic website");
  if (lower.includes("review") && lower.includes(language.toLowerCase()))
    sources.push(`reviews mention ${language}`);
  if (/international|expat|foreign/.test(lower)) sources.push("international clinic");
  if (!sources.length) sources.push(extractDomain(url));
  return sources.slice(0, 3);
}

// ---------- handler ----------

export const searchClinics = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { location: string; specialty: string; language: string }) => {
      if (!input.location?.trim() || !input.specialty?.trim() || !input.language?.trim()) {
        throw new Error("Location, specialty, and language are required.");
      }
      return {
        location: input.location.trim().slice(0, 120),
        specialty: input.specialty.trim().slice(0, 80),
        language: input.language.trim().slice(0, 40),
      };
    },
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

    const query = `${data.language}-speaking ${data.specialty} clinic in ${data.location} (international clinic, ${data.language}-speaking staff, patient reviews, contact phone)`;

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 10,
        include_answer: false,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Tavily search failed (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as TavilyResponse;
    const raw = json.results ?? [];

    const seen = new Set<string>();
    const clinics: ClinicResult[] = [];
    for (const r of raw) {
      if (!r.url || !r.title) continue;
      const domain = extractDomain(r.url);
      if (seen.has(domain)) continue;

      // Skip obvious non-clinic aggregators
      if (/^(facebook|instagram|linkedin|twitter|x|youtube|tiktok|reddit|wikipedia)\./i.test(domain))
        continue;

      seen.add(domain);
      const fullText = `${r.title} ${r.content ?? ""}`;
      const snippet = cleanSnippet(r.content ?? "");
      const signal = detectLanguageSignal(fullText, data.language);

      clinics.push({
        name: cleanTitle(r.title),
        url: r.url,
        domain,
        snippet,
        area: detectArea(fullText, data.location),
        phone: detectPhone(fullText),
        rating: detectRating(fullText),
        languageSignal: signal,
        languageConfirmed: signal === "confirmed",
        sources: buildSources(fullText, data.language, r.url),
      });
      if (clinics.length >= 8) break;
    }

    return { clinics, query };
  });
