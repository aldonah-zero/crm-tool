import React, { useState, useEffect } from "react";
import { TableProvider } from "./contexts/TableContext";
import AdminPanel from "./pages/AdminPanel";
import Calendar from "./pages/Calendar";
import "./App.css";

function App() {
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
              <p className="psych-logo-sub">Upravljanje praksom</p>
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

          <div className="psych-sidebar-footer">
            <p>© 2026 PsihoApp</p>
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
}

export default App;
