import { Link } from "react-router-dom";

export default function LegalDataDeletion() {
  return (
    <div className="auth-shell auth-shell--legal-doc">
      <div className="auth-shell__panel">
        <main className="auth-shell__card legal-doc">
          <h1 className="legal-doc__title">User Data Deletion Instructions</h1>

          <p className="legal-doc__lede">
            If you want your data deleted from Next Step International services, please send an email to:{" "}
            <a href="mailto:shahzaman2800@gmail.com" className="auth-link-accent">
              shahzaman2800@gmail.com
            </a>
          </p>

          <h2 className="legal-doc__h2">Include</h2>
          <ul className="legal-doc__list">
            <li>Your WhatsApp number</li>
            <li>Your full name</li>
            <li>Reason for deletion request</li>
          </ul>

          <p className="legal-doc__p">We will delete your data within 7 business days.</p>

          <p className="legal-doc__meta legal-doc__meta--after-body">Last updated: May 2026</p>

          <p className="legal-doc__footer">
            <Link to="/" className="auth-link-muted">
              ← Back to sign in
            </Link>
            {" · "}
            <Link to="/privacy" className="auth-link-muted">
              Privacy policy
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
