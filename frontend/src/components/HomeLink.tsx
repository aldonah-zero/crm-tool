import React from "react";

const HomeLink: React.FC = () => (
  <a
    href="/"
    style={{
      position: "absolute",
      top: 20,
      left: 24,
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
      color: "#a5b4fc",
      textDecoration: "none",
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
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
    Početna
  </a>
);

export default HomeLink;
