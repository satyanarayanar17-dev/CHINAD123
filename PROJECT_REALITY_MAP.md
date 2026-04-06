# Project Reality Map

## 1. Frontend Routes
- **Authenticated Apps**: Staff (`/clinical/*`, `/operations/*`, `/admin/*`) and Patient (`/patient/*`) dashboards are highly mature.
- **Missing Elements**: The public website layer (Homepage, Specialties, About, Contact) does not exist. `App.tsx` captures `/` and instantly redirects to `/login`.
- **Styling Pipeline**: Standardized custom Tailwind theme utilizing primary `#0fb1bd`. Tailwind V4 natively applied. 

## 2. Backend / Auth
- **JWT Bootstrapping**: Implemented, hardened, fail-fast in Production contexts.
- **Identity Linkage (Patient)**: Implemented via `/api/activation` OTP mechanism mapped effectively to `patients` ID.
- **Occ & Staff Rules**: OCC exists globally for prescriptions/notes.

## 3. The Objective Reality
The "web application" is currently just an authenticated portal silo. 
To convert this into a comprehensive *Clinical End-to-End Hospital Web Platform*, we require a public-facing unauthenticated frame that shares the branding, serves static public content, and intelligently funnels users into the `/login` or `/patient/activate` flows without disrupting the React Router DOM hierarchy currently protecting the portals.
