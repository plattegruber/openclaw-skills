/**
 * Idea Flow Plugin Type Definitions
 * Types for managing the idea-to-implementation pipeline
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface PluginConfig {
  defaultRepo: string;
  claudeCodeEnvironment?: string;
  statePath: string;
  autoNotify: boolean;
  requirePlanBeforeImplement: boolean;
}

// ============================================================================
// Idea Types
// ============================================================================

export type IdeaStatus =
  | 'draft'
  | 'clarifying'
  | 'issue_creating'
  | 'issue_ready'
  | 'planning'
  | 'planned'
  | 'implementing'
  | 'implemented'
  | 'completed'
  | 'deleted';

export interface Idea {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;

  // Clarification tracking
  clarificationHistory: ClarificationEntry[];

  // GitHub artifacts
  github?: GitHubArtifacts;

  // Claude Code session tracking
  sessions: SessionRecord[];

  // Implementation plan
  plan?: ImplementationPlan;
}

export interface ClarificationEntry {
  question: string;
  answer: string;
  askedAt: string;
}

export interface GitHubArtifacts {
  repo: string;
  issueNumber?: number;
  issueUrl?: string;
  prNumber?: number;
  prUrl?: string;
  branch?: string;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionPurpose =
  | 'issue_creation'
  | 'planning'
  | 'implementation'
  | 'modification';

export type SessionStatus = 'running' | 'completed' | 'failed';

export interface SessionRecord {
  sessionId: string;
  purpose: SessionPurpose;
  startedAt: string;
  completedAt?: string;
  status: SessionStatus;
  claudeCodeUrl?: string;
  error?: string;
}

// ============================================================================
// Plan Types
// ============================================================================

export interface ImplementationPlan {
  summary: string;
  steps: PlanStep[];
  criticalFiles: CriticalFile[];
  risks: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  postedAsComment: boolean;
  commentUrl?: string;
}

export interface PlanStep {
  order: number;
  description: string;
  filesInvolved: string[];
}

export interface CriticalFile {
  path: string;
  reason: string;
}

// ============================================================================
// State Types
// ============================================================================

export interface PluginState {
  ideas: Record<string, Idea>;
  notifications: Notification[];
  lastUpdatedAt: string | null;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'issue_created'
  | 'plan_ready'
  | 'implementation_ready'
  | 'modification_complete'
  | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  ideaId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  issueUrl?: string;
  prUrl?: string;
  commentUrl?: string;
  error?: string;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

// idea_capture
export interface CaptureIdeaInput {
  title: string;
  description: string;
  repo?: string;
}

export interface CaptureIdeaOutput {
  ideaId: string;
  status: IdeaStatus;
  title: string;
}

// idea_clarify
export interface ClarifyIdeaInput {
  ideaId: string;
  question: string;
  answer: string;
  updateDescription?: boolean;
}

export interface ClarifyIdeaOutput {
  ideaId: string;
  clarificationCount: number;
}

// idea_list
export interface ListIdeasInput {
  status?: IdeaStatus;
  limit?: number;
}

export interface ListIdeasOutput {
  ideas: IdeaSummary[];
  totalCount: number;
}

export interface IdeaSummary {
  id: string;
  title: string;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
  hasIssue: boolean;
  hasPlan: boolean;
  hasPR: boolean;
}

// idea_status
export interface GetIdeaStatusInput {
  ideaId: string;
}

export interface GetIdeaStatusOutput {
  idea: Idea;
  pendingNotifications: Notification[];
}

// idea_history
export interface GetIdeaHistoryInput {
  ideaId: string;
}

export interface GetIdeaHistoryOutput {
  idea: Idea;
  clarifications: ClarificationEntry[];
  sessions: SessionRecord[];
}

// idea_to_issue
export interface IdeaToIssueInput {
  ideaId: string;
  dryRun?: boolean;
}

export interface IdeaToIssueOutput {
  ideaId: string;
  sessionId?: string;
  issueUrl?: string;
  issueNumber?: number;
  dryRun: boolean;
}

// idea_plan
export interface PlanIdeaInput {
  ideaId: string;
}

export interface PlanIdeaOutput {
  ideaId: string;
  sessionId?: string;
  plan?: ImplementationPlan;
  commentUrl?: string;
}

// idea_implement
export interface ImplementIdeaInput {
  ideaId: string;
  skipPlan?: boolean;
}

export interface ImplementIdeaOutput {
  ideaId: string;
  sessionId?: string;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
}

// idea_modify
export interface ModifyIdeaInput {
  ideaId: string;
  modificationRequest: string;
  target: 'issue' | 'plan' | 'implementation';
}

export interface ModifyIdeaOutput {
  ideaId: string;
  sessionId?: string;
  success: boolean;
}

// idea_delete
export interface DeleteIdeaInput {
  ideaId: string;
  closeIssue?: boolean;
  closePR?: boolean;
}

export interface DeleteIdeaOutput {
  ideaId: string;
  deleted: boolean;
  issueClosed: boolean;
  prClosed: boolean;
}

// ============================================================================
// Session Manager Types
// ============================================================================

export interface SessionParams {
  repo: string;
  title?: string;
  description?: string;
  clarifications?: ClarificationEntry[];
  issueNumber?: number;
  issueUrl?: string;
  plan?: ImplementationPlan;
  modificationRequest?: string;
}

export interface SessionStartResult {
  sessionId: string;
  claudeCodeUrl: string;
  messages: StreamMessage[];
}

export interface SessionResumeResult {
  sessionId: string;
  messages: StreamMessage[];
}

export interface StreamMessage {
  type: string;
  subtype?: string;
  content?: string;
  session_id?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode =
  | 'IDEA_NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'GITHUB_ERROR'
  | 'CLAUDE_CODE_SESSION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NO_ISSUE_EXISTS'
  | 'NO_PLAN_EXISTS'
  | 'CONFIGURATION_ERROR';

export interface RecoveryStrategy {
  action: string;
  message: string;
}
