# CourierSA — Complete Project Package

This archive contains everything built for the CourierSA logistics platform project.

## 📁 Folder structure

```
CourierSA-Project/
├── CourierSA-Backend/         ASP.NET Core 8 Web API (Clean Architecture)
├── CourierSA-Frontend/        React 18 + Vite + Tailwind CSS
├── Prototypes/                6 interactive HTML/CSS/JS UI prototypes
│   └── standalone-single-file/  Same prototypes, one self-contained file each
└── Documentation/             Implementation guide + setup notes
```

---

## 🔧 CourierSA-Backend

Open in **Visual Studio 2022**. Follow `Documentation/CourierSA_Implementation_Guide.docx`
Section 4 for full setup — creating the 5 projects, installing NuGet packages, running
EF Core migrations, and configuring `appsettings.json` with your MySQL password.

**28 files** across Domain, Application, Infrastructure, API, and Tests layers.
53 API endpoints. 15 unit tests. Full JWT auth, SignalR real-time hub, SA pricing engine.

---

## 🎨 CourierSA-Frontend

Open the `CourierSA-Frontend` folder in **VS Code**. Run:
```bash
npm install
npm install react-leaflet leaflet --legacy-peer-deps
npm run dev
```
Then open `http://localhost:5173`. Requires the backend running on `localhost:7001`
(see `vite.config.js` for the proxy configuration).

**29 files** covering all 6 role-based dashboards, the 4-step parcel booking flow,
live driver map, bulk CSV upload, claims, invoices, wallet, and audit logs.

---

## 🖼️ Prototypes

Two versions of the same 6 UI screens — use whichever fits your situation:

**`Prototypes/`** — Multi-file version. Open `index.html` in any browser on a
**laptop or PC**. All 6 screens share one `couriersa.css` file, so keep every
file in this folder together.

**`Prototypes/standalone-single-file/`** — Same 6 screens, but each `.html` file
has its CSS embedded inside it. Use this version on a **phone or tablet** —
just tap any single file and it opens with no other files needed.

Screens included: Login, Customer Dashboard + Book Parcel, Admin Dashboard,
Dispatcher Dashboard + Live Map, Driver Deliveries, Warehouse Dashboard.
All fully interactive — no backend required, pure HTML/CSS/JS.

---

## 📄 Documentation

**`CourierSA_Implementation_Guide.docx`** — The main reference. Covers:
- Complete file-to-folder placement map
- Tool installation (Visual Studio, VS Code, MySQL, Node.js)
- MySQL database creation
- Full Visual Studio backend setup (projects, references, NuGet, migrations)
- Full VS Code frontend setup
- Demo credentials for all 6 roles
- Unit test walkthrough
- Feature demo script (8 complete user flows)
- Troubleshooting for 9 common problems
- Academic deliverables checklist (UML diagrams, ER diagram, meeting minutes, CI/CD)

**`BACKEND_SETUP.md`** — Condensed quick-reference version of the backend setup.

---

## Demo credentials (all roles, password: `Demo@1234`)

| Role | Email |
|---|---|
| Administrator | admin@couriersa.co.za |
| Customer | thabo@gmail.com |
| Driver | sipho.driver@couriersa.co.za |
| Dispatcher | nomvula.dispatch@couriersa.co.za |
| Warehouse Staff | trevor.wh@couriersa.co.za |
| Business Client | lindiwe@techcorp.co.za |

---

## Still to build (from our planning discussions, not yet coded)

These were discussed and designed but not yet implemented — see the conversation
history for the full domain model and reasoning behind each:

- Driver employment types (Employee / Contractor / Outsourced) + earnings & payout system
- Staff account creation by Admin (Dispatcher/Driver/WarehouseStaff cannot self-register)
- Insurance claim verification (declared value cap, supporting documents, admin approval)
- Vehicle breakdown / driver AWOL handling (stranded deliveries queue, reassignment)
- Parcel zone classification (Local / Provincial / National) + warehouse bay routing
- Weight discrepancy detection (declared vs verified weight, dimensional weight)
- Vehicle document expiry tracking + pre-trip inspection enforcement
- Additional payment methods (PayFast, EFT, SnapScan, business account credit terms)
- Support ticket system with SLA tracking
- Delivery ratings (driver + platform) feeding into dispatch decisions
- Public FAQ with helpful/not-helpful feedback counters

Start a new conversation turn and ask to build any of these when ready.
