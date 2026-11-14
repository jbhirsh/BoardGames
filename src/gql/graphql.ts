/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Decision =
  | 'APPROVE'
  | 'DENY';

/** The owner's edits; a field left out keeps what is stored, and `type: null` files it under "Suggested by friends". */
export type DetailsEdit = {
  desc?: string | null | undefined;
  kw?: Array<string> | null | undefined;
  max?: number | null | undefined;
  min?: number | null | undefined;
  mins?: number | null | undefined;
  type?: string | null | undefined;
};

/** Details previewed before an approval or an add, sent back so the game isn't looked up twice. */
export type DetailsInput = {
  bggId?: number | null | undefined;
  desc?: string | null | undefined;
  img?: string | null | undefined;
  kw?: Array<string> | null | undefined;
  max?: number | null | undefined;
  min?: number | null | undefined;
  mins?: number | null | undefined;
  /** The section the preview inferred. */
  section?: string | null | undefined;
  /** BoardGameGeek's weight, as the preview found it. */
  weight?: number | null | undefined;
  year?: number | null | undefined;
};

export type GameSource =
  /** Written into the site's code before it moved to the database. */
  | 'CURATED'
  | 'FRIEND'
  | 'OWNER';

export type HistoryEntry = {
  content: string;
  role: Role;
};

/** How a BoardGameGeek lookup went. */
export type LookupOutcome =
  | 'FOUND'
  | 'NO_MATCH'
  /** BGG_API_TOKEN isn't set, so BoardGameGeek wasn't asked. */
  | 'NO_TOKEN'
  /** BoardGameGeek refused the token. */
  | 'REFUSED'
  | 'UNAVAILABLE';

export type Role =
  | 'MODEL'
  | 'USER';

export type SuggestionStatus =
  | 'APPROVED'
  | 'DENIED'
  | 'PENDING'
  /** The owner took it off the wishlist. */
  | 'REMOVED'
  /** Stored, but the email to the owner failed: off the active list, still in the owner's queue. */
  | 'UNSENT';

export type PendingSuggestionsQueryVariables = Exact<{ [key: string]: never; }>;


export type PendingSuggestionsQuery = { pendingSuggestions: Array<{ id: string, game: string, name: string, note: string }> };

export type PreviewGameQueryVariables = Exact<{
  game: string;
}>;


export type PreviewGameQuery = { previewGame: { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null, weight: number | null, section: string, summary: string | null, honours: Array<{ name: string, year: number | null, result: string }> } | null } };

export type DecideSuggestionMutationVariables = Exact<{
  id: string;
  decision: Decision;
  game?: string | null | undefined;
  details?: DetailsInput | null | undefined;
}>;


export type DecideSuggestionMutation = { decideSuggestion: { lookup: LookupOutcome | null } };

export type AddGameMutationVariables = Exact<{
  game: string;
  name: string;
  note?: string | null | undefined;
  details?: DetailsInput | null | undefined;
}>;


export type AddGameMutation = { addGame: { lookup: LookupOutcome | null } };

export type EditGameMutationVariables = Exact<{
  id: string;
  game: string;
  details: DetailsEdit;
}>;


export type EditGameMutation = { editGame: { id: string } | null };

export type RemoveGameMutationVariables = Exact<{
  id: string;
}>;


export type RemoveGameMutation = { removeGame: boolean };

export type PreviewFragment = { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null, weight: number | null, section: string, summary: string | null, honours: Array<{ name: string, year: number | null, result: string }> } | null };

export type SessionQueryVariables = Exact<{ [key: string]: never; }>;


export type SessionQuery = { session: { admin: boolean } };

export type EmailedSuggestionQueryVariables = Exact<{
  id: string;
  game?: string | null | undefined;
}>;


export type EmailedSuggestionQuery = { emailedSuggestion: { suggestion: { game: string, name: string, note: string, status: SuggestionStatus }, preview: { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null, weight: number | null, section: string, summary: string | null, honours: Array<{ name: string, year: number | null, result: string }> } | null } | null } };

export type DecideByLinkMutationVariables = Exact<{
  id: string;
  decision: Decision;
  game?: string | null | undefined;
  details?: DetailsInput | null | undefined;
}>;


export type DecideByLinkMutation = { decideSuggestion: { lookup: LookupOutcome | null, item: { game: string } | null } };

export type AskRulesSubscriptionVariables = Exact<{
  slug: string;
  message: string;
  history?: Array<HistoryEntry> | HistoryEntry | null | undefined;
  parts?: Array<string> | string | null | undefined;
}>;


export type AskRulesSubscription = { askRules: string };

export type WishlistVotesQueryVariables = Exact<{
  ids: Array<string> | string;
  anonId?: string | null | undefined;
}>;


export type WishlistVotesQuery = { wishlistVotes: { myVotes: Array<string>, counts: Array<{ id: string, count: number }> } };

export type VoteMutationVariables = Exact<{
  itemId: string;
  anonId: string;
  vote: number;
}>;


export type VoteMutation = { vote: { count: number } };

export type GamesQueryVariables = Exact<{ [key: string]: never; }>;


export type GamesQuery = { games: { wishlist: Array<{ id: string, name: string, source: GameSource, suggestedBy: string | null, note: string, players: string | null, minPlayers: number, maxPlayers: number, dur: string | null, minutes: number, description: string, keywords: Array<string>, section: string | null, expands: string | null, video: string | null, image: string | null, bggId: number | null, year: number | null }>, bgg: Array<{ bggId: number, name: string, summary: string | null, weight: number | null, honours: Array<{ name: string, year: number | null, result: string }> }> } };

export type SuggestGameMutationVariables = Exact<{
  game: string;
  name: string;
  note?: string | null | undefined;
}>;


export type SuggestGameMutation = { suggestGame: { id: string } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const PreviewFragmentDoc = new TypedDocumentString(`
    fragment Preview on Preview {
  outcome
  details {
    bggId
    name
    year
    min
    max
    mins
    desc
    kw
    img
    weight
    section
    summary
    honours {
      name
      year
      result
    }
  }
}
    `, {"fragmentName":"Preview"}) as unknown as TypedDocumentString<PreviewFragment, unknown>;
export const PendingSuggestionsDocument = new TypedDocumentString(`
    query PendingSuggestions {
  pendingSuggestions {
    id
    game
    name
    note
  }
}
    `) as unknown as TypedDocumentString<PendingSuggestionsQuery, PendingSuggestionsQueryVariables>;
export const PreviewGameDocument = new TypedDocumentString(`
    query PreviewGame($game: String!) {
  previewGame(game: $game) {
    ...Preview
  }
}
    fragment Preview on Preview {
  outcome
  details {
    bggId
    name
    year
    min
    max
    mins
    desc
    kw
    img
    weight
    section
    summary
    honours {
      name
      year
      result
    }
  }
}`) as unknown as TypedDocumentString<PreviewGameQuery, PreviewGameQueryVariables>;
export const DecideSuggestionDocument = new TypedDocumentString(`
    mutation DecideSuggestion($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {
  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {
    lookup
  }
}
    `) as unknown as TypedDocumentString<DecideSuggestionMutation, DecideSuggestionMutationVariables>;
export const AddGameDocument = new TypedDocumentString(`
    mutation AddGame($game: String!, $name: String!, $note: String, $details: DetailsInput) {
  addGame(game: $game, name: $name, note: $note, details: $details) {
    lookup
  }
}
    `) as unknown as TypedDocumentString<AddGameMutation, AddGameMutationVariables>;
export const EditGameDocument = new TypedDocumentString(`
    mutation EditGame($id: String!, $game: String!, $details: DetailsEdit!) {
  editGame(id: $id, game: $game, details: $details) {
    id
  }
}
    `) as unknown as TypedDocumentString<EditGameMutation, EditGameMutationVariables>;
export const RemoveGameDocument = new TypedDocumentString(`
    mutation RemoveGame($id: String!) {
  removeGame(id: $id)
}
    `) as unknown as TypedDocumentString<RemoveGameMutation, RemoveGameMutationVariables>;
export const SessionDocument = new TypedDocumentString(`
    query Session {
  session {
    admin
  }
}
    `) as unknown as TypedDocumentString<SessionQuery, SessionQueryVariables>;
export const EmailedSuggestionDocument = new TypedDocumentString(`
    query EmailedSuggestion($id: String!, $game: String) {
  emailedSuggestion(id: $id) {
    suggestion {
      game
      name
      note
      status
    }
    preview(game: $game) {
      ...Preview
    }
  }
}
    fragment Preview on Preview {
  outcome
  details {
    bggId
    name
    year
    min
    max
    mins
    desc
    kw
    img
    weight
    section
    summary
    honours {
      name
      year
      result
    }
  }
}`) as unknown as TypedDocumentString<EmailedSuggestionQuery, EmailedSuggestionQueryVariables>;
export const DecideByLinkDocument = new TypedDocumentString(`
    mutation DecideByLink($id: String!, $decision: Decision!, $game: String, $details: DetailsInput) {
  decideSuggestion(id: $id, decision: $decision, game: $game, details: $details) {
    item {
      game
    }
    lookup
  }
}
    `) as unknown as TypedDocumentString<DecideByLinkMutation, DecideByLinkMutationVariables>;
export const AskRulesDocument = new TypedDocumentString(`
    subscription AskRules($slug: String!, $message: String!, $history: [HistoryEntry!], $parts: [String!]) {
  askRules(slug: $slug, message: $message, history: $history, parts: $parts)
}
    `) as unknown as TypedDocumentString<AskRulesSubscription, AskRulesSubscriptionVariables>;
export const WishlistVotesDocument = new TypedDocumentString(`
    query WishlistVotes($ids: [String!]!, $anonId: String) {
  wishlistVotes(ids: $ids, anonId: $anonId) {
    counts {
      id
      count
    }
    myVotes
  }
}
    `) as unknown as TypedDocumentString<WishlistVotesQuery, WishlistVotesQueryVariables>;
export const VoteDocument = new TypedDocumentString(`
    mutation Vote($itemId: String!, $anonId: String!, $vote: Int!) {
  vote(itemId: $itemId, anonId: $anonId, vote: $vote) {
    count
  }
}
    `) as unknown as TypedDocumentString<VoteMutation, VoteMutationVariables>;
export const GamesDocument = new TypedDocumentString(`
    query Games {
  games {
    wishlist {
      id
      name
      source
      suggestedBy
      note
      players
      minPlayers
      maxPlayers
      dur
      minutes
      description
      keywords
      section
      expands
      video
      image
      bggId
      year
    }
    bgg {
      bggId
      name
      summary
      weight
      honours {
        name
        year
        result
      }
    }
  }
}
    `) as unknown as TypedDocumentString<GamesQuery, GamesQueryVariables>;
export const SuggestGameDocument = new TypedDocumentString(`
    mutation SuggestGame($game: String!, $name: String!, $note: String) {
  suggestGame(game: $game, name: $name, note: $note) {
    id
  }
}
    `) as unknown as TypedDocumentString<SuggestGameMutation, SuggestGameMutationVariables>;