// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authSettingProblems, missingAuthSettings, run } from './check-auth-env.ts';

const PREVIEW = {
  VERCEL_ENV: 'preview',
  BETTER_AUTH_SECRET: 's',
  GOOGLE_CLIENT_ID: 'id',
  OAUTH_PROXY_SECRET: 'p',
};
const PRODUCTION = {
  ...PREVIEW,
  VERCEL_ENV: 'production',
  GOOGLE_CLIENT_SECRET: 'g',
  SUGGESTIONS_TO: 'jess@example.com',
};

describe('check-auth-env', () => {
  it('passes a deploy with every setting', () => {
    expect(authSettingProblems(PRODUCTION)).toEqual([]);
    expect(run(PRODUCTION)).toBe('check-auth-env: production has every sign-in setting.');
    expect(run(PREVIEW)).toBe('check-auth-env: preview has every sign-in setting.');
  });

  it("needs Google's secret and the owner's address on production", () => {
    expect(missingAuthSettings({ ...PRODUCTION, GOOGLE_CLIENT_SECRET: undefined })).toEqual(['GOOGLE_CLIENT_SECRET']);
    expect(() => run({ ...PRODUCTION, SUGGESTIONS_TO: '' })).toThrow(
      'sign-in needs SUGGESTIONS_TO: set it for production in the Vercel project',
    );
  });

  it("fails a preview holding Google's secret, saying to untick Preview on it", () => {
    expect(() => run({ ...PREVIEW, GOOGLE_CLIENT_SECRET: 'g' })).toThrow(
      "GOOGLE_CLIENT_SECRET is set for preview, which builds any PR's code: untick Preview on it in the Vercel project, so production alone holds it",
    );
    expect(missingAuthSettings(PREVIEW)).toEqual([]);
  });

  it('fails a deploy, naming each setting it lacks, and every problem at once', () => {
    expect(() => run({ VERCEL_ENV: 'preview', GOOGLE_CLIENT_ID: 'id', BETTER_AUTH_SECRET: '' })).toThrow(
      'sign-in needs BETTER_AUTH_SECRET, OAUTH_PROXY_SECRET: set it for preview in the Vercel project',
    );
    expect(authSettingProblems({ VERCEL_ENV: 'preview', GOOGLE_CLIENT_SECRET: 'g' })).toHaveLength(2);
  });

  it('checks nothing off Vercel, or on its development builds', () => {
    expect(run({})).toBe('check-auth-env: not a deploy.');
    expect(authSettingProblems({ GOOGLE_CLIENT_SECRET: 'g' })).toEqual([]);
    expect(missingAuthSettings({ VERCEL_ENV: 'development' })).toEqual([]);
    expect(run({ VERCEL_ENV: 'development' })).toBe('check-auth-env: not a deploy.');
  });
});
