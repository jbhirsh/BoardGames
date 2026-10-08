import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App, { HomePage } from './App'
import RulesPage from './components/RulesPage'
import ScoreCalculatorPage from './components/ScoreCalculatorPage'
import WordCheckerPage from './components/WordCheckerPage'
import SignInPage from './components/SignInPage'
import NotFoundPage, { RouteError } from './components/NotFoundPage'
import { AuthProvider } from './context/AuthContext'

const router = createBrowserRouter([
  {
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/rules/:slug/:part?', element: <RulesPage /> },
      { path: '/score/:slug', element: <ScoreCalculatorPage /> },
      { path: '/word-checker', element: <WordCheckerPage /> },
      { path: '/sign-in', element: <AuthProvider><SignInPage /></AuthProvider> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

// Offline support (src/sw/sw.ts), for game nights with no signal. Production
// only: in dev it would serve yesterday's code over Vite's.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
