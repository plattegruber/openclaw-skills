/**
 * Idea Flow Plugin for OpenClaw
 *
 * This plugin provides a complete idea-to-implementation pipeline
 * using Claude Code web sessions for GitHub issue creation, planning,
 * and implementation.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

import { createStateManager, StateManager } from './src/state.js';
import { createNotificationManager, NotificationManager } from './src/notifications.js';
import { createSessionManager, ClaudeCodeSessionManager } from './src/claude-code/session-manager.js';
import type { PluginConfig, IdeaStatus } from './src/types.js';

import {
  ideaCaptureDefinition,
  ideaClarifyDefinition,
  ideaListDefinition,
  ideaStatusDefinition,
  ideaHistoryDefinition,
  ideaToIssueDefinition,
  ideaPlanDefinition,
  ideaImplementDefinition,
  ideaModifyDefinition,
  ideaDeleteDefinition,
  captureIdea,
  clarifyIdea,
  listIdeas,
  getIdeaStatus,
  getIdeaHistory,
  ideaToIssue,
  planIdea,
  implementIdea,
  modifyIdea,
  deleteIdea,
} from './src/tools/index.js';

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = (api.pluginConfig ?? {}) as Partial<PluginConfig>;

  // Validate required config
  if (!pluginConfig.defaultRepo) {
    console.error('Idea Flow: defaultRepo is required in plugin config');
    return;
  }

  // Initialize config with defaults
  const config: PluginConfig = {
    defaultRepo: pluginConfig.defaultRepo,
    claudeCodeEnvironment: pluginConfig.claudeCodeEnvironment,
    statePath: pluginConfig.statePath || '~/.idea-flow',
    autoNotify: pluginConfig.autoNotify !== false,
    requirePlanBeforeImplement: pluginConfig.requirePlanBeforeImplement !== false,
  };

  // Initialize managers
  const state = createStateManager(config.statePath);
  const notificationManager = createNotificationManager(config, state);
  const sessionManager = createSessionManager(config);

  // ============================================================================
  // Read Tools (Always Available)
  // ============================================================================

  // idea_list
  api.registerTool({
    name: ideaListDefinition.name,
    description: ideaListDefinition.description,
    parameters: ideaListDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return listIdeas(state, {
        status: params.status as IdeaStatus | undefined,
        limit: params.limit as number | undefined,
      });
    },
  });

  // idea_status
  api.registerTool({
    name: ideaStatusDefinition.name,
    description: ideaStatusDefinition.description,
    parameters: ideaStatusDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return getIdeaStatus(state, notificationManager, {
        ideaId: params.ideaId as string,
      });
    },
  });

  // idea_history
  api.registerTool({
    name: ideaHistoryDefinition.name,
    description: ideaHistoryDefinition.description,
    parameters: ideaHistoryDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return getIdeaHistory(state, {
        ideaId: params.ideaId as string,
      });
    },
  });

  // ============================================================================
  // Write Tools
  // ============================================================================

  // idea_capture
  api.registerTool({
    name: ideaCaptureDefinition.name,
    description: ideaCaptureDefinition.description,
    parameters: ideaCaptureDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return captureIdea(state, config, {
        title: params.title as string,
        description: params.description as string,
        repo: params.repo as string | undefined,
      });
    },
  });

  // idea_clarify
  api.registerTool({
    name: ideaClarifyDefinition.name,
    description: ideaClarifyDefinition.description,
    parameters: ideaClarifyDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return clarifyIdea(state, {
        ideaId: params.ideaId as string,
        question: params.question as string,
        answer: params.answer as string,
        updateDescription: params.updateDescription as boolean | undefined,
      });
    },
  });

  // idea_to_issue
  api.registerTool({
    name: ideaToIssueDefinition.name,
    description: ideaToIssueDefinition.description,
    parameters: ideaToIssueDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return ideaToIssue(state, sessionManager, notificationManager, {
        ideaId: params.ideaId as string,
        dryRun: params.dryRun as boolean | undefined,
      });
    },
  });

  // idea_plan
  api.registerTool({
    name: ideaPlanDefinition.name,
    description: ideaPlanDefinition.description,
    parameters: ideaPlanDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return planIdea(state, sessionManager, notificationManager, {
        ideaId: params.ideaId as string,
      });
    },
  });

  // idea_implement
  api.registerTool({
    name: ideaImplementDefinition.name,
    description: ideaImplementDefinition.description,
    parameters: ideaImplementDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return implementIdea(state, sessionManager, notificationManager, config, {
        ideaId: params.ideaId as string,
        skipPlan: params.skipPlan as boolean | undefined,
      });
    },
  });

  // idea_modify
  api.registerTool({
    name: ideaModifyDefinition.name,
    description: ideaModifyDefinition.description,
    parameters: ideaModifyDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return modifyIdea(state, sessionManager, notificationManager, {
        ideaId: params.ideaId as string,
        modificationRequest: params.modificationRequest as string,
        target: params.target as 'issue' | 'plan' | 'implementation',
      });
    },
  });

  // idea_delete
  api.registerTool({
    name: ideaDeleteDefinition.name,
    description: ideaDeleteDefinition.description,
    parameters: ideaDeleteDefinition.parameters,
    async execute(_id: string, params: Record<string, unknown>) {
      return deleteIdea(state, notificationManager, {
        ideaId: params.ideaId as string,
        closeIssue: params.closeIssue as boolean | undefined,
        closePR: params.closePR as boolean | undefined,
      });
    },
  });
}
