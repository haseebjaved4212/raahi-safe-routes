import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { searchKarachi, type Place } from "@/lib/raahi/services";

interface Props {
  id: string;
  label: string;
  dotClass: string;
  value: string;
  placeholder: string;
  onPick: (place: Place) => void;
  onTextChange: (text: string) => void;
}

export function SearchField({
  id,
  label,
  dotClass,
  value,
  placeholder,
  onPick,
  onTextChange,
}: Props) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const found = await searchKarachi(value);
        if (cancelled) return;
        setResults(found);
        setOpen(true);
        if (found.length === 0) setError("No matching place found inside Karachi.");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 420);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        <span className={`size-2 rounded-full ${dotClass}`} />
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            skip.current = false;
            onTextChange(e.target.value);
          }}
          onFocus={() => results.length && setOpen(true)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/70 focus:ring-2 focus:ring-primary/25"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MapPin className="size-4" />
          )}
        </span>
      </div>

      {error && !loading && <p className="mt-1 text-xs text-alert">{error}</p>}

      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface-raised shadow-panel raahi-scroll">
          {results.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  skip.current = true;
                  onPick(r);
                  setOpen(false);
                  setResults([]);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-primary/10"
              >
                <span className="text-sm text-foreground">{r.name}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
