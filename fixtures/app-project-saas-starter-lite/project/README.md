# SaaS Starter Lite -- Free NestJS + Angular Auth Boilerplate

**The free, open-source foundation for your next SaaS.** Authentication, email, and a clean dashboard -- ready to build on.

> **Want payments, multi-tenancy, Docker, AWS, and more?**
> Check out [SaaS Starter Pro](https://demo.cloudrix.io) -- the full production-ready boilerplate.

## What's Included

- Email/password authentication with JWT
- Google OAuth integration
- Password reset with email
- Email verification
- User dashboard with profile management
- Admin panel with user management
- Dark mode
- PostgreSQL with TypeORM
- Tailwind CSS + Angular standalone components
- Docker Compose for database

## What's in the Pro Version

| Feature | Lite (Free) | Starter ($149) | Pro ($249) ⭐ | Enterprise ($399) |
|---------|:-----------:|:--------------:|:----------:|:-----------------:|
| Auth (JWT, OAuth) | Yes | Yes | Yes | Yes |
| Stripe Payments | -- | Yes | Yes | Yes |
| Email Templates | Basic | 7 templates | 7 templates | 7 templates |
| Multi-tenancy | -- | -- | Yes | Yes |
| RBAC (4 roles) | -- | -- | Yes | Yes |
| Docker Compose | DB only | Full stack | Full stack | Full stack |
| BullMQ Queues | -- | -- | Yes | Yes |
| S3 File Uploads | -- | -- | Yes | Yes |
| Terraform (AWS) | -- | -- | -- | Yes |
| CI/CD Pipelines | -- | -- | -- | Yes |
| Audit Logging | -- | -- | -- | Yes |
| API Keys | -- | -- | -- | Yes |

### Get the Full Version

| Tier | Price | Best For | Get It |
|------|-------|----------|--------|
| **Starter** | $149 | Solo devs, MVPs | [Buy Starter →](https://cloudrix-saas.lemonsqueezy.com/checkout/buy/5d588d2f-2150-4bc1-8622-12038fd98cab) |
| **Pro** ⭐ | $249 | Teams, agencies | [Buy Pro →](https://cloudrix-saas.lemonsqueezy.com/checkout/buy/7d5158ae-d76c-4427-a26e-5b206f0700c7) |
| **Enterprise** | $399 | Enterprise teams | [Buy Enterprise →](https://cloudrix-saas.lemonsqueezy.com/checkout/buy/8a731ead-fd71-4c3e-a9bb-07ed213055c0) |

> All tiers include lifetime access, free updates, and a 14-day refund guarantee.

[View Demo](https://demo.cloudrix.io) · [Get Pro — $249 →](https://cloudrix-saas.lemonsqueezy.com/checkout/buy/7d5158ae-d76c-4427-a26e-5b206f0700c7)

## Quick Start

### Prerequisites
- Node.js 22+
- Docker (for PostgreSQL)

### Setup

```bash
git clone https://github.com/cloudrix-saas/saas-starter-lite.git
cd saas-starter-lite
npm install
cp .env.example .env
# Edit .env with your JWT secret (generate: openssl rand -base64 32)
docker compose up -d  # Start PostgreSQL
npm run dev           # Start API + Angular
```

### Access
| Service | URL |
|---------|-----|
| Frontend | http://localhost:4200 |
| API | http://localhost:3000/api |
| Swagger Docs | http://localhost:3000/api/docs |

## Project Structure

```
saas-starter-lite/
  apps/
    api/                    # NestJS backend
      src/
        auth/               # JWT, Google OAuth, guards, strategies
        users/              # User CRUD + admin endpoints
        email/              # Resend email service + templates
        entities/           # TypeORM entities
        config/             # Database, env validation
    web/                    # Angular frontend
      src/
        app/
          core/             # Auth service, interceptors, guards
          pages/            # Landing, auth, dashboard, 404
          shared/           # Reusable components (button, input, toast, etc.)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret for JWT access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret for JWT refresh tokens |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_USERNAME` | Yes | Database username |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | Database name |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `RESEND_API_KEY` | No | Resend.com API key for emails |

## Need More?

This lite version covers authentication basics. The **full SaaS Starter** adds everything you need for a production SaaS:

- **Stripe integration** -- subscriptions, one-time payments, webhooks, customer portal
- **Multi-tenancy** -- organizations, team invitations, role-based access
- **Background jobs** -- BullMQ queues for email, webhooks, scheduled tasks
- **File uploads** -- S3-compatible storage with pre-signed URLs
- **Infrastructure** -- Docker Compose (full stack), AWS Terraform, GitHub Actions CI/CD
- **Security** -- 2FA, magic links, audit logging, API keys, GDPR tools

[**Save 2-6 weeks of setup. Get the full boilerplate ->**](https://demo.cloudrix.io) · [Get Pro — $249 →](https://cloudrix-saas.lemonsqueezy.com/checkout/buy/7d5158ae-d76c-4427-a26e-5b206f0700c7)

## License

MIT -- Use it for anything.

---

**Built by [SaaS Starter](https://demo.cloudrix.io)**

*Skip the boring parts. [Get the full boilerplate ->](https://demo.cloudrix.io)*
