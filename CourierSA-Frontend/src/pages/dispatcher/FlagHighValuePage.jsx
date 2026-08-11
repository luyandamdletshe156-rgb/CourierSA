import React, { useState, useEffect } from 'react';
import { secureDeliveryApi } from '../../api';

export default function FlagHighValuePage() {
  const [eligibleParcels, setEligibleParcels] = useState([]);
  const [pendingParcels, setPendingParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eligibleRes, pendingRes] = await Promise.all([
        secureDeliveryApi.getHighValueEligible(),
        secureDeliveryApi.getOtpPending(),
      ]);
      setEligibleParcels(eligibleRes.data || []);
      setPendingParcels(pendingRes.data || []);
    } catch (err) {
      console.error('Failed to load secure delivery queues', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (msg, isError = false) => {
    setMessage({ text: msg, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleFlag = async (id) => {
    setActionLoading(id);
    try {
      await secureDeliveryApi.flagHighValue(id);
      showNotification('Parcel successfully flagged for high-value OTP verification.');
      await loadData();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to flag parcel.', true);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendOtp = async (id) => {
    setActionLoading(id);
    try {
      await secureDeliveryApi.resendOtp(id);
      showNotification('New OTP PIN generated and emailed to recipient.');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to resend OTP.', true);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading secure delivery management...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Secure Delivery & OTP Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor high-value parcels ($\ge$ R2,000), manage security flagging, and resend OTPs to recipients.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md text-sm font-medium ${
            message.isError
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Section 1: Eligible for Flagging */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            Eligible High-Value Parcels
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800">
            {eligibleParcels.length} Ready
          </span>
        </div>

        {eligibleParcels.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">
            No unflagged high-value parcels currently ready for dispatch.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold uppercase text-gray-500 border-b">
                <tr>
                  <th className="px-6 py-3">Tracking #</th>
                  <th className="px-6 py-3">Destination</th>
                  <th className="px-6 py-3">Declared Value</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {eligibleParcels.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono font-medium text-gray-900">
                      {p.trackingNumber}
                    </td>
                    <td className="px-6 py-4">
                      {p.destinationCity}, {p.destinationProvince}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {p.quoteAmountZAR ? `R ${p.quoteAmountZAR.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleFlag(p.id)}
                        disabled={actionLoading === p.id}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {actionLoading === p.id ? 'Flagging...' : 'Flag High-Value'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Awaiting OTP Verification */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            Out for Delivery (Awaiting OTP)
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-orange-100 text-orange-800">
            {pendingParcels.length} Active
          </span>
        </div>

        {pendingParcels.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">
            No active deliveries currently pending recipient OTP verification.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold uppercase text-gray-500 border-b">
                <tr>
                  <th className="px-6 py-3">Tracking #</th>
                  <th className="px-6 py-3">Destination</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingParcels.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono font-medium text-gray-900">
                      {p.trackingNumber}
                    </td>
                    <td className="px-6 py-4">
                      {p.destinationCity}, {p.destinationProvince}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded bg-orange-100 text-orange-800 inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse"></span>
                        OTP Required
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleResendOtp(p.id)}
                        disabled={actionLoading === p.id}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50 transition"
                      >
                        {actionLoading === p.id ? 'Sending...' : 'Resend OTP Email'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}