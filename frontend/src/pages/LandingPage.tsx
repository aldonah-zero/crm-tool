import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const injectStyles = () => {
  if (document.getElementById("landing-styles")) return;
  const s = document.createElement("style");
  s.id = "landing-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap');
    .lp-path-card { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
    .lp-path-card:hover { transform: translateY(-4px); box-shadow: 0 20px 45px rgba(15,23,42,0.35); border-color: #818cf8 !important; }
    @keyframes lpFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .lp-fade { animation: lpFadeIn 0.5s ease both; }
  `;
  document.head.appendChild(s);
};

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    injectStyles();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div
        className="lp-fade"
        style={{
          textAlign: "center",
          marginBottom: 48,
          maxWidth: 560,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "linear-gradient(135deg, #6366f1, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
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
            fontSize: 36,
            fontWeight: 800,
            margin: "0 0 12px",
            letterSpacing: "-0.7px",
          }}
        >
          PsihoApp
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 16,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Prostor koji povezuje terapeute i klijente. Terapeuti vode svoju
          praksu, klijenti lako pronalaze pravog terapeuta i zakazuju termin.
        </p>
      </div>

      <div
        className="lp-fade"
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
          maxWidth: 760,
        }}
      >
        <button
          className="lp-path-card"
          onClick={() => navigate("/therapist")}
          style={{
            flex: "1 1 320px",
            maxWidth: 360,
            background: "#fff",
            border: "2px solid transparent",
            borderRadius: 20,
            padding: "36px 28px",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#eef2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 19,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            Ja sam terapeut
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
            Prijavite se ili registrujte praksu, vodite kalendar, klijente i
            grupe.
          </p>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 18,
              color: "#6366f1",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Nastavi →
          </span>
        </button>

        <button
          className="lp-path-card"
          onClick={() => navigate("/client")}
          style={{
            flex: "1 1 320px",
            maxWidth: 360,
            background: "#fff",
            border: "2px solid transparent",
            borderRadius: 20,
            padding: "36px 28px",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg
              width="22"
              height="22"
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
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 19,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            Ja sam klijent
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
            Pronađite terapeuta za ono kroz šta prolazite i zakažite termin,
            uz nalog ili bez njega.
          </p>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 18,
              color: "#16a34a",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Nastavi →
          </span>
        </button>
      </div>

      <p
        className="lp-fade"
        style={{ color: "#475569", fontSize: 12, marginTop: 40 }}
      >
        © 2026 PsihoApp
      </p>
    </div>
  );
};

export default LandingPage;
