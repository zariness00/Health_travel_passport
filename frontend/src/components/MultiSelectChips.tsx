import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string[];
  onChange: (values: string[]) => void;
  options: readonly string[];
  placeholder?: string;
  allowCustom?: boolean;
  emptyHint?: string;
};

export function MultiSelectChips({
  value,
  onChange,
  options,
  placeholder = "Type to search…",
  allowCustom = true,
  emptyHint = "No matches",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const remaining = options.filter(
      (o) => !value.some((v) => v.toLowerCase() === o.toLowerCase()),
    );
    if (!q) return remaining.slice(0, 8);
    return remaining
      .filter((o) => o.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, options, value]);

  const add = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    if (value.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
    setQuery("");
    inputRef.current?.focus();
  };

  const remove = (v: string) => {
    onChange(value.filter((x) => x !== v));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[0]) add(filtered[0]);
      else if (allowCustom && query.trim()) add(query);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const showCustom =
    allowCustom &&
    query.trim().length > 0 &&
    !filtered.some((f) => f.toLowerCase() === query.trim().toLowerCase()) &&
    !value.some((v) => v.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="relative">
      <div
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 hover:bg-background/50"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[100px] flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
        />
      </div>

      {open && (filtered.length > 0 || showCustom || query) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-card">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(opt);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted",
              )}
            >
              <Plus className="size-3.5 text-primary" />
              {opt}
            </button>
          ))}
          {filtered.length === 0 && !showCustom && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {emptyHint}
            </div>
          )}
          {showCustom && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(query);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <Plus className="size-3.5 text-primary" />
              Add &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
