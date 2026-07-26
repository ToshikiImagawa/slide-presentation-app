import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [message, setMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setMessage(message)
  }, [])

  const handleClose = useCallback(() => setMessage(null), [])

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar open={message !== null} autoHideDuration={6000} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleClose} severity="error" variant="filled" sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
