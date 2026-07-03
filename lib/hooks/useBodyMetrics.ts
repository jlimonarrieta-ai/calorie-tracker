import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { BodyMetric } from "../../types/database";
import { useProfile } from "../profile";

// Weigh-ins for the signed-in user (Historial tab + log-weight modal).
//
// Concurrency primitives mirror `useTodayEntries` / `useAddFoodEntry`:
//   - requestIdRef: the last fetch wins; stale responses are dropped.
//   - mountedRef:   never setState after unmount.
//   - inFlightRef:  block double-submit on mutations (tri-state "duplicate").
//
// `addOrUpdateWeight` upserts on (user_id, measured_on): one weigh-in per
// calendar day; re-logging a day overwrites it.
//
// Snapshot sync: `profiles.current_weight_kg` was captured at onboarding and
// would drift from this time-series. After every successful mutation we
// re-read the newest weigh-in from the DB (never from possibly-stale local
// state) and push it into the profile via the ProfileProvider. Best-effort:
// a failed sync never fails the weight save itself.

export type BodyMetricResult = "ok" | "duplicate" | "error";

export function useBodyMetrics(userId: string | undefined) {
  const { profile, updateProfile } = useProfile();
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++requestIdRef.current;

    if (!userId) {
      if (mountedRef.current && myId === requestIdRef.current) {
        setMetrics([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const { data, error } = await supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", userId)
        .order("measured_on", { ascending: false });

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) setError(error.message);
      else setMetrics((data ?? []) as BodyMetric[]);
    } catch (e: unknown) {
      if (!mountedRef.current || myId !== requestIdRef.current) return;
      setError((e as Error).message);
    } finally {
      if (mountedRef.current && myId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function safeSetSubmitting(v: boolean) {
    if (mountedRef.current) setSubmitting(v);
  }
  function safeSetError(v: string | null) {
    if (mountedRef.current) setError(v);
  }

  async function syncProfileToLatest(uid: string) {
    try {
      const { data, error } = await supabase
        .from("body_metrics")
        .select("weight_kg")
        .eq("user_id", uid)
        .order("measured_on", { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return;
      const latest = Number(data[0].weight_kg);
      if (!Number.isFinite(latest) || latest <= 0) return;
      // Skip the write when the snapshot already matches. `updateProfile`
      // returning false here (e.g. its inFlightRef busy) is deliberately
      // ignored — the next mutation re-syncs.
      if (profile && Number(profile.current_weight_kg) === latest) return;
      await updateProfile({ current_weight_kg: latest });
    } catch {
      // Swallow: the weigh-in itself persisted fine.
    }
  }

  async function addOrUpdateWeight(
    weightKg: number,
    measuredOn: string,
    note?: string | null
  ): Promise<BodyMetricResult> {
    if (inFlightRef.current) return "duplicate";
    if (!userId) {
      safeSetError("Sin sesión activa");
      return "error";
    }
    // Mirror the DB CHECK (0 < kg < 500) so bad input fails with friendly
    // copy instead of surfacing a raw PostgREST constraint error.
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg >= 500) {
      safeSetError("Peso inválido");
      return "error";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) {
      safeSetError("Fecha inválida");
      return "error";
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      const trimmedNote = note?.trim() ? note.trim() : null;
      // `.select()` so a zero-row result (RLS rejecting the write) is
      // distinguishable from success — Postgres reports no error for it.
      const { data, error } = await supabase
        .from("body_metrics")
        .upsert(
          {
            user_id: userId,
            weight_kg: weightKg,
            measured_on: measuredOn,
            note: trimmedNote,
          },
          { onConflict: "user_id,measured_on" }
        )
        .select();
      if (error) {
        safeSetError(error.message);
        return "error";
      }
      if (!data || data.length === 0) {
        safeSetError("No se pudo guardar el pesaje.");
        return "error";
      }
      const saved = data[0] as BodyMetric;
      if (mountedRef.current) {
        // Merge locally (replace the row for that day) instead of refetching,
        // so the Historial list doesn't flash a loading state after each save.
        setMetrics((prev) =>
          [saved, ...prev.filter((m) => m.measured_on !== saved.measured_on)].sort((a, b) =>
            a.measured_on < b.measured_on ? 1 : -1
          )
        );
      }
      await syncProfileToLatest(userId);
      return "ok";
    } catch (e: unknown) {
      safeSetError((e as Error).message);
      return "error";
    } finally {
      inFlightRef.current = false;
      safeSetSubmitting(false);
    }
  }

  async function deleteWeight(id: string): Promise<BodyMetricResult> {
    if (inFlightRef.current) return "duplicate";
    if (!userId) {
      safeSetError("Sin sesión activa");
      return "error";
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      // user_id in the filter for explicit intent (not just RLS), mirroring
      // deleteEntry in useAddFoodEntry.
      const { error } = await supabase
        .from("body_metrics")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) {
        safeSetError(error.message);
        return "error";
      }
      if (mountedRef.current) {
        setMetrics((prev) => prev.filter((m) => m.id !== id));
      }
      // Deleting the newest weigh-in must roll the snapshot back to the new
      // latest; when no rows remain the snapshot keeps its last value.
      await syncProfileToLatest(userId);
      return "ok";
    } catch (e: unknown) {
      safeSetError((e as Error).message);
      return "error";
    } finally {
      inFlightRef.current = false;
      safeSetSubmitting(false);
    }
  }

  return { metrics, loading, error, submitting, refetch, addOrUpdateWeight, deleteWeight };
}
