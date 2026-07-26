import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import type { AlertColor } from '@mui/material/Alert'

interface ToastState {
  message: string
  severity: AlertColor
}

interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, severity: AlertColor = 'error') => {
    setToast({ message, severity })
  }, [])

  const handleClose = useCallback(() => setToast(null), [])

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar open={toast !== null} autoHideDuration={6000} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert onClose={handleClose} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
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
