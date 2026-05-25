import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { Profile } from "../../types/database";

// Mirrors the concurrency guard pattern from useTodayEntries / useAddFoodEntry:
// `requestIdRef` rejects stale fetch responses, `mountedRef` prevents setState
// after unmount, and `inFlightRef` blocks overlapping mutations.
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
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
        setProfile(null);
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
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) setError(error.message);
      else setProfile(data as Profile);
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

  const updateProfile = useCallback(
    async (
      patch: Partial<Omit<Profile, "id" | "email" | "created_at">>
    ): Promise<boolean> => {
      if (!userId) return false;
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      if (mountedRef.current) {
        setUpdating(true);
        setError(null);
      }
      try {
        const { error } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", userId);
        if (error) {
          if (mountedRef.current) setError(error.message);
          return false;
        }
        await refetch();
        return true;
      } catch (e: unknown) {
        if (mountedRef.current) setError((e as Error).message);
        return false;
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setUpdating(false);
      }
    },
    [userId, refetch]
  );

  return { profile, loading, error, updating, refetch, updateProfile };
}
