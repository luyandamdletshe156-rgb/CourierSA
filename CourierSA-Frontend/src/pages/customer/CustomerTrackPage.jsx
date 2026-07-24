import { useState, useMemo } from "react";
import {
  Search, ArrowLeft, Package, MapPin, Clock, Truck, CheckCircle2,
  Circle, Phone, Star, Shield, FileSignature, AlertTriangle,
  Download, MessageSquareWarning, Copy, ChevronRight, User
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// Demo data — replace with a real API call (GET /api/parcels/track/{trackingNumber})
// and wire the timeline to the TrackingHub SignalR connection for live updates.
// ─────────────────────────────────────────────────────────────────────────
const DEMO_PARCEL = {
  trackingNumber: "CSA-20260715-00423",
  status: "OutForDelivery",
  serviceType: "Express",
  weightKg: 3.4,
  dimensions: { lengthCm: 40, widthCm: 30, heightCm: 20 },
  declaredValueZAR: 2500,
  description: "Laptop accessories",
  isFragile: true,
  requiresSignature: true,
  insuranceRequired: true,
  estimatedDeliveryDate: "2026-07-21T17:00:00",
  quoteAmountZAR: 189.5,
  pickup: {
    recipientName: "Olwethu M.",
    city: "Sydenham",
    province: "KwaZulu-Natal",
  },
  delivery: {
    recipientName: "Thando N.",
    recipientPhone: "071 234 5678",
    streetAddress: "14 Silverstream Rd",
    suburb: "Berea",
    city: "Durban",
    province: "KwaZulu-Natal",
    postalCode: "4001",
  },
  driver: {
    name: "Sipho Ndlovu",
    phone: "082 345 6789",
    vehicle: "Toyota Quantum · CA 45 KZ GP",
    rating: 4.8,
  },
  events: [
    { type: "Booked", label: "Booking confirmed", location: "Sydenham, Durban", time: "2026-07-19T08:12:00", done: true },
    { type: "Approved", label: "Parcel approved", location: "Sydenham, Durban", time: "2026-07-19T09:03:00", done: true },
    { type: "ReceivedAtWarehouse", label: "Received at warehouse", location: "CourierSA Depot, Springfield Park", time: "2026-07-19T14:41:00", done: true },
    { type: "OutForDelivery", label: "Out for delivery", location: "En route to Berea, Durban", time: "2026-07-21T09:20:00", done: true, active: true },
    { type: "Delivered", label: "Delivered", location: "14 Silverstream Rd, Berea", time: null, done: false },
  ],
};

const STATUS_META = {
  Draft:            { label: "Draft",            tone: "gray"  },
  PendingApproval:  { label: "Pending approval",  tone: "amber" },
  Approved:         { label: "Approved",          tone: "blue"  },
  InWarehouse:      { label: "In warehouse",      tone: "blue"  },
  OutForDelivery:   { label: "Out for delivery",  tone: "teal"  },
  Delivered:        { label: "Delivered",         tone: "green" },
  FailedDelivery:   { label: "Delivery failed",   tone: "red"   },
  Cancelled:        { label: "Cancelled",         tone: "gray"  },
  Returned:         { label: "Returned",          tone: "gray"  },
};

const TONE_CLASSES = {
  gray:  "bg-slate-100 text-slate-700",
  amber: "bg-amber-50 text-amber-700",
  blue:  "bg-blue-50 text-blue-700",
  teal:  "bg-teal-50 text-teal-700",
  green: "bg-green-50 text-green-700",
  red:   "bg-red-50 text-red-700",
};

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtZAR(amount) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.Draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${TONE_CLASSES[meta.tone]}`}>
      {status === "OutForDelivery" && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-600" />
        </span>
      )}
      {meta.label}
    </span>
  );
}

function Timeline({ events }) {
  return (
    <ol className="relative">
      {events.map((ev, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={ev.type} className="relative pb-8 last:pb-0 pl-9">
            {!isLast && (
              <span
                className={`absolute left-[9px] top-5 h-full w-[2px] ${ev.done ? "bg-[#14245C]" : "bg-slate-200"}`}
                aria-hidden="true"
              />
            )}
            <span className="absolute left-0 top-0.5">
              {ev.done ? (
                <CheckCircle2 className={`w-5 h-5 ${ev.active ? "text-teal-600" : "text-[#14245C]"}`} strokeWidth={2} />
              ) : (
                <Circle className="w-5 h-5 text-slate-300" strokeWidth={2} />
              )}
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <p className={`text-sm font-semibold ${ev.done ? "text-slate-900" : "text-slate-400"}`}>
                {ev.label}
              </p>
              {ev.time && (
                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtTime(ev.time)}</span>
              )}
            </div>
            {ev.location && (
              <p className={`text-sm mt-0.5 ${ev.done ? "text-slate-500" : "text-slate-350"}`}>{ev.location}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="w-4 h-4 text-slate-400" />
        {label}
      </span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

export default function CustomerTrackPage() {
  const [query, setQuery] = useState(DEMO_PARCEL.trackingNumber);
  const [parcel, setParcel] = useState(DEMO_PARCEL);
  const [copied, setCopied] = useState(false);
  const isSignedIn = true; // replace with real auth state (e.g. useAuth().isAuthenticated)

  const meta = STATUS_META[parcel?.status] ?? STATUS_META.Draft;
  const nextEvent = useMemo(
    () => parcel?.events.find((e) => !e.done),
    [parcel]
  );

  const handleTrack = () => {
    // Replace with: fetch(`/api/parcels/track/${query}`)
    setParcel(DEMO_PARCEL);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(parcel.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      {/* Header */}
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#14245C] flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[#14245C]">
              Courier<span className="text-blue-500">SA</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="w-4 h-4" /> Back to home
            </button>
            <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-500" />
              </div>
              <span className="text-sm font-medium text-slate-700">Thando N.</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Search */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#14245C] mb-2">Track your parcel</h1>
          <p className="text-slate-500 mb-6">Signed in — showing full delivery details for your account</p>
          <div className="flex items-center gap-3 max-w-xl mx-auto">
            <div className="flex-1 flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 border border-slate-200">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. CSA-20260715-00423"
                className="flex-1 outline-none text-sm text-slate-700 placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={handleTrack}
              className="bg-[#14245C] hover:bg-[#0e1a47] text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
            >
              Track parcel
            </button>
          </div>
        </div>

        {parcel && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column — status + timeline */}
            <div className="lg:col-span-2 space-y-6">
              {/* Status card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-slate-400">Tracking number</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-800">{parcel.trackingNumber}</span>
                      <button onClick={handleCopy} className="text-slate-400 hover:text-slate-600">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copied && <span className="text-xs text-teal-600">Copied</span>}
                    </div>
                  </div>
                  <StatusPill status={parcel.status} />
                </div>

                {nextEvent && parcel.estimatedDeliveryDate && (
                  <div className="mt-4 flex items-center gap-2 bg-teal-50 text-teal-800 rounded-xl px-4 py-3 text-sm">
                    <Clock className="w-4 h-4 shrink-0" />
                    Estimated delivery by <span className="font-semibold">{fmtTime(parcel.estimatedDeliveryDate)}</span>
                  </div>
                )}

                {parcel.status === "OutForDelivery" && (
                  <div className="mt-4 flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#14245C] flex items-center justify-center text-white text-xs font-semibold">
                        {parcel.driver.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{parcel.driver.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {parcel.driver.rating} · {parcel.driver.vehicle}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`tel:${parcel.driver.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-1.5 bg-[#14245C] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#0e1a47]"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call driver
                    </a>
                  </div>
                )}
              </div>

              {/* Timeline card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="text-base font-semibold text-slate-800 mb-5">Delivery progress</h2>
                <Timeline events={parcel.events} />
              </div>

              {/* Recipient card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" /> Delivery address
                </h2>
                <p className="text-sm font-medium text-slate-800">{parcel.delivery.recipientName}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {parcel.delivery.streetAddress}, {parcel.delivery.suburb}<br />
                  {parcel.delivery.city}, {parcel.delivery.province} {parcel.delivery.postalCode}
                </p>
                <p className="text-sm text-slate-500 mt-2">{parcel.delivery.recipientPhone}</p>
              </div>
            </div>

            {/* Right column — parcel details + actions */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" /> Parcel details
                </h2>
                <DetailRow icon={Truck} label="Service type" value={parcel.serviceType} />
                <DetailRow icon={Package} label="Weight" value={`${parcel.weightKg} kg`} />
                <DetailRow
                  icon={Package}
                  label="Dimensions"
                  value={`${parcel.dimensions.lengthCm}×${parcel.dimensions.widthCm}×${parcel.dimensions.heightCm} cm`}
                />
                <DetailRow icon={Shield} label="Declared value" value={fmtZAR(parcel.declaredValueZAR)} />
                <DetailRow icon={Package} label="Contents" value={parcel.description} />
                <DetailRow icon={Package} label="Shipping fee" value={fmtZAR(parcel.quoteAmountZAR)} />

                <div className="flex flex-wrap gap-2 mt-4">
                  {parcel.isFragile && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Fragile
                    </span>
                  )}
                  {parcel.requiresSignature && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                      <FileSignature className="w-3 h-3" /> Signature required
                    </span>
                  )}
                  {parcel.insuranceRequired && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full">
                      <Shield className="w-3 h-3" /> Insured
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-2">
                <button className="w-full flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2.5">
                  <span className="flex items-center gap-2"><Download className="w-4 h-4 text-slate-400" /> Download invoice</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
                <button className="w-full flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2.5">
                  <span className="flex items-center gap-2"><MessageSquareWarning className="w-4 h-4 text-slate-400" /> Report an issue</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
