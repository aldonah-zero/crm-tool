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

  const applyTenantToAxios = (tenantId?: number | null) => {
    if (tenantId) {
      axios.defaults.headers.common["X-Tenant-ID"] = String(tenantId);
      localStorage.setItem("tenant_id", String(tenantId));
    } else {
      delete axios.defaults.headers.common["X-Tenant-ID"];
      localStorage.removeItem("tenant_id");
    }
  };

  const fetchProfile = useCallback(
    async (user: User): Promise<UserProfile | null> => {
      try {
        const res = await axios.post(`${backendBase}/auth/login-profile`, {
          supabase_user_id: user.id,
          email: user.email,
          full_name:
            user.user_metadata?.full_name || user.user_metadata?.name || null,
        });

        const fetchedProfile: UserProfile = res.data;
        applyTenantToAxios(fetchedProfile.tenant_id);

        return fetchedProfile;
      } catch (err: any) {
        if (err?.response?.status === 404) {
          applyTenantToAxios(null);
          return null;
        }

        console.error("Error fetching profile:", err);
        applyTenantToAxios(null);
        return null;
      }
    },
    [backendBase],
  );

  useEffect(() => {
    const savedTenantId = localStorage.getItem("tenant_id");
    if (savedTenantId) {
      axios.defaults.headers.common["X-Tenant-ID"] = savedTenantId;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const p = await fetchProfile(s.user);
        if (!mounted) return;
        setProfile(p);
      } else {
        setProfile(null);
        applyTenantToAxios(null);
      }

      if (mounted) {
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const p = await fetchProfile(s.user);
        if (!mounted) return;
        setProfile(p);
      } else {
        setProfile(null);
        applyTenantToAxios(null);
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

    if (data.user.identities?.length === 0) {
      return { error: "Nalog sa ovim emailom već postoji." };
    }

    if (!data.session) {
      try {
        await axios.post(`${backendBase}/auth/register-profile`, {
          supabase_user_id: data.user.id,
          email,
          full_name: fullName,
          practice_name: practiceName,
        });
      } catch (err: any) {
        console.error("Error creating profile:", err);
      }
      return { error: "EMAIL_CONFIRMATION_NEEDED" };
    }

    try {
      const res = await axios.post(`${backendBase}/auth/register-profile`, {
        supabase_user_id: data.user.id,
        email,
        full_name: fullName,
        practice_name: practiceName,
      });

      const createdProfile: UserProfile = res.data;
      applyTenantToAxios(createdProfile.tenant_id);
      setProfile(createdProfile);

      return {};
    } catch (err: any) {
      console.error("Error creating profile:", err);
      return {
        error: err?.response?.data?.detail || "Greška pri kreiranju profila",
      };
    }
  };

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

    const p = await fetchProfile(data.user);

    if (!p) {
      return { needsProfile: true };
    }

    setProfile(p);
    return {};
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

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

      const createdProfile: UserProfile = res.data;
      applyTenantToAxios(createdProfile.tenant_id);
      setProfile(createdProfile);

      return {};
    } catch (err: any) {
      return {
        error: err?.response?.data?.detail || "Greška pri kreiranju profila",
      };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    applyTenantToAxios(null);
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
