import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, MAIN_TABLE } from './db.js';

const wsClient = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_API_ENDPOINT! });

export interface ChatMessage {
  type: 'chat';
  kind: 'system' | 'player' | 'debug';
  from?: string;
  text: string;
  at: number;
}

/**
 * Broadcasts a world-chat message to every live WebSocket connection.
 * Connections live as CONN#<playerId> items; a CONNS GSI-free scan would be
 * wasteful, so connections are ALSO indexed under the fixed pk "CONNS" with
 * sk = playerId (written by ws-connect).
 */
export async function broadcastChat(msg: ChatMessage): Promise<void> {
  const conns = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    KeyConditionExpression: 'pk = :p',
    ExpressionAttributeValues: { ':p': 'CONNS' },
  }));
  const data = Buffer.from(JSON.stringify(msg));
  // Deliver to everyone concurrently; a dead (Gone) connection only affects
  // its own send, never blocks the others. Zombie roster entries are collected
  // and pruned after the fan-out so a stale connectionId can't silently drop
  // future broadcasts.
  const stale: string[] = [];
  await Promise.all((conns.Items ?? []).map(async (item) => {
    try {
      await wsClient.send(new PostToConnectionCommand({ ConnectionId: item.connectionId, Data: data }));
    } catch (e) {
      if (e instanceof GoneException) {
        stale.push(item.sk as string);
      } else {
        console.error(`broadcast to ${item.sk} failed`, e);
      }
    }
  }));
  await Promise.all(stale.map((sk) =>
    ddb.send(new DeleteCommand({ TableName: MAIN_TABLE, Key: { pk: 'CONNS', sk } }))
      .catch(() => { /* best-effort prune */ }),
  ));
}
