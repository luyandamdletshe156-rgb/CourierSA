import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from './AuthContext'

const TrackingContext = createContext(null)

// Resolve the API origin the same way src/api/index.js does, so dev/staging/prod
// all point SignalR at the same backend as REST calls without a code edit.
// VITE_API_BASE_URL is typically something like "https://<api-host>/api" — strip
// the trailing /api to get the hub's origin.
const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const API_BASE_URL = RAW_API_BASE.replace(/\/api\/?$/, '')

export function TrackingProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const connectionRef = useRef(null)
  const [connected, setConnected]             = useState(false)
  const [parcelUpdates, setParcelUpdates]     = useState({})   // { trackingNum: event }
  const [driverLocations, setDriverLocations] = useState({})   // { driverId: { lat, lng } }
  const [dashboardStats, setDashboardStats]   = useState(null)

  useEffect(() => {
    if (!isAuthenticated) return

    const token = localStorage.getItem('accessToken')

    // Connected directly to your Azure App Service API endpoint
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/tracking`, { accessTokenFactory: () => token })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    connection.on('ParcelStatusChanged', event => {
      setParcelUpdates(prev => ({
        ...prev,
        [event.trackingNumber]: event,
      }))
    })

    connection.on('LocationUpdate', event => {
      setDriverLocations(prev => ({
        ...prev,
        [event.driverId]: {
          lat: event.latitude,
          lng: event.longitude,
          heading: event.heading,
          speed: event.speed,
          trackingNumber: event.trackingNumber,
          updatedAt: event.timestamp,
        },
      }))
    })

    connection.on('DriverLocationUpdated', event => {
      setDriverLocations(prev => ({
        ...prev,
        [event.driverId]: {
          lat: event.latitude,
          lng: event.longitude,
          trackingNumber: event.trackingNumber,
          updatedAt: event.timestamp,
        },
      }))
    })

    connection.on('DashboardStatsUpdated', stats => {
      setDashboardStats(stats)
    })

    connection.onreconnected(() => setConnected(true))
    connection.onclose(()      => setConnected(false))

    connection.start()
      .then(() => { setConnected(true); connectionRef.current = connection })
      .catch(err => console.warn('SignalR connection failed:', err))

    return () => { connection.stop() }
  }, [isAuthenticated])

  const subscribeToParcel = (trackingNumber) => {
    connectionRef.current?.invoke('SubscribeToParcel', trackingNumber).catch(console.warn)
  }

  const unsubscribeFromParcel = (trackingNumber) => {
    connectionRef.current?.invoke('UnsubscribeFromParcel', trackingNumber).catch(console.warn)
  }

  const updateDriverLocation = (trackingNumber, lat, lng) => {
    connectionRef.current?.invoke('UpdateLocation', trackingNumber, lat, lng).catch(console.warn)
  }

  return (
    <TrackingContext.Provider value={{
      connected, parcelUpdates, driverLocations, dashboardStats,
      subscribeToParcel, unsubscribeFromParcel, updateDriverLocation,
    }}>
      {children}
    </TrackingContext.Provider>
  )
}

export const useTracking = () => useContext(TrackingContext)