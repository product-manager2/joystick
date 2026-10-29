import './env.js';
import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, rename, chmod, unlink } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { selectedEnvPath } from './env.js';

if (!process.env.JOYSTICK_ENV_FILE || basename(selectedEnvPath) !== '.env.production') throw new Error('Set JOYSTICK_ENV_FILE to the absolute path of the private .env.production file');
const key=process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error('Set ANTHROPIC_API_KEY in the selected private environment file first');
const workspaceId=process.env.ANTHROPIC_WORKSPACE_ID;
const model=process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const client=new Anthropic({apiKey:key,maxRetries:0});
async function setEnv(name:string,value:string) {
  if (!/^[A-Z_]+$/.test(name) || /[\r\n]/.test(value)) throw new Error('Invalid environment field');
  const source=await readFile(selectedEnvPath,'utf8');
  const lines=source.split(/\r?\n/);
  const index=lines.findIndex(line=>line.startsWith(`${name}=`));
  if (index>=0) lines[index]=`${name}=${value}`;
  else lines.push(`${name}=${value}`);
  const temporary=join(dirname(selectedEnvPath),`.env.production.tmp-${randomUUID()}`);
  try {
    await writeFile(temporary,lines.join('\n'),{mode:0o600});
    await rename(temporary,selectedEnvPath);
  } finally { await unlink(temporary).catch(()=>{}); }
  await chmod(selectedEnvPath,0o600);
  process.env[name]=value;
}
function definitivelyRejected(error:unknown) {
  return error instanceof Anthropic.APIError && error.status===400 && error.type==='invalid_request_error';
}
function safeApiDetail(error:unknown) {
  return error instanceof Anthropic.APIError ? `status=${error.status ?? 'unknown'} type=${error.type ?? 'unknown'} requestID=${error.requestID ?? 'none'}` : 'transport error';
}
async function main() {
  if (process.env.ANTHROPIC_SETUP_ENV_STATE === 'creating' || process.env.ANTHROPIC_SETUP_AGENT_STATE === 'creating') throw new Error('Earlier resource creation has an unknown outcome. Reconcile IDs in Anthropic Console before rerunning.');
  let environmentId=process.env.ANTHROPIC_ENVIRONMENT_ID;
  if (!environmentId) {
    await setEnv('ANTHROPIC_SETUP_ENV_STATE','creating');
    try {
      const environment=await client.beta.environments.create({name:'Joystick private agent',config:{type:'cloud',networking:{type:'limited',allowed_hosts:[],allow_package_managers:false}},workspace_id:workspaceId},{maxRetries:0});
      environmentId=environment.id;
      await setEnv('ANTHROPIC_ENVIRONMENT_ID',environmentId);
      await setEnv('ANTHROPIC_SETUP_ENV_STATE','ready');
      console.log(`Created managed environment ${environmentId}`);
    } catch (error) {
      if (definitivelyRejected(error)) { await setEnv('ANTHROPIC_SETUP_ENV_STATE','rejected'); throw new Error(`Anthropic rejected environment creation (${safeApiDetail(error)}). Check workspace scope and configuration, then rerun.`); }
      throw new Error(`Environment creation outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
    }
  }
  let agentId=process.env.ANTHROPIC_AGENT_ID;
  if (!agentId) {
    await setEnv('ANTHROPIC_SETUP_AGENT_STATE','creating');
    try {
      const agent=await client.beta.agents.create({name:'Joystick private agent',model,system:'You are the account owner’s Joystick agent. Help them think through missions, plans, and quests. State uncertainty clearly. Do not claim to have completed work, accessed files, made payments, or taken actions unless this session has actually done so. This pilot has no Joystick business tools, so offer guidance and draft useful text.',tools:[],workspace_id:workspaceId},{maxRetries:0});
      agentId=agent.id;
      await setEnv('ANTHROPIC_AGENT_ID',agentId);
      await setEnv('ANTHROPIC_SETUP_AGENT_STATE','ready');
      console.log(`Created managed agent ${agentId}`);
    } catch (error) {
      if (definitivelyRejected(error)) { await setEnv('ANTHROPIC_SETUP_AGENT_STATE','rejected'); throw new Error(`Anthropic rejected agent creation (${safeApiDetail(error)}). Check workspace scope and configuration, then rerun.`); }
      throw new Error(`Agent creation outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
    }
  }
  console.log('Managed agent configuration is ready. No session was started.');
}
await main();
