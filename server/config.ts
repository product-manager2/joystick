export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  flyMode: boolean;
  httpProxyMode?: 'vercel';
  webOrigin: string;
  rpId: string;
  cookieSecure: boolean;
  anthropicApiKey?: string;
  aiGatewayApiKey?: string;
  jevModel?: string;
  submissionReviewModel?: string;
  anthropicWorkspaceId?: string;
  anthropicAgentId?: string;
  anthropicWorkflowAgentId?: string;
  anthropicEnvironmentId?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}
export function readConfig(env = process.env): Config {
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:5173';
  const rpId = env.RP_ID ?? 'localhost';
  if (env.HTTP_PROXY_MODE && env.HTTP_PROXY_MODE !== 'vercel') throw new Error('HTTP_PROXY_MODE must be vercel when set');
  const cookieSecure = env.COOKIE_SECURE === 'true' || (env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'false');
  const databaseUrl = env.NODE_ENV === 'production' ? env.DIRECT_DATABASE_URL : (env.DIRECT_DATABASE_URL || env.DATABASE_URL);
  if (!databaseUrl) throw new Error(env.NODE_ENV === 'production' ? 'DIRECT_DATABASE_URL is required in production' : 'DATABASE_URL is required');
  if (env.NODE_ENV === 'production' && (!cookieSecure || !webOrigin.startsWith('https://'))) throw new Error('Production requires secure cookies and HTTPS WEB_ORIGIN');
  if (new URL(webOrigin).hostname !== rpId && !new URL(webOrigin).hostname.endsWith(`.${rpId}`)) throw new Error('RP_ID must match WEB_ORIGIN hostname');
  return { databaseUrl, port: Number(env.PORT ?? 3001), host: env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'), flyMode: !!env.FLY_APP_NAME, httpProxyMode: env.HTTP_PROXY_MODE === 'vercel' ? 'vercel' : undefined, webOrigin, rpId, cookieSecure, aiGatewayApiKey: env.AI_GATEWAY_API_KEY || undefined, jevModel: env.JEV_MODEL || 'typesafe-ai/jev', submissionReviewModel: env.SUBMISSION_REVIEW_MODEL || 'claude-haiku-5-5', anthropicWorkspaceId: env.ANTHROPIC_WORKSPACE_ID, anthropicApiKey: env.ANTHROPIC_API_KEY, anthropicAgentId: env.ANTHROPIC_AGENT_ID, anthropicWorkflowAgentId: env.ANTHROPIC_WORKFLOW_AGENT_ID, anthropicEnvironmentId: env.ANTHROPIC_ENVIRONMENT_ID, vapidPublicKey: env.VAPID_PUBLIC_KEY, vapidPrivateKey: env.VAPID_PRIVATE_KEY, vapidSubject: env.VAPID_SUBJECT || (webOrigin.startsWith('https://') ? webOrigin : undefined) };
}
export function agentAvailable(config: Config): boolean { return !!(config.anthropicApiKey && config.anthropicAgentId && config.anthropicEnvironmentId); }
export function pushAvailable(config: Config): boolean { return !!(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject); }
