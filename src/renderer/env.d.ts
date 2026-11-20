import type { CortaiApi } from '../preload';

declare global {
  interface Window { cortai: CortaiApi }
}
