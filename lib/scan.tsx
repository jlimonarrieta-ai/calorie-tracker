import { ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import type { FoodItem } from "./openFoodFacts";

// Hand-off channel from the barcode scanner modal back to add-food. Params
// can't flow backwards through router.back(), and pushing a second add-food
// on top would stack a stale modal underneath — so the scanner parks its
// result here and add-food consumes it on focus. Shared cross-screen state →
// a single Context instance mounted in app/_layout.tsx (auth/profile rule).
//
// Two result kinds:
//   - "item":   product resolved → add-food jumps straight to the quantity step.
//   - "manual": product missing/unusable → add-food opens manual mode, with
//               the product name pre-filled when OFF at least knew that much.

export type PendingScan =
  | { kind: "item"; item: FoodItem }
  | { kind: "manual"; name?: string };

type PendingScanContextValue = {
  setPending: (scan: PendingScan) => void;
  // Read-and-clear. Returns null when there's nothing parked.
  consume: () => PendingScan | null;
};

const PendingScanContext = createContext<PendingScanContextValue>({
  setPending: () => {},
  consume: () => null,
});

export function PendingScanProvider({ children }: { children: ReactNode }) {
  // The ref is the source of truth so `consume` always sees the latest value
  // even when called in the same tick it was set; the state mirror only
  // exists to keep React aware the provider holds data (devtools, future UI).
  const pendingRef = useRef<PendingScan | null>(null);
  const [, setPendingState] = useState<PendingScan | null>(null);

  const setPending = useCallback((scan: PendingScan) => {
    pendingRef.current = scan;
    setPendingState(scan);
  }, []);

  const consume = useCallback(() => {
    const scan = pendingRef.current;
    pendingRef.current = null;
    setPendingState(null);
    return scan;
  }, []);

  return (
    <PendingScanContext.Provider value={{ setPending, consume }}>
      {children}
    </PendingScanContext.Provider>
  );
}

export function usePendingScan() {
  return useContext(PendingScanContext);
}
