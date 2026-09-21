export type TaskStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'verify_failed'
  | 'agent_failed'
  | 'bootstrap_failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted'
  | 'error';

export interface TaskDto {
  id: string;
  title: string;
  role: string;
  files: string[];
  dependsOn: string[];
  prompt: string;
  verify?: string;
  branch: string;
}

export interface PlanDto {
  goal: string;
  tasks: TaskDto[];
}

export interface TaskResultDto extends TaskDto {
  status: TaskStatus;
  agent?: string;
  changedFiles?: string[];
  log: string;
  startedAt: string;
  endedAt?: string;
  error?: string;
}

export interface FileConflictDto {
  taskA: string;
  taskB: string;
  files: string[];
}

export type RunStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'failed';

export interface RunRecordDto {
  id: string;
  repoPath: string;
  goal: string;
  plan: PlanDto | null;
  pid: number | null;
  status: RunStatus;
  createdAt: string;
  endedAt: string | null;
}

export interface TaskRecordDto {
  id: string;
  runId: string;
  title: string;
  role: string;
  status: string;
  branch: string;
  logPath: string;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  pid: number | null;
}

export interface RepoDto {
  id: string;
  path: string;
  name: string | null;
  addedAt: string;
}

export interface ListReposResponse {
  repos: RepoDto[];
}

export interface RegisterRepoRequest {
  path: string;
}

export interface RegisterRepoResponse {
  repo: RepoDto;
}

export interface ListRunsResponse {
  runs: RunRecordDto[];
}

export interface PlanRequest {
  goal: string;
}

export interface PlanResponse {
  runId: string;
  plan: PlanDto;
  warnings: FileConflictDto[];
}

export interface CreateRunRequest {
  runId?: string;
  plan?: PlanDto;
}

export interface RunResponse {
  run: RunRecordDto;
}

export interface RunDetailResponse {
  run: RunRecordDto;
  tasks: TaskRecordDto[];
}

export interface CancelTaskResponse {
  message: string;
  taskId: string;
  runId: string;
}

export interface MergeReportDto {
  runId: string;
  integrationBranch: string;
  merged: { id: string; branch: string }[];
  conflicts: { id: string; branch: string; files: string[] }[];
  verifyFailed: { id: string; branch: string; exitCode: number }[];
  notMerged: { id: string; branch: string; reason: TaskStatus }[];
}

export interface MergeResponse {
  report: MergeReportDto;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type ReviewStatus = 'passed' | 'needs_fix';

export interface ReviewResultDto {
  status: ReviewStatus;
  summary: string;
  fixTasks?: TaskDto[];
}

export type SquadEventType =
  | 'plan:start'
  | 'plan:log'
  | 'plan:done'
  | 'run:start'
  | 'task:start'
  | 'task:log'
  | 'task:done'
  | 'review:start'
  | 'review:log'
  | 'review:done'
  | 'run:done';

export type SquadEventDto =
  | { type: 'plan:start'; goal: string }
  | { type: 'plan:log'; chunk: string }
  | { type: 'plan:done'; runId: string; plan: PlanDto; warnings: FileConflictDto[] }
  | { type: 'run:start'; runId: string; plan: PlanDto }
  | { type: 'task:start'; runId: string; taskId: string }
  | { type: 'task:log'; runId: string; taskId: string; chunk: string }
  | { type: 'task:done'; runId: string; result: TaskResultDto }
  | { type: 'review:start'; runId: string; round: number }
  | { type: 'review:log'; runId: string; round: number; chunk: string }
  | { type: 'review:done'; runId: string; round: number; result: ReviewResultDto }
  | { type: 'run:done'; runId: string; results: TaskResultDto[] };

export interface AgentSpecDto {
  cli?: string;
  model?: string;
  command?: string[];
  env?: Record<string, string>;
  promptFile?: string;
}

export interface SquadConfigDto {
  configVersion?: number;
  baseBranch: string;
  integrationBranch: string;
  worktreeDir?: string;
  dbFile?: string;
  planFile?: string;
  logDir?: string;
  maxParallel: number;
  timeoutMinutes: number;
  executionMode?: 'direct' | 'worktree';
  maxReviewRounds?: number;
  bootstrap?: string[];
  copyFiles?: string[];
  verify?: string[];
  agents: Record<string, AgentSpecDto>;
}

export interface ProviderConfigDto {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  customModels?: string[];
}

export interface GetProvidersResponse {
  providers: ProviderConfigDto[];
}

export interface SaveProvidersRequest {
  providers: ProviderConfigDto[];
}

export interface TestProviderRequest {
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface TestProviderResponse {
  success: boolean;
  latencyMs: number;
  models: string[];
  error?: string;
}

export interface RepoConfigResponse {
  config: SquadConfigDto;
}

export interface UpdateRepoConfigRequest {
  config: SquadConfigDto;
}

