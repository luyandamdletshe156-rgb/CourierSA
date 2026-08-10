import { Package, Trash2, MapPin, Flame, AlertTriangle, Shield } from 'lucide-react'
import { formatZAR } from '@/utils'

// quotes: optional array aligned by index with items, each { totalAmountZAR, quoteId } | undefined
export default function CartSummaryPanel({ items, quotes, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="card text-center py-12">
        <Package size={40} className="text-[#94A3B8] mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#64748B]">Your cart is empty</p>
        <p className="text-xs text-[#94A3B8] mt-1">Add a parcel above to start building a multi-parcel booking.</p>
      </div>
    )
  }

  const total = quotes?.reduce((sum, q) => sum + (q?.totalAmountZAR ?? 0), 0) ?? null

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#172554]">Cart ({items.length} parcel{items.length === 1 ? '' : 's'})</h3>
        {total !== null && <span className="text-sm font-bold text-[#0A3D91]">{formatZAR(total)}</span>}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.cartItemId} className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-[#D8E4F5] bg-[#F6FAFF]">
            <div className="flex-1 min-w-0">
              
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[#172554]">{item.serviceType}</span>
                
                {/* Visual badges for parcel options */}
                {item.isEmergency && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#B91C1C] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">
                    <Flame size={10} /> Emergency
                  </span>
                )}
                {item.isFragile && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#B45309] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={10} /> Fragile
                  </span>
                )}
                {item.insuranceRequired && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#047857] bg-[#10B981]/10 px-1.5 py-0.5 rounded">
                    <Shield size={10} /> Insured
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#64748B] mt-1.5">
                <MapPin size={12} className="flex-shrink-0" />
                <span className="truncate">{item.pickupAddress?.city} → {item.deliveryAddress?.city}</span>
              </div>
              
              <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
                {item.description} · {item.weightKg} kg
              </p>
              
              {/* Formatted scheduled date */}
              {item.scheduledPickupDate && (
                <p className="text-xs text-[#94A3B8] mt-0.5 font-medium">
                  Scheduled: {new Date(item.scheduledPickupDate).toLocaleDateString('en-ZA', { 
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
                  })}
                </p>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {quotes?.[i] && <span className="text-xs font-bold text-[#172554]">{formatZAR(quotes[i].totalAmountZAR)}</span>}
              <button
                type="button"
                onClick={() => onRemove(item.cartItemId)}
                className="text-[#94A3B8] hover:text-[#EF4444] p-1 -mr-1 transition-colors rounded hover:bg-[#EF4444]/10"
                aria-label={`Remove parcel from cart`}
                title="Remove parcel"
              >
                <Trash2 size={16} />
              </button>
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}