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
    "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, details: $details) {\n    lookup\n  }\n}\n\nmutation EditGame($id: String!, $game: String!, $details: DetailsEdit!) {\n  editGame(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveGame($id: String!) {\n  removeGame(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n    weight\n    section\n    summary\n    honours {\n      name\n      year\n      result\n    }\n  }\n}": typeof types.PendingSuggestionsDocument,
    "query Session {\n  session {\n    admin\n  }\n}": typeof types.SessionDocument,
    "query EmailedSuggestion($id: String!, $game: String) {\n  emailedSuggestion(id: $id) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    item {\n      game\n    }\n    lookup\n  }\n}": typeof types.EmailedSuggestionDocument,
    "subscription AskRules($slug: String!, $message: String!, $history: [HistoryEntry!], $parts: [String!]) {\n  askRules(slug: $slug, message: $message, history: $history, parts: $parts)\n}": typeof types.AskRulesDocument,
    "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Games {\n  games {\n    wishlist {\n      id\n      name\n      source\n      suggestedBy\n      note\n      players\n      minPlayers\n      maxPlayers\n      dur\n      minutes\n      description\n      keywords\n      section\n      asin\n      expands\n      video\n      image\n      bggId\n      year\n    }\n    bgg {\n      bggId\n      name\n      summary\n      weight\n      honours {\n        name\n        year\n        result\n      }\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}": typeof types.WishlistVotesDocument,
};
const documents: Documents = {
    "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, details: $details) {\n    lookup\n  }\n}\n\nmutation EditGame($id: String!, $game: String!, $details: DetailsEdit!) {\n  editGame(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveGame($id: String!) {\n  removeGame(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n    weight\n    section\n    summary\n    honours {\n      name\n      year\n      result\n    }\n  }\n}": types.PendingSuggestionsDocument,
    "query Session {\n  session {\n    admin\n  }\n}": types.SessionDocument,
    "query EmailedSuggestion($id: String!, $game: String) {\n  emailedSuggestion(id: $id) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    item {\n      game\n    }\n    lookup\n  }\n}": types.EmailedSuggestionDocument,
    "subscription AskRules($slug: String!, $message: String!, $history: [HistoryEntry!], $parts: [String!]) {\n  askRules(slug: $slug, message: $message, history: $history, parts: $parts)\n}": types.AskRulesDocument,
    "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Games {\n  games {\n    wishlist {\n      id\n      name\n      source\n      suggestedBy\n      note\n      players\n      minPlayers\n      maxPlayers\n      dur\n      minutes\n      description\n      keywords\n      section\n      asin\n      expands\n      video\n      image\n      bggId\n      year\n    }\n    bgg {\n      bggId\n      name\n      summary\n      weight\n      honours {\n        name\n        year\n        result\n      }\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}": types.WishlistVotesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query PendingSuggestions {\n  pendingSuggestions {\n    id\n    game\n    name\n    note\n  }\n}\n\nquery PreviewGame($game: String!) {\n  previewGame(game: $game) {\n    ...Preview\n  }\n}\n\nmutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    lookup\n  }\n}\n\nmutation AddGame($game: String!, $name: String!, $note: String, $details: DetailsInput) {\n  addGame(game: $game, name: $name, note: $note, details: $details) {\n    lookup\n  }\n}\n\nmutation EditGame($id: String!, $game: String!, $details: DetailsEdit!) {\n  editGame(id: $id, game: $game, details: $details) {\n    id\n  }\n}\n\nmutation RemoveGame($id: String!) {\n  removeGame(id: $id)\n}\n\nfragment Preview on Preview {\n  outcome\n  details {\n    bggId\n    name\n    year\n    min\n    max\n    mins\n    desc\n    kw\n    img\n    weight\n    section\n    summary\n    honours {\n      name\n      year\n      result\n    }\n  }\n}"): typeof import('./graphql').PendingSuggestionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Session {\n  session {\n    admin\n  }\n}"): typeof import('./graphql').SessionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query EmailedSuggestion($id: String!, $game: String) {\n  emailedSuggestion(id: $id) {\n    suggestion {\n      game\n      name\n      note\n      status\n    }\n    preview(game: $game) {\n      ...Preview\n    }\n  }\n}\n\nmutation DecideByLink($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {\n  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {\n    item {\n      game\n    }\n    lookup\n  }\n}"): typeof import('./graphql').EmailedSuggestionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "subscription AskRules($slug: String!, $message: String!, $history: [HistoryEntry!], $parts: [String!]) {\n  askRules(slug: $slug, message: $message, history: $history, parts: $parts)\n}"): typeof import('./graphql').AskRulesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query WishlistVotes($ids: [String!]!, $anonId: String) {\n  wishlistVotes(ids: $ids, anonId: $anonId) {\n    counts {\n      id\n      count\n    }\n    myVotes\n  }\n}\n\nmutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {\n  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {\n    count\n  }\n}\n\nquery Games {\n  games {\n    wishlist {\n      id\n      name\n      source\n      suggestedBy\n      note\n      players\n      minPlayers\n      maxPlayers\n      dur\n      minutes\n      description\n      keywords\n      section\n      asin\n      expands\n      video\n      image\n      bggId\n      year\n    }\n    bgg {\n      bggId\n      name\n      summary\n      weight\n      honours {\n        name\n        year\n        result\n      }\n    }\n  }\n}\n\nmutation SuggestGame($game: String!, $name: String!, $note: String) {\n  suggestGame(game: $game, name: $name, note: $note) {\n    id\n  }\n}"): typeof import('./graphql').WishlistVotesDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
