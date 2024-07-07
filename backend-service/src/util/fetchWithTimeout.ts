import fetch, { Response, RequestInit } from 'node-fetch';
import { AbortSignal as NodeAbortSignal } from 'node-abort-controller';

export interface FetchResponse extends Response {}

type FetchAbortSignal = NonNullable<RequestInit['signal']>;

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
  timeout?: number;
  signal?: NodeAbortSignal;
}

const fetchWithTimeout = async (
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<FetchResponse> => {
  const { timeout = 8000, signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: (externalSignal || controller.signal) as FetchAbortSignal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
};

export default fetchWithTimeout;