import { useLocation } from 'react-router-dom';

/** Dev-only state preview (?state=processing) so every UI state can be reviewed without a backend. */
export function useDevState<T extends string>(allowed: readonly T[]): T | null {
  const { search } = useLocation();
  if (!import.meta.env.DEV) return null;
  const s = new URLSearchParams(search).get('state') as T | null;
  return s && allowed.includes(s) ? s : null;
}
