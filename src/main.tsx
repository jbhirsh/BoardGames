import './startSentry';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App, { HomePage } from './App';
import { RulesPage, ScoreCalculatorPage, WordCheckerPage, SignInPage } from './lazyPages';
import NotFoundPage, { RouteError } from './components/NotFoundPage';
import RouteFallback, { RulesFallback } from './components/RouteFallback';
import { AuthProvider } from './context/AuthContext';
import { SIGN_IN_INTRO, SIGN_IN_TITLE } from './data/signIn';

// The app's entry: error reporting first (./startSentry; client/sentry.ts
// fetches Sentry's SDK once the page is up), then the router. Its pages:
//   /                    HomePage (App.tsx): the hero, the filter bar, then the
//                        collection or the wishlist
//   /rules/:slug/:part?  a game's rulebooks and the AI rules assistant
//                        (components/RulesPage.tsx)
//   /score/:slug/:part?  the score pad for a game, or a game inside one (a
//                        deck's Hearts), in data/scoreCalculators.ts
//                        (components/ScoreCalculatorPage.tsx)
//   /word-checker        components/WordCheckerPage.tsx
//   /sign-in             the owner's magic-link sign-in (components/SignInPage.tsx),
//                        which nothing on the home page links to
// Only the home page, and the not-found page the router's error page needs,
// are in the main bundle. The rest load on first open (lazyPages.ts) behind
// their header in grey (components/RouteFallback.tsx; the sign-in page's
// words come from data/signIn.ts for both), and code that won't load
// reaches RouteError (components/NotFoundPage.tsx), which reloads once.
const router = createBrowserRouter([
  {
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/rules/:slug/:part?',
        element: (
          <Suspense fallback={<RulesFallback />}>
            <RulesPage />
          </Suspense>
        ),
      },
      {
        path: '/score/:slug/:part?',
        element: (
          <Suspense fallback={<RouteFallback title="Score Calculator" />}>
            <ScoreCalculatorPage />
          </Suspense>
        ),
      },
      {
        path: '/word-checker',
        element: (
          <Suspense fallback={<RouteFallback title="Word Checker" />}>
            <WordCheckerPage />
          </Suspense>
        ),
      },
      {
        path: '/sign-in',
        element: (
          <AuthProvider>
            <Suspense fallback={<RouteFallback title={SIGN_IN_TITLE} desc={SIGN_IN_INTRO} art={false} />}>
              <SignInPage />
            </Suspense>
          </AuthProvider>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

// Offline support (src/sw/sw.ts), for game nights with no signal. Production
// only: in dev it would serve yesterday's code over Vite's.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
