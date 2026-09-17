import { type LoadedSquadConfig } from './config.js';
import { type SquadStore } from './store.js';
import type { TaskStatus } from './types.js';
export interface MergeReport {
    runId: string;
    integrationBranch: string;
    merged: {
        id: string;
        branch: string;
    }[];
    conflicts: {
        id: string;
        branch: string;
        files: string[];
    }[];
    verifyFailed: {
        id: string;
        branch: string;
        exitCode: number;
    }[];
    notMerged: {
        id: string;
        branch: string;
        reason: TaskStatus;
    }[];
}
export interface MergeRunOptions {
    runId: string;
    config: LoadedSquadConfig;
    store: SquadStore;
}
/** Merges passed task branches in dependency order and keeps integration green. */
export declare function mergeRun(options: MergeRunOptions): Promise<MergeReport>;
//# sourceMappingURL=merge.d.ts.map