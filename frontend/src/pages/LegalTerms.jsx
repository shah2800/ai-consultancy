import { Link } from "react-router-dom";

export default function LegalTerms() {
  return (
    <div className="auth-shell auth-shell--legal-doc">
      <div className="auth-shell__panel">
        <main className="auth-shell__card legal-doc">
          <p className="legal-doc__meta">Effective date: May 11, 2026</p>
          <h1 className="legal-doc__title">Terms of Service</h1>
          <p className="legal-doc__lede">
            These Terms of Service (“Terms”) govern your use of the Next Step International CRM workspace and related
            services (the “Service”). By accessing or using the Service, you agree to these Terms.
          </p>

          <h2 className="legal-doc__h2">The Service</h2>
          <p className="legal-doc__p">
            The Service is a software tool for education consultants to manage enquiries, communications, and related
            workflow. We may update or modify features with reasonable notice where practicable.
          </p>

          <h2 className="legal-doc__h2">Accounts and access</h2>
          <p className="legal-doc__p">
            You must provide accurate registration information and keep credentials confidential. You are responsible for
            activity under your account. Workspace administrators may invite, manage, or remove users according to
            product controls.
          </p>

          <h2 className="legal-doc__h2">Acceptable use</h2>
          <p className="legal-doc__p">You agree not to:</p>
          <ul className="legal-doc__list">
            <li>use the Service unlawfully, to harass others, or to send spam or misleading messages;</li>
            <li>attempt to gain unauthorised access to systems, accounts, or data;</li>
            <li>reverse engineer, probe, or overload the Service except where applicable law forbids this restriction;</li>
            <li>use the Service in violation of Meta/WhatsApp platform terms when those channels are connected.</li>
          </ul>

          <h2 className="legal-doc__h2">Customer data</h2>
          <p className="legal-doc__p">
            You control the lead and student-related data you enter. You are responsible for having a lawful basis to
            process that data and for your own privacy notices to data subjects where required.
          </p>

          <h2 className="legal-doc__h2">Third-party services</h2>
          <p className="legal-doc__p">
            Integrations (including WhatsApp Cloud API) are subject to third-party terms. We are not responsible for
            third-party platforms or their availability.
          </p>

          <h2 className="legal-doc__h2">Disclaimers</h2>
          <p className="legal-doc__p">
            The Service is provided “as is” to the maximum extent permitted by law. We disclaim implied warranties
            where allowed. Automated or AI-assisted features are advisory; you remain responsible for decisions and
            compliance (including immigration and education advice).
          </p>

          <h2 className="legal-doc__h2">Limitation of liability</h2>
          <p className="legal-doc__p">
            To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential,
            or punitive damages, or for loss of profits, data, or goodwill. Our aggregate liability arising from these
            Terms or the Service will not exceed the amounts you paid us for the Service in the twelve (12) months
            before the claim (or, if none, fifty dollars (USD $50)).
          </p>

          <h2 className="legal-doc__h2">Suspension and termination</h2>
          <p className="legal-doc__p">
            We may suspend or terminate access for breach of these Terms, risk to security, or legal requirements.
            Provisions that by nature should survive will survive termination.
          </p>

          <h2 className="legal-doc__h2">Changes</h2>
          <p className="legal-doc__p">
            We may update these Terms by posting a revised version and updating the effective date. Continued use after
            changes become effective constitutes acceptance, where permitted by law.
          </p>

          <h2 className="legal-doc__h2">Contact</h2>
          <p className="legal-doc__p">
            For questions about these Terms:{" "}
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
            <Link to="/privacy" className="auth-link-muted">
              Privacy policy
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
