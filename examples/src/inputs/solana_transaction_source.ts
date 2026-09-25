import {z} from 'zod';
import {ProgressSampleSchema, type ProgressSample} from '@shihangw/rowrunner';

const TransactionCountResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.number().int().nonnegative(),
});
export const SOLANA_PUBLIC_RPC_URL = 'https://solana-rpc.publicnode.com';

/** Reads Solana's public RPC and timestamps the observation of its count. */
export async function readSolanaTransactionProgress(
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<ProgressSample> {
  const response = await request(SOLANA_PUBLIC_RPC_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransactionCount',
      params: [{commitment: 'finalized'}],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Solana RPC returned HTTP ${response.status}`);
  }
  const {result} = TransactionCountResponseSchema.parse(await response.json());
  return ProgressSampleSchema.parse({
    runId: 'solana-mainnet',
    completed: result,
    timestamp: Date.now(),
    targetTotal: null,
    status: 'running',
    label: 'Solana finalized transactions',
    unit: 'transactions',
  });
}
