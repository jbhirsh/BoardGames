import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App, { HomePage } from './App'
import RulesPage from './components/RulesPage'
import ScoreCalculatorPage from './components/ScoreCalculatorPage'
import WordCheckerPage from './components/WordCheckerPage'
import SignInPage from './components/SignInPage'
import { AuthProvider } from './context/AuthContext'

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/rules/:slug', element: <RulesPage /> },
      { path: '/score/:slug', element: <ScoreCalculatorPage /> },
      { path: '/word-checker', element: <WordCheckerPage /> },
      { path: '/sign-in', element: <AuthProvider><SignInPage /></AuthProvider> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
