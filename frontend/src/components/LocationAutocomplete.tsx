import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocationSuggestion } from "@/lib/locations.functions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function LocationAutocomplete({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // Sync external value -> input
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounced suggestions fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    const myId = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { suggestLocations } = await import("@/lib/locations.functions");
        const res = await suggestLocations({ data: { query: q } });
        if (myId !== reqId.current) return;
        setSuggestions(res.suggestions);
        setSearched(true);
      } catch {
        if (myId !== reqId.current) return;
        setSuggestions([]);
        setSearched(true);
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (s: LocationSuggestion) => {
    onChange(s.label);
    setQuery(s.label);
    setOpen(false);
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Location not supported on this device");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { reverseGeocode } = await import("@/lib/locations.functions");
          const res = await reverseGeocode({
            data: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          });
          onChange(res.label);
          setQuery(res.label);
          setOpen(false);
        } catch {
          setGeoError("Couldn't detect your city");
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setGeoLoading(false);
        setGeoError("Permission denied");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "City, Country"}
          className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoLoading}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          aria-label="Use my location"
        >
          {geoLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Navigation className="size-3" />
          )}
          Use my location
        </button>
      </div>

      {geoError && (
        <p className="mt-1 text-[11px] text-destructive">{geoError}</p>
      )}

      {open && (query.trim().length >= 2 || loading) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-card">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Searching locations…
            </div>
          )}
          {!loading && suggestions.length === 0 && searched && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No matching locations found
            </div>
          )}
          {!loading &&
            suggestions.map((s) => {
              const selected = s.label === value;
              return (
                <button
                  type="button"
                  key={s.label}
                  onClick={() => select(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-secondary text-secondary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <MapPin className="size-3.5 text-primary" />
                  <span className="font-medium text-foreground">{s.city}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.country}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
