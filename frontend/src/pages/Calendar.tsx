import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";

interface Session {
  id: number;
  pocetak: string;
  kraj: string;
  cena: number;
  status: string;
}

interface Client {
  id: number;
  ime: string;
  prezime: string;
  broj_telefona: string;
  email: string;
}
interface Group {
  id: number;
  naziv: string;
  cena?: number;
  opis?: string;
  clanovi_imena?: string;
  broj_clanova?: number;
}

const DAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const MONTHS = [
  "Januar",
  "Februar",
  "Mart",
  "April",
  "Maj",
  "Jun",
  "Jul",
  "Avgust",
  "Septembar",
  "Oktobar",
  "Novembar",
  "Decembar",
];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const statusColors: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  zakazano: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  zavrseno: { bg: "#dcfce7", border: "#22c55e", text: "#166534" },
  otkazano: { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
  default: { bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
};

interface SesijaKlijent {
  id: number;
  sesija_id: number;
  klijent_id: number;
}

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"week" | "month">(
    window.innerWidth <= 768 ? "month" : "week",
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<SesijaKlijent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionGroups, setSessionGroups] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    pocetak: "",
    kraj: "",
    cena: 4000,
    status: "zakazano",
    klijent_id: "",
    grupa_id: "",
  });

  const backendBase =
    (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${backendBase}/sesija/`);
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await axios.get(`${backendBase}/klijent/`);
      setClients(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };
const fetchSessionGroups = async () => {
  try {
    const res = await axios.get(`${backendBase}/sesijagrupa/`);
    setSessionGroups(Array.isArray(res.data) ? res.data : []);
  } catch (err) {
    console.error("Error fetching session-group links:", err);
  }
};
const fetchGroups = async () => {
  try {
    const res = await axios.get(`${backendBase}/grupa/`);
    setGroups(Array.isArray(res.data) ? res.data : []);
  } catch (err) {
    console.error("Error fetching groups:", err);
  }
};
  const fetchLinks = async () => {
    try {
      const res = await axios.get(`${backendBase}/sesijaklijent/`);
      setLinks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching session-client links:", err);
    }
  };

    useEffect(() => {
      Promise.all([
        fetchSessions(),
        fetchClients(),
        fetchGroups(),
        fetchLinks(),
        fetchSessionGroups(),
      ]);
    }, []);

  // Build a map: sessionId → client name(s)
  const sessionClientMap = useMemo(() => {
    const map: Record<number, string> = {};
    const clientMap: Record<number, Client> = {};
    clients.forEach((c) => {
      clientMap[c.id] = c;
    });
    links.forEach((link) => {
      const client = clientMap[link.klijent_id];
      if (client) {
        const name = `${client.ime} ${client.prezime}`;
        if (map[link.sesija_id]) {
          map[link.sesija_id] += `, ${name}`;
        } else {
          map[link.sesija_id] = name;
        }
      }
    });
    return map;
  }, [links, clients]);

const sessionGroupMap = useMemo(() => {
  const map: Record<number, string> = {};
  const groupMap: Record<number, Group> = {};

  groups.forEach((g) => {
    groupMap[g.id] = g;
  });

  sessionGroups.forEach((link) => {
    const group = groupMap[link.grupa_id]; // <-- CORRECT
    if (group) {
      map[link.sesija_1_id] = `Grupa: ${group.naziv}`; // <-- CORRECT
    }
  });

  return map;
}, [sessionGroups, groups]);

  const weekStart = useMemo(() => getMonday(currentDate), [currentDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );
  const monthStart = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    [currentDate],
  );
  const monthDays = useMemo(() => {
    const start = getMonday(monthStart);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monthStart]);

  const getSessionsForDay = (day: Date) =>
    sessions.filter((s) => isSameDay(new Date(s.pocetak), day));
  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };
  const navigateMonth = (dir: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const openNewSession = (date?: Date, hour?: number) => {
    const start = date ? new Date(date) : new Date();
    if (hour !== undefined) start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    // Format as "YYYY-MM-DDTHH:MM" using local time components (no UTC conversion)
    const pad = (n: number) => String(n).padStart(2, "0");
    const toInput = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setFormData({
      pocetak: toInput(start),
      kraj: toInput(end),
      cena: 4000,
      status: "zakazano",
      klijent_id: "",
      grupa_id: "",
    });
    setSelectedSession(null);
    setShowModal(true);
  };

  const openEditSession = (session: Session) => {
    const toInputFormat = (s: string) => {
      return s.replace(" ", "T").slice(0, 16);
    };

    const groupLink = sessionGroups.find(
      (sg: any) => sg.sesija_1_id === session.id,
    );
    const clientLink = links.find((l) => l.sesija_id === session.id);

    // If it's a group session, use the group's price
    let cena = session.cena;
    if (groupLink) {
      const grupa = groups.find((g) => g.id === groupLink.grupa_id);
      if (grupa?.cena) {
        cena = grupa.cena;
      }
    }

    setFormData({
      pocetak: toInputFormat(session.pocetak),
      kraj: toInputFormat(session.kraj),
      cena: cena,
      status: session.status,
      klijent_id: clientLink ? String(clientLink.klijent_id) : "",
      grupa_id: groupLink ? String(groupLink.grupa_id) : "",
    });
    setSelectedSession(session);
    setShowModal(true);
  };

  // INSTANT DELETE with animation — no confirm, no save needed
  const handleDeleteDirect = async (
    sessionId: number,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    setDeletingId(sessionId);
    await new Promise((r) => setTimeout(r, 350));

    // Optimistic removal from all state
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setLinks((prev) => prev.filter((l) => l.sesija_id !== sessionId));
    setSessionGroups((prev) =>
      prev.filter((sg: any) => sg.sesija_1_id !== sessionId),
    );
    setDeletingId(null);
    if (showModal && selectedSession?.id === sessionId) setShowModal(false);

    try {
      await axios.delete(`${backendBase}/sesija/${sessionId}/`);
      showToast("Sesija obrisana");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 409) {
        showToast("Sesija obrisana");
      } else {
        showToast("Greška pri brisanju!", "error");
        Promise.all([fetchSessions(), fetchLinks(), fetchSessionGroups()]);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newId = selectedSession
        ? selectedSession.id
        : Math.floor(Math.random() * 900000) + 100000;
      const pocetakStr =
        formData.pocetak.length === 16
          ? formData.pocetak + ":00"
          : formData.pocetak;
      const krajStr =
        formData.kraj.length === 16 ? formData.kraj + ":00" : formData.kraj;
      const payload = {
        id: newId,
        pocetak: pocetakStr,
        kraj: krajStr,
        cena: formData.cena,
        status: formData.status,
        uplate: null,
        sesijaklijent_1: null,
        sesijagrupa_1: null,
        klijent_id: formData.klijent_id ? parseInt(formData.klijent_id) : null,
        grupa_id: formData.grupa_id ? parseInt(formData.grupa_id) : null,
      };

      if (selectedSession) {
        // EDIT — optimistic update
        setSessions((prev) =>
          prev.map((s) =>
            s.id === selectedSession.id
              ? {
                  ...s,
                  pocetak: pocetakStr,
                  kraj: krajStr,
                  cena: formData.cena,
                  status: formData.status,
                }
              : s,
          ),
        );
        setShowModal(false);
        showToast("Sesija ažurirana");

        axios
          .put(`${backendBase}/sesija/${selectedSession.id}/`, payload)
          .then(() =>
            Promise.all([fetchSessions(), fetchLinks(), fetchSessionGroups()]),
          )
          .catch(() => {
            showToast("Greška pri čuvanju!", "error");
            Promise.all([fetchSessions(), fetchLinks(), fetchSessionGroups()]);
          });
      } else {
        // CREATE — optimistic insert
        const optimisticSession: Session = {
          id: newId,
          pocetak: pocetakStr,
          kraj: krajStr,
          cena: formData.cena,
          status: formData.status,
        };
        setSessions((prev) => [...prev, optimisticSession]);

        if (formData.klijent_id) {
          setLinks((prev) => [
            ...prev,
            {
              id: Date.now(),
              sesija_id: newId,
              klijent_id: parseInt(formData.klijent_id),
            },
          ]);
        }
        if (formData.grupa_id) {
          setSessionGroups((prev) => [
            ...prev,
            {
              id: Date.now(),
              sesija_1_id: newId,
              grupa_id: parseInt(formData.grupa_id),
            },
          ]);
        }

        setShowModal(false);
        showToast("Nova sesija kreirana");

        axios
          .post(`${backendBase}/sesija/`, payload)
          .then(() =>
            Promise.all([fetchSessions(), fetchLinks(), fetchSessionGroups()]),
          )
          .catch(() => {
            showToast("Greška pri čuvanju!", "error");
            Promise.all([fetchSessions(), fetchLinks(), fetchSessionGroups()]);
          });
      }
    } catch (err) {
      showToast("Greška pri čuvanju!", "error");
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();

  return (
    <div className="cal-container">
      {/* Toast */}
      {toast && (
        <div className={`cal-toast cal-toast-${toast.type}`}>
          <span className="cal-toast-icon">
            {toast.type === "success" ? "✓" : "✕"}
          </span>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="cal-header">
        <div className="cal-header-left">
          <h1 className="cal-title">Kalendar</h1>
          <p className="cal-subtitle">
            {view === "week"
              ? `${weekDays[0].getDate()}. - ${weekDays[6].getDate()}. ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
              : `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
          </p>
        </div>
        <div className="cal-header-right">
          <div className="cal-view-toggle">
            <button
              className={`cal-view-btn ${view === "week" ? "active" : ""}`}
              onClick={() => setView("week")}
            >
              Nedelja
            </button>
            <button
              className={`cal-view-btn ${view === "month" ? "active" : ""}`}
              onClick={() => setView("month")}
            >
              Mesec
            </button>
          </div>
          <div className="cal-nav-group">
            <button
              className="cal-nav-btn"
              onClick={() => setCurrentDate(new Date())}
            >
              Danas
            </button>
            <button
              className="cal-nav-btn"
              onClick={() =>
                view === "week" ? navigateWeek(-1) : navigateMonth(-1)
              }
            >
              ‹
            </button>
            <button
              className="cal-nav-btn"
              onClick={() =>
                view === "week" ? navigateWeek(1) : navigateMonth(1)
              }
            >
              ›
            </button>
          </div>
          <button className="cal-add-btn" onClick={() => openNewSession()}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nova Sesija
          </button>
        </div>
      </div>

      {/* Week View */}
      {view === "week" && (
        <>
          {/* Desktop grid */}
          <div className="cal-week cal-week-desktop">
            <div className="cal-time-col">
              <div className="cal-time-header"></div>
              {HOURS.map((h) => (
                <div key={h} className="cal-time-slot">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekDays.map((day, dayIdx) => {
              const isToday = isSameDay(day, today);
              const daySessions = getSessionsForDay(day);
              return (
                <div
                  key={dayIdx}
                  className={`cal-day-col ${isToday ? "today" : ""}`}
                >
                  <div className={`cal-day-header ${isToday ? "today" : ""}`}>
                    <span className="cal-day-name">{DAYS[dayIdx]}</span>
                    <span className={`cal-day-num ${isToday ? "today" : ""}`}>
                      {day.getDate()}
                    </span>
                  </div>
                  {HOURS.map((h) => {
                    const hourSessions = daySessions.filter(
                      (s) => new Date(s.pocetak).getHours() === h,
                    );
                    return (
                      <div
                        key={h}
                        className="cal-hour-cell"
                        onClick={() => openNewSession(day, h)}
                      >
                        {hourSessions.map((s) => {
                          const start = new Date(s.pocetak);
                          const end = new Date(s.kraj);
                          const colors =
                            statusColors[s.status] || statusColors.default;
                          const isDeleting = deletingId === s.id;
                          return (
                            <div
                              key={s.id}
                              className={`cal-session-block ${isDeleting ? "deleting" : ""}`}
                              style={{
                                backgroundColor: colors.bg,
                                borderLeft: `3px solid ${colors.border}`,
                                color: colors.text,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditSession(s);
                              }}
                            >
                              <div className="cal-session-content">
                                <span className="cal-session-name">
                                  {sessionClientMap[s.id] ||
                                    sessionGroupMap[s.id] ||
                                    ""}
                                </span>
                                <span className="cal-session-time">
                                  {formatTime(start)} - {formatTime(end)}
                                </span>
                                <span className="cal-session-price">
                                  {s.cena.toLocaleString()} RSD
                                </span>
                              </div>
                              <button
                                className="cal-session-delete"
                                onClick={(e) => handleDeleteDirect(s.id, e)}
                                title="Obriši"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Mobile agenda */}
          <div className="cal-week-mobile">
            {weekDays.map((day, dayIdx) => {
              const isToday = isSameDay(day, today);
              const daySessions = getSessionsForDay(day);
              return (
                <div
                  key={dayIdx}
                  className={`cal-agenda-day ${isToday ? "today" : ""}`}
                  onClick={() => openNewSession(day, 10)}
                >
                  <div className="cal-agenda-date">
                    <span
                      className={`cal-agenda-day-num ${isToday ? "today" : ""}`}
                    >
                      {day.getDate()}
                    </span>
                    <span className="cal-agenda-day-name">{DAYS[dayIdx]}</span>
                  </div>
                  <div className="cal-agenda-sessions">
                    {daySessions.length === 0 ? (
                      <span className="cal-agenda-empty">Nema sesija</span>
                    ) : (
                      daySessions.map((s) => {
                        const start = new Date(s.pocetak);
                        const end = new Date(s.kraj);
                        const colors =
                          statusColors[s.status] || statusColors.default;
                        return (
                          <div
                            key={s.id}
                            className={`cal-agenda-item ${deletingId === s.id ? "deleting" : ""}`}
                            style={{
                              backgroundColor: colors.bg,
                              borderLeft: `3px solid ${colors.border}`,
                              color: colors.text,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditSession(s);
                            }}
                          >
                            {(sessionClientMap[s.id] ||
                              sessionGroupMap[s.id]) && (
                              <span className="cal-agenda-item-name">
                                {sessionClientMap[s.id] ||
                                  sessionGroupMap[s.id]}
                              </span>
                            )}
                            <span className="cal-agenda-item-time">
                              {formatTime(start)}-{formatTime(end)}
                            </span>
                            <span className="cal-agenda-item-price">
                              {s.cena.toLocaleString()} RSD
                            </span>
                            <button
                              className="cal-agenda-item-delete"
                              onClick={(e) => handleDeleteDirect(s.id, e)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Month View */}
      {view === "month" && (
        <div className="cal-month">
          <div className="cal-month-header">
            {DAYS.map((d) => (
              <div key={d} className="cal-month-day-name">
                {d}
              </div>
            ))}
          </div>
          <div className="cal-month-grid">
            {monthDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              const daySessions = getSessionsForDay(day);
              return (
                <div
                  key={i}
                  className={`cal-month-cell ${!isCurrentMonth ? "other-month" : ""} ${isToday ? "today" : ""}`}
                  onClick={() => openNewSession(day, 10)}
                >
                  <span className={`cal-month-date ${isToday ? "today" : ""}`}>
                    {day.getDate()}
                  </span>
                  <div className="cal-month-sessions">
                    {daySessions.slice(0, 3).map((s) => {
                      const colors =
                        statusColors[s.status] || statusColors.default;
                      return (
                        <div
                          key={s.id}
                          className={`cal-month-session-dot ${deletingId === s.id ? "deleting" : ""}`}
                          style={{ backgroundColor: colors.border }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditSession(s);
                          }}
                          title={`${sessionClientMap[s.id] || sessionGroupMap[s.id] || ""} — ${formatTime(new Date(s.pocetak))} - ${s.cena} RSD`}
                        />
                      );
                    })}
                    {daySessions.length > 3 && (
                      <span className="cal-month-more">
                        +{daySessions.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="cal-legend">
        {Object.entries(statusColors)
          .filter(([k]) => k !== "default")
          .map(([key, colors]) => (
            <div key={key} className="cal-legend-item">
              <div
                className="cal-legend-dot"
                style={{ backgroundColor: colors.border }}
              />
              <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
            </div>
          ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="cal-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-header">
              <h2>{selectedSession ? "Izmeni Sesiju" : "Nova Sesija"}</h2>
              <button
                className="cal-modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-form-group">
                <label>Početak</label>
                <input
                  type="datetime-local"
                  value={formData.pocetak}
                  onChange={(e) =>
                    setFormData({ ...formData, pocetak: e.target.value })
                  }
                />
              </div>
              <div className="cal-form-group">
                <label>Kraj</label>
                <input
                  type="datetime-local"
                  value={formData.kraj}
                  onChange={(e) =>
                    setFormData({ ...formData, kraj: e.target.value })
                  }
                />
              </div>
              <div className="cal-form-row">
                <div className="cal-form-group">
                  <label>Cena (RSD)</label>
                  <input
                    type="number"
                    value={formData.cena}
                    onChange={(e) =>
                      setFormData({ ...formData, cena: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="cal-form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="zakazano">Zakazano</option>
                    <option value="zavrseno">Završeno</option>
                    <option value="otkazano">Otkazano</option>
                  </select>
                </div>
              </div>

              {!formData.grupa_id && (
                <div className="cal-form-group">
                  <label>Klijent (opciono)</label>
                  <select
                    value={formData.klijent_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        klijent_id: e.target.value,
                        grupa_id: "",
                      })
                    }
                  >
                    <option value="">-- Izaberite klijenta --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ime} {c.prezime}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!formData.klijent_id && (
                <div className="cal-form-group">
                  <label>Grupa (opciono)</label>
                  <select
                    value={formData.grupa_id}
                    onChange={(e) => {
                      const grupaId = e.target.value;
                      const selectedGrupa = groups.find(
                        (g) => g.id === parseInt(grupaId),
                      );
                      setFormData({
                        ...formData,
                        grupa_id: grupaId,
                        klijent_id: "",
                        cena: selectedGrupa?.cena ?? formData.cena,
                      });
                    }}
                  >
                    <option value="">-- Izaberite grupu --</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.naziv}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              

              {formData.grupa_id &&
                (() => {
                  const grupa = groups.find(
                    (g) => g.id === parseInt(formData.grupa_id),
                  );
                  return grupa?.clanovi_imena ? (
                    <div className="cal-form-group">
                      <label>Članovi grupe</label>
                      <div
                        style={{
                          padding: "10px 12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontSize: "13px",
                          color: "#475569",
                          lineHeight: "1.6",
                        }}
                      >
                        {grupa.clanovi_imena}
                      </div>
                    </div>
                  ) : null;
                })()}
            </div>
            <div className="cal-modal-footer">
              {selectedSession && (
                <button
                  className="cal-btn cal-btn-danger"
                  onClick={() => handleDeleteDirect(selectedSession.id)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
                  Obriši
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                className="cal-btn cal-btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Otkaži
              </button>
              <button
                className={`cal-btn cal-btn-primary ${saving ? "saving" : ""}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Čuvam..." : "Sačuvaj"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
