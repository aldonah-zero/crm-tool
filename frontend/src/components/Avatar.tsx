import React from "react";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  gradient?: [string, string];
  style?: React.CSSProperties;
}

const initials = (name?: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};

const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 48,
  gradient = ["#6366f1", "#7c3aed"],
  style,
}) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "avatar"}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.38)),
        fontFamily: "inherit",
        flexShrink: 0,
        ...style,
      }}
    >
      {initials(name)}
    </div>
  );
};

export default Avatar;
