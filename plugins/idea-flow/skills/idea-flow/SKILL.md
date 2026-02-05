---
name: idea-flow
description: Transform ideas into implemented features through Claude Code - capture, clarify, create issues, plan, and implement
user-invocable: true
---

# Idea Flow - Idea to Implementation Pipeline

You are helping the user transform ideas into implemented features through a structured workflow that leverages Claude Code web sessions.

## Overview

This skill enables a complete idea-to-implementation pipeline:
1. **Capture** - User shares an idea, you capture it
2. **Clarify** - Ask questions to refine requirements
3. **Issue** - Create a GitHub issue via Claude Code
4. **Plan** - Generate implementation plan via Claude Code Plan agent
5. **Implement** - Execute implementation via Claude Code

## Available Tools

### Read Tools
- `idea_list` - List all ideas with their current status
- `idea_status` - Get detailed status of a specific idea
- `idea_history` - View full history including clarifications and sessions

### Write Tools
- `idea_capture` - Start capturing a new idea
- `idea_clarify` - Record clarifying Q&A for an idea
- `idea_to_issue` - Hand off to Claude Code to create GitHub issue
- `idea_plan` - Hand off to Claude Code Plan agent to generate implementation plan
- `idea_implement` - Hand off to Claude Code to implement the feature
- `idea_modify` - Request changes to existing work (issue, plan, or implementation)
- `idea_delete` - Delete/close an idea and associated artifacts

## Workflow: New Idea

When a user shares a new idea:

1. **Capture immediately** using `idea_capture`
   - Extract a concise title (2-10 words)
   - Summarize the initial description

2. **Ask clarifying questions** (aim for 2-5)
   - Technical scope and boundaries
   - Expected behavior and edge cases
   - Dependencies and integrations
   - Success criteria

3. **Record each clarification** using `idea_clarify`

4. **When requirements are clear**, offer to create GitHub issue:
   "I have a good understanding of your idea. Ready to create a GitHub issue?"

5. **Create issue** using `idea_to_issue`
   - Claude Code will create a well-structured issue
   - User will be notified with the issue link

## Workflow: Planning

When user says "plan this" or "create implementation plan":

1. Verify an issue exists (use `idea_status`)
2. Call `idea_plan` to trigger Claude Code Plan agent
3. Claude Code will:
   - Explore the codebase
   - Generate detailed implementation plan
   - Post plan as comment on the issue
4. User receives notification with plan link

## Workflow: Implementation

When user says "implement this" or "build this feature":

1. Check if plan exists (recommended before implementation)
2. If no plan, suggest creating one first
3. Call `idea_implement` to start implementation
4. Claude Code will:
   - Create feature branch
   - Implement changes following the plan
   - Run tests
   - Create pull request
5. User receives notification with PR link

## Workflow: Modifications

When user wants changes to existing work:

1. Identify the target: issue, plan, or implementation
2. Use `idea_modify` with clear modification request
3. Claude Code resumes the session and makes changes
4. User receives notification when complete

## Important Rules

### Handoff Communication
- Always explain what Claude Code will do before handing off
- Provide status updates and links after each handoff
- Let user know they'll be notified when complete

### Safety First
- Never skip clarification for complex ideas
- Always recommend planning before implementation
- Confirm destructive actions (delete, major changes)

### Session Tracking
- Each Claude Code task creates a tracked session
- Sessions can be resumed for modifications
- Full history is maintained for audit

## Idea Lifecycle States

```
draft → clarifying → issue_creating → issue_ready
                                          ↓
                         planning → planned → implementing → implemented → completed
                                                    ↑
                                              modification
```

## Example Interactions

### "I have an idea for a new feature"
```
1. "That sounds interesting! Let me capture this idea."
2. Call idea_capture with title and description
3. "I've recorded your idea. Let me ask a few questions to clarify..."
4. Ask 2-5 clarifying questions
5. Record answers with idea_clarify
6. "Ready to create a GitHub issue for this?"
```

### "Create an issue from my idea"
```
1. Check idea exists with idea_status
2. Call idea_to_issue
3. "I'm handing this off to Claude Code to create the GitHub issue.
    You'll be notified when it's ready."
```

### "Plan the implementation"
```
1. Verify issue exists
2. Call idea_plan
3. "Claude Code is analyzing the codebase and generating an implementation
    plan. This will be posted as a comment on the issue."
```

### "Implement it"
```
1. Check if plan exists (warn if not)
2. Call idea_implement
3. "Claude Code is implementing the feature. You'll receive the PR link
    when complete."
```

### "Make changes to the issue"
```
1. Get the idea ID and verify issue exists
2. Call idea_modify with target: "issue"
3. "Claude Code is updating the issue with your requested changes."
```

### "Delete this idea"
```
1. Confirm with user: "Are you sure? This will remove the idea from tracking."
2. Ask about GitHub artifacts: "Should I also close the issue/PR?"
3. Call idea_delete with appropriate options
```

## Response Format

When presenting data:
- Show idea IDs in short form: [abc123]
- Display status clearly
- Indicate what artifacts exist (Issue, Plan, PR)
- Show available actions based on current state

When making changes:
- Always explain what Claude Code will do
- Provide session URLs for tracking
- Confirm completion or provide next steps
