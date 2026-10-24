import type { CodegenConfig } from '@graphql-codegen/cli';

// Typed GraphQL documents for the client (`npm run codegen`), generated from
// the API's SDL into src/gql/, which is committed; CI regenerates it and
// fails on any difference ("GraphQL codegen drift"). The operations live in
// src/client/operations/*.graphql. Documents are plain strings
// (documentMode: 'string'), sent as they are by src/client/graphql.ts, so
// no GraphQL library reaches the browser. Reading the SDL file at build
// time is how src learns the API's shapes without importing api/.
const config: CodegenConfig = {
  schema: './api/_schema.graphql',
  documents: ['src/client/operations/*.graphql'],
  generates: {
    './src/gql/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        documentMode: 'string',
        useTypeImports: true,
        enumsAsTypes: true,
        skipTypename: true,
      },
    },
  },
};

export default config;
