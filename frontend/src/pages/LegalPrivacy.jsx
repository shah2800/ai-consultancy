import { Link } from "react-router-dom";

export default function LegalPrivacy() {
  return (
    <div className="auth-shell auth-shell--legal-doc">
      <div className="auth-shell__panel">
        <main className="auth-shell__card legal-doc">
          <p className="legal-doc__meta">Effective date: May 11, 2026</p>
          <h1 className="legal-doc__title">Privacy policy</h1>
          <p className="legal-doc__lede">
            Next Step International (“we”, “us”) provides a study-abroad CRM workspace (the “Service”) for education
            consultants. This policy describes how we handle personal information in the Service.
          </p>

          <h2 className="legal-doc__h2">What we collect</h2>
          <ul className="legal-doc__list">
            <li>
              <strong>Account data:</strong> such as name, email, and credentials you or your organisation provides when
              you join a workspace.
            </li>
            <li>
              <strong>CRM and lead data:</strong> information your team adds about prospective students and related
              contacts (for example phone numbers, messages, notes, and application-related details).
            </li>
            <li>
              <strong>Technical data:</strong> basic logs and metadata needed to run and secure the Service (for example
              IP address, device/browser type, and timestamps), as typical for hosted web applications.
            </li>
            <li>
              <strong>WhatsApp / Meta:</strong> when you connect WhatsApp Cloud API, Meta processes data under their
              terms and policies; we receive messages and related delivery data needed to show conversations in the
              Service.
            </li>
          </ul>

          <h2 className="legal-doc__h2">Why we use it</h2>
          <p className="legal-doc__p">
            We use this information to provide, maintain, and improve the Service; to authenticate users; to deliver
            messaging features you enable; to protect accounts and investigate abuse; and to comply with law where
            applicable.
          </p>

          <h2 className="legal-doc__h2">Sharing</h2>
          <p className="legal-doc__p">
            We use service providers (such as hosting and infrastructure vendors) who process data on our instructions.
            We do not sell your personal information. Where you enable WhatsApp, Meta acts as a separate platform under
            your Meta app configuration.
          </p>

          <h2 className="legal-doc__h2">Retention</h2>
          <p className="legal-doc__p">
            We keep data while your workspace needs it and as required for security, billing, or legal obligations. Your
            organisation’s administrator may delete or export certain data according to product capabilities.
          </p>

          <h2 className="legal-doc__h2">Your choices</h2>
          <p className="legal-doc__p">
            Depending on your location, you may have rights to access, correct, or delete personal information, or to
            object to or restrict certain processing. Contact us using the details below. We may need to verify your
            request and coordinate with your workspace admin where accounts are organisation-controlled.
          </p>

          <h2 className="legal-doc__h2" id="data-deletion">
            Data deletion requests
          </h2>
          <p className="legal-doc__p">
            To request deletion of personal information connected to this Service, email us at{" "}
            <a href="mailto:shahzaman2800@gmail.com" className="auth-link-accent">
              shahzaman2800@gmail.com
            </a>{" "}
            from the address associated with your account (or describe your role and workspace), and specify what you
            want removed. We will respond within a reasonable time and may need to confirm identity or loop in your
            organisation’s admin for workspace-held records.
          </p>

          <h2 className="legal-doc__h2">International transfers</h2>
          <p className="legal-doc__p">
            Our infrastructure may process data in countries where we or our providers operate. We use appropriate
            safeguards as required by applicable law.
          </p>

          <h2 className="legal-doc__h2">Children</h2>
          <p className="legal-doc__p">
            The Service is intended for businesses and adult professionals, not for children. We do not knowingly
            collect personal information from children.
          </p>

          <h2 className="legal-doc__h2">Changes</h2>
          <p className="legal-doc__p">
            We may update this policy and will adjust the effective date above. For material changes, we will provide
            notice as appropriate (for example by email or in-product notice).
          </p>

          <h2 className="legal-doc__h2">Contact</h2>
          <p className="legal-doc__p">
            Questions about this policy:{" "}
            <a href="mailto:shahzaman2800@gmail.com" className="auth-link-accent">
              shahzaman2800@gmail.com
            </a>
            .
          </p>

          <p className="legal-doc__footer">
            <Link to="/" className="auth-link-muted">
              ← Back to sign in
            </Link>
            {" · "}
            <Link to="/terms" className="auth-link-muted">
              Terms of Service
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
