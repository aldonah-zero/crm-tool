import React, { useEffect, useState } from "react";
import axios from "axios";
import { SPECIALTY_TAGS } from "../lib/specialtyTags";

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

const WEEKDAYS = [
  { key: "0", label: "Ponedeljak" },
  { key: "1", label: "Utorak" },
  { key: "2", label: "Sreda" },
  { key: "3", label: "Četvrtak" },
  { key: "4", label: "Petak" },
  { key: "5", label: "Subota" },
  { key: "6", label: "Nedelja" },
];

interface DayHours {
  active: boolean;
  start: string;
  end: string;
}

type WorkingHours = Record<string, DayHours>;

const defaultWorkingHours = (): WorkingHours =>
  Object.fromEntries(
    WEEKDAYS.map((d) => [
      d.key,
      { active: Number(d.key) < 5, start: "09:00", end: "17:00" },
    ]),
  );

const ClientProfileSettings: React.FC = () => {
  const [practiceName, setPracticeName] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHours>(
    defaultWorkingHours(),
  );
  const [defaultPrice, setDefaultPrice] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${backendBase}/tenant/settings`);
        setPracticeName(res.data.name || "");
        setSpecialties(res.data.specialties || []);
        if (
          res.data.working_hours &&
          Object.keys(res.data.working_hours).length > 0
        ) {
          setWorkingHours({ ...defaultWorkingHours(), ...res.data.working_hours });
        }
        if (res.data.default_price != null) {
          setDefaultPrice(String(res.data.default_price));
        }
      } catch (err) {
        console.error("Error loading tenant settings:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleTag = (slug: string) => {
    setSpecialties((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  };

  const updateDay = (key: string, patch: Partial<DayHours>) => {
    setWorkingHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await axios.put(`${backendBase}/tenant/settings`, {
        name: practiceName.trim() || null,
        specialties,
        working_hours: workingHours,
        default_price: defaultPrice ? Number(defaultPrice) : null,
      });
      setMessage({ text: "Sačuvano!", type: "success" });
    } catch (err) {
      console.error("Error saving tenant settings:", err);
      setMessage({ text: "Greška pri čuvanju.", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          border: "1px solid #e5e7eb",
        }}
      >
        <p style={{ fontSize: 13, color: "#64748b" }}>Učitavanje...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 24,
        border: "1px solid #e5e7eb",
      }}
    >
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>
        Vaš profil za klijente
      </h3>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
        Ovo određuje da li i kada se vaša praksa pojavljuje u pretrazi
        "Pronađi terapeuta" za nove klijente.
      </p>

      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
          display: "block",
          marginBottom: 8,
        }}
      >
        Naziv prakse (ovo klijenti vide u pretrazi)
      </label>
      <input
        value={practiceName}
        onChange={(e) => setPracticeName(e.target.value)}
        placeholder="Maja's Praksa"
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          fontSize: 13,
          color: "#1e293b",
          background: "#f8fafc",
          marginBottom: 24,
          boxSizing: "border-box",
          display: "block",
        }}
      />

      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
          display: "block",
          marginBottom: 8,
        }}
      >
        Oblasti kojima se bavite
      </label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {SPECIALTY_TAGS.map((tag) => {
          const active = specialties.includes(tag.slug);
          return (
            <button
              key={tag.slug}
              type="button"
              onClick={() => toggleTag(tag.slug)}
              style={{
                padding: "7px 14px",
                borderRadius: 20,
                border: active ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
                background: active ? "#6366f1" : "#fff",
                color: active ? "#fff" : "#334155",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tag.label}
            </button>
          );
        })}
      </div>

      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
          display: "block",
          marginBottom: 8,
        }}
      >
        Radno vreme
      </label>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {WEEKDAYS.map((day) => {
          const hours = workingHours[day.key];
          return (
            <div
              key={day.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#f8fafc",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: 130,
                  fontSize: 13,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={hours.active}
                  onChange={(e) =>
                    updateDay(day.key, { active: e.target.checked })
                  }
                />
                {day.label}
              </label>
              <input
                type="time"
                value={hours.start}
                disabled={!hours.active}
                onChange={(e) => updateDay(day.key, { start: e.target.value })}
                style={timeInputStyle}
              />
              <span style={{ color: "#94a3b8", fontSize: 13 }}>—</span>
              <input
                type="time"
                value={hours.end}
                disabled={!hours.active}
                onChange={(e) => updateDay(day.key, { end: e.target.value })}
                style={timeInputStyle}
              />
            </div>
          );
        })}
      </div>

      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
          display: "block",
          marginBottom: 8,
        }}
      >
        Podrazumevana cena sesije (RSD, opciono)
      </label>
      <input
        type="number"
        value={defaultPrice}
        onChange={(e) => setDefaultPrice(e.target.value)}
        placeholder="4000"
        style={{
          width: 160,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          fontSize: 13,
          color: "#1e293b",
          background: "#f8fafc",
          marginBottom: 20,
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "#6366f1",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Čuvanje..." : "Sačuvaj"}
        </button>
        {message && (
          <span
            style={{
              fontSize: 13,
              color: message.type === "success" ? "#16a34a" : "#ef4444",
              fontWeight: 600,
            }}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
};

const timeInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  fontSize: 13,
  color: "#1e293b",
  background: "#fff",
};

export default ClientProfileSettings;
