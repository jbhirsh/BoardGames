// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkEnvironment, isDbEnvironment } from '../../api/_db/environment';

describe('isDbEnvironment', () => {
  it('names the deployments with a database of their own', () => {
    expect(isDbEnvironment('production')).toBe(true);
    expect(isDbEnvironment('preview')).toBe(true);
    for (const other of ['development', '', 'Production', undefined, 1]) expect(isDbEnvironment(other)).toBe(false);
  });
});

describe('checkEnvironment', () => {
  it('lets a deploy use the database recording its own environment', () => {
    expect(() => checkEnvironment('production', 'production')).not.toThrow();
    expect(() => checkEnvironment('preview', 'preview')).not.toThrow();
  });

  it("refuses a deploy pointed at the other environment's database, naming both", () => {
    expect(() => checkEnvironment('preview', 'production')).toThrow(
      'a production deploy is pointed at the preview database: check TURSO_DATABASE_URL for production',
    );
    expect(() => checkEnvironment('production', 'preview')).toThrow(/preview deploy is pointed at the production/);
  });

  it('refuses a deploy a database that records no environment, saying how to start it over', () => {
    expect(() => checkEnvironment(undefined, 'production')).toThrow(
      "the production database records no environment and isn't empty, so no deploy claims it",
    );
  });

  it('lets development and tests use only a database recording no environment', () => {
    expect(() => checkEnvironment(undefined, undefined)).not.toThrow();
    // A shell still holding a real database's URL can't change it by accident.
    expect(() => checkEnvironment('preview', undefined)).toThrow(
      'this is the preview database: name it to use it here (`-- preview`)',
    );
    expect(() => checkEnvironment('production', undefined)).toThrow(/production database: name it/);
  });
});
