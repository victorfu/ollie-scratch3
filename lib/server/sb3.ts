import 'server-only';
import {validateSB3 as validate} from '../sb3-validate';
export const MAX_BYTES = 50 * 1024 * 1024;
export function sizeLimit() {
  const n = Number(process.env.SCRATCH_EXAMPLES_MAX_MB || 50);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) * 1024 * 1024 : MAX_BYTES;
}
export const validateSB3 = (bytes: Buffer): Promise<{extensions: string[]}> => validate(bytes, sizeLimit());
