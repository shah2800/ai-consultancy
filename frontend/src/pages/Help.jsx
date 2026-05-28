import { Link } from "react-router-dom";

const sections = [
  {
    title: "Connect WhatsApp (Meta Cloud API)",
    body: (
      <>
        <p style={{ marginTop: 0 }}>
          Each workspace routes inbound WhatsApp to your CRM using your Meta app and phone number. In{" "}
          <Link to="/settings" style={{ color: "var(--accent)", fontWeight: 600 }}>Settings → WhatsApp webhook routing</Link>, enter:
        </p>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.65, color: "var(--text-2)" }}>
          <li><strong>WhatsApp Number</strong> — digits with country code (same style as in Meta).</li>
          <li><strong>Phone Number ID</strong> — from Meta → WhatsApp → API setup.</li>
          <li><strong>Verify token</strong> — a secret you choose; paste the same value in Meta&apos;s webhook verification field.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Webhook URL on your server: <code style={{ fontSize: 12 }}>GET</code> / <code style={{ fontSize: 12 }}>POST</code>{" "}
          <code style={{ fontSize: 12 }}>/webhooks/whatsapp</code> (your API base URL + that path).
        </p>
      </>
    ),
  },
  {
    title: "Lead pipeline statuses",
    body: (
      <>
        <p style={{ marginTop: 0 }}>Statuses group leads so you can filter and report consistently:</p>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.65, color: "var(--text-2)" }}>
          <li><strong>New</strong> — first contact or not yet qualified.</li>
          <li><strong>Warm</strong> — engaged, needs nurturing.</li>
          <li><strong>Hot</strong> — strong intent, prioritize follow-up.</li>
          <li><strong>Ready</strong> — ready to apply or close.</li>
          <li><strong>Converted</strong> — enrolled or won.</li>
          <li><strong>Lost</strong> — closed without conversion.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Change status from the lead profile or list as the conversation moves forward.
        </p>
      </>
    ),
  },
  {
    title: "AI priority score",
    body: (
      <>
        <p style={{ marginTop: 0 }}>
          The score (often shown as a ring or number) ranks leads so busy teams know who to call first. It combines signals such as
          engagement, timeline, and stage — higher means higher priority in lists like &quot;Top leads&quot;.
        </p>
        <p style={{ marginBottom: 0 }}>
          It&apos;s assistive, not a guarantee: always use judgment for visa-sensitive or high-value conversations.
        </p>
      </>
    ),
  },
  {
    title: "Team invites",
    body: (
      <>
        <p style={{ marginTop: 0 }}>
          Admins and managers can generate a time-limited signup link from{" "}
          <Link to="/team" style={{ color: "var(--accent)", fontWeight: 600 }}>Team</Link>.
          New users join <strong>your</strong> workspace — they don&apos;t create a separate organisation.
        </p>
        <p style={{ marginBottom: 0 }}>
          If public registration is turned off, consultants must use an invite link from their admin or from your platform operator.
        </p>
      </>
    ),
  },
];

export default function Help() {
  return (
    <div className="page-shell" style={{ maxWidth: 720 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Help &amp; FAQ
        </h1>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sections.map((s) => (
          <article
            key={s.title}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "20px 22px",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", fontFamily: "var(--font-heading)", color: "var(--text)" }}>
              {s.title}
            </h2>
            <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.65 }}>{s.body}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
