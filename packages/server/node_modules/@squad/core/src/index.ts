export {
  type AgentSpec,
  AgentSpecSchema,
  CLI_PRESETS,
  ConfigError,
  getAgentPromptCandidates,
  loadSquadConfig,
  parseFrontmatter,
  parseSquadConfig,
  renderAgentCommand,
  renderAgentPrompt,
  resolveAgent,
  resolveSquadPaths,
  type LoadedSquadConfig,
  type ResolvedAgent,
  type ResolvedSquadPaths,
  type SquadConfig,
  SquadConfigSchema,
} from './config.js';
export {
  abortMerge,
  cleanupOrphanWorktrees,
  commitAll,
  createWorktree,
  deleteBranch,
  getRepositoryRoot,
  isGitRepository,
  listChangedFiles,
  mergeBranch,
  removeWorktree,
  repoRoot,
  runGit,
  type GitCommandResult,
  GitCommandError,
} from './git.js';
export {
  TaskLockManager,
  TaskLockError,
  isPidAlive,
  type LockMetadata,
} from './lock.js';
export {
  DEFAULT_ROLE_POLICIES,
  globToRegex,
  matchesAnyPattern,
  validateCommandAccess,
  validateFileAccess,
  type PermissionMode,
  type RolePermissionPolicy,
  type ValidationResult,
} from './permissions.js';
export {
  HookPipeline,
  type HookActionType,
  type HookContext,
  type HookResult,
  type PreToolUseHook,
  type PostToolUseHook,
} from './hooks.js';
export {
  buildConsultationPrompt,
  buildPlannerPrompt,
  buildSmartChatPrompt,
  cleanChatReply,
  detectCycle,
  extractJson,
  fileConflicts,
  parsePlanOutput,
  PlanError,
  PlanSchema,
  PlanTaskSchema,
  repoOverview,
  topoSort,
  tryParsePlanOutput,
  validatePlan,
  type FileConflict,
  type RepoOverview,
} from './planner.js';
export { mergeRun, type MergeReport } from './merge.js';
export {
  reconcileOrphanedTasks,
  RunnerError,
  SquadOrchestrator,
  type SquadOrchestratorOptions,
} from './runner.js';
export {
  SquadStore,
  type RunRecord,
  type StoredEvent,
  type TaskRecord,
} from './store.js';
export type { ExecutionMode, Plan, ReviewResult, ReviewStatus, SquadEvent, Task, TaskResult, TaskStatus } from './types.js';
export * from './stages/index.js';
