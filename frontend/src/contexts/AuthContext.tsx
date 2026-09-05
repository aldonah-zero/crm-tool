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
  inviteTenantName: string | null;
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
  clearInvite: () => void;
}

const INVITE_STORAGE_KEY = "pending_invite_token";

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
  const [inviteTenantName, setInviteTenantName] = useState<string | null>(null);

  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const clearInvite = () => {
    sessionStorage.removeItem(INVITE_STORAGE_KEY);
    setInviteTenantName(null);
  };

  // Pick up ?invite=<token> from a shared team-invite link, stash it for the
  // duration of the signup/login flow (it must survive the Google OAuth
  // round-trip and, for email signup, the "confirm your email" detour).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (inviteToken) {
      sessionStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
      params.delete("invite");
      const newSearch = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname +
          (newSearch ? `?${newSearch}` : "") +
          window.location.hash,
      );
    }

    const pending = sessionStorage.getItem(INVITE_STORAGE_KEY);
    if (pending) {
      axios
        .get(`${backendBase}/auth/invite-info`, { params: { token: pending } })
        .then((res) => setInviteTenantName(res.data.tenant_name))
        .catch(() => {
          // Invalid/expired invite link - drop it so the user can sign up normally.
          sessionStorage.removeItem(INVITE_STORAGE_KEY);
        });
    }
  }, [backendBase]);

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
      const inviteToken = sessionStorage.getItem(INVITE_STORAGE_KEY);

      if (inviteToken) {
        try {
          const res = await axios.post(`${backendBase}/auth/join-tenant`, {
            supabase_user_id: user.id,
            email: user.email,
            full_name:
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              null,
            invite_token: inviteToken,
          });

          const joinedProfile: UserProfile = res.data;
          applyTenantToAxios(joinedProfile.tenant_id);
          clearInvite();

          return joinedProfile;
        } catch (err) {
          console.error("Error joining tenant via invite:", err);
          clearInvite();
          // fall through to the normal login-profile lookup below
        }
      }

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

    // supabase-js fires this listener immediately on subscribe with the
    // current session (event "INITIAL_SESSION"), then again on every
    // subsequent change - so this one listener covers both the initial
    // load and later sign-in/sign-out events. A separate getSession() +
    // fetchProfile() call here would race this one (both reading/clearing
    // the same pending-invite token concurrently), so don't add one.
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

  // Creates a brand-new tenant, or joins one via a pending invite token.
  const createOrJoinProfile = async (
    supabaseUserId: string,
    email: string,
    fullName: string,
    practiceName: string,
  ): Promise<UserProfile> => {
    const inviteToken = sessionStorage.getItem(INVITE_STORAGE_KEY);

    if (inviteToken) {
      try {
        const res = await axios.post(`${backendBase}/auth/join-tenant`, {
          supabase_user_id: supabaseUserId,
          email,
          full_name: fullName,
          invite_token: inviteToken,
        });
        clearInvite();
        return res.data;
      } catch (err) {
        console.error("Error joining tenant via invite:", err);
        clearInvite();
        // fall through and create a new practice instead
      }
    }

    const res = await axios.post(`${backendBase}/auth/register-profile`, {
      supabase_user_id: supabaseUserId,
      email,
      full_name: fullName,
      practice_name: practiceName,
    });
    return res.data;
  };

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
        await createOrJoinProfile(data.user.id, email, fullName, practiceName);
      } catch (err: any) {
        console.error("Error creating profile:", err);
      }
      return { error: "EMAIL_CONFIRMATION_NEEDED" };
    }

    try {
      const createdProfile = await createOrJoinProfile(
        data.user.id,
        email,
        fullName,
        practiceName,
      );
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
    const inviteToken = sessionStorage.getItem(INVITE_STORAGE_KEY);
    const redirectTo = inviteToken
      ? `${window.location.origin}/therapist?invite=${encodeURIComponent(inviteToken)}`
      : `${window.location.origin}/therapist`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
  };

  const createProfile = async (
    practiceName: string,
    fullName?: string,
  ): Promise<{ error?: string }> => {
    if (!user) return { error: "Niste prijavljeni" };

    try {
      const createdProfile = await createOrJoinProfile(
        user.id,
        user.email || "",
        fullName || user.user_metadata?.full_name || user.email || "",
        practiceName,
      );
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
        inviteTenantName,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        createProfile,
        clearInvite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
