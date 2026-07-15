import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const MAIN_TABLE = process.env.MAIN_TABLE!;
export const LEADERBOARD_TABLE = process.env.LEADERBOARD_TABLE!;

export interface PlayerProfile {
  playerId: string;
  name: string;
  level: number;
  coins: number;
  titles: string[];
  ownedCars: string[];
  selectedCar: string;
  completedTracks: string[];
}

/**
 * Requests must arrive via CloudFront, which injects x-origin-verify with a
 * shared secret. Direct calls to the execute-api URL are rejected — the
 * public entry point is CloudFront only (security requirement).
 */
export function withOriginVerify<E extends { headers: Record<string, string | undefined> }, R>(
  handler: (event: E) => Promise<R>,
): (event: E) => Promise<R | APIGatewayProxyResultV2> {
  return async (event: E) => {
    const secret = process.env.ORIGIN_VERIFY_SECRET;
    if (secret && event.headers['x-origin-verify'] !== secret) {
      return json(403, { error: 'direct access not allowed' });
    }
    return handler(event);
  };
}

export function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function bad(reason: string, code = 400): APIGatewayProxyResultV2 {
  return json(code, { error: reason });
}
