import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";

const backendBase =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

interface Klijent {
  id: number;
  ime: string;
  prezime: string;
  email?: string;
  broj_telefona?: string;
}

interface Napomena {
  id: number;
  klijent_id: number;
  tekst: string;
  kategorija: string;
  author_name: string | null;
  created_at: string;
}

interface Sesija {
  id: number;
  pocetak: string;
  kraj: string;
  cena: number;
  status: string;
}

interface Props {
  klijent: Klijent;
  onClose: () => void;
}

type Tab = "napomene" | "istorija";

const KATEGORIJE: { value: string; label: string; dot: string; bg: string; text: string }[] = [
  { value: "opste", label: "Opšte", dot: "#94a3b8", bg: "#f1f5f9", text: "#475569" },
  { value: "napredak", label: "Napredak", dot: "#16a34a", bg: "#dcfce7", text: "#166534" },
  { value: "cilj", label: "Cilj", dot: "#6366f1", bg: "#eef2ff", text: "#4338ca" },
  { value: "upozorenje", label: "Upozorenje", dot: "#f59e0b", bg: "#fef3c7", text: "#92400e" },
];

const katInfo = (value: string) =>
  KATEGORIJE.find((k) => k.value === value) || KATEGORIJE[0];

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "avg", "sep", "okt", "nov", "dec",
];

const formatNoteDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}. u ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatSesijaDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}.`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const statusInfo: Record<string, { label: string; bg: string; color: string }> = {
  zakazano: { label: "Zakazano", bg: "#dbeafe", color: "#1e40af" },
  zavrseno: { label: "Završeno", bg: "#dcfce7", color: "#166534" },
  otkazano: { label: "Otkazano", bg: "#fee2e2", color: "#991b1b" },
};

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.2 } },
};

const ClientNotesModal: React.FC<Props> = ({ klijent, onClose }) => {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("napomene");
  const [notes, setNotes] = useState<Napomena[]>([]);
  const [sessions, setSessions] = useState<Sesija[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [draft, setDraft] = useState("");
  const [draftKategorija, setDraftKategorija] = useState("opste");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadNotes = () => {
    setLoadingNotes(true);
    axios
      .get(`${backendBase}/klijent/${klijent.id}/napomene`)
      .then((res) => setNotes(res.data))
      .catch((err) => {
        console.error("Error loading notes:", err);
        setError("Greška pri učitavanju napomena.");
      })
      .finally(() => setLoadingNotes(false));
  };

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klijent.id]);

  useEffect(() => {
    if (tab !== "istorija" || sessionsLoaded) return;
    setLoadingSessions(true);
    axios
      .get(`${backendBase}/klijent/${klijent.id}/sesije`)
      .then((res) => setSessions(res.data))
      .catch((err) => console.error("Error loading sessions:", err))
      .finally(() => {
        setLoadingSessions(false);
        setSessionsLoaded(true);
      });
  }, [tab, sessionsLoaded, klijent.id]);

  const handleAddNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await axios.post(`${backendBase}/klijent/${klijent.id}/napomene`, {
        tekst: draft.trim(),
        kategorija: draftKategorija,
        author_name: profile?.full_name || profile?.email || null,
      });
      setNotes((prev) => [res.data, ...prev]);
      setDraft("");
      setDraftKategorija("opste");
    } catch (err) {
      console.error("Error saving note:", err);
      setError("Greška pri čuvanju napomene.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (id: number) => {
    setDeletingId(id);
    try {
      await axios.delete(`${backendBase}/klijent/${klijent.id}/napomene/${id}`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Error deleting note:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const upcoming = useMemo(
    () => sessions.filter((s) => s.status !== "otkazano" && new Date(s.pocetak) >= new Date()),
    [sessions],
  );
  const past = useMemo(
    () => sessions.filter((s) => s.status === "otkazano" || new Date(s.pocetak) < new Date()),
    [sessions],
  );

  const initials = `${klijent.ime?.[0] || ""}${klijent.prezime?.[0] || ""}`.toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(3px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "88vh",
          background: "#fff",
          borderRadius: 22,
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "26px 28px 0",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.10), transparent 70%)",
              top: -100,
              right: -60,
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: 17,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {initials || "?"}
              </div>
              <div>
                <h2
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: 21,
                    fontWeight: 600,
                    color: "#0f172a",
                    margin: 0,
                  }}
                >
                  {klijent.ime} {klijent.prezime}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#94a3b8" }}>
                  Napomene i istorija sesija
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Zatvori"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: "none",
                background: "#f1f5f9",
                color: "#64748b",
                fontSize: 15,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 20,
              background: "#f1f5f9",
              padding: 5,
              borderRadius: 12,
              width: "fit-content",
            }}
          >
            {(["napomene", "istorija"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 9,
                  border: "none",
                  background: tab === t ? "#fff" : "transparent",
                  color: tab === t ? "#0f172a" : "#64748b",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {t === "napomene" ? "Napomene" : "Istorija sesija"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 28px 28px", overflowY: "auto", flex: 1 }}>
          <AnimatePresence mode="wait">
            {tab === "napomene" ? (
              <motion.div
                key="napomene"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Composer */}
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 22,
                  }}
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Dodajte napomenu o napretku, cilju ili opažanju..."
                    rows={3}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      resize: "vertical",
                      fontSize: 14,
                      color: "#1e293b",
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {KATEGORIJE.map((k) => {
                        const active = draftKategorija === k.value;
                        return (
                          <button
                            key={k.value}
                            type="button"
                            onClick={() => setDraftKategorija(k.value)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "5px 11px",
                              borderRadius: 20,
                              border: active ? `1.5px solid ${k.dot}` : "1.5px solid #e2e8f0",
                              background: active ? k.bg : "#fff",
                              color: active ? k.text : "#94a3b8",
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: k.dot }} />
                            {k.label}
                          </button>
                        );
                      })}
                    </div>
                    <motion.button
                      whileHover={draft.trim() ? { y: -1 } : {}}
                      whileTap={draft.trim() ? { scale: 0.97 } : {}}
                      onClick={handleAddNote}
                      disabled={!draft.trim() || saving}
                      style={{
                        padding: "9px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: !draft.trim() || saving ? "not-allowed" : "pointer",
                        opacity: !draft.trim() || saving ? 0.6 : 1,
                        fontFamily: "inherit",
                        boxShadow: "0 4px 12px rgba(99,102,241,0.25)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {saving ? "Čuvanje..." : "Sačuvaj napomenu"}
                    </motion.button>
                  </div>
                </div>

                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 14 }}>{error}</p>
                )}

                {/* Timeline */}
                {loadingNotes ? (
                  <p style={{ color: "#94a3b8", fontSize: 13 }}>Učitavanje...</p>
                ) : notes.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      border: "1.5px dashed #e2e8f0",
                      borderRadius: 14,
                      color: "#94a3b8",
                      fontSize: 13.5,
                    }}
                  >
                    Još nema napomena za ovog klijenta.
                  </div>
                ) : (
                  <motion.div variants={listVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <AnimatePresence>
                      {notes.map((n) => {
                        const k = katInfo(n.kategorija);
                        return (
                          <motion.div
                            key={n.id}
                            variants={cardVariants}
                            exit="exit"
                            layout
                            style={{
                              borderLeft: `3px solid ${k.dot}`,
                              background: "#fff",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04)",
                              borderRadius: "0 12px 12px 0",
                              padding: "14px 16px",
                              position: "relative",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 9px",
                                    borderRadius: 20,
                                    background: k.bg,
                                    color: k.text,
                                  }}
                                >
                                  {k.label}
                                </span>
                                <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--font-mono), monospace" }}>
                                  {formatNoteDate(n.created_at)}
                                </span>
                                {n.author_name && (
                                  <span style={{ fontSize: 12, color: "#cbd5e1" }}>· {n.author_name}</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteNote(n.id)}
                                disabled={deletingId === n.id}
                                title="Obriši napomenu"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#cbd5e1",
                                  cursor: "pointer",
                                  padding: 4,
                                  flexShrink: 0,
                                  fontSize: 13,
                                }}
                              >
                                {deletingId === n.id ? "…" : "✕"}
                              </button>
                            </div>
                            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                              {n.tekst}
                            </p>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="istorija"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {loadingSessions ? (
                  <p style={{ color: "#94a3b8", fontSize: 13 }}>Učitavanje...</p>
                ) : sessions.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      border: "1.5px dashed #e2e8f0",
                      borderRadius: 14,
                      color: "#94a3b8",
                      fontSize: 13.5,
                    }}
                  >
                    Nema zabeleženih sesija za ovog klijenta.
                  </div>
                ) : (
                  <>
                    {upcoming.length > 0 && (
                      <>
                        <p style={sectionLabel}>Predstojeće</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                          {upcoming.map((s) => (
                            <SessionRow key={s.id} s={s} />
                          ))}
                        </div>
                      </>
                    )}
                    {past.length > 0 && (
                      <>
                        <p style={sectionLabel}>Prošle</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {past.map((s) => (
                            <SessionRow key={s.id} s={s} faded />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const SessionRow: React.FC<{ s: Sesija; faded?: boolean }> = ({ s, faded }) => {
  const st = statusInfo[s.status] || { label: s.status, bg: "#f1f5f9", color: "#64748b" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        background: "#f8fafc",
        opacity: faded ? 0.75 : 1,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 13,
            fontWeight: 600,
            color: "#0f172a",
            minWidth: 90,
          }}
        >
          {formatSesijaDate(s.pocetak)}
        </div>
        <div style={{ fontSize: 13, color: "#64748b", fontFamily: "var(--font-mono), monospace" }}>
          {formatTime(s.pocetak)}–{formatTime(s.kraj)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
          {s.cena.toLocaleString("sr-RS")} RSD
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 20,
            background: st.bg,
            color: st.color,
          }}
        >
          {st.label}
        </span>
      </div>
    </div>
  );
};

export default ClientNotesModal;
