import { lazy, type ComponentType } from 'react'
import { chunkLoaded } from './utils/chunkReload'

// Every page but the home page, its code loaded when it is first opened
// (main.tsx shows its header meanwhile, components/RouteFallback.tsx). The
// service worker saves each one at install (vite.config.ts), so they open
// offline all the same. Code that won't load reaches the router's error
// page, which reloads once (utils/chunkReload.ts); code that loads clears
// the way for the next reload. The not-found page isn't here: the router's
// error page, in the main bundle, shows it anyway.
function page<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().then((module) => {
    chunkLoaded(() => window.sessionStorage)
    return module
  }))
}

export const RulesPage = page(() => import('./components/RulesPage'))
export const ScoreCalculatorPage = page(() => import('./components/ScoreCalculatorPage'))
export const WordCheckerPage = page(() => import('./components/WordCheckerPage'))
export const SignInPage = page(() => import('./components/SignInPage'))
