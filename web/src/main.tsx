import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import App from './App.tsx'
import { SiteSeo } from './seo/SiteSeo'
import { ConfirmProvider } from './components/confirm/ConfirmProvider'
import { PanelThemeProvider } from './theme/PanelThemeProvider'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <SiteSeo />
        <ConfirmProvider>
          <AuthProvider>
            <PanelThemeProvider>
              <App />
            </PanelThemeProvider>
          </AuthProvider>
        </ConfirmProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
