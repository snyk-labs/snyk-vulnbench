# LastSaaS Version Notes

## v1.2 — March 1, 2026

### Product Analytics & Telemetry (New)
- **Conversion funnel dashboard** — visualize the customer journey from visitor to paid subscriber with conversion rates at each step (Visitors → Signups → Plan Page Views → Checkouts → Paid Conversions → Upgrades)
- **SaaS KPIs** — MRR, ARR, ARPU, LTV, churn rate, trial-to-paid conversion rate, median time to first purchase, active subscriber count with trend sparklines
- **Retention cohort analysis** — weekly or monthly cohort retention heatmap tracking user engagement over time
- **Engagement metrics** — DAU/WAU/MAU for paying subscribers, average sessions per user, top features by usage, credit consumption trend
- **Custom event explorer** — browse all telemetry event types, view trend charts, filter by name and time range
- **Telemetry Go SDK** — `telemetry.Track()`, `TrackBatch()`, `TrackPageView()`, `TrackCheckoutStarted()`, `TrackLogin()` for zero-overhead in-process event recording
- **Telemetry REST API** — anonymous endpoint for page views (rate-limited at 60/min per IP) and authenticated endpoints for custom events (120/min per user)
- **Auto-instrumentation** — registration, email verification, login, checkout, subscription activation/cancellation, and plan changes tracked automatically with no configuration
- **365-day retention** with MongoDB TTL auto-expiration

### CI/CD & Testing (New)
- **GitHub Actions CI workflow** with Go build, lint, and test against a MongoDB service container
- **Codecov integration** with coverage badges (Stripe tests at 89.7% coverage)
- **Comprehensive backend test suite** — new tests across auth, middleware, Stripe, webhooks, events, models, validation, and version packages
- **Hybrid validation** — Go struct tag validation via `go-playground/validator` plus MongoDB JSON Schema enforcement across 15 collections
- Frontend test setup with Vitest

### MCP Server Improvements
- Converted from mixed read/write to **32 read-only tools** for safer AI-powered admin access (removed 5 write tools, added 16 new read-only tools including 6 PM/telemetry tools)
- Added **MCP registry manifests** and GoReleaser distribution for discoverability and easy installation
- **6 PM/telemetry tools** — `get_funnel`, `get_kpis`, `get_retention`, `get_engagement`, `get_custom_events`, `list_event_types`
- New tool categories: About, Health Metrics, Entitlement Keys, Credit Bundles, Root Members, Webhook management, PM/Telemetry

### Security Hardening
- **Timing-safe auth** — dummy bcrypt comparison on failed login to prevent account enumeration
- **Rate limit hardening** — switched IP detection from spoofable `X-Forwarded-For` to trusted `Fly-Client-IP` header; tightened MFA challenge limit from 5 to 3 attempts
- **Password reset tokens** — hashed storage (was plaintext), reduced expiry from 60 to 30 minutes, previous unused tokens revoked on new request
- **Session revocation on password change** — all sessions invalidated when password is updated
- **Billing abuse prevention** — trial abuse detection across both tenant and user history; Stripe Customer ID cross-referencing to prevent subscription reassignment; atomic webhook processing to prevent race conditions
- **Refund and dispute handling** — new webhook handlers for `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`
- **Webhook secrets encrypted at rest** with AES-256-GCM
- **NoSQL injection protection** — user input escaped in all MongoDB `$regex` queries across search endpoints
- **XSS fix** — DOMPurify sanitization for branding HTML injection; fixed XSS vulnerability in email fallback templates
- **CSV injection protection** — all CSV exports sanitized against formula injection
- **Scoped logout** — token revocation scoped to authenticated user (was previously unscoped)
- **Impersonation tightened** — token window reduced from 15 to 5 minutes
- **MFA recovery codes** — increased entropy from 5 to 16 bytes
- **Request body size limit** — 1MB cap on all API routes

### Infrastructure & Quality
- **OpenAPI 3.0 spec** served at `/api/docs` as JSON
- **Structured API errors** — machine-readable error codes with request ID for traceability
- **Request ID middleware** — unique `X-Request-ID` header on every response
- **API version header** — `X-API-Version` on all responses
- **Server-side app name injection** into index.html (eliminates title flicker on page load)
- **Structured logging** — migrated from `log.Printf` to `log/slog` across all backend packages
- **Batch query optimization** — replaced N+1 queries in admin user deletion with `$in` batch fetches
- **Reusable UI component library** — standardized Alert, Badge, Button, Card, Input, Modal, Select, Textarea primitives
- **Send Test Email** button on health dashboard for Resend integration verification

---

## v1.0 — February 25, 2026

### Initial Public Release
- Multi-tenant architecture with role-based access control (owner/admin/user)
- Three-tier admin access: user (read-only), admin (read-write), owner (destructive)
- Root Members management for the admin team
- Email/password authentication with bcrypt hashing and JWT tokens
- MFA/TOTP two-factor authentication with setup wizard and recovery codes
- Magic link passwordless login via email
- Google, GitHub, and Microsoft OAuth with automatic account linking
- Passkey/WebAuthn support for passwordless authentication
- Session management with individual and bulk session revocation
- Dark/light theme preference per user
- Email verification via Resend
- Account lockout after failed login attempts
- Stripe Checkout integration for subscription billing
- Stripe Billing Portal for customer self-service
- Per-seat pricing model with included seats, min/max seat limits
- Free trials with configurable trial days per plan
- Stripe Tax integration for automatic tax calculation
- Promotion codes and coupons with expiration dates and product restrictions
- Credit bundles for one-time credit purchases
- PDF invoice generation with company name, address, and tax breakdown
- Multi-currency support with configurable default currency
- Plan management with entitlements (boolean and numeric)
- Billing enforcement middleware
- Dual credit buckets (subscription + purchased) with configurable reset policies
- Team invitations and member management
- Ownership transfer between members
- Per-tenant activity logs
- User profile management and account deletion
- White-label branding: custom app name, tagline, logo, theme colors, fonts, favicon, media library, custom landing page, custom pages, CSS/HTML injection, configurable nav sidebar, auth page customization, dashboard HTML, Open Graph images
- Admin dashboard with user and tenant management
- Admin impersonation for debugging
- Financial dashboard with revenue, ARR, DAU, MAU time-series charting
- Onboarding flow for new users
- System-wide announcements
- In-app messaging to individual users
- CSV export for users and tenants
- System health monitoring with automatic node registration, 30-second heartbeat, metrics collection (CPU, memory, disk, network, HTTP, MongoDB, Go runtime), threshold-based alerting, real-time dashboard with time-series charts, integration health panel
- `lsk_`-prefixed API keys with admin and user authority scopes (SHA-256 hashed)
- Outgoing webhooks with 19 event types, HMAC-SHA256 signing, delivery tracking, test events
- MCP server with 16 tools for AI-powered admin access
- Built-in API documentation at `/api/docs` with interactive HTML and markdown references
- Configuration variable editor (strings, numbers, enums, templates)
- System logging with injection detection
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Rate limiting on authentication endpoints
- Refresh token rotation with family-based revocation
- CLI tools: `setup`, `start`/`stop`/`restart`, `change-password`, `send-message`, `transfer-root-owner`, `config`, `version`, `status`, `mcp`
- Dockerized deployment (Go + React + Alpine)
- Fly.io deployment configuration
- Graceful shutdown with connection draining
- Compile-time version embedding via ldflags
- Auto-versioning with database migration on startup
