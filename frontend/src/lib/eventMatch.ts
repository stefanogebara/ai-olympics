/**
 * Pure helpers for routing live socket events to the right competition view.
 *
 * Kept dependency-free (no React / socket / store imports) so it can be unit
 * tested without pulling in the whole client runtime, and so useSocket can
 * re-export it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketPayload = Record<string, any>;

/**
 * Whether a StreamEvent belongs to the competition a live view is scoped to.
 *
 * The backend broadcasts every event to every connected socket (a single global
 * `io.emit`, so anonymous spectating works without joining the auth-gated room).
 * Without this filter a spectator of competition A also receives competition B's
 * agent/leaderboard/commentary events — and a `competition:start` for B would
 * call reset() and wipe A's view.
 *
 * Rules:
 * - No `competitionId` scope (undefined/empty) → see everything (unscoped hook).
 * - Event carries no `competitionId` (timer ticks, legacy flat payloads) → allow
 *   (there is nothing to disambiguate on, and dropping these would lose data).
 * - Otherwise the event's `competitionId` must equal the scope.
 */
export function eventMatchesCompetition(event: SocketPayload, competitionId?: string): boolean {
  if (!competitionId) return true;
  const eid = event?.competitionId;
  if (!eid) return true;
  return eid === competitionId;
}
