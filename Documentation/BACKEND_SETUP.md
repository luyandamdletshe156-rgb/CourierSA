# CourierSA — Backend Setup Guide

## Solution Structure

```
CourierSA/
├── CourierSA.Domain/           # Entities, Enums, Value Objects  [DONE]
├── CourierSA.Application/      # Interfaces, DTOs, Validators     [DONE]
├── CourierSA.Infrastructure/   # EF Core, Services, Auth          [DONE ✓]
├── CourierSA.API/              # Controllers, Hubs, Middleware     [DONE ✓]
└── CourierSA.Tests/            # Unit + Integration tests          [Next]
```

## NuGet Packages Required

### CourierSA.Infrastructure
```xml
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.*" />
<PackageReference Include="Pomelo.EntityFrameworkCore.MySql" Version="8.*" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="8.*" />
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.*" />
<PackageReference Include="Microsoft.IdentityModel.Tokens" Version="7.*" />
<PackageReference Include="System.IdentityModel.Tokens.Jwt" Version="7.*" />
<PackageReference Include="ZXing.Net.Bindings.SkiaSharp" Version="0.16.*" />
<PackageReference Include="SkiaSharp" Version="2.*" />
<PackageReference Include="FluentValidation.AspNetCore" Version="11.*" />
```

### CourierSA.API
```xml
<PackageReference Include="Microsoft.AspNetCore.SignalR" Version="1.*" />
<PackageReference Include="Swashbuckle.AspNetCore" Version="6.*" />
<PackageReference Include="Microsoft.AspNetCore.Diagnostics.HealthChecks" Version="2.*" />
<PackageReference Include="Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore" Version="8.*" />
```

## Quick Start

### 1. Create MySQL database
```sql
CREATE DATABASE CourierSA_Dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Update appsettings.json
Set your MySQL password in `ConnectionStrings:DefaultConnection`.
Set a strong `Jwt:SecretKey` (min 32 chars).

### 3. EF Core Migrations
```bash
cd CourierSA.Infrastructure

# First migration (creates all tables)
dotnet ef migrations add InitialCreate \
  --startup-project ../CourierSA.API \
  --context ApplicationDbContext

# Apply migrations
dotnet ef database update \
  --startup-project ../CourierSA.API
```

### 4. Run the API
```bash
cd CourierSA.API
dotnet run
# → https://localhost:7001
# → Swagger UI: https://localhost:7001/swagger
```

### 5. Seed Demo Data
The app auto-migrates and seeds in Development mode.
All demo users have password: `Demo@1234`

| Role           | Email                            |
|----------------|----------------------------------|
| Administrator  | admin@couriersa.co.za            |
| Customer       | thabo@gmail.com                  |
| Driver         | sipho.driver@couriersa.co.za     |
| Dispatcher     | nomvula.dispatch@couriersa.co.za |
| WarehouseStaff | trevor.wh@couriersa.co.za        |
| BusinessClient | lindiwe@techcorp.co.za           |

## Key API Endpoints

### Auth
| Method | Endpoint            | Auth     | Description           |
|--------|---------------------|----------|-----------------------|
| POST   | /api/auth/login     | None     | Login → JWT tokens    |
| POST   | /api/auth/register  | None     | Customer registration |
| POST   | /api/auth/refresh   | None     | Refresh access token  |
| POST   | /api/auth/revoke    | Bearer   | Logout                |
| GET    | /api/auth/me        | Bearer   | Current user info     |

### Parcels
| Method | Endpoint                        | Role            | Description           |
|--------|---------------------------------|-----------------|-----------------------|
| GET    | /api/parcels                    | Customer/Biz    | My parcels (paged)    |
| GET    | /api/parcels/{id}               | Any             | Parcel detail         |
| POST   | /api/parcels                    | Customer/Biz    | Book new parcel       |
| PUT    | /api/parcels/{id}/approve       | Dispatcher      | Approve booking       |
| PUT    | /api/parcels/{id}/reject        | Dispatcher      | Reject booking        |
| PUT    | /api/parcels/{id}/checkin       | Warehouse       | Check in at warehouse |
| PUT    | /api/parcels/{id}/dispatch      | Dispatcher      | Assign to driver      |
| POST   | /api/parcels/bulk-upload        | Biz/Admin       | CSV bulk import       |

### Tracking (Public)
| Method | Endpoint                        | Auth     | Description           |
|--------|---------------------------------|----------|-----------------------|
| GET    | /api/tracking/{trackingNumber}  | None     | Public tracking       |

### Deliveries (Driver)
| Method | Endpoint                        | Role     | Description           |
|--------|---------------------------------|----------|-----------------------|
| GET    | /api/deliveries/my              | Driver   | My active deliveries  |
| PUT    | /api/deliveries/{id}/delivered  | Driver   | Mark delivered + POD  |
| PUT    | /api/deliveries/{id}/failed     | Driver   | Mark failed delivery  |
| PUT    | /api/deliveries/{id}/location   | Driver   | GPS update            |

### SignalR Hub
```
ws://localhost:7001/hubs/tracking?access_token=YOUR_JWT

Client events to send:
  subscribeToParcel(trackingNumber)
  updateLocation(trackingNumber, lat, lng, heading?, speed?)
  requestAllDriverLocations()

Server events received:
  ParcelStatusChanged  { trackingNumber, newStatus, location, updatedAt }
  LocationUpdate       { driverId, trackingNumber, latitude, longitude, ... }
  DriverLocationUpdated { ... }
  NewDeliveryAssigned  { ... }
  DashboardStatsUpdated { ... }
```

## Parcel Lifecycle

```
Draft (optional)
    ↓  POST /api/parcels
PendingApproval
    ↓  PUT .../approve       [Dispatcher]
Approved
    ↓  PUT .../checkin       [WarehouseStaff]
InWarehouse
    ↓  PUT .../dispatch      [Dispatcher]
OutForDelivery
    ↓  PUT /api/deliveries/{id}/delivered   [Driver]
Delivered
    ↓  (or)
    ↓  PUT /api/deliveries/{id}/failed      [Driver]
FailedDelivery → re-dispatch or return
```

## Architecture Notes

### Why Clean Architecture?
- **Domain** has zero dependencies — pure business logic
- **Application** depends only on Domain — services, DTOs, interfaces
- **Infrastructure** implements the interfaces — EF Core, JWT, email
- **API** is the delivery mechanism — thin controllers, no business logic

### Security
- PBKDF2-SHA256 password hashing (100k iterations)
- JWT access tokens (8h) + refresh tokens (30 days, rotated)
- Account lockout after 5 failed attempts
- Soft-delete everywhere (data never permanently lost)
- AuditLog captures every state change with old/new JSON diff

### South Africa-Specific
- 9 provinces as enum (no free-text province bugs)
- SA phone number validation in FluentValidation
- 4-digit SA postal code validation
- ZAR currency throughout
- Tracking number format: CSA-YYYYMMDD-NNNNN
