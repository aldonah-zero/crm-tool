import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion, type Variants } from "framer-motion";
import {
  SPECIALTY_TAGS,
  TAG_LABEL_BY_SLUG,
  suggestTagsFromText,
} from "../lib/specialtyTags";
import { useClientAuth } from "../contexts/ClientAuthContext";
import HomeLink from "../components/HomeLink";

const backendBase =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

type Step = "describe" | "contact" | "done";

const fadeSlide: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  padding: "32px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05)",
};

const primaryBtn: React.CSSProperties = {
  padding: "13px 24px",
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(135deg, #6366f1, #7c3aed)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
};

const backLink: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#a5b4fc",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
  marginBottom: 20,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1e293b",
  background: "#f8fafc",
  outline: "none",
  marginTop: 6,
  boxSizing: "border-box",
};

const FindTherapist: React.FC = () => {
  const { profile: clientProfile, signOut } = useClientAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const [step, setStep] = useState<Step>("describe");
  const [freeText, setFreeText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [form, setForm] = useState({
    ime: "",
    prezime: "",
    email: "",
    telefon: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doneName, setDoneName] = useState("");

  useEffect(() => {
    if (!clientProfile) return;
    const [ime, ...rest] = (clientProfile.full_name || "").split(" ");
    setForm((prev) => ({
      ...prev,
      ime: prev.ime || ime || "",
      prezime: prev.prezime || rest.join(" "),
      email: prev.email || clientProfile.email || "",
      telefon: prev.telefon || clientProfile.phone || "",
    }));
  }, [clientProfile]);

  const suggestedTags = useMemo(
    () =>
      suggestTagsFromText(freeText).filter((s) => !selectedTags.includes(s)),
    [freeText, selectedTags],
  );

  const toggleTag = (slug: string) => {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  };

  const canContinue = selectedTags.length > 0 || freeText.trim().length > 0;

  const handleContinue = () => {
    if (!canContinue) return;
    setError("");
    setStep("contact");
  };

  const handleSubmit = async () => {
    if (!form.ime || !form.prezime || !form.email) return;
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${backendBase}/public/intake-request`, {
        ime: form.ime,
        prezime: form.prezime,
        email: form.email,
        telefon: form.telefon || null,
        tags: selectedTags.map((slug) => TAG_LABEL_BY_SLUG[slug] || slug),
        opis: freeText || null,
      });
      setDoneName(res.data.klijent_ime || form.ime);
      setStep("done");
    } catch (err: any) {
      setError(
        err?.response?.status === 429
          ? "Poslali ste previše zahteva. Pokušajte ponovo za nekoliko minuta."
          : "Greška pri slanju zahteva. Pokušajte ponovo.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 20% 15%, #1e2547 0%, #0b1120 45%), linear-gradient(160deg, #0b1120 0%, #131c31 55%, #0b1120 100%)",
        fontFamily: "var(--font-body), 'DM Sans', system-ui, sans-serif",
        padding: "40px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        className="glow-orb drift-a"
        style={{
          width: 420,
          height: 420,
          background: "radial-gradient(circle, #6366f1, transparent 70%)",
          top: "-10%",
          left: "-12%",
        }}
      />
      <div
        className="glow-orb drift-b"
        style={{
          width: 360,
          height: 360,
          background: "radial-gradient(circle, #7c3aed, transparent 70%)",
          bottom: "-8%",
          right: "-10%",
        }}
      />

      <HomeLink />

      <div
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <a
          href={clientProfile ? "/client/dashboard" : "/client"}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#a5b4fc",
            textDecoration: "none",
          }}
        >
          {clientProfile ? "Vaši termini →" : "Prijavite se →"}
        </a>
        {clientProfile && (
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "#64748b",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Odjavi se
          </button>
        )}
      </div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          marginBottom: 32,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            color: "#fff",
            fontSize: 32,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.5px",
          }}
        >
          Zatražite podršku
        </h1>
        <p style={{ color: "#94a3b8", margin: 0, fontSize: 14, maxWidth: 480 }}>
          Recite nam kroz šta prolazite. Prosleđujemo vaš zahtev našem timu,
          koji će vas kontaktirati i povezati sa odgovarajućim terapeutom.
        </p>
      </motion.div>

      <div style={{ width: "100%", maxWidth: 720, position: "relative", zIndex: 1 }}>
        {step === "describe" && (
          <motion.div variants={fadeSlide} initial="hidden" animate="show" style={{ ...card }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#334155",
                display: "block",
                marginBottom: 8,
              }}
            >
              Opišite (opciono) šta vas muči
            </label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Npr. Poslednjih meseci se osećam anksiozno zbog posla i teško spavam..."
              rows={3}
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                fontFamily: "inherit",
                color: "#1e293b",
                background: "#f8fafc",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6366f1";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />

            {suggestedTags.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                  Predlažemo:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {suggestedTags.map((slug) => (
                    <motion.button
                      key={slug}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleTag(slug)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 20,
                        border: "1.5px dashed #a5b4fc",
                        background: "#eef2ff",
                        color: "#4338ca",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      + {TAG_LABEL_BY_SLUG[slug]}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 14px" }}>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
              <span
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  fontWeight: 500,
                  fontFamily: "var(--font-mono), monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                ili izaberite oblasti
              </span>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPECIALTY_TAGS.map((tag) => {
                const active = selectedTags.includes(tag.slug);
                return (
                  <motion.button
                    key={tag.slug}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => toggleTag(tag.slug)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      border: active ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
                      background: active ? "#6366f1" : "#fff",
                      color: active ? "#fff" : "#334155",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: active ? "0 6px 16px rgba(99,102,241,0.3)" : "none",
                    }}
                  >
                    {tag.label}
                  </motion.button>
                );
              })}
            </div>

            {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 16 }}>{error}</p>}

            <motion.button
              whileHover={!canContinue ? {} : { y: -2, boxShadow: "0 10px 26px rgba(99,102,241,0.4)" }}
              whileTap={!canContinue ? {} : { scale: 0.98 }}
              style={{
                ...primaryBtn,
                width: "100%",
                marginTop: 24,
                opacity: !canContinue ? 0.6 : 1,
                cursor: !canContinue ? "not-allowed" : "pointer",
              }}
              disabled={!canContinue}
              onClick={handleContinue}
            >
              {canContinue ? "Nastavi" : "Izaberite bar jednu oblast ili opišite situaciju"}
            </motion.button>
          </motion.div>
        )}

        {step === "contact" && (
          <motion.div variants={fadeSlide} initial="hidden" animate="show">
            <button style={backLink} onClick={() => setStep("describe")}>
              ← Izmeni opis
            </button>
            <div style={card}>
              <div
                style={{
                  background: "#eef2ff",
                  borderRadius: 12,
                  padding: "12px 16px",
                  marginBottom: 20,
                }}
              >
                {selectedTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: freeText ? 8 : 0 }}>
                    {selectedTags.map((slug) => (
                      <span
                        key={slug}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: "#fff",
                          color: "#4338ca",
                        }}
                      >
                        {TAG_LABEL_BY_SLUG[slug]}
                      </span>
                    ))}
                  </div>
                )}
                {freeText && (
                  <p style={{ margin: 0, fontSize: 13, color: "#4338ca" }}>{freeText}</p>
                )}
              </div>

              {clientProfile && (
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#16a34a" }}>
                  Prijavljeni ste kao <strong>{clientProfile.full_name || clientProfile.email}</strong>
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!clientProfile && (
                  <>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                          Ime *
                        </label>
                        <input
                          value={form.ime}
                          onChange={(e) => setForm({ ...form, ime: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                          Prezime *
                        </label>
                        <input
                          value={form.prezime}
                          onChange={(e) => setForm({ ...form, prezime: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                        Email *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                    Telefon (opciono)
                  </label>
                  <input
                    value={form.telefon}
                    onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 16 }}>{error}</p>}

              <motion.button
                whileHover={
                  !form.ime || !form.prezime || !form.email || loading
                    ? {}
                    : { y: -2, boxShadow: "0 10px 26px rgba(99,102,241,0.4)" }
                }
                whileTap={!form.ime || !form.prezime || !form.email || loading ? {} : { scale: 0.98 }}
                style={{
                  ...primaryBtn,
                  width: "100%",
                  marginTop: 20,
                  opacity: !form.ime || !form.prezime || !form.email || loading ? 0.6 : 1,
                  cursor: !form.ime || !form.prezime || !form.email || loading ? "not-allowed" : "pointer",
                }}
                disabled={!form.ime || !form.prezime || !form.email || loading}
                onClick={handleSubmit}
              >
                {loading ? "Slanje..." : "Pošalji zahtev"}
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div variants={fadeSlide} initial="hidden" animate="show" style={{ ...card, textAlign: "center" }}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>
            <h3
              style={{
                margin: "0 0 8px",
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: 22,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Zahtev je poslat!
            </h3>
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
              Hvala, {doneName}. Vaš zahtev je primljen — naš tim će vas uskoro
              kontaktirati i povezati sa odgovarajućim terapeutom.
            </p>
            {clientProfile && (
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/client/dashboard")}
                style={{ ...primaryBtn, marginTop: 20 }}
              >
                Vidi svoje termine
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default FindTherapist;
