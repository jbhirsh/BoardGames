/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $type: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, type: $type, details: $details) {\n    lookup\n  }\n}\n\nmutation EditSuggestion($id: String!, $game: String!, $details: DetailsEdit!) {\n  editSuggestion(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveSuggestion($id: String!) {\n  removeSuggestion(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n  }\n}": typeof types.PendingSuggestionsDocument,
    "query Session {\n  session {\n    admin\n  }\n}\n\nmutation RequestSignInLink($email: String!) {\n  requestSignInLink(email: $email)\n}\n\nmutation Logout {\n  logout\n}": typeof types.SessionDocument,
    "query EmailedSuggestion($id: String!, $token: String!, $game: String) {\n  emailedSuggestion(id: $id, token: $token) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $token: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(\n    id: $id\n    token: $token\n    decision: $decision\n    game: $game\n    details: $details\n  ) {\n    item {\n      game\n    }\n    lookup\n  }\n}\n\nquery SignInLinkLive($token: String!) {\n  signInLinkLive(token: $token)\n}\n\nmutation VerifySignIn($token: String!) {\n  verifySignIn(token: $token) {\n    admin\n  }\n}": typeof types.EmailedSuggestionDocument,
    "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Suggestions {\n  suggestions {\n    id\n    game\n    name\n    note\n    source\n    details {\n      year\n      min\n      max\n      mins\n      desc\n      kw\n      type\n      img\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}": typeof types.WishlistVotesDocument,
};
const documents: Documents = {
    "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $type: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, type: $type, details: $details) {\n    lookup\n  }\n}\n\nmutation EditSuggestion($id: String!, $game: String!, $details: DetailsEdit!) {\n  editSuggestion(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveSuggestion($id: String!) {\n  removeSuggestion(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n  }\n}": types.PendingSuggestionsDocument,
    "query Session {\n  session {\n    admin\n  }\n}\n\nmutation RequestSignInLink($email: String!) {\n  requestSignInLink(email: $email)\n}\n\nmutation Logout {\n  logout\n}": types.SessionDocument,
    "query EmailedSuggestion($id: String!, $token: String!, $game: String) {\n  emailedSuggestion(id: $id, token: $token) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $token: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(\n    id: $id\n    token: $token\n    decision: $decision\n    game: $game\n    details: $details\n  ) {\n    item {\n      game\n    }\n    lookup\n  }\n}\n\nquery SignInLinkLive($token: String!) {\n  signInLinkLive(token: $token)\n}\n\nmutation VerifySignIn($token: String!) {\n  verifySignIn(token: $token) {\n    admin\n  }\n}": types.EmailedSuggestionDocument,
    "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Suggestions {\n  suggestions {\n    id\n    game\n    name\n    note\n    source\n    details {\n      year\n      min\n      max\n      mins\n      desc\n      kw\n      type\n      img\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}": types.WishlistVotesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $type: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, type: $type, details: $details) {\n    lookup\n  }\n}\n\nmutation EditSuggestion($id: String!, $game: String!, $details: DetailsEdit!) {\n  editSuggestion(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveSuggestion($id: String!) {\n  removeSuggestion(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n  }\n}"): typeof import('./graphql').PendingSuggestionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Session {\n  session {\n    admin\n  }\n}\n\nmutation RequestSignInLink($email: String!) {\n  requestSignInLink(email: $email)\n}\n\nmutation Logout {\n  logout\n}"): typeof import('./graphql').SessionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query EmailedSuggestion($id: String!, $token: String!, $game: String) {\n  emailedSuggestion(id: $id, token: $token) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $token: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(\n    id: $id\n    token: $token\n    decision: $decision\n    game: $game\n    details: $details\n  ) {\n    item {\n      game\n    }\n    lookup\n  }\n}\n\nquery SignInLinkLive($token: String!) {\n  signInLinkLive(token: $token)\n}\n\nmutation VerifySignIn($token: String!) {\n  verifySignIn(token: $token) {\n    admin\n  }\n}"): typeof import('./graphql').EmailedSuggestionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Suggestions {\n  suggestions {\n    id\n    game\n    name\n    note\n    source\n    details {\n      year\n      min\n      max\n      mins\n      desc\n      kw\n      type\n      img\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}"): typeof import('./graphql').WishlistVotesDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
