import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, LEADERBOARD_TABLE, json, bad } from './lib/db.js';
import { broadcastChat } from './lib/broadcast.js';

// Multiplayer rewards by finishing position. Everyone earns something; the
// top reward stays below the cheapest car (The Beige Legend, 220) so one race
// never buys a car outright.
const COINS_BY_POSITION = [200, 120, 80, 50, 30, 20, 15, 10];
// Earned on first completion of each track.
const TITLE_BY_TRACK: Record<string, string> = {
  'track-1': 'Loop Graduate',
  'track-2': 'Harbor Hero',
  'track-3': 'Neon Legend',
  'track-4': 'Volcano Conqueror',
};
// Level up when total completed-track count crosses these thresholds — simple
// workshop progression, not meant to be a real XP curve.

interface ResultEntry {
  playerId: string;
  name: string;
  position: number;
  timeMs: number;
  finished: boolean;
}

/**
 * POST /internal/results {trackId, results[]} — called by the game server with
 * a shared secret. Awards coins, upserts leaderboard best times, marks the
 * track completed (which unlocks the next one via the tracks endpoint logic).
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.headers['x-results-secret'] !== process.env.RESULTS_SECRET) {
    return bad('forbidden', 403);
  }
  const { trackId, results } = JSON.parse(event.body ?? '{}') as { trackId: string; results: ResultEntry[] };
  if (!trackId || !Array.isArray(results)) return bad('trackId and results required');

  // world chat: announce the human winner
  const winner = results.find((r) => r.position === 1 && r.playerId);
  if (winner) {
    await broadcastChat({
      type: 'chat', kind: 'system',
      text: `🏆 ${winner.name} 在 ${trackId} 跑出了第一名！`, at: Date.now(),
    }).catch(() => { /* best-effort */ });
  }

  for (const r of results) {
    const coins = COINS_BY_POSITION[r.position - 1] ?? 10;
    try {
      // completedTracks only grows for finishers.
      if (r.finished) {
        const title = TITLE_BY_TRACK[trackId];
        await ddb.send(new UpdateCommand({
          TableName: MAIN_TABLE,
          Key: { pk: `PLAYER#${r.playerId}`, sk: 'PROFILE' },
          UpdateExpression: 'SET coins = coins + :c, completedTracks = list_append(completedTracks, :t), #lvl = #lvl + :one'
            + (title ? ', titles = list_append(titles, :title)' : ''),
          ConditionExpression: 'attribute_exists(pk) AND NOT contains(completedTracks, :tid)',
          ExpressionAttributeNames: { '#lvl': 'level' },
          ExpressionAttributeValues: {
            ':c': coins, ':t': [trackId], ':tid': trackId, ':one': 1,
            ...(title ? { ':title': [title] } : {}),
          },
        }));
      } else {
        throw new Error('not finished'); // fall through to coins-only update
      }
    } catch {
      // Already completed this track (or DNF): coins only.
      await ddb.send(new UpdateCommand({
        TableName: MAIN_TABLE,
        Key: { pk: `PLAYER#${r.playerId}`, sk: 'PROFILE' },
        UpdateExpression: 'SET coins = coins + :c',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':c': coins },
      })).catch(() => { /* unknown player (local bot): skip */ });
    }

    // Leaderboard best time upsert.
    if (r.finished && r.timeMs > 0) {
      const current = await ddb.send(new GetCommand({
        TableName: LEADERBOARD_TABLE, Key: { trackId, playerId: r.playerId },
      }));
      if (!current.Item || r.timeMs < current.Item.bestTimeMs) {
        await ddb.send(new PutCommand({
          TableName: LEADERBOARD_TABLE,
          Item: {
            trackId, playerId: r.playerId, bestTimeMs: r.timeMs,
            playerName: r.name, updatedAt: new Date().toISOString(),
          },
        }));
      }
    }
  }
  return json(200, { processed: results.length });
};
