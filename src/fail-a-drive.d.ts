export type Theme = 'auto' | 'light' | 'dark';
export type Status = 'online' | 'degraded' | 'rebuilding' | 'critical' | 'protected' | 'copyback' | 'offline';

export interface Strings {
  spec: string | ((drives: number) => string);
  legend: { data: string; parity: string; spare: string; rebuilt: string };
  steps: [string, string, string, string];
  failButton: string;
  restoreButton: string;
  hint: string;
  meterProtection: string;
  meterRebuild: string;
  meterGhost: string;
  ghostNote: string;
  protection: string | ((left: 0 | 1 | 2) => string);
  protectionLost: string;
  state: {
    online: string;
    degraded: (drive: string) => string;
    critical: (drive: string) => string;
    rebuilding: (percent: number) => string;
    criticalRebuilding: (percent: number) => string;
    protected: (drives: string[]) => string;
    copyback: (percent: number) => string;
    offline: string;
  };
  /** `**text**` is rendered in bold; everything else is plain text. */
  story: {
    idle: string | ((drives: number) => string);
    failed: string | ((drive: string) => string);
    rebuild: string | ((otherDrives: number) => string);
    second: string | ((drive: string) => string);
    rebuilt: string | (() => string);
    copyback: string | (() => string);
    online: string | (() => string);
    offline: string | (() => string);
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
  detectMs?: number;
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
