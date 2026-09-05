import React from "react";

interface PaymentInstructions {
  amount_rsd: number;
  bank_account: string;
  recipient: string;
  reference: string;
}

interface Props {
  everPaid: boolean;
  payment: PaymentInstructions;
  onSignOut: () => void;
}

const SubscriptionPaywall: React.FC<Props> = ({ everPaid, payment, onSignOut }) => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(160deg, #0b1120 0%, #131c31 55%, #0b1120 100%)",
        padding: 20,
        fontFamily: "var(--font-body), 'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#fff",
          borderRadius: 22,
          padding: "40px 36px",
          boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 600,
            color: "#0f172a",
            textAlign: "center",
            margin: "0 0 8px",
          }}
        >
          {everPaid ? "Pretplata je istekla" : "Probni period je istekao"}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            textAlign: "center",
            margin: "0 0 28px",
            lineHeight: 1.5,
          }}
        >
          Da nastavite da koristite kalendar, klijente i ostale alate,
          obnovite pretplatu uplatom ispod.
        </p>

        <div
          style={{
            background: "#f8fafc",
            border: "1.5px solid #e2e8f0",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>Iznos</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              {payment.amount_rsd.toLocaleString("sr-RS")} RSD / mesečno
            </span>
          </div>
          {payment.bank_account ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>Primalac</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  {payment.recipient}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>Račun</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontFamily: "var(--font-mono), monospace" }}>
                  {payment.bank_account}
                </span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 10px" }}>
              Kontaktirajte nas za detalje uplate.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>Poziv na broj</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#6366f1",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {payment.reference}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: "#94a3b8", textAlign: "center", margin: "0 0 24px", lineHeight: 1.5 }}>
          Nakon uplate, pristup se ručno aktivira u toku dana - obavestićemo
          vas kada bude spreman.
        </p>

        <button
          onClick={onSignOut}
          style={{
            width: "100%",
            padding: "12px 20px",
            border: "1.5px solid #e2e8f0",
            borderRadius: 12,
            background: "#fff",
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Odjavi se
        </button>
      </div>
    </div>
  );
};

export default SubscriptionPaywall;
