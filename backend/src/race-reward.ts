import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE, json, bad, withOriginVerify } from './lib/db.js';

// Quick Start (vs NPC) rewards — deliberately smaller than multiplayer
// (multiplayer pays 200/120/80/... via report-results). Kept server-side so
// coins can't be minted from the browser console beyond this cap.
const PRACTICE_COINS = [40, 25, 15, 10, 5, 5];
const MIN_INTERVAL_MS = 30_000; // a race takes ~40s+; block rapid-fire claims

/**
 * POST /api/race-reward {playerId, position}
 * Awards practice-race coins. Basic abuse guard: at most one claim per
 * 30 seconds per player (lastPracticeAt on the profile).
 */
export const handler = withOriginVerify(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const { playerId, position } = JSON.parse(event.body ?? '{}');
  if (!playerId || !Number.isInteger(position) || position < 1) {
    return bad('playerId and position required');
  }
  const coins = PRACTICE_COINS[Math.min(position - 1, PRACTICE_COINS.length - 1)];
  const now = Date.now();
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET coins = coins + :c, lastPracticeAt = :now',
      ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(lastPracticeAt) OR lastPracticeAt < :cutoff)',
      ExpressionAttributeValues: { ':c': coins, ':now': now, ':cutoff': now - MIN_INTERVAL_MS },
      ReturnValues: 'ALL_NEW',
    }));
    return json(200, { coinsAwarded: coins, coins: res.Attributes!.coins });
  } catch {
    return json(200, { coinsAwarded: 0, reason: 'too soon after last practice race' });
  }
});
