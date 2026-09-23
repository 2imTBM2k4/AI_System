import {
  type PermissionMode,
  validateCommandAccess,
  validateFileAccess,
  type ValidationResult,
} from './permissions.js';

export type HookActionType = 'file_write' | 'command_exec';

export interface HookContext {
  runId: string;
  taskId: string;
  role: string;
  actionType: HookActionType;
  target: string;
  repoPath: string;
  mode?: PermissionMode;
  acceptanceTests?: string[];
}

export interface HookResult {
  decision: 'allow' | 'deny';
  reason?: string;
}

export type PreToolUseHook = (context: HookContext) => Promise<HookResult | null> | HookResult | null;
export type PostToolUseHook = (context: HookContext, result: HookResult) => Promise<void> | void;

/**
 * Extensible PreToolUse and PostToolUse hook pipeline for runtime safety and auditing.
 */
export class HookPipeline {
  private readonly preHooks: PreToolUseHook[] = [];
  private readonly postHooks: PostToolUseHook[] = [];

  constructor() {
    // Register default security policy hook
    this.addPreHook(this.defaultPolicyHook.bind(this));
  }

  addPreHook(hook: PreToolUseHook): void {
    this.preHooks.push(hook);
  }

  addPostHook(hook: PostToolUseHook): void {
    this.postHooks.push(hook);
  }

  /** Evaluates pre-execution hooks. Short-circuits on first 'deny'. */
  async executePreHooks(context: HookContext): Promise<HookResult> {
    for (const hook of this.preHooks) {
      try {
        const result = await hook(context);
        if (result && result.decision === 'deny') {
          await this.executePostHooks(context, result);
          return result;
        }
      } catch (error) {
        const failResult: HookResult = {
          decision: 'deny',
          reason: `Hook execution failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        await this.executePostHooks(context, failResult);
        return failResult;
      }
    }

    const allowResult: HookResult = { decision: 'allow' };
    await this.executePostHooks(context, allowResult);
    return allowResult;
  }

  /** Executes post-execution hooks (audit, logging). */
  async executePostHooks(context: HookContext, result: HookResult): Promise<void> {
    for (const hook of this.postHooks) {
      try {
        await hook(context, result);
      } catch {
        // Post hooks should not fail execution
      }
    }
  }

  private defaultPolicyHook(context: HookContext): HookResult {
    const mode = context.mode ?? 'restricted';
    if (context.actionType === 'file_write') {
      const val = validateFileAccess(
        context.role,
        context.target,
        context.repoPath,
        mode,
        context.acceptanceTests ?? [],
      );
      return val.allowed ? { decision: 'allow' } : { decision: 'deny', reason: val.reason };
    }

    if (context.actionType === 'command_exec') {
      const val = validateCommandAccess(context.role, context.target, mode);
      return val.allowed ? { decision: 'allow' } : { decision: 'deny', reason: val.reason };
    }

    return { decision: 'allow' };
  }
}
