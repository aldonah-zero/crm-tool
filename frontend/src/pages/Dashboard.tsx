import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";

// ============================================
// INJECT GLOBAL STYLES & FONT
// ============================================
const injectStyles = () => {
  if (document.getElementById("dashboard-animations")) return;
  const s = document.createElement("style");
  s.id = "dashboard-animations";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
    @keyframes cardSlideIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes growIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
    .dash-row:hover { background: #f8fafc !important; }
    .dash-chart-card { animation: growIn 0.5s cubic-bezier(0.16,1,0.3,1) both; }
    @media (max-width: 900px) { .dash-grid-2 { grid-template-columns: 1fr !important; } }
    @media (max-width: 600px) { .dash-cards-row { grid-template-columns: repeat(2, 1fr) !important; } }
  `;
  document.head.appendChild(s);
};

// ============================================
// COLORS
// ============================================
const COLORS = {
  indigo: "#6366f1",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  teal: "#14b8a6",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  pink: "#ec4899",
  slate: "#64748b",
};

const CHART_PALETTE = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
];

// ============================================
// ANIMATED NUMBER
// ============================================
const AnimatedNumber: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}> = ({ value, prefix = "", suffix = "", decimals = 0 }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const dur = 800;
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(e * value);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("sr-Latn");
  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

// ============================================
// CIRCULAR PROGRESS
// ============================================
const CircularProgress: React.FC<{
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
}> = ({ percent, size = 64, stroke = 5, label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const color =
    percent >= 80 ? COLORS.green : percent >= 40 ? COLORS.amber : COLORS.red;
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
          {Math.round(percent)}%
        </div>
        {label && (
          <div style={{ fontSize: "9px", color: "#94a3b8", marginTop: "-1px" }}>
            {label}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// LINE CHART (SVG - no library needed)
// ============================================
const LineChart: React.FC<{
  data: { label: string; value: number; value2?: number }[];
  height?: number;
  color1?: string;
  color2?: string;
  label1?: string;
  label2?: string;
}> = ({
  data,
  height = 200,
  color1 = COLORS.indigo,
  color2 = COLORS.green,
  label1 = "Sesije",
  label2 = "Prihod",
}) => {
  if (data.length === 0)
    return (
      <div
        style={{
          color: "#94a3b8",
          fontSize: "13px",
          padding: "20px",
          textAlign: "center",
        }}
      >
        Nema podataka
      </div>
    );

  const W = 600,
    H = height,
    padT = 20,
    padB = 40,
    padL = 10,
    padR = 10;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxV = Math.max(...data.map((d) => d.value), 1);
  const maxV2 =
    data[0]?.value2 !== undefined
      ? Math.max(...data.map((d) => d.value2 || 0), 1)
      : 0;

  const points = data.map((d, i) => ({
    x: padL + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padT + chartH - (d.value / maxV) * chartH,
    y2: maxV2 > 0 ? padT + chartH - ((d.value2 || 0) / maxV2) * chartH : 0,
    label: d.label,
    val: d.value,
    val2: d.value2 || 0,
  }));

  const line1 = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const area1 = `${line1} L ${points[points.length - 1].x} ${padT + chartH} L ${points[0].x} ${padT + chartH} Z`;
  const line2 =
    maxV2 > 0
      ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y2}`).join(" ")
      : "";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="lineGrad1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color1} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color1} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={padL}
            y1={padT + chartH * (1 - pct)}
            x2={W - padR}
            y2={padT + chartH * (1 - pct)}
            stroke="#f1f5f9"
            strokeWidth="1"
          />
        ))}
        {/* Area fill */}
        <path d={area1} fill="url(#lineGrad1)">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.8s"
            fill="freeze"
          />
        </path>
        {/* Line 1 */}
        <path
          d={line1}
          fill="none"
          stroke={color1}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="2000"
            to="0"
            dur="1.2s"
            fill="freeze"
          />
          <animate
            attributeName="stroke-dasharray"
            from="2000"
            to="2000"
            dur="0.01s"
            fill="freeze"
          />
        </path>
        {/* Line 2 */}
        {line2 && (
          <path
            d={line2}
            fill="none"
            stroke={color2}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 4"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="1s"
              begin="0.3s"
              fill="freeze"
            />
          </path>
        )}
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill="#fff"
              stroke={color1}
              strokeWidth="2"
            >
              <animate
                attributeName="r"
                from="0"
                to="4"
                dur="0.3s"
                begin={`${0.5 + i * 0.05}s`}
                fill="freeze"
              />
            </circle>
            {maxV2 > 0 && (
              <circle
                cx={p.x}
                cy={p.y2}
                r="3"
                fill="#fff"
                stroke={color2}
                strokeWidth="2"
              >
                <animate
                  attributeName="r"
                  from="0"
                  to="3"
                  dur="0.3s"
                  begin={`${0.6 + i * 0.05}s`}
                  fill="freeze"
                />
              </circle>
            )}
          </g>
        ))}
        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
            fontFamily="DM Sans, sans-serif"
          >
            {p.label}
          </text>
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          gap: "16px",
          justifyContent: "center",
          marginTop: "8px",
          fontSize: "12px",
          color: "#94a3b8",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "14px",
              height: "3px",
              borderRadius: "2px",
              background: color1,
            }}
          />
          {label1}
        </span>
        {maxV2 > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span
              style={{
                width: "14px",
                height: "3px",
                borderRadius: "2px",
                background: color2,
                borderTop: "1px dashed " + color2,
              }}
            />
            {label2}
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================
// RADAR CHART (SVG)
// ============================================
const RadarChart: React.FC<{
  labels: string[];
  values: number[];
  maxValue?: number;
  color?: string;
  size?: number;
}> = ({ labels, values, maxValue, color = COLORS.indigo, size = 240 }) => {
  const n = labels.length;
  if (n < 3) return null;
  const mx = maxValue || Math.max(...values, 1);
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 30;

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i: number, pct: number) => ({
    x: cx + Math.cos(angleOf(i)) * r * pct,
    y: cy + Math.sin(angleOf(i)) * r * pct,
  });

  const dataPath =
    values
      .map((v, i) => {
        const p = pointAt(i, v / mx);
        return `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`;
      })
      .join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{
        width: "100%",
        maxWidth: size,
        height: "auto",
        margin: "0 auto",
        display: "block",
      }}
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <polygon
          key={pct}
          points={Array.from({ length: n }, (_, i) => {
            const p = pointAt(i, pct);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="0.8"
        />
      ))}
      {/* Axes */}
      {labels.map((_, i) => {
        const p = pointAt(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#e2e8f0"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Data polygon */}
      <polygon
        points={values
          .map((v, i) => {
            const p = pointAt(i, v / mx);
            return `${p.x},${p.y}`;
          })
          .join(" ")}
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <animate
          attributeName="fill-opacity"
          from="0"
          to="0.15"
          dur="0.6s"
          fill="freeze"
        />
      </polygon>
      {/* Data dots */}
      {values.map((v, i) => {
        const p = pointAt(i, v / mx);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#fff"
            stroke={color}
            strokeWidth="2"
          >
            <animate
              attributeName="r"
              from="0"
              to="4"
              dur="0.3s"
              begin={`${0.3 + i * 0.08}s`}
              fill="freeze"
            />
          </circle>
        );
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const p = pointAt(i, 1.18);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="#64748b"
            fontFamily="DM Sans, sans-serif"
            fontWeight="500"
          >
            {lbl.length > 18 ? lbl.slice(0, 17) + "…" : lbl}
          </text>
        );
      })}
    </svg>
  );
};

// ============================================
// HEATMAP (session hours)
// ============================================
const HeatmapChart: React.FC<{ data: number[][] }> = ({ data }) => {
  const days = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
  const hours = Array.from({ length: 12 }, (_, i) => `${i + 8}h`); // 8-19
  const maxVal = Math.max(...data.flat(), 1);

  const getColor = (v: number) => {
    if (v === 0) return "#f8fafc";
    const pct = v / maxVal;
    if (pct < 0.33) return "#c7d2fe";
    if (pct < 0.66) return "#818cf8";
    return "#4f46e5";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `40px repeat(${hours.length}, 1fr)`,
          gap: "2px",
          fontSize: "10px",
          minWidth: "400px",
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={h}
            style={{
              textAlign: "center",
              color: "#94a3b8",
              fontWeight: 500,
              padding: "2px 0",
            }}
          >
            {h}
          </div>
        ))}
        {days.map((day, di) => (
          <React.Fragment key={day}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                color: "#64748b",
                fontWeight: 500,
                fontSize: "11px",
              }}
            >
              {day}
            </div>
            {hours.map((_, hi) => {
              const v = data[di]?.[hi] || 0;
              return (
                <div
                  key={hi}
                  title={`${day} ${hours[hi]}: ${v} sesija`}
                  style={{
                    background: getColor(v),
                    borderRadius: "3px",
                    height: "24px",
                    transition: "background 0.3s",
                    cursor: "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "9px",
                    fontWeight: 600,
                    color:
                      v > maxVal * 0.5
                        ? "#fff"
                        : v > 0
                          ? "#4338ca"
                          : "transparent",
                  }}
                >
                  {v > 0 ? v : ""}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "10px",
          fontSize: "11px",
          color: "#94a3b8",
          justifyContent: "flex-end",
        }}
      >
        <span>Manje</span>
        {[0, 0.33, 0.66, 1].map((pct, i) => (
          <div
            key={i}
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "3px",
              background:
                pct === 0
                  ? "#f1f5f9"
                  : pct < 0.5
                    ? "#c7d2fe"
                    : pct < 0.8
                      ? "#818cf8"
                      : "#4f46e5",
            }}
          />
        ))}
        <span>Više</span>
      </div>
    </div>
  );
};

// ============================================
// MAIN DASHBOARD
// ============================================
const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"overview" | "clients" | "trends">(
    "overview",
  );

  useEffect(() => {
    injectStyles();
    fetchData();
  }, []);

  const fetchData = async () => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
    try {
      const res = await axios.get(`${base}/sesija/`);
      if (Array.isArray(res.data)) setSessions(res.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = useMemo(() => {
    const names = new Set<string>();
    sessions.forEach((s) => {
      if (s.klijent_ime) names.add(s.klijent_ime);
    });
    return Array.from(names).sort();
  }, [sessions]);

  const filtered = useMemo(() => {
    if (filter === "all") return sessions;
    if (filter === "individual") return sessions.filter((s) => !s.grupa_id);
    if (filter === "group") return sessions.filter((s) => !!s.grupa_id);
    return sessions.filter((s) => s.klijent_ime === filter);
  }, [sessions, filter]);

  // ===== STATS =====
  const stats = useMemo(() => {
    const total = filtered.length;
    const totalRev = filtered.reduce((s, x) => s + (x.cena || 0), 0);
    const paid = filtered.filter((x) => x.placeno);
    const paidRev = paid.reduce((s, x) => s + (x.cena || 0), 0);
    const unpaidRev = totalRev - paidRev;
    const paidPct = totalRev > 0 ? (paidRev / totalRev) * 100 : 0;
    const ind = filtered.filter((x) => !x.grupa_id).length;
    const grp = filtered.filter((x) => !!x.grupa_id).length;
    const avgPrice = total > 0 ? totalRev / total : 0;
    // Sessions this week vs last week
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const thisWeek = filtered.filter(
      (x) => x.pocetak && new Date(x.pocetak) >= thisWeekStart,
    ).length;
    const lastWeek = filtered.filter((x) => {
      if (!x.pocetak) return false;
      const d = new Date(x.pocetak);
      return d >= lastWeekStart && d < thisWeekStart;
    }).length;
    const weekChange =
      lastWeek > 0
        ? ((thisWeek - lastWeek) / lastWeek) * 100
        : thisWeek > 0
          ? 100
          : 0;
    return {
      total,
      totalRev,
      paidRev,
      unpaidRev,
      paidPct,
      paidCount: paid.length,
      unpaidCount: total - paid.length,
      ind,
      grp,
      avgPrice,
      thisWeek,
      lastWeek,
      weekChange,
    };
  }, [filtered]);

  // ===== CLIENT STATS =====
  const clientStats = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        total: number;
        paid: number;
        sessions: number;
        isGroup: boolean;
      }
    > = {};
    filtered.forEach((s) => {
      const key = s.klijent_ime || "Nepoznato";
      if (!map[key])
        map[key] = {
          name: key,
          total: 0,
          paid: 0,
          sessions: 0,
          isGroup: !!s.grupa_id,
        };
      map[key].total += s.cena || 0;
      if (s.placeno) map[key].paid += s.cena || 0;
      map[key].sessions += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // ===== WEEKLY TREND (line chart) =====
  const weeklyTrend = useMemo(() => {
    const map: Record<string, { sessions: number; revenue: number }> = {};
    filtered.forEach((s) => {
      if (!s.pocetak) return;
      const d = new Date(s.pocetak);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().split("T")[0];
      if (!map[key]) map[key] = { sessions: 0, revenue: 0 };
      map[key].sessions += 1;
      map[key].revenue += s.cena || 0;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([k, v]) => {
        const d = new Date(k);
        return {
          label: `${d.getDate()}.${d.getMonth() + 1}`,
          value: v.sessions,
          value2: v.revenue / 1000,
        };
      });
  }, [filtered]);

  // ===== MONTHLY STATS =====
  const monthlyStats = useMemo(() => {
    const map: Record<
      string,
      { month: string; total: number; paid: number; count: number }
    > = {};
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Maj",
      "Jun",
      "Jul",
      "Avg",
      "Sep",
      "Okt",
      "Nov",
      "Dec",
    ];
    filtered.forEach((s) => {
      if (!s.pocetak) return;
      const d = new Date(s.pocetak);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (!map[key]) map[key] = { month: label, total: 0, paid: 0, count: 0 };
      map[key].total += s.cena || 0;
      if (s.placeno) map[key].paid += s.cena || 0;
      map[key].count += 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filtered]);

  // ===== HEATMAP DATA =====
  const heatmapData = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(12).fill(0)); // 7 days x 12 hours (8-19)
    filtered.forEach((s) => {
      if (!s.pocetak) return;
      const d = new Date(s.pocetak);
      const day = (d.getDay() + 6) % 7; // Mon=0
      const hour = d.getHours() - 8;
      if (hour >= 0 && hour < 12) grid[day][hour] += 1;
    });
    return grid;
  }, [filtered]);

  // ===== RADAR DATA =====
  const radarData = useMemo(() => {
    const top = clientStats.slice(0, 6);
    return {
      labels: top.map((c) => {
        const clean = c.name.replace(/^\[Grupa\]\s*/, "");
        return clean.length > 16 ? clean.slice(0, 15) + "…" : clean;
      }),
      values: top.map((c) => c.sessions),
    };
  }, [clientStats]);

  const maxClientTotal = useMemo(
    () => Math.max(...clientStats.map((c) => c.total), 1),
    [clientStats],
  );
  const maxMonthly = useMemo(
    () => Math.max(...monthlyStats.map((m) => m.total), 1),
    [monthlyStats],
  );

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "60px",
          opacity: 0.5,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#e2e8f0"
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

  const cardStyle = (delay: number) => ({
    background: "#fff",
    borderRadius: "14px",
    padding: "20px 22px",
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    overflow: "hidden" as const,
    animation: `cardSlideIn 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
  });

  const iconBox = (bg: string) => ({
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
  });

  const chartCard = {
    background: "#fff",
    borderRadius: "14px",
    padding: "22px",
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  };
  const chartTitle = {
    fontSize: "15px",
    fontWeight: 600,
    color: "#334155",
    margin: "0 0 16px",
  };

  return (
    <div
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: "#1e293b",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "26px",
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 4px",
            letterSpacing: "-0.5px",
          }}
        >
          Statistika
        </h2>
        <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
          Pregled sesija, prihoda i naplate
        </p>
      </div>

      {/* View tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: "18px",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1.5px solid #e2e8f0",
          width: "fit-content",
        }}
      >
        {(
          [
            ["overview", "Pregled"],
            ["clients", "Klijenti"],
            ["trends", "Trendovi"],
          ] as [string, string][]
        ).map(([key, label], i) => (
          <button
            key={key}
            onClick={() => setViewMode(key as any)}
            style={{
              padding: "9px 20px",
              border: "none",
              borderLeft: i > 0 ? "1.5px solid #e2e8f0" : "none",
              background:
                viewMode === key
                  ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                  : "#fff",
              color: viewMode === key ? "#fff" : "#64748b",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "24px",
          alignItems: "center",
        }}
      >
        {["all", "individual", "group"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px",
              borderRadius: "20px",
              border:
                filter === f ? "2px solid #6366f1" : "1.5px solid #e2e8f0",
              background:
                filter === f
                  ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                  : "#fff",
              color: filter === f ? "#fff" : "#64748b",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.25s",
              whiteSpace: "nowrap",
            }}
          >
            {f === "all"
              ? "Sve"
              : f === "individual"
                ? "Individualne"
                : "Grupne"}
          </button>
        ))}
        <span style={{ width: "1px", height: "24px", background: "#e2e8f0" }} />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: "8px 14px",
            borderRadius: "20px",
            border: "1.5px solid #e2e8f0",
            fontSize: "13px",
            color: "#64748b",
            fontFamily: "inherit",
            fontWeight: 500,
            cursor: "pointer",
            background: "#fff",
            minWidth: "160px",
          }}
        >
          <option value="all">— Filtriraj po klijentu —</option>
          {filterOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div
        className="dash-cards-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "14px",
          marginBottom: "28px",
        }}
      >
        <div style={cardStyle(0)}>
          <div style={iconBox("linear-gradient(135deg, #eef2ff, #e0e7ff)")}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 2px",
            }}
          >
            <AnimatedNumber value={stats.total} />
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
            }}
          >
            Ukupno sesija
          </p>
        </div>
        <div style={cardStyle(80)}>
          <div style={iconBox("linear-gradient(135deg, #ecfdf5, #d1fae5)")}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="2"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 2px",
            }}
          >
            <AnimatedNumber value={stats.totalRev} suffix=" RSD" />
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
            }}
          >
            Ukupan prihod
          </p>
        </div>
        <div style={cardStyle(160)}>
          <div style={iconBox("linear-gradient(135deg, #f0fdf4, #dcfce7)")}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22c55e"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 2px",
            }}
          >
            <AnimatedNumber value={stats.paidRev} suffix=" RSD" />
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
            }}
          >
            Naplaćeno ({stats.paidCount})
          </p>
        </div>
        <div style={cardStyle(240)}>
          <div style={iconBox("linear-gradient(135deg, #fffbeb, #fef3c7)")}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 2px",
            }}
          >
            <AnimatedNumber value={stats.unpaidRev} suffix=" RSD" />
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
            }}
          >
            Nenaplaćeno ({stats.unpaidCount})
          </p>
        </div>
        <div style={cardStyle(320)}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "4px",
            }}
          >
            <CircularProgress percent={stats.paidPct} size={56} stroke={5} />
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
              textAlign: "center",
            }}
          >
            Naplata
          </p>
        </div>
        <div style={cardStyle(400)}>
          <div style={iconBox("linear-gradient(135deg, #faf5ff, #ede9fe)")}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
            >
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 2px",
            }}
          >
            <AnimatedNumber value={stats.thisWeek} />
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              fontWeight: 500,
              margin: 0,
            }}
          >
            Ove nedelje
            {stats.weekChange !== 0 && (
              <span
                style={{
                  color: stats.weekChange > 0 ? COLORS.green : COLORS.red,
                  marginLeft: "6px",
                  fontSize: "12px",
                }}
              >
                {stats.weekChange > 0 ? "↑" : "↓"}
                {Math.abs(Math.round(stats.weekChange))}%
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {viewMode === "overview" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
            marginBottom: "24px",
          }}
          className="dash-grid-2"
        >
          {/* Monthly Revenue */}
          <div style={chartCard} className="dash-chart-card">
            <h4 style={chartTitle}>Mesečni prihod</h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {monthlyStats.map((m, i) => {
                const paidW = (m.paid / maxMonthly) * 100;
                const unpaidW = ((m.total - m.paid) / maxMonthly) * 100;
                return (
                  <div
                    key={m.month}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#64748b",
                        minWidth: "90px",
                        fontWeight: 500,
                      }}
                    >
                      {m.month}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "26px",
                        background: "#f1f5f9",
                        borderRadius: "8px",
                        overflow: "hidden",
                        display: "flex",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: unpaidW > 0 ? "8px 0 0 8px" : "8px",
                          background:
                            "linear-gradient(135deg, #22c55e, #16a34a)",
                          width: `${paidW}%`,
                          transition: `width 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`,
                        }}
                      />
                      <div
                        style={{
                          height: "100%",
                          borderRadius: paidW > 0 ? "0 8px 8px 0" : "8px",
                          background:
                            "linear-gradient(135deg, #fbbf24, #f59e0b)",
                          width: `${unpaidW}%`,
                          transition: `width 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 80 + 100}ms`,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                        minWidth: "75px",
                        textAlign: "right",
                      }}
                    >
                      {m.total.toLocaleString()} RSD
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginTop: "14px",
                fontSize: "12px",
                color: "#94a3b8",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: "#22c55e",
                  }}
                />
                Naplaćeno
              </span>
              <span
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: "#fbbf24",
                  }}
                />
                Nenaplaćeno
              </span>
            </div>
          </div>

          {/* Donut + Radar */}
          <div style={chartCard} className="dash-chart-card">
            <h4 style={chartTitle}>Aktivnost klijenata</h4>
            {radarData.labels.length >= 3 ? (
              <RadarChart
                labels={radarData.labels}
                values={radarData.values}
                color={COLORS.indigo}
                size={220}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px 0",
                }}
              >
                <svg width="120" height="120" viewBox="0 0 120 120">
                  {(() => {
                    const total = stats.ind + stats.grp || 1;
                    const indPct = stats.ind / total;
                    const r = 48,
                      c = 2 * Math.PI * r;
                    return (
                      <>
                        <circle
                          cx="60"
                          cy="60"
                          r={r}
                          fill="none"
                          stroke="#e2e8f0"
                          strokeWidth="12"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r={r}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="12"
                          strokeDasharray={`${indPct * c} ${c}`}
                          strokeLinecap="round"
                          style={{
                            transform: "rotate(-90deg)",
                            transformOrigin: "60px 60px",
                            transition: "stroke-dasharray 1s",
                          }}
                        />
                        <text
                          x="60"
                          y="56"
                          textAnchor="middle"
                          fontSize="18"
                          fontWeight="700"
                          fill="#0f172a"
                        >
                          {stats.total}
                        </text>
                        <text
                          x="60"
                          y="72"
                          textAnchor="middle"
                          fontSize="11"
                          fill="#94a3b8"
                        >
                          sesija
                        </text>
                      </>
                    );
                  })()}
                </svg>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "2px",
                      }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "3px",
                          background: "#6366f1",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        Individualne
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    >
                      {stats.ind}
                    </span>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "2px",
                      }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "3px",
                          background: "#f59e0b",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        Grupne
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    >
                      {stats.grp}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Heatmap */}
          <div
            style={{ ...chartCard, gridColumn: "1 / -1" }}
            className="dash-chart-card"
          >
            <h4 style={chartTitle}>Raspored sesija (heatmap po satima)</h4>
            <HeatmapChart data={heatmapData} />
          </div>
        </div>
      )}

      {/* ===== CLIENTS TAB ===== */}
      {viewMode === "clients" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
            marginBottom: "24px",
          }}
          className="dash-grid-2"
        >
          {/* Bar chart */}
          <div
            style={{ ...chartCard, gridColumn: "1 / -1" }}
            className="dash-chart-card"
          >
            <h4 style={chartTitle}>Prihod po klijentu / grupi</h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {clientStats.map((c, i) => {
                const paidW = (c.paid / maxClientTotal) * 100;
                const totalW = (c.total / maxClientTotal) * 100;
                const pct =
                  c.total > 0 ? Math.round((c.paid / c.total) * 100) : 0;
                return (
                  <div
                    key={c.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#64748b",
                        minWidth: "130px",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={c.name}
                    >
                      {c.isGroup ? "👥 " : "👤 "}
                      {c.name}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "26px",
                        background: "#f1f5f9",
                        borderRadius: "8px",
                        overflow: "hidden",
                        display: "flex",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: paidW < totalW ? "8px 0 0 8px" : "8px",
                          background:
                            "linear-gradient(135deg, #22c55e, #16a34a)",
                          width: `${paidW}%`,
                          transition: `width 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms`,
                        }}
                      />
                      <div
                        style={{
                          height: "100%",
                          borderRadius: paidW > 0 ? "0 8px 8px 0" : "8px",
                          background:
                            "linear-gradient(135deg, #fbbf24, #f59e0b)",
                          width: `${totalW - paidW}%`,
                          transition: `width 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 60 + 80}ms`,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        minWidth: "110px",
                        textAlign: "right",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#166534" }}>
                        {c.paid.toLocaleString()}
                      </span>
                      <span style={{ color: "#94a3b8" }}>
                        {" "}
                        / {c.total.toLocaleString()}
                      </span>
                      <span
                        style={{
                          color:
                            pct === 100
                              ? COLORS.green
                              : pct > 0
                                ? COLORS.amber
                                : COLORS.red,
                          fontWeight: 600,
                          marginLeft: "6px",
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginTop: "14px",
                fontSize: "12px",
                color: "#94a3b8",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: "#22c55e",
                  }}
                />
                Naplaćeno (RSD)
              </span>
              <span
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "3px",
                    background: "#fbbf24",
                  }}
                />
                Nenaplaćeno (RSD)
              </span>
            </div>
          </div>

          {/* Top clients ranking */}
          <div style={chartCard} className="dash-chart-card">
            <h4 style={chartTitle}>Top klijenti po broju sesija</h4>
            {clientStats.slice(0, 5).map((c, i) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom: i < 4 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background:
                      i === 0
                        ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                        : i === 1
                          ? "linear-gradient(135deg, #d1d5db, #9ca3af)"
                          : i === 2
                            ? "linear-gradient(135deg, #d97706, #b45309)"
                            : "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: i < 3 ? "#fff" : "#64748b",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#1e293b",
                    }}
                  >
                    {c.isGroup ? "👥 " : "👤 "}
                    {c.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {c.sessions} sesija · {c.total.toLocaleString()} RSD
                  </div>
                </div>
                <CircularProgress
                  percent={c.total > 0 ? (c.paid / c.total) * 100 : 0}
                  size={38}
                  stroke={3}
                />
              </div>
            ))}
          </div>

          {/* Avg price card */}
          <div style={chartCard} className="dash-chart-card">
            <h4 style={chartTitle}>Prosečna cena sesije</h4>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p
                style={{
                  fontSize: "42px",
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: "0 0 4px",
                  letterSpacing: "-1px",
                }}
              >
                <AnimatedNumber
                  value={stats.avgPrice}
                  decimals={0}
                  suffix=" RSD"
                />
              </p>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                prosek po sesiji
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "24px",
                  marginTop: "20px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: COLORS.indigo,
                      margin: "0 0 2px",
                    }}
                  >
                    {stats.ind}
                  </p>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
                    individualne
                  </p>
                </div>
                <div style={{ width: "1px", background: "#e2e8f0" }} />
                <div>
                  <p
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: COLORS.amber,
                      margin: "0 0 2px",
                    }}
                  >
                    {stats.grp}
                  </p>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
                    grupne
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TRENDS TAB ===== */}
      {viewMode === "trends" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
            marginBottom: "24px",
          }}
          className="dash-grid-2"
        >
          {/* Weekly line chart */}
          <div
            style={{ ...chartCard, gridColumn: "1 / -1" }}
            className="dash-chart-card"
          >
            <h4 style={chartTitle}>
              Nedeljni trend (sesije vs prihod u hiljadama)
            </h4>
            <LineChart
              data={weeklyTrend}
              height={220}
              color1={COLORS.indigo}
              color2={COLORS.green}
              label1="Broj sesija"
              label2="Prihod (×1000 RSD)"
            />
          </div>

          {/* Radar */}
          {radarData.labels.length >= 3 && (
            <div style={chartCard} className="dash-chart-card">
              <h4 style={chartTitle}>Radar aktivnosti (top 6 klijenata)</h4>
              <RadarChart
                labels={radarData.labels}
                values={radarData.values}
                color={COLORS.purple}
                size={240}
              />
            </div>
          )}

          {/* Payment method breakdown */}
          <div style={chartCard} className="dash-chart-card">
            <h4 style={chartTitle}>Način plaćanja</h4>
            {(() => {
              const methods: Record<string, number> = {};
              filtered.forEach((s) => {
                if (!s.placeno) return;
                // We don't have nacin_placanja on session, count from paid sessions
                methods["Plaćeno"] = (methods["Plaćeno"] || 0) + 1;
              });
              const unpaid = filtered.filter((s) => !s.placeno).length;
              const total = filtered.length || 1;
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    padding: "10px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#64748b",
                        minWidth: "90px",
                        fontWeight: 500,
                      }}
                    >
                      Plaćeno
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "26px",
                        background: "#f1f5f9",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "8px",
                          background:
                            "linear-gradient(135deg, #22c55e, #16a34a)",
                          width: `${(stats.paidCount / total) * 100}%`,
                          transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#166534",
                        minWidth: "50px",
                        textAlign: "right",
                      }}
                    >
                      {stats.paidCount}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#64748b",
                        minWidth: "90px",
                        fontWeight: 500,
                      }}
                    >
                      Neplaćeno
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "26px",
                        background: "#f1f5f9",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "8px",
                          background:
                            "linear-gradient(135deg, #fbbf24, #f59e0b)",
                          width: `${(stats.unpaidCount / total) * 100}%`,
                          transition:
                            "width 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#92400e",
                        minWidth: "50px",
                        textAlign: "right",
                      }}
                    >
                      {stats.unpaidCount}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "14px",
                      background: "#f8fafc",
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "#0f172a",
                        margin: "0 0 2px",
                      }}
                    >
                      {Math.round(stats.paidPct)}%
                    </p>
                    <p
                      style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}
                    >
                      ukupna stopa naplate
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Heatmap again for trends */}
          <div
            style={{ ...chartCard, gridColumn: "1 / -1" }}
            className="dash-chart-card"
          >
            <h4 style={chartTitle}>Kada se sesije najčešće zakazuju</h4>
            <HeatmapChart data={heatmapData} />
          </div>
        </div>
      )}

      {/* Sessions Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid #f1f5f9",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 22px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <h4
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#334155",
              margin: 0,
            }}
          >
            Poslednje sesije
          </h4>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            {filtered.length} rezultata
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr>
                {[
                  "Klijent / Grupa",
                  "Datum",
                  "Vreme",
                  "Cena",
                  "Status",
                  "Plaćeno",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 15).map((s, i) => {
                const d = s.pocetak ? new Date(s.pocetak) : null;
                const dEnd = s.kraj ? new Date(s.kraj) : null;
                return (
                  <tr
                    key={s.id || i}
                    className="dash-row"
                    style={{ transition: "background 0.15s" }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                        fontWeight: 600,
                      }}
                    >
                      {s.grupa_id ? "👥 " : "👤 "}
                      {s.klijent_ime || "—"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                        color: "#334155",
                      }}
                    >
                      {d
                        ? d.toLocaleDateString("sr-Latn", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                        color: "#334155",
                      }}
                    >
                      {d
                        ? d.toLocaleTimeString("sr-Latn", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {dEnd
                        ? ` – ${dEnd.toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {(s.cena || 0).toLocaleString()} RSD
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background:
                            s.status === "zakazano"
                              ? "#dbeafe"
                              : s.status === "zavrseno"
                                ? "#dcfce7"
                                : s.status === "otkazano"
                                  ? "#fee2e2"
                                  : "#f3f4f6",
                          color:
                            s.status === "zakazano"
                              ? "#1e40af"
                              : s.status === "zavrseno"
                                ? "#166534"
                                : s.status === "otkazano"
                                  ? "#991b1b"
                                  : "#374151",
                        }}
                      >
                        {s.status === "zakazano"
                          ? "Zakazano"
                          : s.status === "zavrseno"
                            ? "Završeno"
                            : s.status === "otkazano"
                              ? "Otkazano"
                              : s.status || "—"}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f8fafc",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: s.placeno ? "#dcfce7" : "#fef3c7",
                          color: s.placeno ? "#166534" : "#92400e",
                        }}
                      >
                        {s.placeno ? (
                          <>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#166534"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Da
                          </>
                        ) : (
                          "Ne"
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
