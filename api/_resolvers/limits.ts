// Bounds on what one request may ask, checked before any resolver runs:
// GraphQL lets a single POST repeat a field under many aliases (500
// `suggestions` would be 500 Redis reads, 500 `vote`s 500 turns of the
// rate limiter) or nest and pad a document without end. So a document may
// hold at most MAX_TOKENS tokens, MAX_ALIASES aliases and MAX_DEPTH levels
// of selection; the client's largest operation (EmailedSuggestion) is
// about 60 tokens, 0 aliases and 4 levels deep. A GET may carry only a
// query: Yoga already refuses a mutation there, and this refuses a
// subscription too, which would otherwise ask Gemini over a link. In
// production the schema can't be introspected; codegen reads the SDL file.

import {
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  parse,
  type ASTNode,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type ParseOptions,
  type SelectionSetNode,
  type Source,
  type ValidationContext,
} from 'graphql';
import type { Plugin } from 'graphql-yoga';

const MAX_TOKENS = 1000;
const MAX_ALIASES = 15;
const MAX_DEPTH = 6;

// Validation errors: Yoga answers them as GraphQL-over-HTTP asks (a 400, or
// 200 to a client that accepts only plain JSON), before anything runs.
const refusal = (message: string, nodes?: ASTNode) =>
  new GraphQLError(message, { nodes, extensions: { code: 'BAD_REQUEST' } });

/** At most MAX_ALIASES aliased fields in the whole document. */
function maxAliases(context: ValidationContext): ASTVisitor {
  let aliases = 0;
  return {
    Field(node) {
      if (node.alias && ++aliases === MAX_ALIASES + 1) {
        context.reportError(refusal(`A request may use at most ${MAX_ALIASES} aliases`, node));
      }
    },
  };
}

/** How deep a selection goes, following fragment spreads (each one once on a path). */
function depthOf(
  set: SelectionSetNode | undefined,
  fragments: Map<string, FragmentDefinitionNode>,
  seen: ReadonlySet<string>,
): number {
  if (!set) return 0;
  let deepest = 0;
  for (const selection of set.selections) {
    if (selection.kind === Kind.FIELD) {
      deepest = Math.max(deepest, 1 + depthOf(selection.selectionSet, fragments, seen));
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      deepest = Math.max(deepest, depthOf(selection.selectionSet, fragments, seen));
    } else if (!seen.has(selection.name.value)) {
      const fragment = fragments.get(selection.name.value);
      const next = new Set(seen).add(selection.name.value);
      deepest = Math.max(deepest, depthOf(fragment?.selectionSet, fragments, next));
    }
  }
  return deepest;
}

/** At most MAX_DEPTH levels of fields in any operation. */
function maxDepth(context: ValidationContext): ASTVisitor {
  return {
    OperationDefinition(node) {
      const fragments = new Map(
        context
          .getDocument()
          .definitions.filter((d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION)
          .map((d) => [d.name.value, d]),
      );
      if (depthOf(node.selectionSet, fragments, new Set()) > MAX_DEPTH) {
        context.reportError(refusal(`A request may nest at most ${MAX_DEPTH} levels`, node));
      }
    },
  };
}

/** Only queries over GET, in the words Yoga refuses a mutation there with. */
function queriesOnly(context: ValidationContext): ASTVisitor {
  return {
    OperationDefinition(node) {
      if (node.operation !== 'query') {
        context.reportError(refusal(`Can only perform a ${node.operation} operation from a POST request.`, node));
      }
    },
  };
}

/** The limits, as a Yoga plugin; `production` also turns introspection off. */
export function limits({ production }: { production: boolean }): Plugin {
  return {
    onParse({ setParseFn }) {
      setParseFn((source: string | Source, options?: ParseOptions) =>
        parse(source, { ...options, maxTokens: MAX_TOKENS }),
      );
    },
    onValidate({ addValidationRule, context }) {
      addValidationRule(maxAliases);
      addValidationRule(maxDepth);
      if (production) addValidationRule(NoSchemaIntrospectionCustomRule);
      const { request }: { request?: Request } = context;
      if (request?.method === 'GET') addValidationRule(queriesOnly);
    },
  };
}
