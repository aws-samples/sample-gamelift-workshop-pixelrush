import {
  GameLiftClient, StartMatchmakingCommand, DescribeMatchmakingCommand,
  SearchGameSessionsCommand, CreateGameSessionCommand, CreatePlayerSessionCommand,
  DescribeFleetAttributesCommand,
} from '@aws-sdk/client-gamelift';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify } from './lib/db.js';
import { broadcastChat } from './lib/broadcast.js';

const gamelift = new GameLiftClient({});

// 'open' (Module 4): place players directly into an EC2-fleet session, no
// rules. 'flexmatch' (Module 3 Anywhere, Module 5 EC2): rule-based matchmaking.
const PLACEMENT_MODE = process.env.PLACEMENT_MODE ?? 'flexmatch';

// Regions the managed fleet spans, for LatencyInMs backfill (see below).
const FLEET_REGIONS = (process.env.FLEET_REGIONS ?? 'us-east-1')
  .split(',').map((r) => r.trim()).filter(Boolean);
// A region we couldn't measure is probably far — high enough to be a fallback,
// low enough that FlexMatch still accepts it as a shared placement region.
const FALLBACK_LATENCY_MS = 250;

/**
 * POST /api/matchmaking/request {playerId, trackId}
 *   -> StartMatchmaking with level + trackId player attributes; returns ticketId.
 * GET  /api/matchmaking/status?ticketId=
 *   -> polling fallback / debugging aid (the primary path is the WS push).
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === 'GET') return status(event);

  const { playerId, trackId, matchSize, latencies } = JSON.parse(event.body ?? '{}');
  if (!playerId || !trackId) return bad('playerId and trackId required');
  // 1 = Quick Start (instant match, NPC-filled grid); 2/4/8 = multiplayer.
  const size = [1, 2, 3, 4].includes(matchSize) ? matchSize : 1;
  // client-measured region latencies {region: ms} — the queue uses these to
  // place the game session in the best location for all matched players
  const latencyInMs: Record<string, number> = {};
  if (latencies && typeof latencies === 'object') {
    for (const [region, ms] of Object.entries(latencies)) {
      if (/^[a-z]{2}-[a-z]+-\d$/.test(region) && Number.isFinite(ms as number)) {
        latencyInMs[region] = Math.min(9999, Math.max(1, Math.round(ms as number)));
      }
    }
  }
  // Backfill: every fleet region must have a LatencyInMs value, or a
  // latency-aware queue can't find a region two players share (one player's
  // failed probe would otherwise leave that region absent and unmatchable).
  // Missing region => assume a high-but-usable latency so it's a last resort.
  for (const region of FLEET_REGIONS) {
    if (latencyInMs[region] === undefined) latencyInMs[region] = FALLBACK_LATENCY_MS;
  }

  const player = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
  }));
  if (!player.Item) return bad('player not found', 404);

  // Server-side unlock check: N unlocked iff no prereq or prereq completed.
  const track = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: 'CATALOG#TRACKS', sk: `TRACK#${trackId}` },
  }));
  if (!track.Item) return bad('unknown track', 404);
  const completed: string[] = player.Item.completedTracks ?? [];
  if (track.Item.requiresTrackId && !completed.includes(track.Item.requiresTrackId)) {
    return bad('track locked', 403);
  }

  // Module 4: open placement — no matchmaking rules. Find an open session on
  // the requested track (or create one) and seat the player right away.
  if (PLACEMENT_MODE === 'open') {
    return openPlacement(playerId, player.Item.name as string, trackId, size);
  }

  // MATCHMAKING_CONFIG_PREFIX is e.g. "PixelRushMatchAnywhere" or
  // "PixelRushMatchEc2"; the match size picks the concrete config.
  const res = await gamelift.send(new StartMatchmakingCommand({
    ConfigurationName: `${process.env.MATCHMAKING_CONFIG_PREFIX!}${size}`,
    Players: [{
      PlayerId: playerId,
      PlayerAttributes: {
        level: { N: player.Item.level },
        trackId: { S: trackId },
      },
      ...(Object.keys(latencyInMs).length > 0 ? { LatencyInMs: latencyInMs } : {}),
    }],
  }));
  const ticketId = res.MatchmakingTicket!.TicketId!;

  // debug trace to the world channel: who asked for what, with latencies
  const latStr = Object.keys(latencyInMs).length
    ? Object.entries(latencyInMs).map(([r, ms]) => `${r.replace(/^(..)-([a-z])[a-z]*-(\d)$/, '$1$2$3')}:${ms}ms`).join(' ')
    : 'no latency data';
  await broadcastChat({
    type: 'chat', kind: 'debug',
    text: `FlexMatch ⇢ ${player.Item.name} 申请 ${size === 1 ? 'QuickStart' : size + 'P'} @${trackId}｜规则: 同赛道+等级差≤3｜延迟 ${latStr}`,
    at: Date.now(),
  }).catch(() => { /* best-effort */ });

  await ddb.send(new PutCommand({
    TableName: MAIN_TABLE,
    Item: {
      pk: `TICKET#${ticketId}`, sk: 'STATUS',
      playerId, trackId, status: 'SEARCHING',
      ttl: Math.floor(Date.now() / 1000) + 3600,
    },
  }));
  return json(200, { ticketId });
});

/**
 * Module 4 — open placement. No FlexMatch, no rules: look for an ACTIVE
 * session on this track with a free slot; if none, create one on the EC2
 * queue's fleet. Then create a player session and return its connection info
 * directly (the client's status poll picks it up immediately).
 *
 * This is deliberately simpler than FlexMatch: whoever asks first for a track
 * shares a session with whoever asks next — no level/latency/team rules. That
 * gap is exactly what Module 5 fills.
 */
let cachedFleetId: string | undefined;
async function resolveFleetId(): Promise<string> {
  if (cachedFleetId) return cachedFleetId;
  // The EC2 fleet is named 'PixelRushFleet' (see gamelift-stack). List fleets'
  // attributes and match by name — no cross-stack ARN plumbing needed.
  const res = await gamelift.send(new DescribeFleetAttributesCommand({}));
  const fleet = res.FleetAttributes?.find((f) => f.Name === process.env.OPEN_PLACEMENT_FLEET);
  if (!fleet?.FleetId) throw new Error(`fleet ${process.env.OPEN_PLACEMENT_FLEET} not found`);
  cachedFleetId = fleet.FleetId;
  return cachedFleetId;
}

async function openPlacement(
  playerId: string, name: string, trackId: string, size: number,
): Promise<APIGatewayProxyResultV2> {
  const fleetId = await resolveFleetId();

  await broadcastChat({
    type: 'chat', kind: 'debug',
    text: `直接放置 ⇢ ${name} 申请 @${trackId}｜无匹配规则，找一个空位或新开一局`,
    at: Date.now(),
  }).catch(() => { /* best-effort */ });

  // 1. Look for an ACTIVE session on this fleet with a free slot on this track.
  //    (Track is a game property; we filter it in code for clarity.)
  const search = await gamelift.send(new SearchGameSessionsCommand({
    FleetId: fleetId,
    FilterExpression: 'hasAvailablePlayerSessions = true',
    SortExpression: 'creationTimeMillis ASC',
    Limit: 20,
  })).catch(() => undefined);

  let session = search?.GameSessions?.find(
    (s) => s.GameProperties?.some((p) => p.Key === 'trackId' && p.Value === trackId),
  );

  // 2. None joinable on this track — create a fresh session on the fleet.
  if (!session) {
    const created = await gamelift.send(new CreateGameSessionCommand({
      FleetId: fleetId,
      MaximumPlayerSessionCount: size,
      GameProperties: [{ Key: 'trackId', Value: trackId }],
    })).catch((e) => { throw new Error(`create session: ${(e as Error).message}`); });
    session = created.GameSession;
  }

  if (!session?.GameSessionId) return bad('no session available', 503);

  // 3. Seat the player.
  const ps = await gamelift.send(new CreatePlayerSessionCommand({
    GameSessionId: session.GameSessionId,
    PlayerId: playerId,
  }));
  const p = ps.PlayerSession!;
  const connection = {
    ipAddress: p.IpAddress ?? '',
    dnsName: p.DnsName ?? '',
    port: p.Port ?? 0,
    playerSessionId: p.PlayerSessionId ?? '',
  };
  return json(200, { ticketId: p.PlayerSessionId, connection });
}

async function status(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const ticketId = event.queryStringParameters?.ticketId;
  if (!ticketId) return bad('ticketId required');
  // Prefer the event-updated item; fall back to DescribeMatchmaking.
  const item = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: `TICKET#${ticketId}`, sk: 'STATUS' },
  }));
  if (item.Item?.status === 'MatchmakingSucceeded' || item.Item?.connection) {
    return json(200, { status: item.Item.status, connection: item.Item.connection ?? null });
  }
  const res = await gamelift.send(new DescribeMatchmakingCommand({ TicketIds: [ticketId] }));
  const t = res.TicketList?.[0];
  return json(200, { status: t?.Status ?? 'UNKNOWN', connection: null });
}
