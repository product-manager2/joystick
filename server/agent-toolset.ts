import type { BetaManagedAgentsAgentToolset20260401Params } from '@anthropic-ai/sdk/resources/beta/agents/agents.js';

// Every Joystick agent gets the full built-in toolset: a sandboxed shell and files,
// web search, and web page reading. Each session runs in its own container.
export const BUILT_IN_TOOLS: BetaManagedAgentsAgentToolset20260401Params = {type:'agent_toolset_20260401',default_config:{enabled:true,permission_policy:{type:'always_allow'}}};
