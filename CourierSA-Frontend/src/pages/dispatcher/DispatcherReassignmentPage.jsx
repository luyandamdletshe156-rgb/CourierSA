import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dispatcherApi, driverApi } from '@/api'

export default function DispatcherReassignmentPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('ALL')
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [newDriverId, setNewDriverId] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)

  // Queries
  const { data: fleet = [], isLoading } = useQuery({
    queryKey: ['dispatcher-fleet'],
    queryFn: async () => {
      const res = await dispatcherApi.vehicles()
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

  // Mutation
  const reassignMutation = useMutation({
    mutationFn: ({ id, driverId }) => dispatcherApi.reassignDriver(id, driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatcher-fleet'] })
      queryClient.invalidateQueries({ queryKey: ['drivers-directory'] })
      setSelectedVehicle(null)
      setErrorMsg(null)
    },
    onError: (err) => setErrorMsg(err.message || 'Failed to reassign driver.'),
  })

  const filteredFleet = fleet.filter((v) => {
    if (filter === 'MAINTENANCE') return v.status === 'InMaintenance'
    if (filter === 'ACTIVE') return v.status === 'Active'
    return true
  })

  const needingSwapCount = fleet.filter(
    (v) => v.status === 'InMaintenance' || v.lastInspection?.result === 'Fail'
  ).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatcher Fleet & Driver Swaps</h1>
          <p className="page-subtitle">
            Reassign drivers when vehicles enter maintenance or fail inspection.
          </p>
        </div>
      </div>

      {needingSwapCount > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-amber-800">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <span className="font-bold text-sm">
                {needingSwapCount} vehicle(s) require driver reassignments!
              </span>
              <p className="text-xs opacity-80">
                Vehicles in maintenance or with failed inspections should have their drivers swapped.
              </p>
            </div>
          </div>
          <button
            className="btn-sm bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => setFilter('MAINTENANCE')}
          >
            View Maintenance List
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          className={`btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('ALL')}
        >
          All Fleet ({fleet.length})
        </button>
        <button
          className={`btn-sm ${filter === 'MAINTENANCE' ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => setFilter('MAINTENANCE')}
        >
          In Maintenance ({fleet.filter((v) => v.status === 'InMaintenance').length})
        </button>
        <button
          className={`btn-sm ${filter === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('ACTIVE')}
        >
          Active ({fleet.filter((v) => v.status === 'Active').length})
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Make / Model</th>
              <th>Status</th>
              <th>Last Inspection</th>
              <th>Current Driver</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  Loading vehicle assignments...
                </td>
              </tr>
            ) : filteredFleet.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No vehicles in this view.
                </td>
              </tr>
            ) : (
              filteredFleet.map((v) => (
                <tr
                  key={v.id}
                  className={v.status === 'InMaintenance' ? 'bg-amber-50/40' : ''}
                >
                  <td>
                    <span className="tracking-number">{v.registrationNumber}</span>
                  </td>
                  <td className="font-medium text-[#172554]">
                    {v.make && v.model ? `${v.make} ${v.model}` : '—'}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        v.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-500'
                          : 'bg-amber-50 text-amber-600 border-amber-500'
                      }`}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td>
                    {v.lastInspection ? (
                      <InspectionBadge result={v.lastInspection.result} />
                    ) : (
                      <span className="text-xs text-gray-400">No inspection records</span>
                    )}
                  </td>
                  <td className="font-semibold text-[#0A3D91] text-xs">
                    {v.assignedDriver
                      ? `${v.assignedDriver.firstName} ${v.assignedDriver.lastName}`
                      : 'Unassigned'}
                  </td>
                  <td className="text-right">
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => {
                        setSelectedVehicle(v)
                        setNewDriverId(v.assignedDriverId || '')
                      }}
                    >
                      Reassign Driver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedVehicle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-[#172554] mb-1">Swap / Reassign Driver</h2>
            <p className="text-xs text-gray-500 mb-4">
              Vehicle: <span className="font-bold">{selectedVehicle.registrationNumber}</span>
            </p>

            {selectedVehicle.status === 'InMaintenance' && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl mb-4">
                ℹ️ Assigning a new driver to this vehicle will automatically clear its status from{' '}
                <span className="font-bold">InMaintenance</span> back to{' '}
                <span className="font-bold">Active</span>.
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl mb-4">{errorMsg}</div>
            )}

            <label className="label">Select New Driver</label>
            <select
              className="input mb-6"
              value={newDriverId}
              onChange={(e) => setNewDriverId(e.target.value)}
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
                  setSelectedVehicle(null)
                  setErrorMsg(null)
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() =>
                  reassignMutation.mutate({
                    id: selectedVehicle.id,
                    driverId: newDriverId || null,
                  })
                }
              >
                Confirm Driver Swap
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InspectionBadge({ result }) {
  if (result === 'Fail')
    return <span className="status-pill bg-red-50 text-red-600 border-red-500">Inspection Failed</span>
  if (result === 'PassWithMinorIssues')
    return <span className="status-pill bg-amber-50 text-amber-600 border-amber-500">Minor Issues</span>
  return <span className="status-pill bg-emerald-50 text-emerald-600 border-emerald-500">Passed</span>
}