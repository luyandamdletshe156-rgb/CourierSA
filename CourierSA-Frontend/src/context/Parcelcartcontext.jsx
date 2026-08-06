import { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react'

const ParcelCartContext = createContext(null)

const CART_STORAGE_KEY = 'courierSA_parcelCart'

function loadInitialState() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return { items: [] }
    const parsed = JSON.parse(raw)
    // defensive: if the stored shape is stale/corrupt, fall back to empty rather than crash
    return Array.isArray(parsed.items) ? parsed : { items: [] }
  } catch {
    return { items: [] }
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM':
      return { items: [...state.items, action.item] }
    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.cartItemId !== action.cartItemId) }
    case 'CLEAR_CART':
      return { items: [] }
    default:
      return state
  }
}

export function ParcelCartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState)

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // localStorage full/unavailable (private browsing etc.) — cart still works in-memory this session
    }
  }, [state])

  const addItem = useCallback((draft) => {
    dispatch({ type: 'ADD_ITEM', item: { cartItemId: crypto.randomUUID(), ...draft } })
  }, [])

  const removeItem = useCallback((cartItemId) => {
    dispatch({ type: 'REMOVE_ITEM', cartItemId })
  }, [])

  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), [])

  const value = useMemo(() => ({
    items: state.items,
    itemCount: state.items.length,
    addItem,
    removeItem,
    clearCart,
  }), [state.items, addItem, removeItem, clearCart])

  return (
    <ParcelCartContext.Provider value={value}>
      {children}
    </ParcelCartContext.Provider>
  )
}

export function useParcelCart() {
  const ctx = useContext(ParcelCartContext)
  if (!ctx) throw new Error('useParcelCart must be used within a ParcelCartProvider')
  return ctx
}