import type { AiProvider, AiRequest, AiResult } from './types';

/**
 * Deterministic test double. Selectable ONLY when NODE_ENV === 'test' via
 * setTestProvider(); production and development can never route to it, so
 * no "AI connected" claim can be backed by fake output.
 */
export function createFakeProvider(respond: (req: AiRequest) => AiResult | Promise<AiResult>, model = 'test-double'): AiProvider {
  return { name: 'fake', model, isFake: true, generate: async (req) => respond(req) };
}
