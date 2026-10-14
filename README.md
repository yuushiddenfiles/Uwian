# Uwian (U-wee-ahn)

Student Hangout Discovery and Safe Commute Network

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg?style=flat-square)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg?style=flat-square)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19.x-blue.svg?style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-purple.svg?style=flat-square)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg?style=flat-square)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/Database-better--sqlite3-blue.svg?style=flat-square)](https://github.com/WiseLibs/better-sqlite3)
[![Leaflet](https://img.shields.io/badge/Mapping-Leaflet.js-brightgreen.svg?style=flat-square)](https://leafletjs.com/)
[![Tests](https://img.shields.io/badge/Tests-18%20Passed-success.svg?style=flat-square)](uwian/package.json)

---

## Overview

In Filipino culture, "Uwian" refers to heading home at the end of the day or night.

For commuting university students and young adults in Metro Manila, gathering with friends (*barkada*) often ends late at night. Leaving tambayan spots presents real logistical and safety friction: unsafe transit corridors along major routes, lack of arrival accountability, peer pressure around splitting alcohol tabs, and difficulty coordinating escorts across shared transit lines.

Uwian is a full-stack social safety and hangout platform engineered for student circles. It combines verified hangout discovery, transparent tab splitting with non-drinker protections, real-time transit corridor buddy pairing, automated arrival check-in escalation, direct and group messaging with live coordinate pins, and a dedicated platform moderation console.

---

## Core Problem and Technical Solutions

| Challenge | Engineering Solution |
|---|---|
| Late-night transit risks and commute anxiety | Direction-aware commute buddy pairing groups students by transit route (LRT-1, MRT-3, Commonwealth, Katipunan, Taft) with automated check-in countdown timers. |
| Unvouched strangers entering private circles | Two-tier identity verification requires 18+ birthdate validation, government or student ID document review, and mutual member vouches. |
| Alcohol peer pressure and unfair bill splits | Mathematical bill isolation in `shared/split.js` automatically excludes non-drinkers from alcohol lines, dividing only food and non-alcoholic items among them. |
| Bilateral debt confusion across groups | Cash settlement engine in `shared/settle.js` resolves multi-payer balances and calculates the minimal number of direct transfers using greedy cash-flow simplification. |
| Unanswered "text me when you get home" texts | Three-stage escalation state machine triggers automated notifications to the student, then to commute buddies (+30 min), then to operators and emergency contacts (+60 min). |
| Unregulated tambayan locations | Community spot suggestion engine lets students propose verified spots with coordinates, operating hours, and price tiers, moderated by platform operators. |

---

## Complete Feature Inventory

### 1. Identity, Verification, and Trust System
- **Mandatory 18+ Age Gating (`server/src/lib/authz.js`)**: Registration computes exact age from birthdate records, rejecting underage accounts.
- **Terms of Service and Safety Agreement Gate (Migration `m005`)**: Users must accept the explicit community safety policy (`tos_accepted_at`) before accessing verification features.
- **Three-Tier Trust Lifecycle (`server/src/db.js`, `web/src/components/sheets.jsx`)**:
  - `unverified`: Account created, profile browsable, restricted from broadcasting live GPS and creating public sessions.
  - `pending`: ID document submitted to the operator queue, under active review.
  - `verified`: ID approved by staff, full access to location broadcast, spot submissions, and vouching.
- **Document Photo Upload and Inspection (Migration `m006`)**:
  - Client-side image selection or camera capture with HTML5 Canvas downscaling to preserve bandwidth.
  - Stored as data URLs in SQLite for staff review. Supports Student ID, National ID, UMID, Passport, and Driver's License.
- **Double-Vouch Trust Tree (`server/src/index.js`)**:
  - Existing verified members can vouch for incoming members.
  - Two-strike accountability system: misconduct or false vouch reports issue verifiable strikes; two strikes result in automatic vouch revocation.
- **Discord-Style Handles and User Vibes (Migration `m010`)**:
  - Unique discriminator format (`handle#12345`) for privacy-safe friend lookups.
  - Custom vibe bios indicating campus, transit route, and hangout preferences.

### 2. Hangout Sessions and Event Lifecycle
- **Five-Stage Session State Machine (`server/src/db.js`)**:
  - `planning`: Session created, spot designated, RSVP invitations open.
  - `open`: Gathering is currently active at the venue.
  - `wrapped`: Bill settled, gathering ended, commute buddy pairing initiated.
  - `commute_active`: Members are actively in transit home; check-in timers run.
  - `home_safe`: All attendees have checked in or escalations have completed.
- **Custom Session Banners (Migration `m011`)**:
  - Organizers can upload custom cover banners (`cover_url`) or use generative spot artwork based on venue category.
- **Deep-Linked Session Chat (Migration `m008`)**:
  - Each session automatically provisions a dedicated group conversation thread. Attendees switch directly between session details and live event chat.

### 3. Commute Buddy Pairing and Automated Escalation
- **Transit Route Grouping Algorithm (`server/src/index.js`)**:
  - Clusters attendees by transit corridors: LRT-1, MRT-3, Taft Avenue, Katipunan, Commonwealth, C5, and South corridors.
- **Buddy Pairing Math (`shared/safety.js`)**:
  - Partitions attendees into pairs. Odd numbers automatically resolve into a trio so no individual is left traveling alone.
- **Timed Escalation Protocol**:
  - Step 1 (Threshold Deadline): System sends notification to the traveler requesting check-in confirmation.
  - Step 2 (+30 minutes overdue): System flags overdue status and notifies assigned commute buddy pair with transit route details.
  - Step 3 (+60 minutes overdue): System notifies platform operators in the moderation console and dispatches designated emergency contact alerts.

### 4. Algorithmic Tab Splitting and Debt Minimization
- **Non-Drinker Bill Isolation (`shared/split.js`)**:
  - Non-drinkers (`can_drink: 0`) and designated drivers are strictly omitted from alcohol liabilities.
  - Food items, appetizers, and venue charges are split equally among all attendees.
- **Deterministic Centavo Accounting**:
  - Leftover centavos from fractional division are distributed deterministically across attendees.
  - Strict invariant: zero centavos are lost, invented, or rounded away across any headcount or split combination.
- **Greedy Cash-Flow Minimization (`shared/settle.js`)**:
  - Aggregates multi-payer receipts, computing net balances per participant.
  - Reduces complex web of debts to the minimal possible bilateral payment transactions.
- **Edit-After-Close Ledger Safety**:
  - When a host edits expenses after closing, previously settled and paid transfers remain locked; only open transfers recompute.

### 5. Hangganan: Privacy-Preserving Budget and Intoxication Nudges
- **Private Limits**: Users set personal spending caps (in centavos) and drink limits without broadcasting them to group members.
- **Autonomous Nudges (`server/src/index.js`)**:
  - 80% threshold: triggers an "approaching limit" warning.
  - 100% threshold: triggers an "at limit" warning.
  - Stored strictly in isolated user rows to prevent social peer pressure.

### 6. Interactive Geospatial Tambayan Radar
- **Leaflet.js Map Architecture (`web/src/components/session-live-map.jsx`, `web/src/pages/map.jsx`)**:
  - Map container isolated in a distinct stacking context to eliminate z-index leakage across modals and drawers.
  - Custom dark and light CartoDB tile layers with theme synchronization.
- **Verified Spot Markers**:
  - Displays tambayan pins with operating hours, closing time countdowns, price tiers (₱ to ₱₱₱₱), and route tags.
- **Live Attendee GPS Tracking (Migration `m009`)**:
  - Attendees can broadcast location coordinates during active sessions.
  - Shows GPS accuracy radius and user avatars.
  - Pins with updates older than 2 minutes automatically fade to indicate stale positioning.
  - Location broadcast toggle allows members to start or stop sharing coordinates instantly.
- **Community Spot Suggestion Flow (Migration `m004`)**:
  - Members can submit new spots with name, GPS coordinates, price bracket, closing hours, and venue notes.
  - Enters the operator moderation queue for review before public visibility.

### 7. Real-Time Chat and Geolocation Dropping
- **Direct and Group Messaging (Migration `m003`)**:
  - Conversation channels for both 1-on-1 direct messaging and session-wide barkada chats.
  - Read receipts tracked via `last_read_at` with unread notification badges.
- **Chat Location Pins (Migration `m007`)**:
  - Verified members can drop geographic location pins directly in chat threads.
  - Messages carry `lat` and `lng` metadata rendered as interactive map mini-previews.

### 8. Find Friends and Social Discovery
- **Swipeable Friend Discovery Stack (`web/src/components/FindFriendsStack.jsx`)**:
  - Card deck presenting student members with animated drag and swipe dismissal.
  - Displays user avatar, handle, mutual circles, and location bio.
- **Bidirectional Friend System (Migration `m010`)**:
  - Friend request dispatch, incoming request management, acceptance, and rejection states.

### 9. Operator Moderation Console (`/admin`)
- **Role-Based Staff Access (`users.role = 'admin'`)**:
  - Distinct operator console separate from crew-level admin controls.
- **ID Verification Queue (`web/src/pages/admin.jsx`)**:
  - Side-by-side inspection of submitted ID photos, legal names, and birthdates.
  - One-click approve and reject actions with operator audit notes.
- **Spot Submission Moderation**:
  - Review community tambayan recommendations, inspect location coordinates on map, approve or discard.
- **Safety Incident Queue**:
  - Review member misconduct reports, investigate session context, apply strikes, or suspend accounts.

### 10. Web Audio Synthesizer Engine
- **Tactile Sound System (`web/src/lib/sound.js`)**:
  - Zero-asset Web Audio API synthesizer generating real-time acoustic feedback.
  - Dedicated sound designs: tactile clicks, modal pops, subtle switch toggles, and gentle arrival chimes.
  - Global sound toggle with local storage persistence.

---

## Design System and Motion Architecture

The primary client (`uwian/web`) uses a neobrutalism blue design system documented in `uwian/DESIGN.md`:

```
Palette:
- Primary Canvas: #eff6ff (soft light blue)
- Primary Accent: #2563eb (cobalt blue)
- Deep Ink:       #0a1b3a (navy contrast)
- Card Surfaces:  #ffffff with 2px solid #000000 borders and 4px offset ink shadows
- Glass Accents:  88% surface opacity with backdrop blur (Glass-70 standard)

Typography:
- Display Wordmark: Fraunces (wonk/soft serif)
- Headings & Accents: Archivo Black (marquee strips) and Caveat (handwritten notes)
- Data & Financials: Space Mono (amounts, splits, receipts, coordinates)
- Body Copy: DM Sans (neutral interface clarity)
```

- **Interactive Hero Entrance**: Inline SVG gradient wordmarks (ElevateWord) with canvas baseline alignment, paired with an ElasticMesh interactive squishable brand stamp.
- **WebGL PixelSnow**: Lightweight WebGL snow shader rendered behind containers, automatically halted when the user enables `prefers-reduced-motion`.
- **TargetCursor**: Fine-pointer corner bracket interaction active across interactive surfaces.
- **Morphing Sticky Navigation**: Fixed top header stage that morphs into a centered floating glass pill on scroll down, with staggered icon animations.
- **Lenis Smooth Scrolling**: Decoupled smooth wheel scrolling synchronized with GSAP ScrollTrigger reveals.
- **AccordionGallery**: Keyboard-navigable SVG vector view selector switching between Calendar, Crew, Radar, and Bento Overview.
- **Accessibility & Contrast**: Built to WCAG AA contrast ratios, visible focus outlines, full keyboard navigation (Tab, Enter, Space, Escape modal dismissal), and reduced-motion kill-switches.

---

## Technical Stack

```
uwian/
├── server/                     # Backend API & Database
│   ├── src/
│   │   ├── index.js            # Express 5 REST API & session endpoints
│   │   ├── db.js               # SQLite connection & migrations m001-m011
│   │   └── lib/
│   │       ├── authz.js        # Bcrypt password hashing & 18+ validation
│   │       └── authz.test.js   # Authorization unit tests
│   ├── seed.js                 # Database seeder for demo accounts & spots
│   ├── make-admin.js           # CLI script to create/promote platform operators
│   └── uwian.sqlite            # Pre-seeded SQLite database
├── web/                        # Primary Client (React + Vite + Tailwind)
│   ├── src/
│   │   ├── components/         # UI Primitives, Live Map, Friend Stack, Sheets
│   │   ├── pages/              # Dashboard, Map, Session, Messages, Admin, Auth
│   │   ├── lib/                # API client, Geolocation, Sound, Utils
│   │   ├── App.jsx             # Hash router, boot sequences, notifications
│   │   └── main.jsx            # React root mount
│   ├── package.json
│   └── vite.config.js
├── shared/                     # Shared Business Logic & Algorithms
│   ├── split.js                # Bill isolation & centavo distribution algorithm
│   ├── split.test.js           # Split unit tests & randomized invariants
│   ├── settle.js               # Debt minimization cash-flow graph algorithm
│   ├── settle.test.js          # Settle unit tests
│   ├── safety.js               # Commute pairing & escalation state machine
│   ├── safety.test.js          # Commute safety unit tests
│   └── safety_messaging.test.js# Safety verification & chat test suite
├── client/                     # Retired Vanilla Client (Kept for rollback reference)
│   └── public/                 # Vanilla JS SPA, CSS tokens, 3D icon library
├── screenshots/                # Walkthrough captures of platform workflows
├── DESIGN.md                   # Full design system specification & motion dials
└── package.json                # Project-level scripts
```

---

## Database Migrations Log

The SQLite database (`better-sqlite3`) initializes synchronously on startup with automated, idempotent migrations:

| Migration | Purpose | Tables / Columns Added |
|---|---|---|
| `base` | Core system entities | `users`, `groups`, `group_members`, `sessions`, `session_rsvps`, `expenses`, `expense_splits`, `settlements`, `check_ins`, `vouches`, `hangganan_limits`, `audit_logs` |
| `m001` | ID verification workflow | `verification_submissions` (id_type, id_number, status, reviewed_by, reviewed_at) |
| `m002` | Safety incident reporting | `reports` (reported_id, reason, details, status, review_note) |
| `m003` | In-app messaging | `conversations`, `conversation_members`, `messages` |
| `m004` | Community tambayan suggestions | `spot_submissions` (name, lat, lng, price_range, closes_at, notes, status) |
| `m005` | Terms of service gate | `users.tos_accepted_at` |
| `m006` | ID photo document upload | `verification_submissions.id_photo` (base64 image storage) |
| `m007` | Geolocation chat messages | `messages.kind`, `messages.lat`, `messages.lng` |
| `m008` | Session-linked conversations | `conversations.session_id` |
| `m009` | Live GPS location broadcast | `live_locations` (session_id, user_id, lat, lng, accuracy, active, updated_at) |
| `m010` | User handles & friend graph | `users.handle`, `users.vibe`, `friends` (user_id, friend_id, status) |
| `m011` | Per-session custom cover photos | `sessions.cover_url` |

---

## Demo Accounts for Evaluation

The login screen features 1-click quick-fill buttons for rapid evaluation:

| Account | Role | Email | Password | Trust Status |
|---|---|---|---|---|
| **Ana Reyes** | Barkada Host & Organizer | `ana@barkada.demo` | `BarkadaDemo!2026` | Verified (Tier 1, 5 vouches) |
| **Ela Bautista** | Crew Member & Attendee | `ela@barkada.demo` | `BarkadaDemo!2026` | Verified (Tier 1, 3 vouches) |
| **Uwian Dev** | Platform Operator & Moderator | `uwiandev@uwian.dev` | `BarkadaDemo!2026` | Admin (`/admin` access) |
| **Tara Lim** | Non-Drinker & Designated Driver | `tara@barkada.demo` | `BarkadaDemo!2026` | Unverified (`can_drink: 0`) |

*(You can also sign up with any new test account; birthdate must verify as 18+).*

---

## Running the Project Locally

### 1. Prerequisites
- **Node.js** v20.x or higher
- **npm** v10.x or higher

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/yuushiddenfiles/Uwian.git
cd Uwian/uwian

# Install dependencies for server and web client
npm --prefix server install
npm --prefix web install
```

### 3. Launch Development Environment
```bash
# Terminal 1: Launch backend API server (runs at http://localhost:3000)
npm run dev:server

# Terminal 2: Launch primary React web client (runs at http://localhost:5173)
npm run dev:web
```

Open your browser:
- **Web Client**: [http://localhost:5173](http://localhost:5173)
- **API Server & Ops Console**: [http://localhost:3000/admin](http://localhost:3000/admin)

### 4. Production Build
```bash
npm run build:web
```

### 5. Running the Automated Test Suite
```bash
npm run test
```

Test output executes 18 unit tests across 6 suites validating core algorithms:
- Bill isolation math and non-drinker exclusion (`shared/split.test.js`)
- Leftover centavo deterministic invariant tests across randomized trial distributions
- Cash settlement graph debt minimization (`shared/settle.test.js`)
- Commute buddy pairing and trio fallback logic (`shared/safety.test.js`)
- Safe arrival check-in escalation state machine
- Hangganan privacy budget nudges
- Safety reporting and verification state assertions (`shared/safety_messaging.test.js`)
- Unread chat preview truncation and message indexing

---

## Platform Walkthrough Screenshots

Walkthrough screenshots documenting the platform flows are stored in the [`screenshots/`](screenshots/) directory:

- [`step0_tos.png`](screenshots/step0_tos.png): Mandatory Terms of Service and Safety Agreement modal.
- [`step1_id_info.png`](screenshots/step1_id_info.png): ID type selection and birthdate verification form.
- [`step2_photo_upload.png`](screenshots/step2_photo_upload.png): Document photo upload with client-side canvas capture.
- [`step2_preview.png`](screenshots/step2_preview.png): Document image preview prior to submission.
- [`step3_under_review.png`](screenshots/step3_under_review.png): Confirmation receipt and pending review badge.
- [`ops_console_queue.png`](screenshots/ops_console_queue.png): Platform operator verification queue on `/admin`.
- [`ops_inspector_modal.png`](screenshots/ops_inspector_modal.png): Side-by-side document inspection and approval modal.
- [`unverified_dashboard.png`](screenshots/unverified_dashboard.png): Dashboard state for unverified member.
- [`pending_dashboard.png`](screenshots/pending_dashboard.png): Dashboard state with verification pending banner.
- [`verified_account_dropdown.png`](screenshots/verified_account_dropdown.png): User profile menu with verified trust badge.
- [`verified_profile_page.png`](screenshots/verified_profile_page.png): Profile settings, friend list, handle, and trust tier.
- [`pixelsnow_active.png`](screenshots/pixelsnow_active.png): Active dashboard showing neobrutalism blue theme and PixelSnow shader.

---

Presented by the Uwian Development Team.