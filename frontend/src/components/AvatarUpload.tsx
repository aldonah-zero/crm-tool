import React, { useRef, useState } from "react";
import Avatar from "./Avatar";
import { resizeImageToDataUrl } from "../lib/imageUpload";

interface AvatarUploadProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  onChange: (dataUrl: string | null) => void;
  gradient?: [string, string];
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  src,
  name,
  size = 88,
  onChange,
  gradient,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Izaberite fajl slike.");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
    } catch {
      setError("Greška pri obradi slike.");
    }
  };

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <Avatar src={src} name={name} size={size} gradient={gradient} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Promeni sliku"
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "2px solid #fff",
            background: "#6366f1",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        {src && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Ukloni sliku"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "2px solid #fff",
              background: "#ef4444",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
    </div>
  );
};

export default AvatarUpload;
