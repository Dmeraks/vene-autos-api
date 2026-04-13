import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import App from './App.tsx'
import { ConfirmProvider } from './components/confirm/ConfirmProvider'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
