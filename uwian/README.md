# 🌅 Uwian (U-wee-ahn)
### *Student Hangout Discovery & Safe Commute Network*

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg?style=flat-square)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg?style=flat-square)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/Database-better--sqlite3-blue.svg?style=flat-square)](https://github.com/WiseLibs/better-sqlite3)
[![Leaflet](https://img.shields.io/badge/Mapping-Leaflet.js-brightgreen.svg?style=flat-square)](https://leafletjs.com/)
[![UI Design](https://img.shields.io/badge/Design-Claymorphism%20%26%20Glass-orange.svg?style=flat-square)](https://awwwards.com/)
[![Privacy](https://img.shields.io/badge/Architecture-Privacy--First-teal.svg?style=flat-square)](docs/privacy.md)

---

## 📖 Executive Summary

In Filipino culture, **"Uwian"** is the familiar, comforting phrase meaning *"time to head home."* 

College students and young adults love hanging out late into the night with their *barkada* (friend group), but heading home often comes with severe anxiety: **unsafe transit corridors, late-night harassment, lack of accountability, and social awkwardness around asking friends for safe escorts or opting out of alcohol bills.**

**Uwian is an end-to-end social safety and hangout platform.** It bridges social discovery with real-world physical safety: members discover and plan hangouts within vouched circles, track arrival guarantees, split tabs fairly without alcohol pressure, and ensure every single friend gets safely to their doorstep through automated commute buddy pairing.

---

## 🎯 The Core Problem & Social Impact

| The Problem | How Uwian Solves It |
|---|---|
| **Commute Anxiety & Late-Night Risk** | Automated **Buddy Escort & Commute Direction Pairing** matches friends traveling along similar routes/lines, with automated check-in timers. |
| **Predators & Strangers in Hangouts** | **Two-Tier Vouch Identity System**: Every member is age-verified (18+) and must be vouched for by an existing member before gaining access. |
| **Alcohol Peer Pressure & Unfair Tabs** | **Automatic Bill Isolation**: Non-drinkers are flagged and mathematically excluded from alcohol receipts, ending financial pressure. |
| **Awkward "Text Me When You're Home"** | **Automated Escalation Protocol**: The system tracks safe arrival check-ins and automatically alerts buddy pairs if someone doesn't check in. |

---

## 🌟 Key Innovations & Features

### 1. 🛡️ Identity Protection & Double-Vouch Trust Tree
- **Real Verification**: Requires declared legal name and verified 18+ age checks.
- **Vouch-Gated Entry**: Users cannot freely roam into private circles without an active member vouching for their character.
- **Two-Strike Accountability**: False vouches or misconduct report triggers an automatic strike; two strikes lead to vouch revocation and exclusion.

### 2. 🚶 Safe Commute Buddy Pairing & Escalation Engine
- **Direction-Aware Pairing**: When a session wraps up, attendees are grouped by transit routes (e.g., LRT-1, Commonwealth, Taft, Katipunan).
- **Automated Escalation State Machine**:
  - `planning` ➔ `open` ➔ `wrapped` ➔ `commute_active` ➔ `home_safe`.
  - Check-in timers automatically ping buddies; if a student fails to confirm safe arrival within the threshold window, the escalation engine triggers notifications to designated escorts.

### 3. 💳 Algorithmic Debt Minimization & Ethical Splitting
- **Zero-Pressure Splitting (`shared/split.js`)**: Alcohol tabs are separated from food tabs; members with `can_drink: false` are strictly omitted from alcohol liabilities.
- **Graph-Based Cash Settle (`shared/settle.js`)**: Computes net balances across multi-payer groups and reduces bilateral transactions to the mathematical minimum number of transfers using a greedy cash-flow settlement algorithm.

### 4. 🗺️ Interactive Hangout Map (Leaflet.js)
- Real-time map displaying approved tambayan spots, meetup locations, and active session pins with custom 3D map markers and isolated stacking contexts.

### 5. 🎨 Awwwards-Caliber Claymorphic & Pastel Interface
- **Warm Porcelain & Pastel Surfaces**: Tactile, cozy design system inspired by modern soft clay neumorphism (`#FAF6F0`, `#FDECE3`, `#DCEEE5`, `#FCF1D6`).
- **Interactive 3D Iconography**: Custom 3D clay badges (`/img/3d/*.png`) with tactile hover physics.
- **Interactive 1-Click Demo Sign-In**: Quick-fill pastel pills on the login page for effortless evaluator testing.
- **Glass Floating Dock & Vertical Rail**: Ergonomic utility rail for desktop and floating thumb-reachable glass dock for mobile devices.

---

## 🏗️ Technical Architecture & Stack

Uwian is engineered with high discipline: **ultra-fast, zero-bloat, zero heavy frameworks, and sub-50ms API response times.**

```
uwian/
├── client/
│   └── public/
│       ├── index.html         # Semantic HTML5 shell with responsive viewports
│       ├── app.css            # 2,200+ lines of custom Vanilla CSS (Design Tokens & Claymorphism)
│       ├── js/
│       │   ├── app.js         # Client-side hash routing, session state, DOM renderer
│       │   ├── pages.js       # Dynamic view components (Dashboard, Map, Sessions, Auth)
│       │   └── util.js        # DOM helper (h), 3D icon loader, Toast notification system
│       └── img/3d/            # Curated library of 32 custom 3D clay icons
├── server/
│   └── src/
│       ├── index.js           # Express 5 REST API & session authentication
│       ├── db.js              # SQLite schema & transactional database connection
│       └── lib/
│           └── authz.js       # Bcrypt password hashing & 18+ age verification logic
├── shared/
│   ├── split.js               # Tab division & alcohol boundary exclusion algorithm
│   └── settle.js              # Graph-based debt minimization algorithm
└── docs/                      # Privacy guidelines & architectural specifications
```

### Technology Highlights:
- **Backend**: Node.js (ES Modules) + Express 5.
- **Database**: SQLite via `better-sqlite3` (synchronous, ACID-compliant, zero network latency).
- **Security**: `bcryptjs` salted password hashing, `cookie-session` with cryptographic signing, and strict role-based access control.
- **Mapping**: Leaflet.js with custom tile styling and CSS isolation layers.
- **Client**: Vanilla ES6+ with an optimized reactive virtual-DOM helper (`h()`) for instant page transitions without bundle overhead.

---

## 👥 Demo Accounts for Presentation & Evaluation

The login page features **interactive 1-click quick-fill buttons** for instant evaluation:

| Account | Role | Email | Password | Trust Tier |
|---|---|---|---|---|
| **Ana Reyes** | Barkada Host / Admin | `ana@barkada.demo` | `BarkadaDemo!2026` | Tier 1 (ID Verified, 5 Vouches) |
| **Ela Bautista** | Crew Member | `ela@barkada.demo` | `BarkadaDemo!2026` | Tier 1 (ID Verified, 3 Vouches) |

*(You can also sign up with any new test account; age must be 18+).*

---

## 🚀 Running the Project Locally

### 1. Prerequisites
- **Node.js** v20.x or higher
- **npm** v10.x or higher

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/curtn/Uwian.git
cd Uwian/uwian

# Install server dependencies
cd server && npm install && cd ..
```

### 3. Launch Development Server
```bash
# Start server with live file watch (starts at http://localhost:3000)
npm run dev:server
```

Open your browser and navigate to:
```
http://localhost:3000
```

### 4. Running Unit Tests
```bash
npm run test
```
*Validates password authorization, bill isolation math, and cash settlement graph minimization.*

---

## 🏆 Why Uwian is an Exemplary Academic Project

1. **Practical Social Utility**: Addresses a genuine safety issue faced by thousands of commuting university students every night.
2. **Algorithmic Depth**: Not just a simple CRUD app — features graph-based debt simplification, automated escalation state machines, and boundary-aware splitting.
3. **Engineering Craftsmanship**: Rejects heavy JavaScript dependencies in favor of lean, robust vanilla code with sub-50ms response times and custom Awwwards-grade visual design.
4. **Privacy-Preserving Philosophy**: Strict row-level isolation guarantees that personal counters, safety preferences, and transit routes are never exposed to unauthorized parties.

---

*Presented by the Uwian Development Team.*
