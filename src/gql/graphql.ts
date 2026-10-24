/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Decision =
  | 'APPROVE'
  | 'DENY';

/** The owner's edits; a field left out keeps what is stored, and `type: null` files it back under "Suggested by friends". */
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
  year?: number | null | undefined;
};

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

export type Source =
  | 'FRIEND'
  | 'OWNER';

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


export type PreviewGameQuery = { previewGame: { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null } | null } };

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
  type?: string | null | undefined;
  details?: DetailsInput | null | undefined;
}>;


export type AddGameMutation = { addGame: { lookup: LookupOutcome | null } };

export type EditSuggestionMutationVariables = Exact<{
  id: string;
  game: string;
  details: DetailsEdit;
}>;


export type EditSuggestionMutation = { editSuggestion: { id: string } | null };

export type RemoveSuggestionMutationVariables = Exact<{
  id: string;
}>;


export type RemoveSuggestionMutation = { removeSuggestion: boolean };

export type PreviewFragment = { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null } | null };

export type SessionQueryVariables = Exact<{ [key: string]: never; }>;


export type SessionQuery = { session: { admin: boolean } };

export type RequestSignInLinkMutationVariables = Exact<{
  email: string;
}>;


export type RequestSignInLinkMutation = { requestSignInLink: boolean };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { logout: boolean };

export type EmailedSuggestionQueryVariables = Exact<{
  id: string;
  token: string;
  game?: string | null | undefined;
}>;


export type EmailedSuggestionQuery = { emailedSuggestion: { suggestion: { game: string, name: string, note: string, status: SuggestionStatus }, preview: { outcome: LookupOutcome, details: { bggId: number, name: string, year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, img: string | null } | null } | null } };

export type DecideByLinkMutationVariables = Exact<{
  id: string;
  token: string;
  decision: Decision;
  game?: string | null | undefined;
  details?: DetailsInput | null | undefined;
}>;


export type DecideByLinkMutation = { decideSuggestion: { lookup: LookupOutcome | null, item: { game: string } | null } };

export type SignInLinkLiveQueryVariables = Exact<{
  token: string;
}>;


export type SignInLinkLiveQuery = { signInLinkLive: boolean };

export type VerifySignInMutationVariables = Exact<{
  token: string;
}>;


export type VerifySignInMutation = { verifySignIn: { admin: boolean } };

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

export type SuggestionsQueryVariables = Exact<{ [key: string]: never; }>;


export type SuggestionsQuery = { suggestions: Array<{ id: string, game: string, name: string, note: string, source: Source, details: { year: number | null, min: number, max: number, mins: number, desc: string, kw: Array<string>, type: string | null, img: string | null } | null }> };

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
    mutation AddGame($game: String!, $name: String!, $note: String, $type: String, $details: DetailsInput) {
  addGame(game: $game, name: $name, note: $note, type: $type, details: $details) {
    lookup
  }
}
    `) as unknown as TypedDocumentString<AddGameMutation, AddGameMutationVariables>;
export const EditSuggestionDocument = new TypedDocumentString(`
    mutation EditSuggestion($id: String!, $game: String!, $details: DetailsEdit!) {
  editSuggestion(id: $id, game: $game, details: $details) {
    id
  }
}
    `) as unknown as TypedDocumentString<EditSuggestionMutation, EditSuggestionMutationVariables>;
export const RemoveSuggestionDocument = new TypedDocumentString(`
    mutation RemoveSuggestion($id: String!) {
  removeSuggestion(id: $id)
}
    `) as unknown as TypedDocumentString<RemoveSuggestionMutation, RemoveSuggestionMutationVariables>;
export const SessionDocument = new TypedDocumentString(`
    query Session {
  session {
    admin
  }
}
    `) as unknown as TypedDocumentString<SessionQuery, SessionQueryVariables>;
export const RequestSignInLinkDocument = new TypedDocumentString(`
    mutation RequestSignInLink($email: String!) {
  requestSignInLink(email: $email)
}
    `) as unknown as TypedDocumentString<RequestSignInLinkMutation, RequestSignInLinkMutationVariables>;
export const LogoutDocument = new TypedDocumentString(`
    mutation Logout {
  logout
}
    `) as unknown as TypedDocumentString<LogoutMutation, LogoutMutationVariables>;
export const EmailedSuggestionDocument = new TypedDocumentString(`
    query EmailedSuggestion($id: String!, $token: String!, $game: String) {
  emailedSuggestion(id: $id, token: $token) {
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
  }
}`) as unknown as TypedDocumentString<EmailedSuggestionQuery, EmailedSuggestionQueryVariables>;
export const DecideByLinkDocument = new TypedDocumentString(`
    mutation DecideByLink($id: String!, $token: String!, $decision: Decision!, $game: String, $details: DetailsInput) {
  decideSuggestion(
    id: $id
    token: $token
    decision: $decision
    game: $game
    details: $details
  ) {
    item {
      game
    }
    lookup
  }
}
    `) as unknown as TypedDocumentString<DecideByLinkMutation, DecideByLinkMutationVariables>;
export const SignInLinkLiveDocument = new TypedDocumentString(`
    query SignInLinkLive($token: String!) {
  signInLinkLive(token: $token)
}
    `) as unknown as TypedDocumentString<SignInLinkLiveQuery, SignInLinkLiveQueryVariables>;
export const VerifySignInDocument = new TypedDocumentString(`
    mutation VerifySignIn($token: String!) {
  verifySignIn(token: $token) {
    admin
  }
}
    `) as unknown as TypedDocumentString<VerifySignInMutation, VerifySignInMutationVariables>;
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
export const SuggestionsDocument = new TypedDocumentString(`
    query Suggestions {
  suggestions {
    id
    game
    name
    note
    source
    details {
      year
      min
      max
      mins
      desc
      kw
      type
      img
    }
  }
}
    `) as unknown as TypedDocumentString<SuggestionsQuery, SuggestionsQueryVariables>;
export const SuggestGameDocument = new TypedDocumentString(`
    mutation SuggestGame($game: String!, $name: String!, $note: String) {
  suggestGame(game: $game, name: $name, note: $note) {
    id
  }
}
    `) as unknown as TypedDocumentString<SuggestGameMutation, SuggestGameMutationVariables>;