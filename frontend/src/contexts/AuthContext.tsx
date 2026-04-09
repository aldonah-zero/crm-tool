import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { supabase } from "../lib/supabase";
import axios from "axios";
import type { User, Session } from "@supabase/supabase-js";

interface UserProfile {
  user_id: number;
  supabase_user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  tenant_id: number;
  tenant_name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    practiceName: string,
  ) => Promise<{ error?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error?: string; needsProfile?: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  createProfile: (
    practiceName: string,
    fullName?: string,
  ) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Fetch user profile from our backend
  const fetchProfile = useCallback(
    async (user: User): Promise<UserProfile | null> => {
      try {
        const res = await axios.post(`${backendBase}/auth/login-profile`, {
          supabase_user_id: user.id,
          email: user.email,
          full_name:
            user.user_metadata?.full_name || user.user_metadata?.name || null,
        });
        return res.data;
      } catch (err: any) {
        if (err?.response?.status === 404) {
          return null; // No profile yet — needs registration
        }
        console.error("Error fetching profile:", err);
        return null;
      }
    },
    [backendBase],
  );

  // Set tenant ID on axios whenever profile changes
  useEffect(() => {
    if (profile?.tenant_id) {
      axios.defaults.headers.common["X-Tenant-ID"] = String(profile.tenant_id);
    } else {
      delete axios.defaults.headers.common["X-Tenant-ID"];
    }
  }, [profile]);

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const p = await fetchProfile(s.user);
        setProfile(p);
      }

      setLoading(false);
    });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const p = await fetchProfile(s.user);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Sign up with email + password
  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    practiceName: string,
  ): Promise<{ error?: string }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Registracija neuspešna" };

    // Check if account already exists (identities is empty)
    if (data.user.identities?.length === 0) {
      return { error: "Nalog sa ovim emailom već postoji." };
    }

    // Check if email confirmation is required (no session = needs confirmation)
    if (!data.session) {
      // Email confirmation required — create profile now so it's ready when they confirm
      try {
        await axios.post(`${backendBase}/auth/register-profile`, {
          supabase_user_id: data.user.id,
          email: email,
          full_name: fullName,
          practice_name: practiceName,
        });
      } catch (err: any) {
        console.error("Error creating profile:", err);
      }
      return { error: "EMAIL_CONFIRMATION_NEEDED" };
    }

    // If we get here, no email confirmation needed (auto-confirm is on)
    try {
      const res = await axios.post(`${backendBase}/auth/register-profile`, {
        supabase_user_id: data.user.id,
        email: email,
        full_name: fullName,
        practice_name: practiceName,
      });
      setProfile(res.data);
      return {};
    } catch (err: any) {
      console.error("Error creating profile:", err);
      return {
        error: err?.response?.data?.detail || "Greška pri kreiranju profila",
      };
    }
  };

  // Sign in with email + password
  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error?: string; needsProfile?: boolean }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Prijava neuspešna" };

    // Fetch profile
    const p = await fetchProfile(data.user);
    if (!p) {
      return { needsProfile: true };
    }

    setProfile(p);
    return {};
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  // Create profile (for Google users who don't have one yet)
  const createProfile = async (
    practiceName: string,
    fullName?: string,
  ): Promise<{ error?: string }> => {
    if (!user) return { error: "Niste prijavljeni" };

    try {
      const res = await axios.post(`${backendBase}/auth/register-profile`, {
        supabase_user_id: user.id,
        email: user.email,
        full_name: fullName || user.user_metadata?.full_name || user.email,
        practice_name: practiceName,
      });
      setProfile(res.data);
      return {};
    } catch (err: any) {
      return {
        error: err?.response?.data?.detail || "Greška pri kreiranju profila",
      };
    }
  };

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    delete axios.defaults.headers.common["X-Tenant-ID"];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        createProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
