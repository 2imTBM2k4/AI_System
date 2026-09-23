export interface ClarificationQuestion {
  id: string;
  question: string;
  reason?: string;
  answered?: string;
}

export interface ClarificationResult {
  isClear: boolean;
  questions: ClarificationQuestion[];
  summary?: string;
}

export interface ApiEndpointContract {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string;
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

export interface TechLeadContract {
  architectureSummary: string;
  endpoints: ApiEndpointContract[];
  databaseSchemaOverview?: string;
  sharedRules: string[];
  markdownDocument?: string;
}

export interface QAReport {
  passed: boolean;
  testSuitesRun: number;
  failedChecks: string[];
  feedbackForDevs?: string;
  summary: string;
}

export interface DevOpsReport {
  buildSuccess: boolean;
  artifactsCreated: string[];
  deploymentInstructions: string;
  status: 'ready' | 'failed';
  summary: string;
}
