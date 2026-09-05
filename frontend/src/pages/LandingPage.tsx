import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";

const injectStyles = () => {
  if (document.getElementById("landing-split-styles")) return;
  const s = document.createElement("style");
  s.id = "landing-split-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Khand:wght@400;500;600;700&family=Work+Sans:wght@400;500;600&display=swap');

    .lp-split {
      --khand: 'Khand', sans-serif;
      --worksans: 'Work Sans', system-ui, sans-serif;
      --ink: #241C30;
      --paper: #FDFCFB;
      --violet-1: #5B3FA3;
      --violet-2: #7A4FC7;
      --violet-3: #9B5FD1;
      --gold: #E8B15C;
      --sage: #8FAE93;
      --muted: rgba(36,28,48,0.6);
      --line: rgba(36,28,48,0.1);
      display: flex;
      min-height: 100vh;
    }
    .lp-left { flex: 0 0 44%; max-width: 44%; }
    .lp-right { flex: 0 0 56%; max-width: 56%; }

    @media (max-width: 900px) {
      .lp-split { flex-direction: column; }
      .lp-left, .lp-right { flex: 1 1 auto; max-width: 100%; }
      .lp-left { order: 2; padding: 40px 28px !important; }
      .lp-right { order: 1; min-height: 460px; }
      .lp-stage { display: none !important; }
    }

    .lp-dotgrid {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px);
      background-size: 26px 26px;
      opacity: 0.5;
      pointer-events: none;
    }

    @keyframes lpBlobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-24px,30px) scale(1.06); } }
    @keyframes lpBlobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,-22px) scale(1.08); } }
    @keyframes lpBlobC { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-16px,-18px); } }
    .lp-blob-a { animation: lpBlobA 14s ease-in-out infinite; }
    .lp-blob-b { animation: lpBlobB 18s ease-in-out infinite; }
    .lp-blob-c { animation: lpBlobC 11s ease-in-out infinite; }

    @keyframes lpFloat1 { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-9px) rotate(-2deg); } }
    @keyframes lpFloat2 { 0%,100% { transform: translateY(0) rotate(2deg); } 50% { transform: translateY(-11px) rotate(2deg); } }
    @keyframes lpFloat3 { 0%,100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-8px) rotate(-1.5deg); } }
    @keyframes lpFloat4 { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-7px) rotate(-2deg); } }
    .lp-float-1 { animation: lpFloat1 6.5s ease-in-out infinite; }
    .lp-float-2 { animation: lpFloat2 7.5s ease-in-out infinite; }
    .lp-float-3 { animation: lpFloat3 6s ease-in-out infinite; }
    .lp-float-4 { animation: lpFloat4 5.5s ease-in-out infinite; }

    @keyframes lpPulseDot { 0% { box-shadow: 0 0 0 0 rgba(143,174,147,0.5); } 70% { box-shadow: 0 0 0 8px rgba(143,174,147,0); } 100% { box-shadow: 0 0 0 0 rgba(143,174,147,0); } }
    .lp-pulse-dot { animation: lpPulseDot 2s infinite; }

    .lp-choice:hover { border-color: var(--violet-2) !important; transform: translateX(3px); box-shadow: 0 10px 26px -14px rgba(90,63,163,0.4); }
    .lp-choice-primary:hover { box-shadow: 0 14px 30px -12px rgba(90,63,163,0.55) !important; }
    .lp-login-link:hover { border-bottom-color: var(--violet-1) !important; }

    @media (prefers-reduced-motion: reduce) {
      .lp-blob-a, .lp-blob-b, .lp-blob-c,
      .lp-float-1, .lp-float-2, .lp-float-3, .lp-float-4,
      .lp-pulse-dot {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(s);
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    injectStyles();
  }, []);

  return (
    <div className="lp-split">
      {/* ============ LEFT: PAPER PANEL ============ */}
      <div
        className="lp-left"
        style={{
          background: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative radial blob */}
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(122,79,199,0.05), transparent 70%)",
            top: -180,
            left: -180,
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, var(--violet-2), var(--violet-1))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
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
          <div>
            <div
              style={{
                fontFamily: "var(--khand)",
                fontSize: 19.2,
                fontWeight: 600,
                color: "var(--ink)",
                lineHeight: 1.1,
                letterSpacing: "0.02em",
              }}
            >
              PsihoApp
            </div>
            <div
              style={{
                fontFamily: "var(--worksans)",
                fontSize: 11.5,
                color: "var(--muted)",
              }}
            >
              Upravljanje praksom
            </div>
          </div>
        </div>

        {/* Middle content */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          style={{ maxWidth: 420, position: "relative", margin: "40px 0" }}
        >
          <motion.div
            variants={item}
            style={{
              fontFamily: "var(--khand)",
              color: "var(--sage)",
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginBottom: 12,
            }}
          >
            Dobrodošli
          </motion.div>

          <motion.h1
            variants={item}
            style={{
              fontFamily: "var(--khand)",
              fontSize: "clamp(30px, 4.4vw, 41.6px)",
              fontWeight: 600,
              color: "var(--ink)",
              margin: "0 0 16px",
              letterSpacing: "0.01em",
              lineHeight: 1.1,
            }}
          >
            Pronađite pravu podršku ili vodite svoju praksu.
          </motion.h1>

          <motion.p
            variants={item}
            style={{
              fontFamily: "var(--worksans)",
              fontSize: 16,
              color: "var(--muted)",
              lineHeight: 1.5,
              margin: "0 0 34px",
            }}
          >
            Sve na jednom mestu — za terapeute koji žele lakše da organizuju
            praksu, i za ljude koji traže pravog sagovornika.
          </motion.p>

          <motion.div
            variants={item}
            style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}
          >
            <button
              className="lp-choice lp-choice-primary"
              onClick={() => navigate("/find-therapist")}
              style={choiceBtnPrimary}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={choiceTitlePrimary}>Tražim podršku</span>
                <span style={choiceSubPrimary}>
                  Opišite šta vas muči, mi pronalazimo terapeuta
                </span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <button
              className="lp-choice"
              onClick={() => navigate("/therapist")}
              style={choiceBtnSecondary}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={choiceTitleSecondary}>Ja sam terapeut</span>
                <span style={choiceSubSecondary}>
                  Kalendar, klijenti i naplata na jednom mestu
                </span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </motion.div>

          <motion.div
            variants={item}
            style={{
              fontFamily: "var(--worksans)",
              fontSize: 14.4,
              color: "var(--muted)",
            }}
          >
            Već imate nalog?{" "}
            <button
              className="lp-login-link"
              onClick={() => navigate("/client")}
              style={{
                background: "none",
                border: "none",
                borderBottom: "1px solid transparent",
                padding: 0,
                color: "var(--violet-1)",
                fontWeight: 500,
                fontSize: 14.4,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Prijavite se
            </button>
          </motion.div>
        </motion.div>

        <p
          style={{
            fontFamily: "var(--worksans)",
            fontSize: 12.5,
            color: "var(--muted)",
            margin: 0,
            position: "relative",
          }}
        >
          © 2026 PsihoApp — sva prava zadržana
        </p>
      </div>

      {/* ============ RIGHT: GRADIENT PANEL ============ */}
      <div
        className="lp-right"
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(150deg, var(--violet-1) 0%, var(--violet-2) 55%, var(--violet-3) 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "52px 56px 60px",
          color: "#fff",
        }}
      >
        <div className="lp-dotgrid" />

        {/* Soft floating blobs */}
        <div
          className="lp-blob-a"
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.09)",
            top: -100,
            right: -80,
          }}
        />
        <div
          className="lp-blob-b"
          style={{
            position: "absolute",
            width: 240,
            height: 240,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
            bottom: 40,
            left: -70,
          }}
        />
        <div
          className="lp-blob-c"
          style={{
            position: "absolute",
            width: 150,
            height: 150,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            top: "38%",
            right: "10%",
          }}
        />

        {/* Top badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            position: "relative",
            zIndex: 1,
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 100,
            padding: "8px 16px",
            fontFamily: "var(--worksans)",
            fontSize: 13.1,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--gold)",
              flexShrink: 0,
            }}
          />
          Novo: pametno pronalaženje terapeuta
        </motion.div>

        {/* Floating card stage */}
        <div
          className="lp-stage"
          style={{
            position: "relative",
            zIndex: 1,
            flex: "1 1 auto",
            minHeight: 280,
            margin: "18px 0 12px",
          }}
        >
          {/* Sledeća sesija - top left */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="lp-float-1"
            style={{ ...card, top: "2%", left: "2%", width: 220, zIndex: 2 }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={cardClockIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--violet-1)" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 7v5l3 2" />
                  <circle cx="12" cy="12" r="9" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <div style={cardTitle}>Sledeća sesija</div>
                <div style={cardSub}>Danas, 14:00 · Marina B.</div>
              </div>
            </div>
          </motion.div>

          {/* Match card - upper right, glass effect */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lp-float-2"
            style={{
              ...card,
              top: "10%",
              right: 0,
              width: 236,
              zIndex: 3,
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div style={cardLabel}>Pronađen terapeut za temu</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span style={{ ...matchTag, background: "var(--sage)", color: "#fff" }}>Anksioznost</span>
              <span style={matchTag}>Veze</span>
              <span style={{ ...matchTag, background: "var(--sage)", color: "#fff" }}>Tuga</span>
              <span style={matchTag}>Stres</span>
            </div>
          </motion.div>

          {/* +24 aktivnih - lower left */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="lp-float-3"
            style={{ ...card, bottom: "16%", left: 0, width: 196, zIndex: 2 }}
          >
            <div style={{ display: "flex", marginBottom: 8 }}>
              {["var(--gold)", "var(--sage)", "var(--violet-2)"].map((c, i) => (
                <span
                  key={c}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c,
                    border: "2px solid #fff",
                    marginLeft: i === 0 ? 0 : -8,
                  }}
                />
              ))}
            </div>
            <div style={cardCount}>+24 aktivnih</div>
            <div style={cardSub}>klijenata ove nedelje</div>
          </motion.div>

          {/* Pulsing status pill - lower right */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="lp-float-4"
            style={{
              position: "absolute",
              bottom: "6%",
              right: "14%",
              zIndex: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              background: "#fff",
              borderRadius: 14,
              padding: "10px 16px",
              boxShadow: "0 26px 50px -22px rgba(20,10,40,0.45)",
            }}
          >
            <span
              className="lp-pulse-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--sage)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "var(--worksans)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap" }}>
              Termin upravo zakazan
            </span>
          </motion.div>
        </div>

        {/* Divider */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: 1,
            background: "rgba(255,255,255,0.14)",
            marginBottom: 28,
          }}
        />

        {/* Bottom headline + checklist */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "relative", zIndex: 1, maxWidth: 440 }}
        >
          <h2
            style={{
              fontFamily: "var(--khand)",
              fontSize: "clamp(24px, 2.6vw, 32px)",
              fontWeight: 600,
              color: "#fff",
              margin: "0 0 22px",
              lineHeight: 1.15,
              letterSpacing: "0.01em",
            }}
          >
            Sve na jednom mestu — za terapeute i klijente.
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              "Pronađite terapeuta koji vam odgovara",
              "Kalendar sa sedmičnim i mesečnim pregledom",
              "Automatski podsetnici na email",
            ].map((text) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.16)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span
                  style={{
                    fontFamily: "var(--worksans)",
                    fontSize: 14.7,
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const choiceBtnBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  width: "100%",
  padding: "18px 22px",
  borderRadius: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  transition: "border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
};

const choiceBtnPrimary: React.CSSProperties = {
  ...choiceBtnBase,
  border: "none",
  background: "linear-gradient(120deg, var(--violet-1), var(--violet-2))",
};

const choiceBtnSecondary: React.CSSProperties = {
  ...choiceBtnBase,
  border: "1px solid var(--line)",
  background: "#fff",
};

const choiceTitlePrimary: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontWeight: 600,
  fontSize: 16,
  color: "#fff",
};

const choiceSubPrimary: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontSize: 13.1,
  color: "rgba(255,255,255,0.75)",
};

const choiceTitleSecondary: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontWeight: 600,
  fontSize: 16,
  color: "var(--ink)",
};

const choiceSubSecondary: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontSize: 13.1,
  color: "var(--muted)",
};

const card: React.CSSProperties = {
  position: "absolute",
  background: "#fff",
  color: "var(--ink)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 26px 50px -22px rgba(20,10,40,0.45)",
  fontSize: 13.6,
  fontFamily: "var(--worksans)",
};

const cardClockIcon: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: "#EFE7FA",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const cardTitle: React.CSSProperties = {
  fontFamily: "var(--khand)",
  fontWeight: 600,
  fontSize: 14.1,
  letterSpacing: "0.01em",
  marginBottom: 2,
  color: "var(--ink)",
};

const cardSub: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  color: "var(--muted)",
  fontSize: 12.5,
};

const cardLabel: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontSize: 12.5,
  color: "var(--muted)",
  marginBottom: 10,
};

const matchTag: React.CSSProperties = {
  fontFamily: "var(--worksans)",
  fontSize: 12.2,
  fontWeight: 500,
  padding: "5px 11px",
  borderRadius: 100,
  background: "#F3ECFB",
  color: "var(--violet-1)",
};

const cardCount: React.CSSProperties = {
  fontFamily: "var(--khand)",
  fontWeight: 600,
  fontSize: 13.6,
  color: "var(--ink)",
};

export default LandingPage;
