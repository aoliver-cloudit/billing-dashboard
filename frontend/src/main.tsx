import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OverviewPage from './overview/OverviewPage.tsx'

const isOverview = window.location.pathname.replace(/\/+$/, '') === '/overview'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverview ? <OverviewPage /> : <App />}</StrictMode>,
)
