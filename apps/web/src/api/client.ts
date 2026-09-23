import type {
  ListReposResponse,
  RegisterRepoResponse,
  ListRunsResponse,
  PlanResponse,
  RunResponse,
  RunDetailResponse,
  CancelTaskResponse,
  RetryTaskResponse,
  MergeResponse,
  PlanDto,
  ProviderConfigDto,
  GetProvidersResponse,
  SaveProvidersRequest,
  TestProviderRequest,
  TestProviderResponse,
  RepoConfigResponse,
  UpdateRepoConfigRequest,
  SquadConfigDto,
  ClarificationResultDto,
  ChatMode,
  ChatMessageResponse,
  FileContentResponse,
} from '@squad/shared-types';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errorMsg = errJson.error.message;
      } else if (errJson?.message) {
        errorMsg = errJson.message;
      }
    } catch {
      // fallback to status text
      errorMsg = res.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export async function listRepos(): Promise<ListReposResponse> {
  const res = await fetch('/repos');
  return handleResponse<ListReposResponse>(res);
}

export async function registerRepo(path: string): Promise<RegisterRepoResponse> {
  const res = await fetch('/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return handleResponse<RegisterRepoResponse>(res);
}

export interface DetectRepoResult {
  packageManager: 'pnpm' | 'yarn' | 'npm' | null;
  bootstrap: string[];
}

export async function detectRepoInfo(path: string): Promise<DetectRepoResult> {
  const res = await fetch('/repos/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return handleResponse<DetectRepoResult>(res);
}

export async function listRuns(repoId: string): Promise<ListRunsResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/runs`);
  return handleResponse<ListRunsResponse>(res);
}

export async function clarifyGoal(repoId: string, goal: string): Promise<ClarificationResultDto> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });
  return handleResponse<ClarificationResultDto>(res);
}

export async function createPlan(repoId: string, goal: string): Promise<PlanResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });
  return handleResponse<PlanResponse>(res);
}

export async function sendChatMessage(
  repoId: string,
  message: string,
  mode: ChatMode = 'auto'
): Promise<ChatMessageResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode }),
  });
  return handleResponse<ChatMessageResponse>(res);
}

export async function startRun(
  repoId: string,
  options: { runId?: string; plan?: PlanDto }
): Promise<RunResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return handleResponse<RunResponse>(res);
}

export async function getRunDetail(
  runId: string,
  signal?: AbortSignal
): Promise<RunDetailResponse> {
  const res = await fetch(`/runs/${encodeURIComponent(runId)}`, { signal });
  return handleResponse<RunDetailResponse>(res);
}

export async function cancelTask(runId: string, taskId: string): Promise<CancelTaskResponse> {
  const res = await fetch(
    `/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/cancel`,
    { method: 'POST' }
  );
  return handleResponse<CancelTaskResponse>(res);
}

export async function retryTask(runId: string, taskId: string): Promise<RetryTaskResponse> {
  const res = await fetch(
    `/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/retry`,
    { method: 'POST' }
  );
  return handleResponse<RetryTaskResponse>(res);
}

export async function mergeRun(runId: string): Promise<MergeResponse> {
  const res = await fetch(`/runs/${encodeURIComponent(runId)}/merge`, {
    method: 'POST',
  });
  return handleResponse<MergeResponse>(res);
}

export async function getProviders(): Promise<GetProvidersResponse> {
  const res = await fetch('/providers');
  return handleResponse<GetProvidersResponse>(res);
}

export async function saveProviders(providers: ProviderConfigDto[]): Promise<GetProvidersResponse> {
  const res = await fetch('/providers/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers } satisfies SaveProvidersRequest),
  });
  return handleResponse<GetProvidersResponse>(res);
}

export async function testProvider(req: TestProviderRequest): Promise<TestProviderResponse> {
  const res = await fetch('/providers/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<TestProviderResponse>(res);
}

export async function getRepoConfig(repoId: string): Promise<RepoConfigResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/config`);
  return handleResponse<RepoConfigResponse>(res);
}

export async function updateRepoConfig(
  repoId: string,
  config: SquadConfigDto
): Promise<RepoConfigResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config } satisfies UpdateRepoConfigRequest),
  });
  return handleResponse<RepoConfigResponse>(res);
}

export interface ServerHealthInfo {
  status: string;
  uptime: number;
  timestamp: number;
  registeredRepos: number;
}

export async function getServerHealth(): Promise<ServerHealthInfo> {
  const res = await fetch('/health');
  return handleResponse<ServerHealthInfo>(res);
}

export interface AgentFileInfo {
  role: string;
  filePath: string;
  exists: boolean;
  content: string;
  candidatePaths: string[];
}

export interface SaveAgentFileResponse {
  role: string;
  filePath: string;
  saved: boolean;
}

export async function getAgentFile(repoId: string, role: string): Promise<AgentFileInfo> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/agents/${encodeURIComponent(role)}/file`);
  return handleResponse<AgentFileInfo>(res);
}

export async function saveAgentFile(
  repoId: string,
  role: string,
  content: string,
  filePath?: string
): Promise<SaveAgentFileResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/agents/${encodeURIComponent(role)}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filePath }),
  });
  return handleResponse<SaveAgentFileResponse>(res);
}

export async function getRepoFile(repoId: string, path: string): Promise<FileContentResponse> {
  const res = await fetch(`/repos/${encodeURIComponent(repoId)}/file?path=${encodeURIComponent(path)}`);
  return handleResponse<FileContentResponse>(res);
}

