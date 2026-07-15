import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { SNSEvent } from 'aws-lambda';
import { ddb, MAIN_TABLE } from './lib/db.js';
import { broadcastChat } from './lib/broadcast.js';

const wsClient = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_API_ENDPOINT! });

/**
 * FlexMatch event pipeline: SNS -> this Lambda -> WebSocket push.
 * Event reference: https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/match-events.html
 * Adapted from the guidance repo's process_matchmaking_events.py, replacing
 * "write to DynamoDB and let the client poll" with a direct push (and still
 * persisting the status so the polling endpoint keeps working as a fallback).
 */
export const handler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);
    const detail = message.detail;
    const type: string = detail?.type ?? '';
    if (!type) continue;

    const gameSessionInfo = detail.gameSessionInfo;

    if (type === 'MatchmakingSucceeded') {
      const ids: string[] = (gameSessionInfo?.players ?? [])
        .map((gp: { playerId: string }) => gp.playerId);
      const names = await Promise.all(ids.map(lookupName));
      // world announcement (everyone cares who's racing)
      await broadcastChat({
        type: 'chat', kind: 'system',
        text: `🏁 FlexMatch：${names.join(' vs ')} 匹配成功`, at: Date.now(),
      }).catch(() => { /* best-effort */ });
      // debug trace: where the queue placed the session (region is embedded
      // in the GameLift DnsName: <id>.<fleet>.<region>.amazongamelift.com)
      const dns: string = gameSessionInfo?.dnsName ?? '';
      const region = dns.match(/\.([a-z]{2}-[a-z]+-\d)\.amazongamelift\.com$/)?.[1] ?? 'unknown';
      await broadcastChat({
        type: 'chat', kind: 'debug',
        text: `FlexMatch ⇢ 会话放置于 ${region}｜${gameSessionInfo?.ipAddress ?? '?'}:${gameSessionInfo?.port ?? '?'}｜${names.length} 名玩家`,
        at: Date.now(),
      }).catch(() => { /* best-effort */ });
    } else if (type === 'MatchmakingTimedOut' || type === 'MatchmakingFailed') {
      await broadcastChat({
        type: 'chat', kind: 'debug',
        text: `FlexMatch ⇢ 匹配${type === 'MatchmakingTimedOut' ? '超时' : '失败'}（票据 ${(detail.tickets ?? []).length} 张）`,
        at: Date.now(),
      }).catch(() => { /* best-effort */ });
    }

    for (const ticket of detail.tickets ?? []) {
      const ticketId: string = ticket.ticketId;

      // players in this ticket (one per ticket in our flow, but loop anyway)
      for (const p of ticket.players ?? []) {
        const playerId: string = p.playerId;
        let payload: Record<string, unknown> = { type: 'matchmaking', status: type, ticketId };

        if (type === 'MatchmakingSucceeded') {
          const sessionPlayer = (gameSessionInfo?.players ?? [])
            .find((gp: { playerId: string }) => gp.playerId === playerId);
          payload = {
            ...payload,
            ipAddress: gameSessionInfo?.ipAddress ?? '',
            dnsName: gameSessionInfo?.dnsName ?? '',
            port: gameSessionInfo?.port ?? 0,
            playerSessionId: sessionPlayer?.playerSessionId ?? '',
          };
          await ddb.send(new UpdateCommand({
            TableName: MAIN_TABLE,
            Key: { pk: `TICKET#${ticketId}`, sk: 'STATUS' },
            UpdateExpression: 'SET #s = :s, connection = :c',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':s': type,
              ':c': {
                ipAddress: payload.ipAddress, dnsName: payload.dnsName,
                port: payload.port, playerSessionId: payload.playerSessionId,
              },
            },
          })).catch(() => { /* ticket item may have expired */ });
        } else {
          await ddb.send(new UpdateCommand({
            TableName: MAIN_TABLE,
            Key: { pk: `TICKET#${ticketId}`, sk: 'STATUS' },
            UpdateExpression: 'SET #s = :s',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':s': type },
          })).catch(() => { /* ignore */ });
        }

        await push(playerId, payload);
      }
    }
  }
};

async function lookupName(playerId: string): Promise<string> {
  const p = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: `PLAYER#${playerId}`, sk: 'PROFILE' },
  })).catch(() => null);
  return (p?.Item?.name as string) ?? playerId.slice(0, 8);
}

async function push(playerId: string, payload: Record<string, unknown>): Promise<void> {
  const conn = await ddb.send(new GetCommand({
    TableName: MAIN_TABLE, Key: { pk: `CONN#${playerId}`, sk: 'WS' },
  }));
  const connectionId = conn.Item?.connectionId as string | undefined;
  if (!connectionId) {
    console.log(`no ws connection for player ${playerId}; client can poll instead`);
    return;
  }
  try {
    await wsClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }));
  } catch (e) {
    if (e instanceof GoneException) {
      await ddb.send(new DeleteCommand({
        TableName: MAIN_TABLE, Key: { pk: `CONN#${playerId}`, sk: 'WS' },
      }));
    } else {
      console.error(`push to ${playerId} failed`, e);
    }
  }
}
