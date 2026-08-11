import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { TrackingBadge, Modal, Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { parcelApi } from '@/api'
import {
  PackageCheck,
  PackagePlus,
  Search,
  ArrowRightLeft,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Box,
  ClipboardList
} from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

const emptyChecklist = {
  packagingIntact: true,
  noMoistureDamage: true,
  weightMatchesDeclared: true,
  fragileHandlingOk: false,
  sealIntact: true
}

function InspectionChecklistFields({ checklist, setChecklist }) {
  const toggle = key => setChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {[
        { key: 'packagingIntact', label: 'Packaging intact' },
        { key: 'noMoistureDamage', label: 'No moisture damage' },
        { key: 'weightMatchesDeclared', label: 'Weight matches declared' },
        { key: 'sealIntact', label: 'Security seal intact' },
        { key: 'fragileHandlingOk', label: 'Fragile handling verified' }
      ].map(({ key, label }) => (
        <label
          key={key}
          className={clsx(
            'flex items-center gap-3 cursor-pointer px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all select-none',
            checklist[key]
              ? 'bg-blue-50/60 border-blue-200 text-[#0A3D91]'
              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
          )}
        >
          <input
            type="checkbox"
            checked={!!checklist[key]}
            onChange={() => toggle(key)}
            className="w-4 h-4 text-[#0A3D91] rounded border-[#CBD5E1] focus:ring-[#0A3D91]"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

export function ParcelProcessingPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('checkin')
  const [activeModal, setActiveModal] = useState(null) // { type: 'checkin' | 'checkout', parcel: obj }
  const [selectedParcelId, setSelectedParcelId] = useState('')
  const [checklist, setChecklist] = useState(emptyChecklist)
  const [result, setResult] = useState('Pass')
  const [notes, setNotes] = useState('')
  const [selectedBinId, setSelectedBinId] = useState('')

  // Queries
  const { data: checkinData, isLoading: loadingCheckin } = useQuery({
    queryKey: ['q-checkin'],
    queryFn: () => parcelApi.queue({ status: 'AwaitingCheckIn', pageSize: 100 })
  })

  const { data: checkoutData, isLoading: loadingCheckout } = useQuery({
    queryKey: ['q-checkout'],
    queryFn: () => parcelApi.queue({ status: 'InWarehouse', pageSize: 100 })
  })

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['q-history'],
    queryFn: () => parcelApi.inspections()
  })

  // Extract arrays safely from response envelopes
  const parcelsCheckin = checkinData?.data?.items ?? checkinData?.items ?? checkinData?.data ?? []
  const parcelsCheckout = checkoutData?.data?.items ?? checkoutData?.items ?? checkoutData?.data ?? []
  const inspections = historyData?.data ?? historyData ?? []

  // Active queue based on modal type
  const currentQueue = activeModal?.type === 'checkin' ? parcelsCheckin : parcelsCheckout

  // Selected Parcel object
  const selectedParcel = currentQueue.find(p => (p.id || p.Id) === selectedParcelId) || activeModal?.parcel

  // Parcel ID for bin allocation query
  const parcelId = selectedParcel?.id || selectedParcel?.Id

  // Fetch bin sorting suggestion
  const { data: suggestionData, isLoading: suggestionLoading, error: suggestionError } = useQuery({
    queryKey: ['q-suggest', parcelId],
    queryFn: async () => {
      if (!parcelId) return null

      if (typeof parcelApi?.getSortingSuggestion === 'function') {
        return await parcelApi.getSortingSuggestion(parcelId)
      }

      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('jwt') ||
        localStorage.getItem('accessToken') ||
        ''
      const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      const res = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/sorting-suggestion`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      if (!res.ok) throw new Error(`Server returned status ${res.status}`)
      return await res.json()
    },
    enabled: activeModal?.type === 'checkin' && !!parcelId
  })

  // Extract bins safely
  const rawSuggestion = suggestionData?.data?.bins
    ? suggestionData.data
    : suggestionData?.bins
    ? suggestionData
    : suggestionData?.data

  const bins = rawSuggestion?.bins ?? []
  const suggestedBinId = rawSuggestion?.suggestedBinId

  // Auto-select recommended bin
  useEffect(() => {
    if (suggestedBinId) {
      setSelectedBinId(suggestedBinId)
    }
  }, [suggestedBinId])

  // Open processing modal and set default selection
  const openProcessModal = (type, parcel = null) => {
    const queue = type === 'checkin' ? parcelsCheckin : parcelsCheckout
    const defaultParcel = parcel || queue[0] || null
    const defaultId = defaultParcel?.id || defaultParcel?.Id || ''

    setActiveModal({ type, parcel: defaultParcel })
    setSelectedParcelId(defaultId)
    setChecklist(emptyChecklist)
    setResult('Pass')
    setNotes('')
    setSelectedBinId('')
  }

  const closeModal = () => {
    setActiveModal(null)
    setSelectedParcelId('')
    setChecklist(emptyChecklist)
    setResult('Pass')
    setNotes('')
    setSelectedBinId('')
  }

  // Handle dropdown selection change in modal
  const handleParcelSelect = e => {
    const pId = e.target.value
    setSelectedParcelId(pId)
    const found = currentQueue.find(p => (p.id || p.Id) === pId)
    if (found) {
      setActiveModal(prev => ({ ...prev, parcel: found }))
    }
  }

  // Mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!parcelId) throw new Error('No parcel selected for processing.')

      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('jwt') ||
        localStorage.getItem('accessToken') ||
        ''
      const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }

      // Step 1: Log Inspection
      const inspectionBody = {
        stage: activeModal.type === 'checkin' ? 'CheckIn' : 'Checkout',
        result: result || 'Pass',
        packagingIntact: Boolean(checklist.packagingIntact),
        noMoistureDamage: Boolean(checklist.noMoistureDamage),
        weightMatchesDeclared: Boolean(checklist.weightMatchesDeclared),
        fragileHandlingOk: Boolean(checklist.fragileHandlingOk),
        sealIntact: Boolean(checklist.sealIntact),
        notes: notes?.trim() || null
      }

      const inspectionRes = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/inspections`, {
        method: 'POST',
        headers,
        body: JSON.stringify(inspectionBody)
      })

      if (!inspectionRes.ok) {
        const errData = await inspectionRes.json().catch(() => null)
        const msg =
          errData?.message ||
          errData?.title ||
          (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
        throw new Error(msg || `Inspection failed (${inspectionRes.status})`)
      }

      // Step 2: Check-in or Checkout
      if (activeModal.type === 'checkin') {
        const checkinRes = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/checkin`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ sortingBinId: selectedBinId })
        })

        if (!checkinRes.ok) {
          const errData = await checkinRes.json().catch(() => null)
          const msg =
            errData?.message ||
            errData?.title ||
            (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
          throw new Error(msg || `Check-in failed (${checkinRes.status})`)
        }
      } else {
        const checkoutRes = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/checkout`, {
          method: 'PUT',
          headers
        })

        if (!checkoutRes.ok) {
          const errData = await checkoutRes.json().catch(() => null)
          const msg =
            errData?.message ||
            errData?.title ||
            (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
          throw new Error(msg || `Checkout failed (${checkoutRes.status})`)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries()
      closeModal()
    }
  })

  const getErrorMessage = err => {
    if (!err) return null
    const data = err?.response?.data
    if (!data) return err.message || 'Failed to process parcel'
    if (typeof data === 'string') return data
    if (data.message) return data.message
    if (data.title) return data.title
    if (data.errors) return Object.values(data.errors).flat().join(', ')
    return err.message || 'Failed to process parcel'
  }

  return (
    <AppShell title="Processing & Inspections">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#172554]">Parcel Processing & Intake</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Perform physical inspections, check in to warehouse bins, and release for delivery.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => openProcessModal('checkin')}
              disabled={parcelsCheckin.length === 0}
              className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2 rounded-xl shadow-sm disabled:opacity-50"
            >
              <PackagePlus size={16} /> Process Check-In
            </button>
            <button
              onClick={() => openProcessModal('checkout')}
              disabled={parcelsCheckout.length === 0}
              className="btn-secondary text-xs px-4 py-2.5 flex items-center gap-2 rounded-xl border border-[#D8E4F5] disabled:opacity-50"
            >
              <PackageCheck size={16} /> Process Checkout
            </button>
          </div>
        </div>

        {/* Navigation Tabs with Badges */}
        <div className="flex gap-2 border-b border-[#E2E8F0] pb-3">
          {[
            {
              id: 'checkin',
              label: 'Awaiting Check-in',
              icon: PackagePlus,
              count: parcelsCheckin.length
            },
            {
              id: 'checkout',
              label: 'Awaiting Checkout',
              icon: PackageCheck,
              count: parcelsCheckout.length
            },
            {
              id: 'history',
              label: 'Inspection History',
              icon: History,
              count: inspections.length
            }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border',
                activeTab === tab.id
                  ? 'bg-[#0A3D91] text-white border-[#0A3D91] shadow-sm'
                  : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#0A3D91]/40'
              )}
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-full text-[10px]',
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-[#F1F5F9] text-[#475569]'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content Tables */}
        <div className="card bg-white rounded-2xl border border-[#D8E4F5] shadow-sm overflow-hidden">
          {activeTab === 'checkin' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-3.5 pl-5">Tracking #</th>
                    <th className="p-3.5">Zone</th>
                    <th className="p-3.5">Declared Weight</th>
                    <th className="p-3.5 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#334155]">
                  {loadingCheckin ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[#0A3D91]" />
                        Loading check-in queue…
                      </td>
                    </tr>
                  ) : parcelsCheckin.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                        No parcels awaiting warehouse check-in.
                      </td>
                    </tr>
                  ) : (
                    parcelsCheckin.map(p => {
                      const pId = p.id || p.Id
                      return (
                        <tr key={pId} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-3.5 pl-5">
                            <TrackingBadge value={p.trackingNumber} />
                          </td>
                          <td className="p-3.5 font-medium">{p.zone ?? '—'}</td>
                          <td className="p-3.5 font-mono">{p.weightKg ?? p.declaredWeightKg ?? '—'} kg</td>
                          <td className="p-3.5 pr-5 text-right">
                            <button
                              className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ml-auto shadow-xs"
                              onClick={() => openProcessModal('checkin', p)}
                            >
                              <Search size={13} /> Check-In
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'checkout' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-3.5 pl-5">Tracking #</th>
                    <th className="p-3.5">Assigned Bin</th>
                    <th className="p-3.5">Weight</th>
                    <th className="p-3.5 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#334155]">
                  {loadingCheckout ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[#0A3D91]" />
                        Loading checkout queue…
                      </td>
                    </tr>
                  ) : parcelsCheckout.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <Box size={24} className="mx-auto mb-2 text-[#94A3B8]" />
                        No parcels awaiting warehouse checkout.
                      </td>
                    </tr>
                  ) : (
                    parcelsCheckout.map(p => {
                      const pId = p.id || p.Id
                      return (
                        <tr key={pId} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-3.5 pl-5">
                            <TrackingBadge value={p.trackingNumber} />
                          </td>
                          <td className="p-3.5 font-bold text-[#0A3D91]">{p.binCode ?? p.sortingBinCode ?? '—'}</td>
                          <td className="p-3.5 font-mono">{p.weightKg ?? '—'} kg</td>
                          <td className="p-3.5 pr-5 text-right">
                            <button
                              className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ml-auto shadow-xs"
                              onClick={() => openProcessModal('checkout', p)}
                            >
                              <ArrowRightLeft size={13} /> Check Out
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-3.5 pl-5">Tracking #</th>
                    <th className="p-3.5">Stage</th>
                    <th className="p-3.5">Result</th>
                    <th className="p-3.5 pr-5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#334155]">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[#0A3D91]" />
                        Loading inspection history…
                      </td>
                    </tr>
                  ) : inspections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[#64748B]">
                        <ClipboardList size={24} className="mx-auto mb-2 text-[#94A3B8]" />
                        No inspection logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    inspections.map(i => {
                      const iId = i.id || i.Id
                      return (
                        <tr key={iId} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-3.5 pl-5">
                            <TrackingBadge value={i.trackingNumber} />
                          </td>
                          <td className="p-3.5 font-medium">{i.stage}</td>
                          <td className="p-3.5">
                            <span
                              className={clsx(
                                'px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1',
                                i.result === 'Pass'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : i.result === 'Damaged'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              )}
                            >
                              {i.result === 'Pass' && <CheckCircle2 size={12} />}
                              {i.result === 'Damaged' && <AlertTriangle size={12} />}
                              {i.result === 'Rejected' && <XCircle size={12} />}
                              {i.result}
                            </span>
                          </td>
                          <td className="p-3.5 pr-5 font-mono text-[11px] text-[#64748B]">
                            {formatDate(i.createdAt)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Process Parcel Modal */}
      <Modal
        open={!!activeModal}
        onClose={closeModal}
        title={activeModal?.type === 'checkin' ? 'Warehouse Check-In & Inspection' : 'Warehouse Checkout & Release'}
        size="md"
      >
        <div className="space-y-4 text-xs">
          {/* Step 1: Parcel Selection Dropdown (No typing needed) */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Select Parcel to Process <span className="text-red-500">*</span>
            </label>
            <select
              className="input font-mono w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs bg-white focus:border-[#0A3D91]"
              value={selectedParcelId}
              onChange={handleParcelSelect}
            >
              <option value="">-- Select parcel from queue --</option>
              {currentQueue.map(p => {
                const pId = p.id || p.Id
                return (
                  <option key={pId} value={pId}>
                    {p.trackingNumber} {p.zone ? `(Zone: ${p.zone})` : ''} — {p.weightKg ?? p.declaredWeightKg ?? '?'}kg
                  </option>
                )
              })}
            </select>
          </div>

          {/* Step 2: Quality Inspection Checklist */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-2">
              Physical Quality Checklist
            </label>
            <InspectionChecklistFields checklist={checklist} setChecklist={setChecklist} />
          </div>

          {/* Step 3: Inspection Result */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Inspection Outcome <span className="text-red-500">*</span>
              </label>
              <select
                className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs bg-white"
                value={result}
                onChange={e => setResult(e.target.value)}
              >
                <option value="Pass">Pass (Good Condition)</option>
                <option value="Damaged">Damaged (Log Exception)</option>
                <option value="Rejected">Rejected (Return to Sender)</option>
              </select>
            </div>

            {/* Step 4: Bin Allocation (Check-in only) */}
            {activeModal?.type === 'checkin' && (
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Bin Allocation <span className="text-red-500">*</span>
                </label>
                {suggestionLoading ? (
                  <div className="p-2.5 border border-[#CBD5E1] rounded-xl text-[11px] text-[#64748B] flex items-center gap-1.5 bg-[#F8FAFC]">
                    <RefreshCw size={14} className="animate-spin text-[#0A3D91]" /> Finding recommended bin…
                  </div>
                ) : suggestionError ? (
                  <Alert type="error" message={`Could not load bins: ${suggestionError.message}`} />
                ) : bins.length === 0 ? (
                  <Alert type="warning" message="No active sorting bins found in database." />
                ) : (
                  <select
                    className="input font-mono w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs bg-white focus:border-[#0A3D91]"
                    value={selectedBinId}
                    onChange={e => setSelectedBinId(e.target.value)}
                  >
                    <option value="">-- Select bin --</option>
                    {bins.map(b => {
                      const bId = b.id || b.Id
                      const bCode = b.binCode || b.BinCode
                      const bZone = b.zone || b.Zone || ''
                      const isRec = bId === suggestedBinId
                      return (
                        <option key={bId} value={bId}>
                          Bin {bCode} {bZone ? `(${bZone})` : ''} {isRec ? '★ Recommended' : ''}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Inspection Notes Textarea */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Inspection Notes <span className="text-[#94A3B8] font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs"
              placeholder="Log physical condition observations or notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Process Error Alert */}
          {processMutation.error && (
            <Alert type="error" message={getErrorMessage(processMutation.error)} />
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0]">
            <button className="btn-secondary text-xs px-4 py-2 rounded-xl" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn-primary text-xs px-5 py-2 rounded-xl font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              disabled={
                !selectedParcelId ||
                (activeModal?.type === 'checkin' && !selectedBinId) ||
                processMutation.isPending
              }
              onClick={() => processMutation.mutate()}
            >
              {processMutation.isPending ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Processing…
                </>
              ) : (
                'Confirm & Process'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}