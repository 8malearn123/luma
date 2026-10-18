import { messages } from './messages';
export const ar: Record<string, string> = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v[0]]));
