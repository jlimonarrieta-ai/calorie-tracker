import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "./supabase";
import { Profile } from "../types/database";
import { useAuth } from "./auth";

// Profile is shared across screens (RootNavigator gates onboarding off it; the
// Today tab reads the daily goal; Settings/EditGoals mutate it). A single
// Provider instance keeps every consumer in sync after mutations — otherwise
// independent useState instances drift and we get bounce-loops between
// (onboarding) and (tabs).

type ProfilePatch = Partial<Omit<Profile, "id" | "email" | "created_at">>;

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  updating: boolean;
  refetch: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<boolean>;
};

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  error: null,
  updating: false,
  refetch: async () => {},
  updateProfile: async () => false,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
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
    async (patch: ProfilePatch): Promise<boolean> => {
      if (!userId) return false;
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      if (mountedRef.current) {
        setUpdating(true);
        setError(null);
      }
      try {
        // `.select()` asks Postgres to return the updated rows so we can detect
        // the "silent zero-rows-matched" case (missing profile row or an RLS
        // policy rejecting the update both return `{ data: [], error: null }`).
        const { data, error } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", userId)
          .select();
        if (error) {
          if (mountedRef.current) setError(error.message);
          return false;
        }
        if (!data || data.length === 0) {
          if (mountedRef.current) setError("No se encontró tu perfil.");
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

  return (
    <ProfileContext.Provider
      value={{ profile, loading, error, updating, refetch, updateProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
