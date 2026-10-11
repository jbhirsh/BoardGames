import './instrument'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App, { HomePage } from './App'
import { RulesPage, ScoreCalculatorPage, WordCheckerPage, SignInPage } from './lazyPages'
import NotFoundPage, { RouteError } from './components/NotFoundPage'
import RouteFallback, { RulesFallback } from './components/RouteFallback'
import { AuthProvider } from './context/AuthContext'
import { SIGN_IN_INTRO, SIGN_IN_TITLE } from './data/signIn'

const router = createBrowserRouter([
  {
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/rules/:slug/:part?', element: <Suspense fallback={<RulesFallback />}><RulesPage /></Suspense> },
      { path: '/score/:slug', element: <Suspense fallback={<RouteFallback title="Score Calculator" />}><ScoreCalculatorPage /></Suspense> },
      { path: '/word-checker', element: <Suspense fallback={<RouteFallback title="Word Checker" />}><WordCheckerPage /></Suspense> },
      { path: '/sign-in', element: <AuthProvider><Suspense fallback={<RouteFallback title={SIGN_IN_TITLE} desc={SIGN_IN_INTRO} art={false} />}><SignInPage /></Suspense></AuthProvider> },
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
