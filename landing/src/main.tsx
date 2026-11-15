import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './landing.css'
import './components/arena/arena.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
