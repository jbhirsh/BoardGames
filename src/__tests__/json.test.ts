import { describe, it, expect } from 'vitest';
import { isJsonRequest } from '../../api/_lib/json';

describe('isJsonRequest', () => {
  it('treats only JSON content types as JSON requests', () => {
    expect(isJsonRequest({ 'content-type': 'application/json' })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'Application/JSON; charset=utf-8' })).toBe(true);
    expect(isJsonRequest({ 'content-type': ['application/json'] })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'application/json; charset=utf-8' })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'APPLICATION/JSON' })).toBe(true);
    expect(isJsonRequest({ 'content-type': ' application/json ;charset=utf-8' })).toBe(true);
    expect(isJsonRequest({ 'content-type': 'application/x-www-form-urlencoded' })).toBe(false);
    // Only the media type counts, not a parameter or a longer type containing it.
    expect(isJsonRequest({ 'content-type': 'text/plain; x=application/json' })).toBe(false);
    expect(isJsonRequest({ 'content-type': 'application/json-patch+json' })).toBe(false);
    expect(isJsonRequest({ 'content-type': 'application/jsonx' })).toBe(false);
    expect(isJsonRequest({})).toBe(false);
  });
});
