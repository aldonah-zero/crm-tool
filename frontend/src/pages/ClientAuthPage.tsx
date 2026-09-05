import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientAuth } from "../contexts/ClientAuthContext";

type View = "login" | "register";

const ClientAuthPage: React.FC = () => {
  const { signIn, signUp, signInWithGoogle, user, profile, loading } =
    useClientAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!loading && user && profile) {
      navigate("/client/dashboard");
    }
  }, [loading, user, profile, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setSubmitting(true);
    const result = await signIn(email, password);
    if (result.error) setError(result.error);
    setSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (password.length < 6) {
      setError("Lozinka mora imati najmanje 6 karaktera");
      return;
    }

    setSubmitting(true);
    const result = await signUp(email, password, fullName);

    if (result.error === "EMAIL_CONFIRMATION_NEEDED") {
      setSuccessMessage(
        "Registracija uspešna! Proverite svoj email i potvrdite nalog pre prijavljivanja.",
      );
      setError("");
    } else if (result.error) {
      setError(result.error);
    }

    setSubmitting(false);
  };

  const handleGoogleLogin = async () => {
    setError("");
    setSuccessMessage("");
    await signInWithGoogle();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h1 className="auth-title">
            {view === "login" ? "Dobrodošli nazad" : "Kreirajte nalog"}
          </h1>
          <p className="auth-subtitle">
            {view === "login"
              ? "Prijavite se da vidite svoje termine"
              : "Pratite svoje termine na jednom mestu"}
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {successMessage && <div className="auth-success">{successMessage}</div>}

        <button
          type="button"
          className="auth-btn auth-btn-google"
          onClick={handleGoogleLogin}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Nastavi sa Google
        </button>

        <div className="auth-divider">
          <span>ili</span>
        </div>

        <form
          onSubmit={view === "login" ? handleLogin : handleRegister}
          className="auth-form"
        >
          {view === "register" && (
            <div className="auth-field">
              <label>Vaše ime</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ana Anić"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label>Lozinka</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="auth-btn auth-btn-primary"
            disabled={submitting}
            style={{
              background: "linear-gradient(135deg, #16a34a, #15803d)",
              boxShadow: "0 4px 14px rgba(22,163,74,0.3)",
            }}
          >
            {submitting
              ? "Učitavanje..."
              : view === "login"
                ? "Prijavi se"
                : "Registruj se"}
          </button>
        </form>

        <div className="auth-toggle">
          {view === "login" ? (
            <p>
              Nemate nalog?{" "}
              <button
                type="button"
                onClick={() => {
                  setView("register");
                  setError("");
                  setSuccessMessage("");
                }}
              >
                Registrujte se
              </button>
            </p>
          ) : (
            <p>
              Već imate nalog?{" "}
              <button
                type="button"
                onClick={() => {
                  setView("login");
                  setError("");
                  setSuccessMessage("");
                }}
              >
                Prijavite se
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="auth-footer" style={{ textAlign: "center" }}>
        <p>
          Ne želite nalog?{" "}
          <a
            href="/find-therapist"
            style={{ color: "#16a34a", fontWeight: 600 }}
          >
            Nastavite kao gost
          </a>
        </p>
        <p>© 2026 PsihoApp</p>
      </div>
    </div>
  );
};

export default ClientAuthPage;
