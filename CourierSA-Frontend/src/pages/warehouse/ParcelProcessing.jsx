import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert } from '@/components/ui'
import { parcelApi } from '@/api'
import { PackageCheck, PackagePlus, CheckCircle, Search, ClipboardCheck, ArrowRightLeft, History } from 'lucide-react'
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
    <div className="space-y-2">
      {[
        { key: 'packagingIntact', label: 'packaging intact checked' },
        { key: 'noMoistureDamage', label: 'no moisture damage checked' },
        { key: 'weightMatchesDeclared', label: 'weight matches declared checked' },
        { key: 'sealIntact', label: 'seal intact checked' }
      ].map(({ key, label }) => (
        <label key={key} className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl border border-[#D8E4F5] hover:bg-[#F6FAFF]">
          <input type="checkbox" checked={!!checklist[key]} onChange={() => toggle(key)} className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5]" />
          <span className="text-sm font-medium text-[#334155]">{label}</span>
        </label>
      ))}
    </div>
  )
}

export function ParcelProcessingPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('checkin') 
  const [activeModal, setActiveModal] = useState(null)
  const [scanConfirm, setScanConfirm] = useState('')
  const [checklist, setChecklist] = useState(emptyChecklist)
  const [result, setResult] = useState('Pass')
  const [notes, setNotes] = useState('')
  const [selectedBinId, setSelectedBinId] = useState('')

  const { data: checkinData } = useQuery({ queryKey: ['q-checkin'], queryFn: () => parcelApi.queue({ status: 'AwaitingCheckIn', pageSize: 50 }) })
  const { data: checkoutData } = useQuery({ queryKey: ['q-checkout'], queryFn: () => parcelApi.queue({ status: 'InWarehouse', pageSize: 50 }) })
  const { data: historyData } = useQuery({ queryKey: ['q-history'], queryFn: () => parcelApi.inspections() })
  
  // Safely resolve the Parcel ID regardless of property casing
  const parcelId = activeModal?.parcel?.id || activeModal?.parcel?.Id || activeModal?.parcel?.parcelId

  const { data: suggestionData, isLoading: suggestionLoading, error: suggestionError } = useQuery({ 
    queryKey: ['q-suggest', parcelId], 
    queryFn: async () => {
      if (!parcelId) return null

      if (typeof parcelApi?.getSortingSuggestion === 'function') {
        return await parcelApi.getSortingSuggestion(parcelId)
      }

      const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('accessToken') || ''
      const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      const res = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/sorting-suggestion`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`)
      }

      return await res.json()
    }, 
    enabled: activeModal?.type === 'checkin' && !!parcelId 
  })

  // Extract bins safely from response wrappers
  const rawSuggestion = suggestionData?.data?.bins 
    ? suggestionData.data 
    : (suggestionData?.bins ? suggestionData : suggestionData?.data)

  const bins = rawSuggestion?.bins ?? []
  const suggestedBinId = rawSuggestion?.suggestedBinId

  // Auto-select the recommended bin ID when suggestions load
  useEffect(() => { 
    if (suggestedBinId) {
      setSelectedBinId(suggestedBinId) 
    }
  }, [suggestedBinId])

  const parcelsCheckin = checkinData?.data?.items ?? checkinData?.items ?? checkinData?.data ?? []
  const parcelsCheckout = checkoutData?.data?.items ?? checkoutData?.items ?? checkoutData?.data ?? []
  const inspections = historyData?.data ?? historyData ?? []

  const closeModal = () => { 
    setActiveModal(null)
    setScanConfirm('')
    setChecklist(emptyChecklist)
    setResult('Pass')
    setNotes('')
    setSelectedBinId('') 
  }

  const processMutation = useMutation({
    mutationFn: async () => {
      // Map enums to C# numeric enum values (0 = CheckIn/Pass, 1 = Checkout/Damaged, 2 = Rejected)
      const stageValue = activeModal.type === 'checkin' ? 0 : 1
      const resultValue = result === 'Damaged' ? 1 : result === 'Rejected' ? 2 : 0

      const inspectionBody = {
        stage: stageValue,
        result: resultValue,
        packagingIntact: Boolean(checklist.packagingIntact),
        noMoistureDamage: Boolean(checklist.noMoistureDamage),
        weightMatchesDeclared: Boolean(checklist.weightMatchesDeclared),
        fragileHandlingOk: Boolean(checklist.fragileHandlingOk),
        sealIntact: Boolean(checklist.sealIntact),
        notes: notes || null
      }

      // 1. Log the Inspection
      if (typeof parcelApi?.logInspection === 'function') {
        await parcelApi.logInspection(parcelId, inspectionBody)
      } else {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('accessToken') || ''
        const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
        
        const res = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/inspections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(inspectionBody)
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          const msg = errData?.message || errData?.title || (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
          throw new Error(msg || `Inspection failed (${res.status})`)
        }
      }

      // 2. Perform CheckIn or Checkout
      if (activeModal.type === 'checkin') {
        if (typeof parcelApi?.checkIn === 'function') {
          await parcelApi.checkIn(parcelId, { sortingBinId: selectedBinId })
        } else {
          const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('accessToken') || ''
          const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
          const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

          const res = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/checkin`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ sortingBinId: selectedBinId })
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => null)
            const msg = errData?.message || errData?.title || (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
            throw new Error(msg || `Check-in failed (${res.status})`)
          }
        }
      } else {
        if (typeof parcelApi?.checkout === 'function') {
          await parcelApi.checkout(parcelId)
        } else {
          const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('accessToken') || ''
          const baseUrl = import.meta.env?.VITE_API_BASE_URL || '/api'
          const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

          const res = await fetch(`${cleanBaseUrl}/parcels/${parcelId}/checkout`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => null)
            const msg = errData?.message || errData?.title || (errData?.errors ? Object.values(errData.errors).flat().join(', ') : null)
            throw new Error(msg || `Checkout failed (${res.status})`)
          }
        }
      }
    },
    onSuccess: () => { 
      qc.invalidateQueries()
      closeModal() 
    }
  })

  // Helper to extract detailed server error messages
  const getErrorMessage = (err) => {
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
      <div className="page-header">
        <div><h1 className="page-title">Parcel Processing</h1><p className="page-subtitle">Inspect, check-in, and release</p></div>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { id: 'checkin', label: 'Awaiting Check-in', icon: PackagePlus },
          { id: 'checkout', label: 'Awaiting Checkout', icon: PackageCheck },
          { id: 'history', label: 'History', icon: History }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx('px-5 py-2.5 rounded-xl text-sm font-semibold border-2 flex items-center gap-2', activeTab === tab.id ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B]')}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'checkin' && (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Tracking #</th><th>Zone</th><th>Weight</th><th>Action</th></tr></thead>
              <tbody>
                {parcelsCheckin.map(p => (
                  <tr key={p.id || p.Id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td><td>{p.zone ?? '—'}</td><td>{p.weightKg} kg</td>
                    <td><button className="btn-primary btn-sm" onClick={() => setActiveModal({ type: 'checkin', parcel: p })}><Search size={14}/> Process</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'checkout' && (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Tracking #</th><th>Bin</th><th>Weight</th><th>Action</th></tr></thead>
              <tbody>
                {parcelsCheckout.map(p => (
                  <tr key={p.id || p.Id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td><td className="font-bold">{p.binCode ?? '—'}</td><td>{p.weightKg} kg</td>
                    <td><button className="btn-primary btn-sm" onClick={() => setActiveModal({ type: 'checkout', parcel: p })}><ArrowRightLeft size={14}/> Process</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'history' && (
           <div className="table-container">
           <table className="table">
             <thead><tr><th>Tracking #</th><th>Stage</th><th>Result</th><th>Date</th></tr></thead>
             <tbody>
               {inspections.map(i => (
                 <tr key={i.id || i.Id}>
                   <td><TrackingBadge value={i.trackingNumber} /></td><td>{i.stage}</td><td className="font-bold">{i.result}</td><td className="font-mono text-xs">{formatDate(i.createdAt)}</td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
        )}
      </div>

      <Modal open={!!activeModal} onClose={closeModal} title="Process Parcel" size="md">
        <label className="label">Confirm tracking number</label>
        <input type="text" className="input font-mono mb-4" value={scanConfirm} onChange={e => setScanConfirm(e.target.value.toUpperCase())} autoFocus />
        
        <InspectionChecklistFields checklist={checklist} setChecklist={setChecklist} />
        
        <select className="input mt-4" value={result} onChange={e => setResult(e.target.value)}>
          <option value="Pass">Pass</option><option value="Damaged">Damaged</option><option value="Rejected">Rejected</option>
        </select>

        {activeModal?.type === 'checkin' && (
          <div>
            <label className="label mt-4">Sorting Bin Allocation</label>
            {suggestionLoading ? (
              <p className="text-xs text-[#94A3B8] mt-1 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#0A3D91] animate-ping" />
                Loading recommended bins...
              </p>
            ) : suggestionError ? (
              <Alert type="error" message={`Could not load bins: ${suggestionError.message}`} className="mt-2" />
            ) : bins.length === 0 ? (
              <Alert type="warning" message="No active sorting bins found in database. Create bins in Inventory first." className="mt-2" />
            ) : (
              <select 
                className="input mt-1 bg-white focus:ring-2 focus:ring-[#0A3D91]" 
                value={selectedBinId} 
                onChange={e => setSelectedBinId(e.target.value)}
              >
                <option value="">Select bin...</option>
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

        {processMutation.error && (
          <Alert type="error" message={getErrorMessage(processMutation.error)} className="mt-4" />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button 
            className="btn-primary" 
            disabled={scanConfirm !== activeModal?.parcel?.trackingNumber || (activeModal?.type === 'checkin' && !selectedBinId) || processMutation.isPending} 
            onClick={() => processMutation.mutate()}
          >
            {processMutation.isPending ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}