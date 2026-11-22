import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import DateRangePicker from "./DateRangePicker";
import { DateRange, computeRange, rangeQueryParams } from "./dateRange";
import { backendBase, Client, SessionRow, formatDate, formatDateTime, GENDER_LABELS, STATUS_LABELS, STATUS_COLORS, SESSION_STATUS_LABELS } from "./adminApi";

interface TherapistDetail {
  user_id: number;
  full_name: string | null;
  email: string;
  role: string;
  active: boolean;
  total_clients: number;
  active_clients: number;
  completed_clients: number;
  clients_in_range: number;
  total_sessions: number;
  sessions_in_range: number;
  free_sessions_in_range: number;
  clients_rank_in_range: number;
  sessions_rank_in_range: number;
  clients_rank_overall: number;
  sessions_rank_overall: number;
  clients: Client[];
  recent_sessions: SessionRow[];
  profile: {
    bio: string | null;
    specialties: string[];
    modalities: string[];
  };
  attendance: {
    meetings_held: number;
    attended: number;
    absent: number;
    excused: number;
    percentage: number | null;
  };
}

interface ProfileOption {
  slug: string;
  label: string;
}

const ProfileChips: React.FC<{ title: string; slugs: string[]; labels: Record<string, string> }> = ({
  title,
  slugs,
  labels,
}) => (
  <div style={{ marginTop: 14 }}>
    <div className="mhc-card-label" style={{ marginBottom: 6 }}>{title}</div>
    {slugs.length === 0 ? (
      <span className="mhc-card-sub">Nije navedeno.</span>
    ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {slugs.map((slug) => (
          <span key={slug} className="mhc-badge" style={{ background: "#eef2ff", color: "#4338ca" }}>
            {labels[slug] || slug}
          </span>
        ))}
      </div>
    )}
  </div>
);

const AdminTherapistDetail: React.FC = () => {
  const { therapistId } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => computeRange("current_year"));
  const [data, setData] = useState<TherapistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    axios
      .get(`${backendBase}/tenant/profile-options`)
      .then((res) => {
        const all: ProfileOption[] = [...res.data.specialties, ...res.data.modalities];
        setOptionLabels(Object.fromEntries(all.map((o) => [o.slug, o.label])));
      })
      .catch(() => setOptionLabels({}));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    axios
      .get(`${backendBase}/admin/therapists/${therapistId}`, { params: rangeQueryParams(range) })
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.status === 404 ? "Terapeut nije pronađen." : "Greška pri učitavanju."))
      .finally(() => setLoading(false));
  }, [therapistId, range]);

  return (
    <div>
      <button type="button" className="mhc-btn mhc-btn-secondary mhc-btn-sm" onClick={() => navigate("/therapist/admin/therapists")} style={{ marginBottom: 16 }}>
        ← Nazad na terapeute
      </button>

      <div className="mhc-page-header">
        <div>
          <h1 className="mhc-page-title">{data ? data.full_name || data.email : "Terapeut"}</h1>
          <p className="mhc-page-sub">{data?.email}</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {error && <div className="mhc-error">{error}</div>}

      {loading ? (
        <div className="mhc-loading">Učitavanje…</div>
      ) : data ? (
        <>
          <div className="mhc-cards-grid">
            <div className="mhc-card">
              <div className="mhc-card-label">Ukupno klijenata</div>
              <div className="mhc-card-value">{data.total_clients}</div>
              <div className="mhc-card-sub">Rang: #{data.clients_rank_overall} ukupno</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Ukupno sesija</div>
              <div className="mhc-card-value">{data.total_sessions}</div>
              <div className="mhc-card-sub">Rang: #{data.sessions_rank_overall} ukupno</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Klijenti (period)</div>
              <div className="mhc-card-value">{data.clients_in_range}</div>
              <div className="mhc-card-sub">Rang: #{data.clients_rank_in_range} u periodu</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Sesije (period)</div>
              <div className="mhc-card-value">{data.sessions_in_range}</div>
              <div className="mhc-card-sub">Rang: #{data.sessions_rank_in_range} u periodu</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Aktivni klijenti</div>
              <div className="mhc-card-value">{data.active_clients}</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Završeni klijenti</div>
              <div className="mhc-card-value">{data.completed_clients}</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Besplatne sesije (period)</div>
              <div className="mhc-card-value">{data.free_sessions_in_range}</div>
            </div>
            <div className="mhc-card">
              <div className="mhc-card-label">Prisustvo sastancima</div>
              <div className="mhc-card-value">{data.attendance.percentage !== null ? `${data.attendance.percentage}%` : "—"}</div>
              <div className="mhc-card-sub">
                {data.attendance.attended} prisutan / {data.attendance.absent} odsutan / {data.attendance.excused} opravdano
              </div>
            </div>
          </div>

          <div className="mhc-panel">
            <h3 className="mhc-panel-title">Profil terapeuta</h3>
            <div style={{ padding: "0 4px 4px" }}>
              {data.profile.bio ? (
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{data.profile.bio}</p>
              ) : (
                <span className="mhc-card-sub">Terapeut još nije dodao biografiju.</span>
              )}
              <ProfileChips title="Oblasti rada" slugs={data.profile.specialties} labels={optionLabels} />
              <ProfileChips title="Psihoterapijski pravci" slugs={data.profile.modalities} labels={optionLabels} />
            </div>
          </div>

          <div className="mhc-panel">
            <h3 className="mhc-panel-title">Dodeljeni klijenti ({data.clients.length})</h3>
            <div className="mhc-table-wrap">
              {data.clients.length === 0 ? (
                <div className="mhc-empty">Nema dodeljenih klijenata.</div>
              ) : (
                <table className="mhc-table">
                  <thead>
                    <tr>
                      <th>Klijent</th>
                      <th>Pol</th>
                      <th>Status</th>
                      <th>Sesija</th>
                      <th>Datum početka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="mhc-table-link" onClick={() => navigate(`/therapist/admin/clients/${c.id}`)}>
                            {c.ime} {c.prezime}
                          </span>
                        </td>
                        <td>{c.gender ? GENDER_LABELS[c.gender] : "—"}</td>
                        <td>
                          <span className="mhc-badge" style={STATUS_COLORS[c.status]}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </td>
                        <td>{c.session_count ?? "—"}</td>
                        <td>{formatDate(c.date_started)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="mhc-panel">
            <h3 className="mhc-panel-title">Nedavne sesije</h3>
            <div className="mhc-table-wrap">
              {data.recent_sessions.length === 0 ? (
                <div className="mhc-empty">Nema sesija.</div>
              ) : (
                <table className="mhc-table">
                  <thead>
                    <tr>
                      <th>Klijent</th>
                      <th>Datum</th>
                      <th>Status</th>
                      <th>Besplatna</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.klijent_name || "—"}</td>
                        <td>{formatDateTime(s.pocetak)}</td>
                        <td>{SESSION_STATUS_LABELS[s.status] || s.status}</td>
                        <td>{s.is_free === null ? "—" : s.is_free ? "Da" : "Ne"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AdminTherapistDetail;
