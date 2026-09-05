import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 20% 15%, #1e2547 0%, #0b1120 45%), linear-gradient(160deg, #0b1120 0%, #131c31 55%, #0b1120 100%)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      {/* Ambient glow orbs */}
      <div
        className="glow-orb drift-a"
        style={{
          width: 460,
          height: 460,
          background: "radial-gradient(circle, #6366f1, transparent 70%)",
          top: "-8%",
          left: "-10%",
        }}
      />
      <div
        className="glow-orb drift-b"
        style={{
          width: 380,
          height: 380,
          background: "radial-gradient(circle, #7c3aed, transparent 70%)",
          bottom: "-10%",
          right: "-8%",
        }}
      />
      <div
        className="glow-orb"
        style={{
          width: 300,
          height: 300,
          background: "radial-gradient(circle, #16a34a, transparent 70%)",
          top: "35%",
          right: "8%",
          opacity: 0.22,
        }}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          marginBottom: 52,
          maxWidth: 600,
        }}
      >
        <motion.div
          variants={item}
          style={{
            width: 68,
            height: 68,
            borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            boxShadow: "0 12px 32px rgba(99,102,241,0.45)",
          }}
        >
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </motion.div>

        <motion.h1
          variants={item}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(38px, 6vw, 58px)",
            fontWeight: 600,
            color: "#fff",
            margin: "0 0 18px",
            lineHeight: 1.08,
            letterSpacing: "-0.5px",
          }}
        >
          Prostor za brigu o{" "}
          <span className="brand-gradient-text">sebi</span>
        </motion.h1>

        <motion.p
          variants={item}
          style={{
            color: "#94a3b8",
            fontSize: 17,
            margin: 0,
            lineHeight: 1.65,
            fontWeight: 400,
          }}
        >
          PsihoApp povezuje terapeute i klijente na jednom mestu. Terapeuti
          vode svoju praksu bez glavobolje, klijenti pronalaze pravog
          terapeuta i zakazuju termin u par klikova.
        </motion.p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
          maxWidth: 780,
        }}
      >
        <motion.button
          variants={item}
          whileHover={{ y: -6, boxShadow: "0 24px 50px rgba(99,102,241,0.35)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/therapist")}
          style={pathCardStyle}
        >
          <div style={{ ...iconWrap, background: "#eef2ff" }}>
            <svg
              width="24"
              height="24"
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
          <h2 style={cardTitle}>Ja sam terapeut</h2>
          <p style={cardBody}>
            Prijavite se ili registrujte praksu, vodite kalendar, klijente i
            grupe.
          </p>
          <span style={{ ...cardCta, color: "#6366f1" }}>Nastavi →</span>
        </motion.button>

        <motion.button
          variants={item}
          whileHover={{ y: -6, boxShadow: "0 24px 50px rgba(22,163,74,0.3)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/client")}
          style={pathCardStyle}
        >
          <div style={{ ...iconWrap, background: "#f0fdf4" }}>
            <svg
              width="24"
              height="24"
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
          <h2 style={cardTitle}>Ja sam klijent</h2>
          <p style={cardBody}>
            Pronađite terapeuta za ono kroz šta prolazite i zakažite termin,
            uz nalog ili bez njega.
          </p>
          <span style={{ ...cardCta, color: "#16a34a" }}>Nastavi →</span>
        </motion.button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        style={{
          position: "relative",
          zIndex: 1,
          color: "#475569",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          marginTop: 44,
        }}
      >
        © 2026 PsihoApp
      </motion.p>
    </div>
  );
};

const pathCardStyle: React.CSSProperties = {
  flex: "1 1 320px",
  maxWidth: 360,
  background: "#fff",
  border: "none",
  borderRadius: 22,
  padding: "38px 30px",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
};

const iconWrap: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 18,
};

const cardTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontFamily: "var(--font-display)",
  fontSize: 21,
  fontWeight: 600,
  color: "#0f172a",
};

const cardBody: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.55,
};

const cardCta: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginTop: 20,
  fontWeight: 700,
  fontSize: 14,
};

export default LandingPage;
