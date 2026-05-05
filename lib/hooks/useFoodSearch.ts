import { useEffect, useRef, useState } from "react";
import { FoodItem, searchFoods } from "../openFoodFacts";

const DEBOUNCE_MS = 350;

export function useFoodSearch(query: string) {
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const items = await searchFoods(query, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(items);
          setError(null);
        }
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [query]);

  return { results, loading, error };
}
