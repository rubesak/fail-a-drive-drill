export type Theme = 'auto' | 'light' | 'dark';
export type Status = 'online' | 'degraded' | 'rebuilding' | 'critical' | 'protected' | 'copyback' | 'offline';

export interface Strings {
  spec: string | ((drives: number, rebuildAreas: number) => string);
  legend: { data: string; parity: string; spare: string; rebuilt: string };
  steps: [string, string, string, string];
  failButton: string;
  replaceButton: string | ((failedDrives: number) => string);
  restoreButton: string;
  hint: string;
  meterProtection: string;
  meterAreas: string | ((rebuildAreas: number) => string);
  meterRebuild: string;
  meterGhost: string;
  ghostNote: string;
  protection: string | ((left: 0 | 1 | 2) => string);
  protectionLost: string;
  areas: string | ((free: number, total: number, rebuilding: string | null, used: string[]) => string);
  areasCopyback: string;
  state: {
    online: string;
    degraded: (drive: string) => string;
    critical: string | (() => string);
    noArea: string | (() => string);
    rebuilding: (percent: number) => string;
    criticalRebuilding: (percent: number) => string;
    protected: (drives: string[]) => string;
    copyback: (percent: number, withRebuild: boolean) => string;
    offline: string;
  };
  /** `**text**` is rendered in bold; everything else is plain text. */
  story: {
    idle: string | ((drives: number, rebuildAreas: number) => string);
    failed: string | ((drive: string) => string);
    rebuild: string | ((otherDrives: number, drive: string) => string);
    second: string | ((drive: string, rebuildingDrive: string, rebuildAreas: number) => string);
    noArea: string | ((drive: string, drivesInAreas: string[]) => string);
    noAreaCritical: string | ((drive: string) => string);
    rebuilt: string | ((drivesInAreas: string[]) => string);
    waiting: string | ((drivesInAreas: string[], drivesWithoutArea: string[]) => string);
    critical: string | ((drivesWithoutArea: string[]) => string);
    copyback: string | ((replacedDrives: number, fromRebuildArea: boolean, rebuiltDirectly: string[]) => string);
    online: string | (() => string);
    offline: string | ((drive: string) => string);
    restored: string | (() => string);
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...a: any[]) => any ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface Options {
  drives?: number;
  rows?: number;
  stripe?: number;
  rebuildMs?: number;
  spareSlower?: number;
  /** Distributed spare capacity in drives (1 to 4). Each failed drive keeps one area until it is replaced. */
  rebuildAreas?: number;
  detectMs?: number;
  /** Replace failed drives on their own after holdMs (default false: the visitor replaces them). */
  autoReplace?: boolean;
  holdMs?: number;
  copybackMs?: number;
  theme?: Theme;
  title?: string;
  headingLevel?: 0 | 2 | 3 | 4 | 5 | 6;
  animate?: boolean;
  strings?: DeepPartial<Strings>;
}

export interface Controller {
  readonly root: HTMLElement;
  fail(index: number): void;
  failRandom(): void;
  /** Replaces every failed drive once no more rebuilds can run. */
  replace(): void;
  reset(): void;
  destroy(): void;
}

export function mount(target: Element | string, options?: Options): Controller;
export function autoInit(selector?: string): Controller[];
export const defaults: Required<Omit<Options, 'strings'>> & { strings: {} };
export const strings: Strings;

declare global {
  interface HTMLElementEventMap {
    'faildrive:status': CustomEvent<{ status: Status; failed: number[] }>;
    'faildrive:rebuild': CustomEvent<{ drives: number[] }>;
  }
}
