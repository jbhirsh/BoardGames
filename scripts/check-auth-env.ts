// Fails a Vercel build whose sign-in settings (api/_auth.ts) are wrong,
// naming what to fix, rather than deploying a site whose sign-in fails at
// its first use, or locks the owner out. vercel.json's buildCommand runs it
// after the build, before the migration. Off Vercel (a laptop, CI) it
// checks nothing: sign-in isn't tried there.
//
//   BETTER_AUTH_SECRET    signs the session cookie; each environment its own
//   GOOGLE_CLIENT_ID      the Google OAuth client
//   OAUTH_PROXY_SECRET    production's and every preview's, the same value
//   GOOGLE_CLIENT_SECRET  production's alone: only production exchanges a
//                         code, and a preview builds any PR's code, so a
//                         preview build holding it fails too
//   SUGGESTIONS_TO        production's: the owner's Google account, without
//                         which no one can be the owner

import { pathToFileURL } from 'node:url';

export type Env = Record<string, string | undefined>;

const EVERYWHERE = ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'OAUTH_PROXY_SECRET'];
const PRODUCTION = [...EVERYWHERE, 'GOOGLE_CLIENT_SECRET', 'SUGGESTIONS_TO'];

/** The deploy this build is for, if it's production's or a preview's. */
const deployOf = (env: Env) =>
  env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview' ? env.VERCEL_ENV : undefined;

/** The settings this build is missing, for a production or preview deploy; none elsewhere. */
export function missingAuthSettings(env: Env): string[] {
  const deploy = deployOf(env);
  if (!deploy) return [];
  return (deploy === 'production' ? PRODUCTION : EVERYWHERE).filter((name) => !env[name]);
}

/** What's wrong with this build's sign-in settings, each a sentence; none when all is well. */
export function authSettingProblems(env: Env): string[] {
  const deploy = deployOf(env);
  const problems: string[] = [];
  const missing = missingAuthSettings(env);
  if (missing.length) problems.push(`sign-in needs ${missing.join(', ')}: set it for ${deploy} in the Vercel project`);
  if (deploy === 'preview' && env.GOOGLE_CLIENT_SECRET) {
    problems.push(
      "GOOGLE_CLIENT_SECRET is set for preview, which builds any PR's code: untick Preview on it in the Vercel project, so production alone holds it",
    );
  }
  return problems;
}

/** The command: throws, naming what's wrong, or returns its log line. */
export function run(env: Env): string {
  const deploy = deployOf(env);
  if (!deploy) return 'check-auth-env: not a deploy.';
  const problems = authSettingProblems(env);
  if (problems.length) throw new Error(problems.join('; '));
  return `check-auth-env: ${deploy} has every sign-in setting.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(run(process.env));
}
