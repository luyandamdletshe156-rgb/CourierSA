import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, driverApi } from '@/api'

const VEHICLE_TYPES = [
  'Motorcycle',
  'LightDeliveryVehicle',
  'Van',
  'Truck',
  'HeavyTruck',
]

export default function AdminFleetPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [assigningVehicle, setAssigningVehicle] = useState(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [retiringVehicleId, setRetiringVehicleId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  // Queries
  const { data: vehicles = [], isLoading: isLoadingVehicles } = useQuery({
    queryKey: ['admin-vehicles'],
    queryFn: async () => {
      const res = await adminApi.vehicles()
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-directory'],
    queryFn: async () => {
      const res = await driverApi.all()
      return Array.isArray(res) ? res : res?.data || []
    },
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (dto) => adminApi.createVehicle(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] })
      setIsCreateOpen(false)
      setErrorMsg(null)
    },
    onError: (err) => setErrorMsg(err.message || 'Failed to create vehicle.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }) => adminApi.updateVehicle(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] })
      setEditingVehicle(null)
      setErrorMsg(null)
    },
    onError: (err) => setErrorMsg(err.message || 'Failed to update vehicle.'),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, driverId }) => adminApi.assignDriver(id, driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] })
      queryClient.invalidateQueries({ queryKey: ['drivers-directory'] })
      setAssigningVehicle(null)
      setErrorMsg(null)
    },
    onError: (err) => setErrorMsg(err.message || 'Assignment failed.'),
  })

  const retireMutation = useMutation({
    mutationFn: (id) => adminApi.retireVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] })
      setRetiringVehicleId(null)
    },
    onError: (err) => setErrorMsg(err.message || 'Failed to retire vehicle.'),
  })

  const driverMap = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`]))

  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.registrationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.model?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fleet Management</h1>
          <p className="page-subtitle">Add vehicles, assign drivers, and manage fleet lifecycle.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsCreateOpen(true)}>
          + Add New Vehicle
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card flex items-center gap-4">
          <div className="stat-icon">🚛</div>
          <div>
            <div className="text-2xl font-bold text-[#172554]">{vehicles.length}</div>
            <div className="text-xs text-gray-500 font-medium">Total Fleet</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="stat-icon bg-emerald-100 text-emerald-700">✅</div>
          <div>
            <div className="text-2xl font-bold text-[#172554]">
              {vehicles.filter((v) => v.status === 'Active').length}
            </div>
            <div className="text-xs text-gray-500 font-medium">Active Vehicles</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="stat-icon bg-amber-100 text-amber-700">🔧</div>
          <div>
            <div className="text-2xl font-bold text-[#172554]">
              {vehicles.filter((v) => v.status === 'InMaintenance').length}
            </div>
            <div className="text-xs text-gray-500 font-medium">In Maintenance</div>
          </div>
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <input
          type="text"
          className="input sm:w-80"
          placeholder="Search registration, make, model..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Status:</label>
          <select
            className="input !py-1.5 text-xs w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="InMaintenance">In Maintenance</option>
            <option value="Retired">Retired</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Registration</th>
              <th>Make / Model</th>
              <th>Type</th>
              <th>Payload</th>
              <th>Status</th>
              <th>Assigned Driver</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingVehicles ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  Loading fleet data...
                </td>
              </tr>
            ) : filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No vehicles found.
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span className="tracking-number">{v.registrationNumber}</span>
                  </td>
                  <td className="font-medium text-[#172554]">
                    {v.make && v.model ? `${v.make} ${v.model} (${v.year})` : '—'}
                  </td>
                  <td className="text-xs font-semibold text-gray-600">{v.vehicleType}</td>
                  <td className="text-xs font-medium">{v.payloadCapacityKg} kg</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="text-xs font-semibold text-[#0A3D91]">
                    {v.assignedDriverId ? driverMap.get(v.assignedDriverId) || 'Assigned' : 'Unassigned'}
                  </td>
                  <td className="text-right space-x-2">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setAssigningVehicle(v)
                        setSelectedDriverId(v.assignedDriverId || '')
                      }}
                    >
                      Assign
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => setEditingVehicle(v)}>
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setRetiringVehicleId(v.id)}
                    >
                      Retire
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Create / Edit Vehicle */}
      {(isCreateOpen || editingVehicle) && (
        <VehicleFormModal
          vehicle={editingVehicle}
          errorMsg={errorMsg}
          onClose={() => {
            setIsCreateOpen(false)
            setEditingVehicle(null)
            setErrorMsg(null)
          }}
          onSubmit={(dto) => {
            if (editingVehicle) {
              updateMutation.mutate({ id: editingVehicle.id, dto })
            } else {
              createMutation.mutate(dto)
            }
          }}
        />
      )}

      {/* Modal: Assign Driver */}
      {assigningVehicle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-[#172554] mb-2">Assign Driver to Vehicle</h2>
            <p className="text-xs text-gray-500 mb-4">
              Registration: <span className="font-bold">{assigningVehicle.registrationNumber}</span>
            </p>

            {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl mb-4">{errorMsg}</div>}

            <label className="label">Select Driver</label>
            <select
              className="input mb-6"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">-- No Driver (Unassign) --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} ({d.licenseNumber})
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => {
                  setAssigningVehicle(null)
                  setErrorMsg(null)
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() =>
                  assignMutation.mutate({
                    id: assigningVehicle.id,
                    driverId: selectedDriverId || null,
                  })
                }
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Retire */}
      {retiringVehicleId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-xl">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-[#172554] mb-2">Retire Vehicle?</h3>
            <p className="text-xs text-gray-500 mb-6">
              This soft-deletes the vehicle and automatically unassigns any active driver.
            </p>
            <div className="flex gap-3 justify-center">
              <button className="btn-secondary" onClick={() => setRetiringVehicleId(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => retireMutation.mutate(retiringVehicleId)}
              >
                Confirm Retire
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'Active')
    return <span className="status-pill bg-emerald-50 text-emerald-600 border-emerald-500">Active</span>
  if (status === 'InMaintenance')
    return <span className="status-pill bg-amber-50 text-amber-600 border-amber-500">In Maintenance</span>
  return <span className="status-pill bg-slate-50 text-slate-500 border-slate-400">Retired</span>
}

function VehicleFormModal({ vehicle, errorMsg, onClose, onSubmit }) {
  const [reg, setReg] = useState(vehicle?.registrationNumber || '')
  const [make, setMake] = useState(vehicle?.make || '')
  const [model, setModel] = useState(vehicle?.model || '')
  const [year, setYear] = useState(vehicle?.year || new Date().getFullYear())
  const [type, setType] = useState(vehicle?.vehicleType || 'LightDeliveryVehicle')
  const [payloadKg, setPayloadKg] = useState(vehicle?.payloadCapacityKg || 1000)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl">
        <h2 className="text-lg font-bold text-[#172554] mb-4">
          {vehicle ? 'Edit Vehicle Details' : 'Add New Fleet Vehicle'}
        </h2>

        {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl mb-4">{errorMsg}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Registration Number</label>
            <input
              type="text"
              className="input uppercase tracking-wider font-mono"
              placeholder="e.g. CA 123-456"
              value={reg}
              onChange={(e) => setReg(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Make</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Isuzu"
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Model</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. D-Max"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Year</label>
            <input
              type="number"
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="label">Vehicle Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Payload Capacity (kg)</label>
            <input
              type="number"
              className="input"
              value={payloadKg}
              onChange={(e) => setPayloadKg(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              onSubmit({
                registrationNumber: reg,
                make,
                model,
                year,
                vehicleType: type,
                payloadCapacityKg: payloadKg,
              })
            }
          >
            {vehicle ? 'Update Vehicle' : 'Create Vehicle'}
          </button>
        </div>
      </div>
    </div>
  )
}