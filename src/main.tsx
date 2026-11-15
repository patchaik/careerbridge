import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE_URL, USE_MOCKS } from './lib/config'

if (import.meta.env.DEV) {
  console.log(
    `[CareerBridge] API mode: ${USE_MOCKS ? "MOCK" : "REAL"} (VITE_API_BASE_URL=${API_BASE_URL})`,
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
