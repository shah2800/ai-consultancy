export default function LeadCard({ lead }) {

  const openWhatsApp = () => {
    const phone = lead.phone;

    const message = `Hi, this is Next Step International. I saw your inquiry about studying abroad.`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");
  };

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: 15,
        marginBottom: 10,
        borderRadius: 8,
        background: lead.status === "hot" ? "#ffe5e5" : "#fff"
      }}
    >
      <h4>{lead.phone}</h4>

      <p>Country: {lead.countryInterest || "Not set"}</p>
      <p>Status: {lead.status}</p>
      <p>Score: {lead.score}</p>
      <p>Last: {lead.lastMessage}</p>

      <button
        onClick={openWhatsApp}
        style={{
          marginTop: 10,
          padding: "8px 12px",
          background: "#25D366",
          color: "#fff",
          border: "none",
          borderRadius: 5,
          cursor: "pointer"
        }}
      >
        💬 Chat on WhatsApp
      </button>
    </div>
  );
}