# Seema - Compliance Platform for UK Law Firms

Seema is a comprehensive compliance platform designed specifically for UK law firms to manage COLP (Compliance Officer for Legal Practice) operations, regulatory compliance, and legal requirements.

**Tagline:** Your COLP's Operating System

## Tech Stack

- **Framework:** Next.js 14 with TypeScript
- **Frontend:** React 18, Tailwind CSS
- **State Management:** Zustand
- **HTTP Client:** Axios
- **UI Components:** Lucide React
- **Charts & Visualization:** Recharts
- **Notifications:** React Hot Toast
- **Date Utilities:** date-fns

## Project Structure

```
seema-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with sidebar
│   │   ├── globals.css          # Global styles and utilities
│   │   ├── page.tsx             # Redirect to dashboard
│   │   ├── login/
│   │   │   └── page.tsx         # Login page
│   │   └── dashboard/
│   │       └── page.tsx         # Main dashboard
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.tsx      # Navigation sidebar
│   │   └── ui/                  # Reusable UI components
│   ├── lib/
│   │   ├── api.ts               # API client
│   │   ├── store.ts             # Zustand stores
│   │   ├── constants.ts         # App constants
│   │   └── types.ts             # TypeScript types
├── public/                      # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── postcss.config.js
├── Dockerfile                   # Multi-stage build
└── .env.example
```

## Design System

### Colors

- **Sidebar:** `#1b2a4a` (dark blue)
  - Hover: `#243556`
  - Active: `#2d4470`
- **Page Background:** `#f5f6fa` (light gray)
- **Primary:** `#2563eb` (blue)
  - Hover: `#1d4ed8`
- **Text:**
  - Primary: `#1a2233`
  - Secondary: `#5a6478`
  - Muted: `#8c95a6`
- **Status:**
  - Success: `#059669` (green)
  - Warning: `#d97706` (amber)
  - Error: `#dc2626` (red)

### Typography

- **Font Family:** Inter
- **Responsive:** Mobile-first design

## Features

### Dashboard
- Main overview page with compliance metrics
- User welcome message with role-based information

### Daily Operations
- **Staff & Training:** Manage training records and staff compliance
- **Client Intake:** Handle new client onboarding
- **Deadlines:** Track important regulatory deadlines
- **Regulatory Updates:** View latest SRA and regulatory updates

### Compliance
- **Alerts:** Critical compliance alerts and notifications
- **SRA Audit:** Manage SRA audit readiness and reports
- **Remediation:** Track remediation actions and progress
- **Policies:** Central policy repository and version control
- **Breach Log:** Data breach reporting and tracking
- **Audit Report:** Generate and view compliance audit reports

### COLP Tools
- **Chasers:** Automated follow-up system for overdue tasks
- **Evidence Locker:** Secure document storage and audit trail
- **Supervision:** Supervision records and management
- **Matter Checklists:** Pre-defined compliance checklists
- **SRA Return:** Annual SRA return management and filing
- **Audit Trail:** Complete action history and audit logs

### Admin
- **Data Management:** Bulk data operations and imports
- **User Management:** Manage users and permissions
- **Staff Portal:** Internal staff communication hub
- **Email Settings:** Configure email templates and routing

### Tools
- **Compliance Scan:** Automated compliance scanner

## Getting Started

### Prerequisites

- Node.js 18+ (for compatibility with Next.js 14)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd seema-web
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Configure environment variables:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

Create an optimized production build:

```bash
npm run build
```

### Production

Start the production server:

```bash
npm start
```

### Type Checking

Run TypeScript type checker:

```bash
npm run type-check
```

## Docker

Build the Docker image:

```bash
docker build -t seema-web:latest .
```

Run the container:

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://api.seemaai.co.uk \
  seema-web:latest
```

## API Integration

The app includes a pre-configured API client (`src/lib/api.ts`) that:
- Automatically adds JWT tokens to requests
- Handles 401 unauthorized responses
- Provides TypeScript-typed methods for all HTTP verbs

### Usage Example

```typescript
import { apiClient } from '@/lib/api';

const response = await apiClient.get('/alerts');
const data = response.data;
```

## State Management

Two Zustand stores are available:

### AuthStore
```typescript
import { useAuthStore } from '@/lib/store';

const { user, token, setUser, logout } = useAuthStore();
```

### UIStore
```typescript
import { useUIStore } from '@/lib/store';

const { sidebarOpen, toggleSidebar } = useUIStore();
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

## Authentication Flow

1. User navigates to `/login`
2. Enters email and password
3. API returns JWT token and user data
4. Token stored in localStorage
5. User redirected to dashboard
6. JWT automatically added to subsequent API requests
7. On 401 response, user redirected back to login

## Security

- JWT-based authentication
- Secure token storage (localStorage)
- Automatic token injection in API requests
- 401 error handling with re-authentication
- TypeScript strict mode enabled
- CORS-compatible API configuration

## Performance

- Next.js 14 optimizations (App Router, Server Components)
- Standalone output for containerized deployments
- Tailwind CSS with purging
- React.lazy for code splitting
- Image optimization with Next.js Image component

## Contributing

1. Create a feature branch
2. Commit changes with descriptive messages
3. Ensure TypeScript types are correct
4. Submit a pull request

## License

Proprietary - Seema Compliance Platform

## Support

For support, contact the development team.
