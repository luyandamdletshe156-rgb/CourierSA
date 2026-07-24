import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Papa from 'papaparse'
import AppShell from '@/components/layout/AppShell'
import { Alert, Spinner, EmptyState, PageLoader, Modal } from '@/components/ui'
import { bulkUploadApi } from '@/api'
import {
  Upload, Download, FileText, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, RotateCcw,
  Package, Clock, Info, Eye, Send
} from 'lucide-react'
import { formatDate, formatZAR, SA_PROVINCES } from '@/utils'
import clsx from 'clsx'

// ── Expected CSV columns (matches backend template) ───────────────────────────
const REQUIRED_COLS = [
  'PickupName','PickupPhone','PickupStreet','PickupCity','PickupProvince','PickupPostalCode',
  'DeliveryName','DeliveryPhone','DeliveryStreet','DeliveryCity','DeliveryProvince','DeliveryPostalCode',
  'ServiceType','WeightKg','Description',
]
const ALL_COLS = [
  ...REQUIRED_COLS,
  'PickupEmail','PickupSuburb','DeliveryEmail','DeliverySuburb',
  'DeclaredValue','IsFragile','RequiresSignature','InsuranceRequired',
  'SpecialInstructions','LengthCm','WidthCm','HeightCm','ClientReference',
]

const VALID_SERVICE_TYPES  = new Set(['Economy','Standard','Express','Overnight','SameDay','Same Day'])
const SA_PHONE_RE          = /^(\+27|0)[6-8][0-9]{8}$/
const POSTAL_RE            = /^\d{4}$/
const VALID_PROVINCES      = new Set([
  'Gauteng','WesternCape','EasternCape','KwaZuluNatal',
  'Limpopo','Mpumalanga','NorthWest','NorthernCape','FreeState',
  // aliases
  'Western Cape','Eastern Cape','KwaZulu-Natal','KwaZulu Natal',
  'North West','Northern Cape','Free State',
  'GP','WC','EC','KZN','LP','MP','NW','NC','FS',
])

// ── Client-side row validator (mirrors backend logic) ─────────────────────────
function validateRow(row, rowIndex) {
  const errors = []
  const req = (field, label) => {
    if (!row[field]?.trim()) errors.push(`${label} is required`)
  }
  const phone = (field, label) => {
    if (row[field] && !SA_PHONE_RE.test(row[field].trim()))
      errors.push(`${label}: invalid SA number (e.g. +27821234567 or 0821234567)`)
  }
  const postal = (field, label) => {
    if (row[field] && !POSTAL_RE.test(row[field].trim()))
      errors.push(`${label} must be 4 digits`)
  }
  const province = (field, label) => {
    if (!VALID_PROVINCES.has(row[field]?.trim()))
      errors.push(`${label} '${row[field]}' is not a recognised SA province`)
  }

  req('PickupName',   'Pickup name')
  phone('PickupPhone','Pickup phone')
  req('PickupStreet', 'Pickup street')
  req('PickupCity',   'Pickup city')
  province('PickupProvince', 'Pickup province')
  postal('PickupPostalCode', 'Pickup postal code')

  req('DeliveryName',   'Delivery name')
  phone('DeliveryPhone','Delivery phone')
  req('DeliveryStreet', 'Delivery street')
  req('DeliveryCity',   'Delivery city')
  province('DeliveryProvince', 'Delivery province')
  postal('DeliveryPostalCode', 'Delivery postal code')

  if (!VALID_SERVICE_TYPES.has(row['ServiceType']?.trim()))
    errors.push(`ServiceType '${row['ServiceType']}' must be one of: Economy, Standard, Express, Overnight, SameDay`)

  const w = parseFloat(row['WeightKg'])
  if (isNaN(w) || w < 0.1 || w > 999)
    errors.push('WeightKg must be a number between 0.1 and 999')

  if (!row['Description']?.trim())
    errors.push('Description is required')

  if (row['DeclaredValue'] && isNaN(parseFloat(row['DeclaredValue'])))
    errors.push('DeclaredValue must be a number')

  const hasL = row['LengthCm']?.trim()
  const hasW = row['WidthCm']?.trim()
  const hasH = row['HeightCm']?.trim()
  if ((hasL || hasW || hasH) && !(hasL && hasW && hasH))
    errors.push('Dimensions: LengthCm, WidthCm, and HeightCm must all be provided together')

  return errors
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFile, disabled }) {
  const inputRef            = useRef()
  const [dragging, setDrag] = useState(false)

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  const handleChange = e => {
    if (e.target.files[0]) onFile(e.target.files[0])
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={clsx(
        'relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer',
        'transition-all duration-200',
        dragging
          ? 'border-brand-400 bg-brand-50 scale-[1.01]'
          : 'border-gray-300 hover:border-brand-300 hover:bg-gray-50',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className={clsx(
        'w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4',
        dragging ? 'bg-brand-100' : 'bg-gray-100'
      )}>
        <Upload size={24} className={dragging ? 'text-brand-500' : 'text-gray-400'} />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">
        {dragging ? 'Drop your CSV here' : 'Drag & drop your CSV file'}
      </p>
      <p className="text-xs text-gray-500">
        or <span className="text-brand-500 font-medium">browse</span> to select · max 10 MB
      </p>
    </div>
  )
}

// ── Preview table row ─────────────────────────────────────────────────────────
function PreviewRow({ row, index, defaultExpanded = false }) {
  const [open, setOpen] = useState(defaultExpanded && row.errors.length > 0)
  const hasErrors = row.errors.length > 0

  return (
    <div className={clsx(
      'border rounded-lg overflow-hidden transition-colors',
      hasErrors ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'
    )}>
      <button
        type="button"
        onClick={() => hasErrors && setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          hasErrors ? 'cursor-pointer hover:bg-red-50/50' : 'cursor-default'
        )}
      >
        {/* Row status */}
        <div className="flex-shrink-0">
          {hasErrors
            ? <XCircle size={16} className="text-red-500" />
            : <CheckCircle size={16} className="text-emerald-500" />}
        </div>

        {/* Row number */}
        <span className="text-xs font-mono text-gray-400 w-10 flex-shrink-0">
          #{row.rowNumber}
        </span>

        {/* Recipient */}
        <span className="text-sm font-medium text-gray-800 min-w-0 truncate flex-1">
          {row.DeliveryName || '—'}
        </span>

        {/* Destination */}
        <span className="text-xs text-gray-500 hidden sm:block w-32 truncate">
          {row.DeliveryCity || '—'}, {row.DeliveryProvince || '—'}
        </span>

        {/* Service */}
        <span className="text-xs text-gray-500 hidden md:block w-20 truncate">
          {row.ServiceType || '—'}
        </span>

        {/* Weight */}
        <span className="text-xs text-gray-500 hidden md:block w-16 text-right">
          {row.WeightKg ? `${row.WeightKg} kg` : '—'}
        </span>

        {/* Client ref */}
        {row.ClientReference && (
          <span className="text-xs font-mono text-gray-400 hidden lg:block w-28 truncate">
            {row.ClientReference}
          </span>
        )}

        {/* Error count / expand */}
        {hasErrors && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              {row.errors.length} error{row.errors.length > 1 ? 's' : ''}
            </span>
            {open ? <ChevronUp size={14} className="text-red-400" />
                  : <ChevronDown size={14} className="text-red-400" />}
          </div>
        )}
      </button>

      {/* Expanded errors */}
      {open && hasErrors && (
        <div className="px-4 pb-3 pt-1 border-t border-red-200">
          <ul className="space-y-1">
            {row.errors.map((err, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-600">
                <span className="mt-0.5 flex-shrink-0">•</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Results table after upload ────────────────────────────────────────────────
function ResultsTable({ result }) {
  const [filter, setFilter] = useState('all')

  const rows = result.rows.filter(r =>
    filter === 'all'     ? true :
    filter === 'success' ? r.success :
    !r.success
  )

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={clsx(
        'flex items-start gap-4 px-5 py-4 rounded-xl border',
        result.failed === 0
          ? 'bg-emerald-50 border-emerald-200'
          : result.successful === 0
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
      )}>
        <div className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          result.failed === 0 ? 'bg-emerald-100' :
          result.successful === 0 ? 'bg-red-100' : 'bg-amber-100'
        )}>
          {result.failed === 0
            ? <CheckCircle size={20} className="text-emerald-600" />
            : result.successful === 0
              ? <XCircle size={20} className="text-red-600" />
              : <AlertTriangle size={20} className="text-amber-600" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">
            {result.failed === 0
              ? `All ${result.successful} parcels booked successfully`
              : result.successful === 0
                ? `Upload failed — all ${result.failed} rows had errors`
                : `${result.successful} parcels booked · ${result.failed} rows skipped`}
          </p>
          <p className="text-xs text-gray-500">
            Upload ID: <span className="font-mono">{result.uploadId}</span> ·{' '}
            {formatDate(result.processedAt, { time: true })}
          </p>
        </div>

        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-4 text-center flex-shrink-0">
          <div>
            <p className="text-lg font-bold text-emerald-700">{result.successful}</p>
            <p className="text-xs text-gray-500">Booked</p>
          </div>
          {result.failed > 0 && (
            <div>
              <p className="text-lg font-bold text-red-600">{result.failed}</p>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {[
          { key: 'all',     label: `All (${result.rows.length})` },
          { key: 'success', label: `✓ Booked (${result.successful})` },
          { key: 'failed',  label: `✗ Failed (${result.failed})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              filter === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm',
            row.success
              ? 'bg-white border-gray-200'
              : 'bg-red-50/40 border-red-200'
          )}>
            {row.success
              ? <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" />
              : <XCircle    size={15} className="text-red-500 flex-shrink-0" />}

            <span className="font-mono text-xs text-gray-400 w-8 flex-shrink-0">
              #{row.rowNumber}
            </span>

            <span className="font-medium text-gray-800 flex-1 min-w-0 truncate">
              {row.recipientName || '—'}
            </span>

            <span className="text-xs text-gray-500 hidden sm:block">
              {row.destinationCity}
            </span>

            {row.success ? (
              <span className="font-mono text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-100 flex-shrink-0">
                {row.trackingNumber}
              </span>
            ) : (
              <span className="text-xs text-red-600 max-w-xs truncate text-right flex-shrink-0">
                {row.errors[0]}
                {row.errors.length > 1 && ` (+${row.errors.length - 1} more)`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Upload history ────────────────────────────────────────────────────────────
function UploadHistory() {
  const [detailUploadId, setDetailUploadId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['bulk-upload-history'],
    queryFn:  () => bulkUploadApi.history(),
    staleTime: 0,
  })

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['bulk-upload-detail', detailUploadId],
    queryFn:  () => bulkUploadApi.historyDetail(detailUploadId),
    enabled:  !!detailUploadId,
  })

  const history = data?.data ?? []
  const detail  = detailData?.data

  if (isLoading) return <PageLoader />
  if (history.length === 0)
    return (
      <EmptyState
        icon={Clock}
        title="No upload history"
        description="Your previous bulk uploads will appear here."
      />
    )

  return (
    <>
      <div className="divide-y divide-gray-100">
        {history.map(h => (
          <div key={h.uploadId} className="flex items-center gap-4 py-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              h.failed === 0 ? 'bg-emerald-50' : h.successful === 0 ? 'bg-red-50' : 'bg-amber-50'
            )}>
              <FileText size={16} className={
                h.failed === 0 ? 'text-emerald-500' :
                h.successful === 0 ? 'text-red-500' : 'text-amber-500'
              } />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{h.fileName}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(h.uploadedAt, { time: true })} ·{' '}
                <span className="font-mono text-gray-400">{h.uploadId}</span>
              </p>
            </div>
            <div className="text-right flex-shrink-0 mr-2">
              <p className="text-sm font-semibold text-gray-800">{h.totalRows} rows</p>
              <p className="text-xs mt-0.5">
                <span className="text-emerald-600 font-medium">{h.successful} ok</span>
                {h.failed > 0 && (
                  <span className="text-red-500 font-medium ml-1.5">{h.failed} failed</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setDetailUploadId(h.uploadId)}
              className="btn-ghost btn-sm flex-shrink-0"
              title="View row results"
            >
              <Eye size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!detailUploadId}
        onClose={() => setDetailUploadId(null)}
        title={`Upload results — ${detailUploadId}`}
        size="xl"
      >
        {detailLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-lg font-bold text-gray-900">{detail.totalRows}</p>
                <p className="text-xs text-gray-500">Total rows</p>
              </div>
              <div className="bg-emerald-50 rounded-lg px-3 py-2">
                <p className="text-lg font-bold text-emerald-700">{detail.successful}</p>
                <p className="text-xs text-gray-500">Booked</p>
              </div>
              <div className={clsx('rounded-lg px-3 py-2', detail.failed > 0 ? 'bg-red-50' : 'bg-gray-50')}>
                <p className={clsx('text-lg font-bold', detail.failed > 0 ? 'text-red-600' : 'text-gray-400')}>
                  {detail.failed}
                </p>
                <p className="text-xs text-gray-500">Failed</p>
              </div>
            </div>

            {/* Row list */}
            <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-1.5">
              {(detail.rows ?? []).map((row, i) => (
                <div key={i} className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm',
                  row.success ? 'bg-white border-gray-200' : 'bg-red-50/40 border-red-200'
                )}>
                  {row.success
                    ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                    : <XCircle    size={14} className="text-red-500 flex-shrink-0" />}
                  <span className="font-mono text-xs text-gray-400 w-8 flex-shrink-0">#{row.rowNumber}</span>
                  <span className="font-medium text-gray-800 flex-1 min-w-0 truncate">
                    {row.recipientName || '—'}
                  </span>
                  <span className="text-xs text-gray-500 hidden sm:block">{row.destinationCity}</span>
                  {row.success ? (
                    <span className="font-mono text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-100 flex-shrink-0">
                      {row.trackingNumber}
                    </span>
                  ) : (
                    <span className="text-xs text-red-600 max-w-[200px] truncate text-right flex-shrink-0">
                      {row.errors?.[0]}
                      {row.errors?.length > 1 && ` (+${row.errors.length - 1})`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, label }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BulkUploadPage() {
  const [file,        setFile]        = useState(null)
  const [preview,     setPreview]     = useState(null)   // { rows, validCount, invalidCount }
  const [stage,       setStage]       = useState('idle') // idle | previewing | uploading | done | error
  const [progress,    setProgress]    = useState(0)
  const [result,      setResult]      = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [activeTab,   setActiveTab]   = useState('upload') // upload | history

  // ── Client-side CSV preview ───────────────────────────────────────────────
  const handleFile = useCallback(f => {
    if (!f.name.endsWith('.csv')) {
      setUploadError('Please select a .csv file.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 10 MB.')
      return
    }

    setFile(f)
    setUploadError('')
    setStage('previewing')
    setPreview(null)

    Papa.parse(f, {
      header:     true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: parsed => {
        if (parsed.errors.length && parsed.data.length === 0) {
          setUploadError('Could not parse CSV. Check the file format and try again.')
          setStage('idle')
          return
        }

        // Check required columns
        const cols    = Object.keys(parsed.data[0] ?? {})
        const missing = REQUIRED_COLS.filter(c => !cols.includes(c))
        if (missing.length > 0) {
          setUploadError(
            `CSV is missing required columns: ${missing.join(', ')}. Download the template to see the correct format.`
          )
          setStage('idle')
          return
        }

        const rows = parsed.data.map((row, i) => ({
          rowNumber:       i + 2, // +2: 1-based + header row
          ...row,
          errors: validateRow(row, i),
        }))

        setPreview({
          rows,
          validCount:   rows.filter(r => r.errors.length === 0).length,
          invalidCount: rows.filter(r => r.errors.length > 0).length,
          totalCount:   rows.length,
        })
        setStage('previewed')
      },
      error: err => {
        setUploadError(`Parse error: ${err.message}`)
        setStage('idle')
      },
    })
  }, [])

  // ── Upload mutation ───────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (f) => {
      // Simulate progress animation (real progress requires XMLHttpRequest)
      const tick = setInterval(() => {
        setProgress(p => Math.min(p + Math.random() * 12, 88))
      }, 350)

      try {
        const res = await bulkUploadApi.upload(f)
        clearInterval(tick)
        setProgress(100)
        return res
      } catch (err) {
        clearInterval(tick)
        throw err
      }
    },
    onSuccess: (res) => {
      // 207 Multi-Status for partial success also lands here after axios unwrap
      setResult(res.data ?? res)
      setStage('done')
    },
    onError: (err) => {
      setUploadError(err.message)
      setStage('previewed')
      setProgress(0)
    },
  })

  const handleUpload = () => {
    if (!file || !preview) return
    setUploadError('')
    setProgress(0)
    setStage('uploading')
    uploadMutation.mutate(file)
  }

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setStage('idle')
    setProgress(0)
    setResult(null)
    setUploadError('')
  }

  const downloadTemplate = () => {
    window.open(bulkUploadApi.template(), '_blank')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Bulk Upload">
      <div className="max-w-4xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Bulk parcel upload</h1>
            <p className="page-subtitle">
              Upload a CSV to book multiple parcels at once — up to 500 rows per file
            </p>
          </div>
          <button onClick={downloadTemplate} className="btn-secondary">
            <Download size={15} />
            Download template
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
          {[
            { key: 'upload',  label: 'Upload',  icon: Upload },
            { key: 'history', label: 'History', icon: Clock  },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                activeTab === key
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'history' ? (
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-semibold text-gray-800">Upload history</h2>
            </div>
            <UploadHistory />
          </div>
        ) : (

          <div className="space-y-5">
            {/* ── Step 1: Drop zone (shown until file selected) ── */}
            {stage === 'idle' && (
              <>
                <Alert type="info" message={uploadError} />
                <DropZone onFile={handleFile} disabled={false} />

                {/* Format guide */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <Info size={15} className="text-brand-500" />
                      CSV format guide
                    </h3>
                  </div>
                  <div className="space-y-3 text-sm text-gray-600">
                    <p>Your CSV must have a header row with the following columns:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { label: 'Required columns', cols: REQUIRED_COLS, color: 'bg-red-50 text-red-700 border-red-200' },
                        { label: 'Optional columns', cols: ALL_COLS.filter(c => !REQUIRED_COLS.includes(c)), color: 'bg-gray-50 text-gray-600 border-gray-200' },
                      ].map(({ label, cols, color }) => (
                        <div key={label}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {cols.map(c => (
                              <span key={c} className={clsx('text-xs px-2 py-0.5 rounded border font-mono', color)}>
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-gray-100 space-y-1 text-xs text-gray-500">
                      <p>• Phone numbers: SA format — <code className="bg-gray-100 px-1 rounded">+27821234567</code> or <code className="bg-gray-100 px-1 rounded">0821234567</code></p>
                      <p>• Province: full name (<code className="bg-gray-100 px-1 rounded">Gauteng</code>) or abbreviation (<code className="bg-gray-100 px-1 rounded">GP</code>)</p>
                      <p>• Postal code: 4-digit SA postal code</p>
                      <p>• ServiceType: Economy, Standard, Express, Overnight, SameDay</p>
                      <p>• IsFragile / RequiresSignature / InsuranceRequired: <code className="bg-gray-100 px-1 rounded">true</code> / <code className="bg-gray-100 px-1 rounded">false</code></p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Step 2: Parsing spinner ── */}
            {stage === 'previewing' && (
              <div className="card flex flex-col items-center py-14 gap-4">
                <Spinner size="lg" />
                <p className="text-sm text-gray-500">Reading <strong>{file?.name}</strong>…</p>
              </div>
            )}

            {/* ── Step 3: Preview results ── */}
            {(stage === 'previewed' || stage === 'uploading') && preview && (
              <>
                {/* File info bar */}
                <div className="card flex items-center gap-4">
                  <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-brand-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{file?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {preview.totalCount} rows ·{' '}
                      <span className="text-emerald-600 font-medium">{preview.validCount} valid</span>
                      {preview.invalidCount > 0 && (
                        <span className="text-red-500 font-medium"> · {preview.invalidCount} with errors</span>
                      )}
                    </p>
                  </div>
                  {stage === 'previewed' && (
                    <button
                      onClick={handleReset}
                      className="btn-ghost btn-sm flex-shrink-0"
                    >
                      <RotateCcw size={14} /> Change file
                    </button>
                  )}
                </div>

                {/* Upload progress */}
                {stage === 'uploading' && (
                  <div className="card">
                    <ProgressBar
                      value={progress}
                      label={`Uploading and booking ${preview.validCount} parcels…`}
                    />
                    <p className="text-xs text-gray-400 mt-3 text-center">
                      Do not close this window. Invalid rows will be skipped and reported below.
                    </p>
                  </div>
                )}

                {/* Validation summary + all-valid shortcut */}
                {stage === 'previewed' && (
                  <>
                    {preview.invalidCount === 0 ? (
                      <div className="flex items-center gap-3 px-5 py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-emerald-800">
                            All {preview.totalCount} rows passed validation
                          </p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Ready to submit — click Upload to book all parcels.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-900">
                            {preview.invalidCount} row{preview.invalidCount > 1 ? 's' : ''} have errors
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            {preview.validCount > 0
                              ? `The ${preview.validCount} valid rows will still be booked. Fix the errors and re-upload the full file to book the remaining parcels.`
                              : 'Fix the errors below and re-upload the file.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <Alert type="error" message={uploadError} />

                    {/* Action buttons */}
                    <div className="flex justify-between items-center">
                      <button onClick={handleReset} className="btn-secondary">
                        <RotateCcw size={15} /> Start over
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={preview.validCount === 0}
                        className="btn-primary px-6"
                      >
                        <Send size={15} />
                        {preview.invalidCount > 0
                          ? `Upload ${preview.validCount} valid rows`
                          : `Upload all ${preview.totalCount} parcels`}
                      </button>
                    </div>
                  </>
                )}

                {/* Per-row preview list */}
                {stage === 'previewed' && (
                  <div className="card">
                    <div className="card-header">
                      <h3 className="text-sm font-semibold text-gray-800">
                        Row preview
                      </h3>
                      <span className="text-xs text-gray-400">
                        Click a row with errors to expand details
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
                      {preview.rows.map((row, i) => (
                        <PreviewRow key={i} row={row} index={i} defaultExpanded={i < 3} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Step 4: Upload results ── */}
            {stage === 'done' && result && (
              <>
                <ResultsTable result={result} />
                <div className="flex justify-between items-center pt-2">
                  <button onClick={handleReset} className="btn-secondary">
                    <Upload size={15} /> Upload another file
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="btn-ghost"
                  >
                    <Clock size={15} /> View history
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
