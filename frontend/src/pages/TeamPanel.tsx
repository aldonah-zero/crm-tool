import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import ClientProfileSettings from "../components/ClientProfileSettings";

interface TeamMember {
  user_id: number;
  email: string;
  full_name: string | null;
  role: string;
}

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TeamPanel: React.FC = () => {
  const { profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadTeam = async () => {
    setLoading(true);
    setError("");
    try {
      const [membersRes, inviteRes] = await Promise.all([
        axios.get(`${backendBase}/auth/team-members`),
        axios.get(`${backendBase}/auth/invite-link`),
      ]);
      setMembers(membersRes.data);
      setInviteUrl(
        `${window.location.origin}/therapist?invite=${encodeURIComponent(inviteRes.data.invite_token)}`,
      );
    } catch (err) {
      console.error("Error loading team:", err);
      setError("Nije moguće učitati podatke o timu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopiranje nije uspelo, kopirajte link ručno.");
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    padding: 26,
    boxShadow:
      "0 1px 3px rgba(0,0,0,0.04), 0 12px 32px rgba(15,23,42,0.05), 0 0 0 1px rgba(15,23,42,0.04)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={cardStyle}>
        <h3
          style={{
            margin: "0 0 6px",
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 18,
            fontWeight: 600,
            color: "#0f172a",
          }}
        >
          Pozovite člana tima
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
          Pošaljite ovaj link novom članu. Kada se registruje ili prijavi
          preko njega, automatski se priključuje vašoj praksi kao član. Link
          važi 7 dana.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            readOnly
            value={loading ? "Generisanje linka..." : inviteUrl}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1.5px solid #e2e8f0",
              fontSize: 13,
              color: "#334155",
              background: "#f8fafc",
              fontFamily: "var(--font-mono), monospace",
            }}
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !inviteUrl}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #6366f1, #7c3aed)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "default" : "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (loading || !inviteUrl) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 16px rgba(99,102,241,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(99,102,241,0.3)";
            }}
          >
            {copied ? "Kopirano!" : "Kopiraj link"}
          </button>
        </div>
        {error && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#ef4444" }}>
            {error}
          </p>
        )}
      </div>

      <div style={cardStyle}>
        <h3
          style={{
            margin: "0 0 16px",
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 18,
            fontWeight: 600,
            color: "#0f172a",
          }}
        >
          Članovi tima
        </h3>
        {loading ? (
          <p style={{ fontSize: 13, color: "#64748b" }}>Učitavanje...</p>
        ) : members.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748b" }}>Nema članova.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {members.map((m) => (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f8fafc";
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    {m.full_name || m.email}
                    {m.email === profile?.email && " (vi)"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{m.email}</div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: m.role === "owner" ? "#6366f1" : "#64748b",
                    background: m.role === "owner" ? "#eef2ff" : "#e2e8f0",
                    padding: "4px 10px",
                    borderRadius: 20,
                  }}
                >
                  {m.role === "owner" ? "Vlasnik" : "Član"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientProfileSettings />
    </div>
  );
};

export default TeamPanel;
