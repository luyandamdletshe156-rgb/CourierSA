import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert } from '@/components/ui'
import { parcelApi } from '@/api'
import { PackageCheck, PackagePlus, CheckCircle, Search, ClipboardCheck, ArrowRightLeft, History } from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

const emptyChecklist = { packagingIntact: false, noMoistureDamage: false, weightMatchesDeclared: false, fragileHandlingOk: null, sealIntact: false }

function InspectionChecklistFields({ checklist, setChecklist, isFragile }) {
  const toggle = key => setChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  return (
    <div className="space-y-2">
      {['packagingIntact', 'noMoistureDamage', 'weightMatchesDeclared', 'sealIntact'].map(k => (
        <label key={k} className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl border border-[#D8E4F5] hover:bg-[#F6FAFF]">
          <input type="checkbox" checked={!!checklist[k]} onChange={() => toggle(k)} className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5]" />
          <span className="text-sm font-medium text-[#334155]">{k.replace(/([A-Z])/g, ' $1').toLowerCase()} checked</span>
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
  const { data: suggestionData } = useQuery({ queryKey: ['q-suggest', activeModal?.parcel?.id], queryFn: () => parcelApi.getSortingSuggestion(activeModal.parcel.id), enabled: activeModal?.type === 'checkin' })

  useEffect(() => { if (suggestionData?.data?.suggestedBinId) setSelectedBinId(suggestionData.data.suggestedBinId) }, [suggestionData])

  const parcelsCheckin = checkinData?.data?.items ?? []
  const parcelsCheckout = checkoutData?.data?.items ?? []
  const inspections = historyData?.data ?? []

  const closeModal = () => { setActiveModal(null); setScanConfirm(''); setChecklist(emptyChecklist); setResult('Pass'); setNotes(''); setSelectedBinId('') }

  const processMutation = useMutation({
    mutationFn: async () => {
      await parcelApi.logInspection(activeModal.parcel.id, { stage: activeModal.type === 'checkin' ? 'CheckIn' : 'Checkout', ...checklist, result, notes })
      if (activeModal.type === 'checkin') await parcelApi.checkIn(activeModal.parcel.id, { sortingBinId: selectedBinId })
      else await parcelApi.checkout(activeModal.parcel.id)
    },
    onSuccess: () => { qc.invalidateQueries(); closeModal() }
  })

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
                  <tr key={p.id}>
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
                  <tr key={p.id}>
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
                 <tr key={i.id}>
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
        
        <select className="input mt-4" value={result} onChange={e=>setResult(e.target.value)}>
          <option value="Pass">Pass</option><option value="Damaged">Damaged</option><option value="Rejected">Rejected</option>
        </select>

        {activeModal?.type === 'checkin' && (
          <select className="input mt-4" value={selectedBinId} onChange={e => setSelectedBinId(e.target.value)}>
            <option value="">Select bin...</option>
            {suggestionData?.data?.bins?.map(b => <option key={b.id} value={b.id}>Bin {b.binCode}</option>)}
          </select>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button className="btn-primary" disabled={scanConfirm !== activeModal?.parcel?.trackingNumber || (activeModal?.type === 'checkin' && !selectedBinId) || processMutation.isPending} onClick={() => processMutation.mutate()}>
            Confirm
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}