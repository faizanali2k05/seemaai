# Seema Next.js 14 Project Structure

Complete foundational project structure for Seema - Your COLP's Operating System.

## Directory Layout

```
seema-web/
│
├── src/
│   ├── app/                          # Next.js 14 App Router
│   │   ├── layout.tsx               # Root layout with sidebar, Toaster
│   │   ├── globals.css              # Global styles, Tailwind directives, utilities
│   │   ├── page.tsx                 # Home page (redirects to /dashboard)
│   │   ├── login/
│   │   │   └── page.tsx             # Login page with auth form
│   │   └── dashboard/
│   │       └── page.tsx             # Dashboard page (requires auth)
│   │
│   ├── components/
│   │   └── layout/
│   │       └── Sidebar.tsx          # Collapsible navigation sidebar (330 lines)
│   │           ├── Menu sections: Overview, Daily, Compliance, COLP Tools, Admin, Tools
│   │           ├── Expandable sections
│   │           ├── Active route highlighting
│   │           ├── User info & logout
│   │           └── Mobile responsive (hamburger menu)
│   │
│   └── lib/
│       ├── api.ts                   # Axios API client with interceptors
│       │   ├── Auto JWT token injection
│       │   ├── 401 error handling
│       │   └── Typed methods (get, post, put, patch, delete)
│       ├── store.ts                 # Zustand stores
│       │   ├── useAuthStore (user, token, auth state)
│       │   └── useUIStore (sidebar state)
│       ├── constants.ts             # App-wide constants
│       │   ├── Routes enum
│       │   ├── Status colors & labels
│       │   └── App metadata
│       └── types.ts                 # TypeScript interfaces
│           ├── User, AuthResponse, LoginRequest
│           ├── Alert, ComplianceTask, Deadline
│           ├── ComplianceStatus, UserRole enums
│           └── ApiError, PaginatedResponse types
│
├── public/                          # Static assets (placeholder)
│
├── Configuration Files
│   ├── package.json                 # Dependencies & scripts
│   ├── tsconfig.json                # TypeScript config with @ alias
│   ├── next.config.js               # Next.js config (standalone output, rewrites)
│   ├── tailwind.config.ts           # Tailwind with Seema design tokens
│   ├── postcss.config.js            # PostCSS plugins
│   ├── .eslintrc.json               # ESLint rules
│   ├── next-env.d.ts                # TypeScript environment definitions
│   └── tsconfig.json                # TypeScript configuration
│
├── Docker & Deployment
│   ├── Dockerfile                   # Multi-stage build
│   │   ├── Stage 1: deps (install dependencies)
│   │   ├── Stage 2: build (build Next.js)
│   │   └── Stage 3: runner (optimize runtime)
│   ├── .dockerignore                # Docker ignore patterns
│
├── Environment & VCS
│   ├── .env.example                 # Example environment variables
│   ├── .gitignore                   # Git ignore patterns
│
└── Documentation
    ├── README.md                    # Comprehensive project guide
    └── PROJECT_STRUCTURE.md         # This file
```

## Key Files Summary

### Configuration Files (11 files)

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: Next.js 14, React 18, TypeScript, Tailwind, Zustand, Axios, date-fns, Lucide, Toast, Recharts |
| `tsconfig.json` | TypeScript strict mode, path alias (@/ → src/), incremental builds |
| `next.config.js` | Standalone output, API rewrites to api.seemaai.co.uk |
| `tailwind.config.ts` | Custom Seema design tokens (colors, spacing, fonts) |
| `postcss.config.js` | Tailwind & Autoprefixer |
| `.eslintrc.json` | ESLint rules for Next.js |
| `next-env.d.ts` | Environment variable types |
| `.gitignore` | Standard Node.js/Next.js ignores |
| `.dockerignore` | Docker build ignores |
| `.env.example` | Example env config |
| `Dockerfile` | Multi-stage production build |

### Source Files (10 files, 1000+ lines)

#### App Routes (5 files)
- `src/app/layout.tsx` (44 lines) - Root layout with sidebar
- `src/app/page.tsx` - Home redirect
- `src/app/login/page.tsx` (161 lines) - Login form with auth
- `src/app/dashboard/page.tsx` - Dashboard page
- `src/app/globals.css` - Global styles & utilities

#### Components (1 file)
- `src/components/layout/Sidebar.tsx` (330 lines) - Collapsible sidebar with full menu

#### Libraries (4 files)
- `src/lib/api.ts` - Axios client with interceptors
- `src/lib/store.ts` - Zustand stores
- `src/lib/constants.ts` - Routes, colors, labels
- `src/lib/types.ts` - TypeScript interfaces & enums

## Sidebar Menu Structure

```
Overview
  ├── Dashboard

Daily
  ├── Staff & Training
  ├── Client Intake
  ├── Deadlines
  └── Regulatory Updates

Compliance
  ├── Alerts
  ├── SRA Audit
  ├── Remediation
  ├── Policies
  ├── Breach Log
  └── Audit Report

COLP Tools
  ├── Chasers
  ├── Evidence Locker
  ├── Supervision
  ├── Matter Checklists
  ├── SRA Return
  └── Audit Trail

Admin
  ├── Data Management
  ├── User Management
  ├── Staff Portal
  └── Email Settings

Tools
  └── Compliance Scan
```

## Design Tokens

### Colors
- **Sidebar:** `#1b2a4a` | Hover: `#243556` | Active: `#2d4470`
- **Page BG:** `#f5f6fa`
- **Primary:** `#2563eb` | Hover: `#1d4ed8`
- **Text:** Primary `#1a2233` | Secondary `#5a6478` | Muted `#8c95a6`
- **Status:** Success `#059669` | Warning `#d97706` | Error `#dc2626`

### Typography
- **Font:** Inter (via next/font)
- **Scale:** Tailwind defaults

## Getting Started

### Install & Run
```bash
npm install
npm run dev    # http://localhost:3000
```

### Build & Deploy
```bash
npm run build
npm start      # Production server

# Or Docker
docker build -t seema-web .
docker run -p 3000:3000 seema-web
```

### Type Check
```bash
npm run type-check
```

## Authentication Flow

1. User visits `/login`
2. Submits email + password
3. API returns JWT token + user data
4. Token stored in localStorage
5. User redirected to `/dashboard`
6. API client auto-injects token in all requests
7. Invalid token → redirect to `/login`

## API Integration

All requests auto-include JWT token:
```typescript
import { apiClient } from '@/lib/api';
const response = await apiClient.get('/alerts');
```

## Production Ready

✓ TypeScript strict mode
✓ Environment-based configuration
✓ Multi-stage Docker build
✓ Standalone Next.js output
✓ Mobile-responsive design
✓ Security: JWT auth, CORS
✓ Error handling & logging
✓ ESLint & type checking
✓ Tailwind CSS with purging

## Next Steps

1. Install dependencies: `npm install`
2. Configure `.env.local` with API URL
3. Run development server: `npm run dev`
4. Build pages in `/src/app/*` for each route
5. Create UI components in `/src/components/*`
6. Deploy Docker container to production
