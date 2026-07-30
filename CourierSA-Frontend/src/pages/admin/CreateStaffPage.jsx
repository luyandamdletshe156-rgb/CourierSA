import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '@/api'
import { Alert, Spinner } from '@/components/ui'
import { ArrowLeft, UserPlus, Mail, Phone, User, CheckCircle } from 'lucide-react'

const STAFF_ROLES = [
  { value: 'Dispatcher',     label: 'Dispatcher',      blurb: 'Approves bookings, dispatches drivers, manages the queue' },
  { value: 'WarehouseStaff', label: 'Warehouse Staff',  blurb: 'Checks parcels in/out of the warehouse' },
  { value: 'Driver',         label: 'Driver',           blurb: 'Delivers parcels, updates delivery status' },
]

const initialForm = {
  firstName: '', lastName: '', email: '', phoneNumber: '', role: 'Dispatcher',
  licenseNumber: '', licenseExpiry: '',
}

// Staff accounts (Dispatcher / WarehouseStaff / Driver) are never self-registered —
// an admin creates them here. The backend generates a temporary password, emails
// it to the new staff member, and forces a password change on their first login.
export function CreateStaffPage() {
  const [form, setForm]         = useState(initialForm)
  const [errors, setErrors]     = useState({})
  const [loading, setLoading]   = useState(false)
  const [apiError, setApiError] = useState('')
  const [created, setCreated]   = useState(null) // { firstName, lastName, email, role }

  const update = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    if (errors[field]) setErrors(er => ({ ...er, [field]: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required'
    if (!form.lastName.trim())  e.lastName  = 'Last name is required'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address'
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(form.phoneNumber.replace(/\s/g, '')))
      e.phoneNumber = 'Enter a valid South African phone number'
    if (form.role === 'Driver') {
      if (!form.licenseNumber.trim()) e.licenseNumber = 'License number is required for drivers'
      if (!form.licenseExpiry) e.licenseExpiry = 'License expiry date is required for drivers'
      else if (new Date(form.licenseExpiry) <= new Date()) e.licenseExpiry = 'License must not be already expired'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setApiError('')
    if (!validate()) return

    setLoading(true)
    try {
      await adminApi.createStaffUser({
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        email:       form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        role:        form.role,
        ...(form.role === 'Driver' && {
          licenseNumber: form.licenseNumber.trim(),
          licenseExpiry: form.licenseExpiry, // yyyy-mm-dd from <input type="date">, ASP.NET binds this fine
        }),
      })
      setCreated({ ...form })
      setForm(initialForm)
    } catch (err) {
      setApiError(
        err?.status === 409
          ? 'An account with this email already exists.'
          : err?.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6FAFF] font-sans">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] mb-6">
          <ArrowLeft size={16} /> Back to Users
        </Link>

        <div className="page-header">
          <div>
            <h1 className="page-title">Create staff account</h1>
            <p className="page-subtitle">
              Dispatchers, warehouse staff, and drivers are added here — they'll receive
              a temporary password by email and set their own on first sign-in.
            </p>
          </div>
        </div>

        {created && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20">
            <CheckCircle size={20} className="text-[#10B981] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#172554]">
                {created.firstName} {created.lastName} was added as {STAFF_ROLES.find(r => r.value === created.role)?.label}
              </p>
              <p className="text-xs text-[#64748B] mt-0.5">
                A temporary password has been emailed to {created.email}.
              </p>
            </div>
          </div>
        )}

        <div className="card">
          {apiError && (
            <div className="mb-5">
              <Alert type="error" message={apiError} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="label mb-3 block">Role</label>
              <div className="grid sm:grid-cols-3 gap-3">
                {STAFF_ROLES.map(r => (
                  <button
                    type="button"
                    key={r.value}
                    onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      form.role === r.value
                        ? 'border-[#1E63E9] bg-[#DCEEFF]/50 ring-2 ring-[#1E63E9]/20'
                        : 'border-[#D8E4F5] hover:border-[#1E63E9]/50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#172554] mb-1">{r.label}</p>
                    <p className="text-xs text-[#64748B] leading-relaxed">{r.blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    id="firstName"
                    className={`input pl-10 ${errors.firstName ? 'input-error' : ''}`}
                    placeholder="Sipho"
                    value={form.firstName}
                    onChange={update('firstName')}
                  />
                </div>
                {errors.firstName && <p className="field-error">{errors.firstName}</p>}
              </div>
              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  className={`input ${errors.lastName ? 'input-error' : ''}`}
                  placeholder="Nkosi"
                  value={form.lastName}
                  onChange={update('lastName')}
                />
                {errors.lastName && <p className="field-error">{errors.lastName}</p>}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="email"
                  type="email"
                  className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
                  placeholder="staff@couriersa.co.za"
                  value={form.email}
                  onChange={update('email')}
                />
              </div>
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div>
              <label className="label" htmlFor="phoneNumber">Phone number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="phoneNumber"
                  type="tel"
                  className={`input pl-10 ${errors.phoneNumber ? 'input-error' : ''}`}
                  placeholder="082 123 4567"
                  value={form.phoneNumber}
                  onChange={update('phoneNumber')}
                />
              </div>
              {errors.phoneNumber && <p className="field-error">{errors.phoneNumber}</p>}
            </div>

            {form.role === 'Driver' && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#F6FAFF] border border-[#D8E4F5]">
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-[#0A3D91] uppercase tracking-wider mb-1">
                    Driver license details
                  </p>
                  <p className="text-xs text-[#64748B] mb-3">Required to create a driver's delivery profile.</p>
                </div>
                <div>
                  <label className="label" htmlFor="licenseNumber">License number</label>
                  <input
                    id="licenseNumber"
                    className={`input ${errors.licenseNumber ? 'input-error' : ''}`}
                    placeholder="e.g. KZN12345678"
                    value={form.licenseNumber}
                    onChange={update('licenseNumber')}
                  />
                  {errors.licenseNumber && <p className="field-error">{errors.licenseNumber}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="licenseExpiry">License expiry</label>
                  <input
                    id="licenseExpiry"
                    type="date"
                    className={`input ${errors.licenseExpiry ? 'input-error' : ''}`}
                    value={form.licenseExpiry}
                    onChange={update('licenseExpiry')}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {errors.licenseExpiry && <p className="field-error">{errors.licenseExpiry}</p>}
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>
              {loading ? <Spinner size="sm" className="text-white" /> : (
                <>
                  <UserPlus size={16} /> Create staff account
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default CreateStaffPage