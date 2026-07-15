import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { ddb, MAIN_TABLE } from './lib/db.js';
import { broadcastChat } from './lib/broadcast.js';

/**
 * WebSocket API routes:
 *  $connect (?playerId=)  — register the connection for matchmaking pushes AND
 *                           the world-chat roster; announces the arrival.
 *  $disconnect            — deregister (clean the roster + push-lookup item so
 *                           broadcasts never target a dead connection).
 *  $default               — world-chat message from a player; broadcast it.
 */
export const handler = async (event: APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string>;
}) => {
  const { connectionId, routeKey } = event.requestContext;

  if (routeKey === '$connect') {
    const playerId = event.queryStringParameters?.playerId;
    if (!playerId) return { statusCode: 400, body: 'playerId query param required' };
    const ttl = Math.floor(Date.now() / 1000) + 7200;
    const name = await playerName(playerId);
    await Promise.all([
      // matchmaking push lookup: playerId -> connectionId
      ddb.send(new PutCommand({
        TableName: MAIN_TABLE,
        Item: { pk: `CONN#${playerId}`, sk: 'WS', connectionId, ttl },
      })),
      // world-chat roster: one partition, one item per live player
      ddb.send(new PutCommand({
        TableName: MAIN_TABLE,
        Item: { pk: 'CONNS', sk: playerId, connectionId, name, ttl },
      })),
    ]);
    // NOTE: cannot PostToConnection during $connect (connection not live yet),
    // so the join announcement fires on the client's first $default frame
    // ({"type":"hello"}) instead.
    return { statusCode: 200, body: 'connected' };
  }

  if (routeKey === '$disconnect') {
    // Clean the roster so broadcasts stop targeting this dead connection.
    // We only have connectionId here (not playerId), so find the roster entry
    // whose connectionId matches and delete both it and the push-lookup item.
    // TTL remains the backstop for anything we can't resolve.
    const roster = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'pk = :p',
      ExpressionAttributeValues: { ':p': 'CONNS' },
    })).catch(() => undefined);
    const entry = roster?.Items?.find((it) => it.connectionId === connectionId);
    if (entry) {
      const playerId = entry.sk as string;
      await Promise.all([
        ddb.send(new DeleteCommand({ TableName: MAIN_TABLE, Key: { pk: 'CONNS', sk: playerId } })),
        // only remove the push lookup if it still points at THIS connection —
        // a fast reconnect may have already written a newer connectionId
        ddb.send(new DeleteCommand({
          TableName: MAIN_TABLE,
          Key: { pk: `CONN#${playerId}`, sk: 'WS' },
          ConditionExpression: 'connectionId = :c',
          ExpressionAttributeValues: { ':c': connectionId },
        })).catch(() => { /* newer connection owns it; leave it */ }),
      ]);
    }
    return { statusCode: 200, body: 'bye' };
  }

  // $default: chat frames from players
  try {
    const body = JSON.parse(event.body ?? '{}');
    const playerId: string = body.playerId ?? '';
    const name = await playerName(playerId);
    if (body.type === 'hello') {
      // Presence announcement. Debounced server-side so a reconnect (API GW
      // idle timeout, network blip) doesn't re-announce: only fire if this
      // player hasn't announced within the debounce window.
      if (playerId && (await shouldAnnounce(playerId))) {
        await broadcastChat({ type: 'chat', kind: 'system', text: `${name} 进入了游戏`, at: Date.now() });
      }
    } else if (body.type === 'say' && typeof body.text === 'string' && body.text.trim()) {
      await broadcastChat({
        type: 'chat', kind: 'player', from: name,
        text: String(body.text).slice(0, 200), at: Date.now(),
      });
    }
  } catch { /* malformed frame: drop */ }
  return { statusCode: 200, body: 'ok' };
};

async function playerName(playerId: string): Promise<string> {
  if (!playerId) return 'Someone';
  const p = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
  }));
  return (p.Item?.name as string) ?? 'Someone';
}

// Debounce presence announcements: record the last-announced timestamp per
// player and only allow one within the window. This makes the announcement
// reliable (it's server-driven, so every peer's broadcast reaches the current
// roster) without spamming on reconnects.
const ANNOUNCE_DEBOUNCE_SECONDS = 60;
async function shouldAnnounce(playerId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE,
      Item: { pk: `PRESENCE#${playerId}`, sk: 'HELLO', at: now, ttl: now + 7200 },
      // write only if there's no recent announcement still live
      ConditionExpression: 'attribute_not_exists(pk) OR #a < :cutoff',
      ExpressionAttributeNames: { '#a': 'at' },
      ExpressionAttributeValues: { ':cutoff': now - ANNOUNCE_DEBOUNCE_SECONDS },
    }));
    return true;
  } catch {
    return false; // recent announcement exists — skip
  }
}
