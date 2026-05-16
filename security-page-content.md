# Security at Seema

**Seema is built for regulated professionals. Security isn't an afterthought — it's the foundation.**

Law firms entrust Seema with sensitive compliance data. We take that responsibility seriously. This page explains exactly how we protect your firm's information.

---

## Encryption

### Data in transit

All connections to Seema use **TLS 1.2 or TLS 1.3** with strong cipher suites (ECDHE key exchange, AES-256-GCM). We enforce HTTPS everywhere — HTTP requests are automatically redirected. Our TLS configuration receives an A+ rating from SSL Labs.

We deploy **HTTP Strict Transport Security (HSTS)** with a two-year max-age, including subdomains, with preload enabled. This prevents protocol downgrade attacks and cookie hijacking.

### Data at rest

All database storage is encrypted using **AES-256** at the volume level. Database backups are encrypted using the same standard. Encryption keys are managed by our hosting provider's key management service and are rotated automatically.

---

## Infrastructure & hosting

### Where your data lives

Seema's infrastructure is hosted in the **United Kingdom**. Your compliance data never leaves the UK. This is a deliberate choice — as a product built for SRA-regulated firms, we believe your data should remain within UK jurisdiction.

Our infrastructure runs on:

- **PostgreSQL** database (encrypted, dedicated instance — not shared)
- **Redis** for background task queuing and session caching (no persistent PII stored)
- **Nginx** reverse proxy with hardened security headers and rate limiting
- **Docker** containerised services for isolation and reproducibility

### Network security

- All API requests are rate-limited to prevent abuse (configurable per endpoint)
- Security headers enforced on every response: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- Server version information is suppressed
- OCSP stapling is enabled for faster, more private certificate validation
- Camera, microphone, and geolocation permissions are explicitly denied

---

## Authentication & access control

### How authentication works

- **bcrypt** password hashing with per-user salts — passwords are never stored in plaintext
- **JWT access tokens** with 15-minute expiry, paired with 7-day refresh tokens
- **Rate limiting on login**: 5 attempts per minute per IP to prevent brute-force attacks
- Automatic session expiry and token revocation

### Role-based access control (RBAC)

Seema enforces five permission levels:

1. **COLP** — Full platform access including compliance oversight, AI features, and firm settings
2. **Partner** — Access to matters, compliance data, and reporting
3. **Solicitor** — Case-level access with compliance task visibility
4. **Admin** — User management, system configuration, and billing
5. **Staff** — Limited access to assigned tasks and training records

Every API endpoint checks both authentication and authorisation. Staff cannot access COLP-only views. Partners cannot modify firm-level settings. This is enforced server-side, not just in the UI.

---

## Data isolation (multi-tenancy)

Seema is a multi-tenant platform, but your data is completely isolated from other firms.

- Every database table includes a `firm_id` column
- Every database query is automatically filtered by the authenticated firm's ID via middleware
- There is no mechanism — in the API, the database layer, or the UI — for one firm to access another firm's data
- This isolation is enforced at the middleware level, not just at the application level

---

## AI features & data handling

Seema uses **Anthropic's Claude API** to power features like regulatory impact analysis, policy generation, compliance scanning, and the knowledge engine.

### What we send to the AI

- Your firm's profile (name, SRA number, practice areas, size) for context
- Aggregated compliance metrics (counts only — e.g., "3 overdue deadlines", not the deadline details)
- The specific text being analysed (e.g., a regulatory update you're reviewing)

### What we don't send

- Individual client names, matter details, or case files
- Staff personal data (beyond role titles for context)
- Financial information, bank details, or billing data
- Documents you haven't explicitly submitted for AI analysis

### Anthropic's data handling

Anthropic does not use API inputs to train their models. Your data is processed and discarded — it is not retained, logged for training, or shared. See [Anthropic's data usage policy](https://www.anthropic.com/privacy) for full details.

### Graceful degradation

If the AI service is unavailable or you choose not to enable it, Seema falls back to rule-based analysis. No AI features are required to use the platform — they enhance it, but the core compliance management works without them.

---

## Backup & disaster recovery

- **Daily automated backups** of all database content
- Backups are encrypted and stored in a separate location from the primary database
- **Point-in-time recovery** capability — we can restore to any moment within the backup retention window
- Backup restoration is tested regularly to verify integrity
- **Recovery time objective (RTO)**: 4 hours
- **Recovery point objective (RPO)**: 24 hours (daily backups)

---

## Incident response

We maintain a documented **Incident Response Plan** covering:

1. **Detection & classification** — severity levels from P4 (minor) to P1 (critical data breach)
2. **Containment** — immediate steps to limit impact
3. **ICO notification** — data breaches reportable under UK GDPR are notified to the ICO within 72 hours
4. **Affected firm notification** — impacted customers are notified without undue delay with clear, actionable information
5. **Remediation** — root cause analysis and permanent fixes
6. **Post-incident review** — lessons learned, updated controls, published summary

Our full Breach Notification Procedure and Incident Response Plan are available on request.

---

## Compliance & regulatory alignment

Seema is built specifically for the UK legal compliance market. Our own compliance posture reflects that:

- **UK GDPR & Data Protection Act 2018** — we maintain a Record of Processing Activities (ROPA), have completed a Data Protection Impact Assessment (DPIA), and offer a Data Processing Agreement (DPA) to all customers
- **ICO registration** — Seema Compliance Ltd is registered with the Information Commissioner's Office as a data controller
- **SRA awareness** — our platform is designed around the SRA Standards and Regulations 2019, and we monitor SRA, ICO, and Law Society updates through the same regulatory feeds our customers use

---

## Sub-processors

Seema uses a limited number of third-party services to operate the platform:

| Sub-processor | Purpose | Data accessed | Location |
|---|---|---|---|
| **Anthropic** | AI-powered compliance analysis | Firm profile, compliance metrics, submitted text | USA (no PII transferred) |
| **SendGrid** | Transactional email delivery | Recipient email addresses, email content | USA |
| **Stripe** | Subscription billing & payments | Billing contact details, payment method tokens | USA |
| **Let's Encrypt** | TLS certificate issuance | Domain name only | USA |

All sub-processors are bound by data processing agreements. We review our sub-processor list quarterly and notify customers of material changes.

---

## What we don't do

- We **never sell your data** to third parties
- We **never use your data for advertising**
- We **never access your account** without your explicit permission or a documented security reason
- We **never store passwords** in plaintext — only bcrypt hashes
- We **never share data between firms** — multi-tenancy isolation is absolute

---

## Responsible disclosure

If you discover a security vulnerability in Seema, please report it to **security@seemaai.co.uk**. We commit to:

- Acknowledging your report within 2 business days
- Providing an initial assessment within 5 business days
- Keeping you informed of our remediation progress
- Not pursuing legal action against good-faith security researchers

---

## Questions?

If you have questions about our security practices or need documentation for your firm's due diligence process (DPA, DPIA summary, sub-processor list), contact us at **security@seemaai.co.uk** or speak with your account manager.

*Last updated: April 2026*
