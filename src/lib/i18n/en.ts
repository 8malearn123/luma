import { messages } from './messages';
export const en: Record<string, string> = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v[1]]));
