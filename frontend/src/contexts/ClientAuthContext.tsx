import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { clientSupabase } from "../lib/clientSupabase";
import axios from "axios";
import type { User, Session } from "@supabase/supabase-js";

interface ClientProfile {
  client_id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
}

interface ClientAuthContextType {
  user: User | null;
  session: Session | null;
  profile: ClientProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(
  undefined,
);

export const useClientAuth = () => {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth must be used within ClientAuthProvider");
  return ctx;
};

export const ClientAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const applyClientToAxios = (clientId?: number | null) => {
    if (clientId) {
      axios.defaults.headers.common["X-Client-ID"] = String(clientId);
      localStorage.setItem("client_id", String(clientId));
    } else {
      delete axios.defaults.headers.common["X-Client-ID"];
      localStorage.removeItem("client_id");
    }
  };

  const fetchProfile = useCallback(
    async (user: User): Promise<ClientProfile | null> => {
      try {
        const res = await axios.post(`${backendBase}/client-auth/profile`, {
          supabase_user_id: user.id,
          email: user.email,
          full_name:
            user.user_metadata?.full_name || user.user_metadata?.name || null,
        });
        applyClientToAxios(res.data.client_id);
        return res.data;
      } catch (err) {
        console.error("Error fetching client profile:", err);
        applyClientToAxios(null);
        return null;
      }
    },
    [backendBase],
  );

  useEffect(() => {
    const savedClientId = localStorage.getItem("client_id");
    if (savedClientId) {
      axios.defaults.headers.common["X-Client-ID"] = savedClientId;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Mirrors AuthContext's pattern: onAuthStateChange fires immediately on
    // subscribe with the current session, so a separate getSession() call
    // here would race it - see the "Fix race between duplicate profile
    // fetches" fix in AuthContext.tsx for why that's worth avoiding.
    const {
      data: { subscription },
    } = clientSupabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const p = await fetchProfile(s.user);
        if (!mounted) return;
        setProfile(p);
      } else {
        setProfile(null);
        applyClientToAxios(null);
      }

      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error?: string }> => {
    const { data, error } = await clientSupabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Registracija neuspešna" };

    if (data.user.identities?.length === 0) {
      return { error: "Nalog sa ovim emailom već postoji." };
    }

    if (!data.session) {
      return { error: "EMAIL_CONFIRMATION_NEEDED" };
    }

    return {};
  };

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const { data, error } = await clientSupabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Prijava neuspešna" };

    return {};
  };

  const signInWithGoogle = async () => {
    await clientSupabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/client/dashboard`,
      },
    });
  };

  const signOut = async () => {
    await clientSupabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    applyClientToAxios(null);
  };

  return (
    <ClientAuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
};
