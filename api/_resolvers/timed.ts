// Times each field with a resolver of its own (api/_lib/timing.ts's
// timeField), so a request's `Server-Timing` shows which fields its time
// went to (#354). Done once, on the built schema, by wrapping each such
// field's resolver in place: Yoga executes with @graphql-tools/executor,
// which publishes none of GraphQL's own per-field events, and a wrapper
// works whichever executor runs it. A field without a resolver (a plain
// property read) is left alone, so it's never timed. Introspection's own
// types (`__Schema` and the rest) are left alone too.

import { isObjectType, type GraphQLResolveInfo, type GraphQLSchema, type ResponsePath } from 'graphql';
import { timeField } from '../_lib/timing.js';

/** A field's response path as dotted keys, list item numbers included: `games.wishlist.0.votes`. */
export function responsePathOf(path: ResponsePath): string {
  const keys: Array<string | number> = [];
  for (let at: ResponsePath | undefined = path; at; at = at.prev) keys.push(at.key);
  return keys.reverse().join('.');
}

/** Wraps every field with a resolver of its own in timeField(), and returns the schema. */
export function timedResolvers(schema: GraphQLSchema): GraphQLSchema {
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type) || type.name.startsWith('__')) continue;
    for (const field of Object.values(type.getFields())) {
      const resolve = field.resolve;
      if (!resolve) continue;
      const label = `${type.name}.${field.name}`;
      field.resolve = (source: unknown, args: Record<string, unknown>, context: unknown, info: GraphQLResolveInfo) =>
        timeField(label, responsePathOf(info.path), () => resolve(source, args, context, info));
    }
  }
  return schema;
}
