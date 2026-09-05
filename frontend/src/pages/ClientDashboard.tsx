import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useClientAuth } from "../contexts/ClientAuthContext";

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Appointment {
  sesija_id: number;
  tenant_id: number;
  tenant_name: string;
  therapist_name: string;
  pocetak: string;
  kraj: string;
  cena: number;
  status: string;
}

const MONTH_NAMES = [
  "januar", "februar", "mart", "april", "maj", "jun",
  "jul", "avgust", "septembar", "oktobar", "novembar", "decembar",
];

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} u ${time}`;
};

const statusLabel: Record<string, { text: string; bg: string; color: string }> = {
  zakazano: { text: "Zakazano", bg: "#dbeafe", color: "#1e40af" },
  zavrseno: { text: "Završeno", bg: "#dcfce7", color: "#166534" },
  otkazano: { text: "Otkazano", bg: "#fee2e2", color: "#991b1b" },
};

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.25 } },
};

type Tab = "termini" | "profil";

const ClientDashboard: React.FC = () => {
  const { profile, loading: authLoading, signOut } = useClientAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("termini");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    if (!authLoading && !profile) {
      navigate("/client");
    }
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
      });
    }
  }, [authLoading, profile, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendBase}/client/appointments`);
      setAppointments(res.data);
    } catch (err) {
      console.error("Error loading appointments:", err);
      setError("Nije moguće učitati termine.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    try {
      await axios.post(`${backendBase}/client/appointments/${id}/cancel`);
      await load();
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      setError("Greška pri otkazivanju termina.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await axios.put(`${backendBase}/client-auth/profile`, profileForm);
      setProfileMessage("Sačuvano!");
    } catch (err) {
      console.error("Error saving profile:", err);
      setProfileMessage("Greška pri čuvanju.");
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMessage(""), 2500);
    }
  };

  const upcoming = appointments.filter(
    (a) => a.status !== "otkazano" && new Date(a.pocetak) >= new Date(),
  );
  const past = appointments.filter(
    (a) => a.status === "otkazano" || new Date(a.pocetak) < new Date(),
  );

  if (authLoading || (loading && appointments.length === 0 && tab === "termini")) {
    return (
      <div style={pageStyle}>
        <p style={{ color: "#94a3b8" }}>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div className="glow-orb drift-a" style={{ width: 380, height: 380, background: "radial-gradient(circle, #16a34a, transparent 70%)", top: "-10%", left: "-8%", opacity: 0.28 }} />
      <div style={{ width: "100%", maxWidth: 720, position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", color: "#fff", fontSize: 26, fontWeight: 600, margin: 0 }}>
              Zdravo, {profile?.full_name?.split(" ")[0] || "tamo"}
            </h1>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
              {profile?.email}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/find-therapist")}
              style={{ ...secondaryBtn, background: "#16a34a", color: "#fff", border: "none" }}
            >
              + Novi termin
            </motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={signOut} style={secondaryBtn}>
              Odjavi se
            </motion.button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "rgba(255,255,255,0.06)", padding: 5, borderRadius: 12, width: "fit-content" }}>
          {(["termini", "profil"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                border: "none",
                background: tab === t ? "#16a34a" : "transparent",
                color: tab === t ? "#fff" : "#cbd5e1",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.2s ease",
              }}
            >
              {t === "termini" ? "Termini" : "Moj profil"}
            </button>
          ))}
        </div>

        {error && (
          <p style={{ color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <AnimatePresence mode="wait">
          {tab === "termini" ? (
            <motion.div key="termini" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <h3 style={sectionHeading}>Nadolazeći termini</h3>
              {upcoming.length === 0 ? (
                <div style={card}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                    Nemate zakazanih termina.
                  </p>
                </div>
              ) : (
                <motion.div variants={listVariants} initial="hidden" animate="show" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                  <AnimatePresence>
                    {upcoming.map((a) => (
                      <motion.div key={a.sesija_id} variants={cardVariants} exit="exit" layout style={card}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "#0f172a", fontSize: 16, marginBottom: 4 }}>
                              {a.therapist_name}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>{a.tenant_name}</div>
                            <div style={{ color: "#334155", fontSize: 14, fontFamily: "var(--font-mono)" }}>
                              {formatDateTime(a.pocetak)}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: statusLabel[a.status]?.bg || "#f1f5f9", color: statusLabel[a.status]?.color || "#64748b" }}>
                            {statusLabel[a.status]?.text || a.status}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          <motion.button whileTap={{ scale: 0.96 }} onClick={() => handleCancel(a.sesija_id)} disabled={cancellingId === a.sesija_id} style={dangerBtn}>
                            {cancellingId === a.sesija_id ? "Otkazivanje..." : "Otkaži"}
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate("/find-therapist")} style={secondaryBtnSmall}>
                            Pomeri termin
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {past.length > 0 && (
                <>
                  <h3 style={sectionHeading}>Istorija</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {past.map((a) => (
                      <div key={a.sesija_id} style={{ ...card, opacity: 0.7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "#0f172a", fontSize: 16, marginBottom: 4 }}>
                              {a.therapist_name}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>{a.tenant_name}</div>
                            <div style={{ color: "#334155", fontSize: 14, fontFamily: "var(--font-mono)" }}>
                              {formatDateTime(a.pocetak)}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: statusLabel[a.status]?.bg || "#f1f5f9", color: statusLabel[a.status]?.color || "#64748b" }}>
                            {statusLabel[a.status]?.text || a.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div key="profil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={card}>
              <h3 style={{ margin: "0 0 20px", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>
                Moj profil
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={fieldLabel}>Ime i prezime</label>
                  <input
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    style={fieldInput}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Telefon</label>
                  <input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    style={fieldInput}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Email</label>
                  <input value={profile?.email || ""} disabled style={{ ...fieldInput, opacity: 0.6, cursor: "not-allowed" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={handleSaveProfile} disabled={savingProfile} style={{ ...secondaryBtn, background: "#16a34a", color: "#fff", border: "none" }}>
                  {savingProfile ? "Čuvanje..." : "Sačuvaj"}
                </motion.button>
                {profileMessage && (
                  <span style={{ fontSize: 13, color: profileMessage === "Sačuvano!" ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
                    {profileMessage}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(160deg, #0b1120 0%, #131c31 55%, #0b1120 100%)",
  fontFamily: "var(--font-body)",
  padding: "40px 20px",
  display: "flex",
  justifyContent: "center",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: "22px 24px",
  boxShadow: "0 14px 36px rgba(0,0,0,0.18)",
};

const sectionHeading: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  fontFamily: "var(--font-mono)",
  margin: "0 0 12px",
};

const secondaryBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 10,
  border: "1px solid #334155",
  background: "transparent",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryBtnSmall: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#334155",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const dangerBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  display: "block",
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #e2e8f0",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#1e293b",
  background: "#f8fafc",
  boxSizing: "border-box",
  outline: "none",
};

export default ClientDashboard;
