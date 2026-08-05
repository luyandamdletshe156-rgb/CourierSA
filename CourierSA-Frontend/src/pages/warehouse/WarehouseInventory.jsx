import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  EmptyState, PageLoader, Modal,
  StatusPill, TrackingBadge, Pagination
} from '@/components/ui'
import { parcelApi } from '@/api'
import {
  Package, Archive, Search, MapPin, Weight, ShieldAlert,
  Calendar, FileText, ChevronRight, CheckCircle2, History
} from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

export function WarehouseInventoryPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('InWarehouse')
  const [localSearch, setLocalSearch] = useState('')
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-inventory', page, statusFilter],
    queryFn:  () => parcelApi.queue({ page, pageSize, status: statusFilter }),
    keepPreviousData: true,
  })
  
  const rawParcels = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0

  // Quick local filter for the current page view
  const parcels = useMemo(() => {
    if (!localSearch.trim()) return rawParcels
    const q = localSearch.toLowerCase()
    return rawParcels.filter(p => 
      p.trackingNumber.toLowerCase().includes(q) || 
      p.destinationCity?.toLowerCase().includes(q)
    )
  }, [rawParcels, localSearch])

  const STATUS_FILTERS = [
    { value: 'InWarehouse',     label: 'Awaiting Checkout' },
    { value: 'CheckedOut',      label: 'Ready for Dispatch' },
    { value: 'AwaitingCheckIn', label: 'Awaiting Check-in' },
  ]

  const isBinGroupable = statusFilter === 'InWarehouse' || statusFilter === 'CheckedOut'
  const binGroups = isBinGroupable ? parcels.reduce((groups, p) => {
    const key = p.binCode || 'Unassigned'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
    return groups
  }, {}) : null

  const sortedBinCodes = binGroups ? Object.keys(binGroups).sort((a, b) => {
    if (a === 'Unassigned') return 1
    if (b === 'Unassigned') return -1
    return a.localeCompare(b)
  }) : []

  const [detailParcel, setDetailParcel] = useState(null)
  
  // Fetch detailed info + inspections only when a row is clicked
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['parcel-detail', detailParcel?.id],
    queryFn:  () => parcelApi.getDetail(detailParcel.id), // Assuming detail endpoint exists in parcelApi
    enabled:  !!detailParcel,
  })

  const { data: inspData } = useQuery({
    queryKey: ['parcel-inspections', detailParcel?.id],
    queryFn:  () => parcelApi.inspections(),
    enabled:  !!detailParcel,
  })

  const detail = detailData?.data
  const parcelInspections = (inspData?.data ?? []).filter(i => i.parcelId === detailParcel?.id)

  return (
    <AppShell title="Inventory">
      <div className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Warehouse Inventory</h1>
          <p className="page-subtitle">Manage and locate {total} active parcels</p>
        </div>
        
        {/* Modern Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
          <input 
            type="text" 
            placeholder="Search tracking or city..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#D8E4F5] rounded-xl text-sm focus:outline-none focus:border-[#0A3D91] focus:ring-1 focus:ring-[#0A3D91] transition-shadow"
          />
        </div>
      </div>

      {/* Sleek Segmented Tabs */}
      <div className="bg-[#F6FAFF] p-1 rounded-xl inline-flex mb-6 border border-[#D8E4F5]">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); setLocalSearch('') }}
            className={clsx(
              'px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
              statusFilter === f.value
                ? 'bg-white text-[#0A3D91] shadow-sm'
                : 'text-[#64748B] hover:text-[#172554] hover:bg-white/50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : parcels.length === 0 ? (
        <div className="card">
          <EmptyState icon={Package} title="No parcels found" description={localSearch ? "Try adjusting your search query." : "No parcels match this status category."} />
        </div>
      ) : isBinGroupable ? (
        <div className="space-y-6">
          {sortedBinCodes.map(binCode => {
            const binParcels = binGroups[binCode]
            return (
              <div key={binCode} className="card overflow-hidden border-t-4 border-t-[#0A3D91]">
                <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-[#E2E8F0]"><Archive size={18} className="text-[#0A3D91]" /></div>
                    <div>
                      <h2 className="text-base font-bold text-[#172554]">{binCode === 'Unassigned' ? 'Unassigned Zone' : `Sorting Bin: ${binCode}`}</h2>
                      <p className="text-xs font-medium text-[#64748B]">{binParcels.length} parcel{binParcels.length !== 1 ? 's' : ''} inside</p>
                    </div>
                  </div>
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead><tr><th>Tracking #</th><th>Destination</th><th>Weight</th><th>Flags</th><th>Booked</th><th></th></tr></thead>
                    <tbody>
                      {binParcels.map(p => (
                        <tr key={p.id} onClick={() => setDetailParcel(p)} className="cursor-pointer hover:bg-[#F6FAFF] group transition-colors">
                          <td><TrackingBadge value={p.trackingNumber} /></td>
                          <td>
                            <p className="text-sm font-semibold text-[#172554]">{p.destinationCity}</p>
                            <p className="text-xs text-[#64748B] capitalize">{p.serviceType}</p>
                          </td>
                          <td className="text-sm text-[#64748B] font-mono">{p.weightKg} kg</td>
                          <td>{p.isFragile ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold bg-[#FEF3C7] text-[#D97706] px-2 py-1 rounded-md"><ShieldAlert size={12}/> Fragile</span> : <span className="text-[#CBD5E1]">—</span>}</td>
                          <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
                          <td className="text-right text-[#CBD5E1] group-hover:text-[#0A3D91] transition-colors"><ChevronRight size={18} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          <div className="card mt-5"><Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} /></div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Tracking #</th><th>Destination</th><th>Weight</th><th>Flags</th><th>Booked</th><th></th></tr></thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id} onClick={() => setDetailParcel(p)} className="cursor-pointer hover:bg-[#F6FAFF] group transition-colors">
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td>
                      <p className="text-sm font-semibold text-[#172554]">{p.destinationCity}</p>
                      <p className="text-xs text-[#64748B] capitalize">{p.serviceType}</p>
                    </td>
                    <td className="text-sm text-[#64748B] font-mono">{p.weightKg} kg</td>
                    <td>{p.isFragile ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold bg-[#FEF3C7] text-[#D97706] px-2 py-1 rounded-md"><ShieldAlert size={12}/> Fragile</span> : <span className="text-[#CBD5E1]">—</span>}</td>
                    <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
                    <td className="text-right text-[#CBD5E1] group-hover:text-[#0A3D91] transition-colors"><ChevronRight size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </div>
      )}

      {/* Modernized Details Modal */}
      <Modal open={!!detailParcel} onClose={() => setDetailParcel(null)} title="Inventory Details" size="lg">
        {detailLoading ? <PageLoader /> : detail && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#F6FAFF] rounded-xl"><Package className="text-[#0A3D91]" size={24} /></div>
                <div>
                  <TrackingBadge value={detail.trackingNumber} />
                  <p className="text-xs text-[#64748B] mt-1 capitalize font-medium">{detail.serviceType} Delivery</p>
                </div>
              </div>
              <StatusPill status={detail.status} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Route Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-2"><MapPin size={14}/> Routing</h3>
                <div className="bg-[#F8FAFC] p-4 rounded-xl space-y-3 border border-[#E2E8F0]">
                  <div className="relative pl-4 border-l-2 border-[#CBD5E1] pb-3">
                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#CBD5E1]" />
                    <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider mb-0.5">Pickup</p>
                    <p className="text-sm font-semibold text-[#172554]">{detail.pickupAddress?.city}</p>
                    <p className="text-xs text-[#64748B]">{detail.pickupAddress?.recipientName}</p>
                  </div>
                  <div className="relative pl-4 border-l-2 border-transparent">
                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#0A3D91]" />
                    <p className="text-[10px] text-[#0A3D91] font-bold uppercase tracking-wider mb-0.5">Delivery</p>
                    <p className="text-sm font-semibold text-[#172554]">{detail.deliveryAddress?.city}</p>
                    <p className="text-xs text-[#64748B]">{detail.deliveryAddress?.recipientName}</p>
                  </div>
                </div>
              </div>

              {/* Specs */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-2"><Weight size={14}/> Specifications</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                    <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Weight</p>
                    <p className="text-sm font-mono font-semibold text-[#172554]">{detail.weightKg} kg</p>
                  </div>
                  {detail.dimensions && (
                    <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                      <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Dimensions</p>
                      <p className="text-sm font-mono font-semibold text-[#172554]">{detail.dimensions.lengthCm}×{detail.dimensions.widthCm}×{detail.dimensions.heightCm}</p>
                    </div>
                  )}
                  <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] col-span-2 flex items-center justify-between">
                    <p className="text-[10px] text-[#64748B] font-bold uppercase">Special Handling</p>
                    <div className="flex gap-2">
                      {detail.isFragile && <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] px-2 py-0.5 rounded">Fragile</span>}
                      {detail.requiresSignature && <span className="text-[10px] font-bold bg-[#F1F5F9] text-[#475569] px-2 py-0.5 rounded">Signature</span>}
                      {!detail.isFragile && !detail.requiresSignature && <span className="text-xs text-[#94A3B8]">—</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction block */}
            {detail.specialInstructions && (
              <div className="bg-[#FEF9C3]/50 border border-[#FEF08A] p-3 rounded-xl flex items-start gap-3">
                <FileText className="text-[#CA8A04] mt-0.5 shrink-0" size={16} />
                <div>
                  <p className="text-[10px] font-bold uppercase text-[#CA8A04] mb-0.5">Instructions</p>
                  <p className="text-sm text-[#854D0E]">{detail.specialInstructions}</p>
                </div>
              </div>
            )}

            {/* Inspections History */}
            {parcelInspections.length > 0 && (
              <div className="pt-4 border-t border-[#E2E8F0]">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-3 flex items-center gap-2"><History size={14}/> Inspection Logs</h3>
                <div className="space-y-2">
                  {parcelInspections.map(insp => (
                    <div key={insp.id} className="flex items-center justify-between bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-2.5 rounded-lg">
                      <div className="flex items-center gap-3">
                        {insp.result === 'Pass' ? <CheckCircle2 size={16} className="text-[#10B981]" /> : <ShieldAlert size={16} className="text-[#EF4444]" />}
                        <span className="text-sm font-semibold text-[#172554]">{insp.stage} Check</span>
                      </div>
                      <span className="text-xs text-[#94A3B8] font-mono">{formatDate(insp.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  )
}