import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useClientAuth } from "../contexts/ClientAuthContext";

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Appointment {
  sesija_id: number;
  tenant_id: number;
  tenant_name: string;
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

const ClientDashboard: React.FC = () => {
  const { profile, loading: authLoading, signOut } = useClientAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !profile) {
      navigate("/client");
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

  const upcoming = appointments.filter(
    (a) => a.status !== "otkazano" && new Date(a.pocetak) >= new Date(),
  );
  const past = appointments.filter(
    (a) => a.status === "otkazano" || new Date(a.pocetak) < new Date(),
  );

  if (authLoading || (loading && appointments.length === 0)) {
    return (
      <div style={pageStyle}>
        <p style={{ color: "#94a3b8" }}>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 720 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>
              Vaši termini
            </h1>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
              {profile?.full_name || profile?.email}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => navigate("/find-therapist")}
              style={{ ...secondaryBtn, background: "#16a34a", color: "#fff", border: "none" }}
            >
              + Novi termin
            </button>
            <button onClick={signOut} style={secondaryBtn}>
              Odjavi se
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <h3 style={sectionHeading}>Nadolazeći termini</h3>
        {upcoming.length === 0 ? (
          <div style={card}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
              Nemate zakazanih termina.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
            {upcoming.map((a) => (
              <div key={a.sesija_id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, marginBottom: 4 }}>
                      {a.tenant_name}
                    </div>
                    <div style={{ color: "#334155", fontSize: 14 }}>
                      {formatDateTime(a.pocetak)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: statusLabel[a.status]?.bg || "#f1f5f9",
                      color: statusLabel[a.status]?.color || "#64748b",
                    }}
                  >
                    {statusLabel[a.status]?.text || a.status}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => handleCancel(a.sesija_id)}
                    disabled={cancellingId === a.sesija_id}
                    style={dangerBtn}
                  >
                    {cancellingId === a.sesija_id ? "Otkazivanje..." : "Otkaži"}
                  </button>
                  <button
                    onClick={() => navigate("/find-therapist")}
                    style={secondaryBtnSmall}
                  >
                    Pomeri termin
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {past.length > 0 && (
          <>
            <h3 style={sectionHeading}>Istorija</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {past.map((a) => (
                <div key={a.sesija_id} style={{ ...card, opacity: 0.7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, marginBottom: 4 }}>
                        {a.tenant_name}
                      </div>
                      <div style={{ color: "#334155", fontSize: 14 }}>
                        {formatDateTime(a.pocetak)}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 20,
                        background: statusLabel[a.status]?.bg || "#f1f5f9",
                        color: statusLabel[a.status]?.color || "#64748b",
                      }}
                    >
                      {statusLabel[a.status]?.text || a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
  fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  padding: "40px 20px",
  display: "flex",
  justifyContent: "center",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: "20px 22px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
};

const sectionHeading: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
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

export default ClientDashboard;
