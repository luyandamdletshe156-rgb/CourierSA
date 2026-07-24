import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from './AuthContext'

const TrackingContext = createContext(null)

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
    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/tracking', { accessTokenFactory: () => token })
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
