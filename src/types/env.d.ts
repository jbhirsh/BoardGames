// The VITE_ variables the client reads, typed: vite/client's ImportMetaEnv
// gives any other name the type `any`.
interface ImportMetaEnv {
  /** Sentry's browser DSN; unset, the client reports nothing. */
  readonly VITE_SENTRY_DSN?: string;
}
