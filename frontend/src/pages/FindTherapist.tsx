import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  SPECIALTY_TAGS,
  TAG_LABEL_BY_SLUG,
  suggestTagsFromText,
} from "../lib/specialtyTags";
import { useClientAuth } from "../contexts/ClientAuthContext";

const backendBase =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

const injectStyles = () => {
  if (document.getElementById("find-therapist-styles")) return;
  const s = document.createElement("style");
  s.id = "find-therapist-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
    .ft-chip { transition: all 0.15s ease; }
    .ft-chip:hover { border-color: #6366f1 !important; }
    .ft-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .ft-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(15,23,42,0.12); }
    .ft-slot-btn:hover { background: #6366f1 !important; color: #fff !important; border-color: #6366f1 !important; }
    @keyframes ftFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .ft-fade { animation: ftFadeIn 0.35s ease both; }
  `;
  document.head.appendChild(s);
};

interface TherapistResult {
  tenant_id: number;
  name: string;
  specialties: string[];
  matched_tags: string[];
  match_count: number;
  next_available: string;
}

interface Slot {
  start: string;
  end: string;
}

type Step = "search" | "results" | "availability" | "confirm" | "done";

const DAY_NAMES = [
  "Nedelja",
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "Četvrtak",
  "Petak",
  "Subota",
];
const MONTH_NAMES = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

const formatDayHeading = (d: Date) =>
  `${DAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatDayHeading(d)} u ${formatTime(iso)}`;
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

const FindTherapist: React.FC = () => {
  const { profile: clientProfile } = useClientAuth();
  const navigate = useNavigate();

  useEffect(() => {
    injectStyles();
  }, []);

  const [step, setStep] = useState<Step>("search");
  const [freeText, setFreeText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [results, setResults] = useState<TherapistResult[]>([]);
  const [selectedTherapist, setSelectedTherapist] =
    useState<TherapistResult | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({
    ime: "",
    prezime: "",
    email: "",
    telefon: "",
    napomena: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<{
    tenant_name: string;
    pocetak: string;
  } | null>(null);

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

  const handleSearch = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`${backendBase}/public/therapists`, {
        params: { tags: selectedTags.join(",") },
      });
      setResults(res.data);
      setStep("results");
    } catch {
      setError("Greška pri pretrazi. Pokušajte ponovo.");
    } finally {
      setLoading(false);
    }
  };

  const handlePickTherapist = async (therapist: TherapistResult) => {
    setError("");
    setLoading(true);
    setSelectedTherapist(therapist);
    try {
      const res = await axios.get(
        `${backendBase}/public/therapists/${therapist.tenant_id}/availability`,
      );
      setSlots(res.data.slots);
      setStep("availability");
    } catch {
      setError("Greška pri učitavanju termina. Pokušajte ponovo.");
    } finally {
      setLoading(false);
    }
  };

  const handlePickSlot = (slot: Slot) => {
    setSelectedSlot(slot);
    setStep("confirm");
  };

  const handleBook = async () => {
    if (!selectedTherapist || !selectedSlot) return;
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(
        `${backendBase}/public/therapists/${selectedTherapist.tenant_id}/book`,
        {
          ime: form.ime,
          prezime: form.prezime,
          email: form.email,
          telefon: form.telefon || null,
          napomena: form.napomena || null,
          pocetak: selectedSlot.start,
          kraj: selectedSlot.end,
        },
      );
      setConfirmed({
        tenant_name: res.data.tenant_name,
        pocetak: res.data.pocetak,
      });
      setStep("done");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError(
          "Nažalost, ovaj termin je upravo zauzet. Izaberite drugi termin.",
        );
        setStep("availability");
        if (selectedTherapist) {
          const res = await axios.get(
            `${backendBase}/public/therapists/${selectedTherapist.tenant_id}/availability`,
          );
          setSlots(res.data.slots);
        }
      } else {
        setError("Greška pri zakazivanju. Pokušajte ponovo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const slotsByDay = useMemo(() => {
    const groups: { heading: string; items: Slot[] }[] = [];
    for (const slot of slots) {
      const heading = formatDayHeading(new Date(slot.start));
      const last = groups[groups.length - 1];
      if (last && last.heading === heading) {
        last.items.push(slot);
      } else {
        groups.push({ heading, items: [slot] });
      }
    }
    return groups;
  }, [slots]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        padding: "40px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      <a
        href={clientProfile ? "/client/dashboard" : "/client"}
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          fontSize: 13,
          fontWeight: 600,
          color: "#a5b4fc",
        }}
      >
        {clientProfile ? "Vaši termini →" : "Prijavite se →"}
      </a>
      <div
        style={{
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
            color: "#fff",
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.5px",
          }}
        >
          Pronađite svog terapeuta
        </h1>
        <p style={{ color: "#94a3b8", margin: 0, fontSize: 14, maxWidth: 480 }}>
          Recite nam kroz šta prolazite, a mi ćemo vam pronaći terapeute koji
          se time bave i imaju slobodan termin.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 720 }}>
        {step === "search" && (
          <div style={{ ...card }} className="ft-fade">
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
              }}
            />

            {suggestedTags.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span
                  style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}
                >
                  Predlažemo:
                </span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {suggestedTags.map((slug) => (
                    <button
                      key={slug}
                      className="ft-chip"
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
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "24px 0 14px",
              }}
            >
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
              <span
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  fontWeight: 500,
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
                  <button
                    key={tag.slug}
                    className="ft-chip"
                    onClick={() => toggleTag(tag.slug)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      border: active
                        ? "1.5px solid #6366f1"
                        : "1.5px solid #e2e8f0",
                      background: active ? "#6366f1" : "#fff",
                      color: active ? "#fff" : "#334155",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>

            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, marginTop: 16 }}>
                {error}
              </p>
            )}

            <button
              style={{
                ...primaryBtn,
                width: "100%",
                marginTop: 24,
                opacity: selectedTags.length === 0 || loading ? 0.6 : 1,
                cursor:
                  selectedTags.length === 0 || loading
                    ? "not-allowed"
                    : "pointer",
              }}
              disabled={selectedTags.length === 0 || loading}
              onClick={handleSearch}
            >
              {loading
                ? "Tražim..."
                : selectedTags.length === 0
                  ? "Izaberite bar jednu oblast"
                  : "Pronađi terapeute"}
            </button>
          </div>
        )}

        {step === "results" && (
          <div className="ft-fade">
            <button style={backLink} onClick={() => setStep("search")}>
              ← Izmeni pretragu
            </button>
            {loading ? (
              <div style={{ ...card, textAlign: "center", color: "#64748b" }}>
                Učitavanje...
              </div>
            ) : results.length === 0 ? (
              <div style={{ ...card, textAlign: "center" }}>
                <p style={{ color: "#334155", fontWeight: 600, margin: 0 }}>
                  Trenutno nema terapeuta sa slobodnim terminima za ove
                  oblasti.
                </p>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
                  Pokušajte sa drugim oblastima ili se vratite kasnije.
                </p>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {results.map((r) => (
                  <div key={r.tenant_id} className="ft-card" style={card}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin: "0 0 6px",
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#0f172a",
                          }}
                        >
                          {r.name}
                        </h3>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {r.specialties.map((slug) => (
                            <span
                              key={slug}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "3px 10px",
                                borderRadius: 20,
                                background: r.matched_tags.includes(slug)
                                  ? "#eef2ff"
                                  : "#f1f5f9",
                                color: r.matched_tags.includes(slug)
                                  ? "#4338ca"
                                  : "#64748b",
                              }}
                            >
                              {TAG_LABEL_BY_SLUG[slug] || slug}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        style={{ ...primaryBtn, whiteSpace: "nowrap" }}
                        onClick={() => handlePickTherapist(r)}
                      >
                        Zakaži termin
                      </button>
                    </div>
                    <p
                      style={{
                        margin: "14px 0 0",
                        fontSize: 13,
                        color: "#16a34a",
                        fontWeight: 600,
                      }}
                    >
                      Najraniji termin: {formatDateTime(r.next_available)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "availability" && selectedTherapist && (
          <div className="ft-fade">
            <button style={backLink} onClick={() => setStep("results")}>
              ← Nazad na rezultate
            </button>
            <div style={card}>
              <h3
                style={{
                  margin: "0 0 4px",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {selectedTherapist.name}
              </h3>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
                Izaberite slobodan termin
              </p>

              {loading ? (
                <p style={{ color: "#64748b" }}>Učitavanje termina...</p>
              ) : slotsByDay.length === 0 ? (
                <p style={{ color: "#64748b" }}>
                  Nema slobodnih termina u narednih 14 dana.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 18,
                    maxHeight: 480,
                    overflowY: "auto",
                  }}
                >
                  {slotsByDay.map((group) => (
                    <div key={group.heading}>
                      <p
                        style={{
                          margin: "0 0 8px",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#334155",
                          textTransform: "capitalize",
                        }}
                      >
                        {group.heading}
                      </p>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                      >
                        {group.items.map((slot) => (
                          <button
                            key={slot.start}
                            className="ft-slot-btn"
                            onClick={() => handlePickSlot(slot)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 10,
                              border: "1.5px solid #e2e8f0",
                              background: "#f8fafc",
                              color: "#334155",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {formatTime(slot.start)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && selectedTherapist && selectedSlot && (
          <div className="ft-fade">
            <button style={backLink} onClick={() => setStep("availability")}>
              ← Izaberite drugi termin
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
                <p style={{ margin: 0, fontSize: 13, color: "#4338ca" }}>
                  <strong>{selectedTherapist.name}</strong>
                  <br />
                  {formatDateTime(selectedSlot.start)}
                </p>
              </div>

              {clientProfile && (
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#16a34a" }}>
                  Prijavljeni ste kao <strong>{clientProfile.full_name || clientProfile.email}</strong>
                </p>
              )}

              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {!clientProfile && (
                  <>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#334155",
                          }}
                        >
                          Ime *
                        </label>
                        <input
                          value={form.ime}
                          onChange={(e) =>
                            setForm({ ...form, ime: e.target.value })
                          }
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#334155",
                          }}
                        >
                          Prezime *
                        </label>
                        <input
                          value={form.prezime}
                          onChange={(e) =>
                            setForm({ ...form, prezime: e.target.value })
                          }
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
                      >
                        Email *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label
                    style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
                  >
                    Telefon (opciono)
                  </label>
                  <input
                    value={form.telefon}
                    onChange={(e) =>
                      setForm({ ...form, telefon: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}
                  >
                    Napomena (opciono)
                  </label>
                  <textarea
                    value={form.napomena}
                    onChange={(e) =>
                      setForm({ ...form, napomena: e.target.value })
                    }
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>
              </div>

              {error && (
                <p style={{ color: "#ef4444", fontSize: 13, marginTop: 16 }}>
                  {error}
                </p>
              )}

              <button
                style={{
                  ...primaryBtn,
                  width: "100%",
                  marginTop: 20,
                  opacity:
                    !form.ime || !form.prezime || !form.email || loading
                      ? 0.6
                      : 1,
                  cursor:
                    !form.ime || !form.prezime || !form.email || loading
                      ? "not-allowed"
                      : "pointer",
                }}
                disabled={
                  !form.ime || !form.prezime || !form.email || loading
                }
                onClick={handleBook}
              >
                {loading ? "Zakazujem..." : "Potvrdi termin"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && confirmed && (
          <div style={{ ...card, textAlign: "center" }} className="ft-fade">
            <div
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
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 20,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Termin je zakazan!
            </h3>
            <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
              {confirmed.tenant_name} vas očekuje{" "}
              <strong>{formatDateTime(confirmed.pocetak)}</strong>.
            </p>
            {clientProfile && (
              <button
                onClick={() => navigate("/client/dashboard")}
                style={{ ...primaryBtn, marginTop: 20 }}
              >
                Vidi svoje termine
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

export default FindTherapist;
