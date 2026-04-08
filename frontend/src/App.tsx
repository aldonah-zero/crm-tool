import React, { useState, useEffect } from "react";
import { TableProvider } from "./contexts/TableContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AdminPanel from "./pages/AdminPanel";
import Calendar from "./pages/Calendar";
import AuthPage from "./pages/AuthPage";
import "./App.css";
import "./styles/auth.css";

// ============================================
// Main app content (shown when authenticated)
// ============================================
const AppContent: React.FC = () => {
  const { user, profile, loading, signOut } = useAuth();
  const [activePage, setActivePage] = useState<"admin" | "calendar">("admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0f172a",
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#1e293b"
            strokeWidth="3.5"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#6366f1"
            strokeWidth="3.5"
            strokeDasharray="80 33"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 22 22"
              to="360 22 22"
              dur="0.7s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      </div>
    );
  }

  // Not logged in — show auth page
  if (!user || !profile) {
    return <AuthPage />;
  }

  // Logged in — show app
  const handleNavClick = (page: "admin" | "calendar") => {
    setActivePage(page);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <TableProvider>
      <div className="psych-app">
        {/* Mobile Header */}
        {isMobile && (
          <header className="psych-mobile-header">
            <button
              className="psych-hamburger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              <span
                className={`psych-hamburger-line ${sidebarOpen ? "open" : ""}`}
              />
              <span
                className={`psych-hamburger-line ${sidebarOpen ? "open" : ""}`}
              />
              <span
                className={`psych-hamburger-line ${sidebarOpen ? "open" : ""}`}
              />
            </button>
            <div className="psych-mobile-logo">
              <div className="psych-logo-icon psych-logo-icon-sm">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <span className="psych-logo-text-sm">PsihoApp</span>
            </div>
            <div className="psych-mobile-page-label">
              {activePage === "admin" ? "Admin" : "Kalendar"}
            </div>
          </header>
        )}

        {/* Overlay */}
        {isMobile && sidebarOpen && (
          <div
            className="psych-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav
          className={`psych-sidebar ${isMobile ? (sidebarOpen ? "open" : "closed") : ""}`}
        >
          <div className="psych-sidebar-header">
            <div className="psych-logo-icon">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <h1 className="psych-logo-text">PsihoApp</h1>
              <p className="psych-logo-sub">{profile.tenant_name}</p>
            </div>
            {isMobile && (
              <button
                className="psych-sidebar-close"
                onClick={() => setSidebarOpen(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="psych-sidebar-section">
            <span className="psych-sidebar-label">GLAVNI MENI</span>
            <button
              className={`psych-sidebar-btn ${activePage === "admin" ? "active" : ""}`}
              onClick={() => handleNavClick("admin")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Admin Panel
            </button>
            <button
              className={`psych-sidebar-btn ${activePage === "calendar" ? "active" : ""}`}
              onClick={() => handleNavClick("calendar")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Kalendar
            </button>
          </div>

          {/* User info at bottom */}
          <div className="psych-sidebar-footer">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
                padding: "0 4px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {(profile.full_name || profile.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#e2e8f0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile.full_name || profile.email}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile.role === "owner" ? "Vlasnik" : "Član"} ·{" "}
                  {profile.email}
                </div>
              </div>
            </div>
            <button
              onClick={signOut}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #334155",
                borderRadius: "8px",
                background: "transparent",
                color: "#94a3b8",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1e293b";
                e.currentTarget.style.color = "#e2e8f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Odjavi se
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="psych-main">
          {activePage === "admin" && <AdminPanel />}
          {activePage === "calendar" && <Calendar />}
        </main>
      </div>
    </TableProvider>
  );
};

// ============================================
// Root App with AuthProvider
// ============================================
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
