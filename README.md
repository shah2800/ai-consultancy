# AI Consultancy CRM

A full-stack CRM for lead management, team collaboration, WhatsApp messaging, and AI-assisted replies.

## What the project does

- Authenticates workspace users (admin/manager/team roles)
- Manages leads, statuses, tags, assignments, notes, and notifications
- Supports team management and workspace invite flows
- Sends/receives WhatsApp messages and media via webhook integration
- Provides dashboards, analytics, exports (CSV/XLSX), and weekly reports

## Tech stack

- Backend: Node.js, Express, MongoDB (Mongoose), JWT, Zod
- Frontend: React + Vite

## Install

```bash
npm install
cd frontend && npm install
```

## Environment variables

1. Copy `.env.example` to `.env`.
2. Fill in real values for database, auth, AI provider, WhatsApp, and SMTP fields.

Required minimum for local startup:

- `MONGO_URI`
- `JWT_SECRET` (use 24+ random chars)
- `GROQ_API_KEY`

## Run locally

Backend:

```bash
npm start
```

Frontend:

```bash
cd frontend
npm run dev
```

## Production build

```bash
cd frontend
npm run build
```

## Screenshots

Add UI screenshots to `docs/screenshots/` and reference them here, for example:

- Login page
- Dashboard
- Lead profile conversation view

## Security notes

- Do not commit `.env` files.
- Keep API keys and passwords only in environment variables.
- Rotate `JWT_SECRET`, WhatsApp tokens, and SMTP credentials before production release.
