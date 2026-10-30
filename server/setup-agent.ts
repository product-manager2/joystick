import './env.js';
import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, rename, chmod, unlink } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { selectedEnvPath } from './env.js';
import { AGENT_RUN_SYSTEM, AGENT_RUN_TOOLS } from './agent-runs/tools.js';
import { BUILT_IN_TOOLS } from './agent-toolset.js';
import { APP_TOOLS } from './composio.js';
import { PRIVATE_AGENT_SYSTEM } from './private-agent-prompt.js';
import { PRIVATE_AGENT_TOOLS } from './private-agent-tools.js';

if (!process.env.JOYSTICK_ENV_FILE || basename(selectedEnvPath) !== '.env.production') throw new Error('Set JOYSTICK_ENV_FILE to the absolute path of the private .env.production file');
const key=process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error('Set ANTHROPIC_API_KEY in the selected private environment file first');
const workspaceId=process.env.ANTHROPIC_WORKSPACE_ID;
const model=process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const client=new Anthropic({apiKey:key,maxRetries:0});
const agentTools=[...AGENT_RUN_TOOLS,...APP_TOOLS,BUILT_IN_TOOLS];
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
  if (process.env.ANTHROPIC_SETUP_ENV_STATE === 'creating' || ['creating','updating'].includes(process.env.ANTHROPIC_SETUP_AGENT_STATE??'') || ['creating','updating'].includes(process.env.ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE??'')) throw new Error('Earlier resource change has an unknown outcome. Reconcile IDs in Anthropic Console before rerunning.');
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
      const agent=await client.beta.agents.create({name:'Joystick private agent',model,system:PRIVATE_AGENT_SYSTEM,tools:PRIVATE_AGENT_TOOLS,workspace_id:workspaceId},{maxRetries:0});
      agentId=agent.id;
      await setEnv('ANTHROPIC_AGENT_ID',agentId);
      await setEnv('ANTHROPIC_SETUP_AGENT_STATE','ready');
      console.log(`Created managed agent ${agentId}`);
    } catch (error) {
      if (definitivelyRejected(error)) { await setEnv('ANTHROPIC_SETUP_AGENT_STATE','rejected'); throw new Error(`Anthropic rejected agent creation (${safeApiDetail(error)}). Check workspace scope and configuration, then rerun.`); }
      throw new Error(`Agent creation outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
    }
  } else {
    const existing=await client.beta.agents.retrieve(agentId,{workspace_id:workspaceId});
    const privateConfigured=existing.system===PRIVATE_AGENT_SYSTEM&&PRIVATE_AGENT_TOOLS.every(t=>existing.tools.some(actual=>actual.type==='custom'&&actual.name===t.name&&actual.description===t.description&&JSON.stringify(actual.input_schema)===JSON.stringify(t.input_schema)));
    if(!privateConfigured){
      await setEnv('ANTHROPIC_SETUP_AGENT_STATE','updating');
      try{
        await client.beta.agents.update(agentId,{system:PRIVATE_AGENT_SYSTEM,tools:PRIVATE_AGENT_TOOLS,version:existing.version,workspace_id:workspaceId},{maxRetries:0});
        await setEnv('ANTHROPIC_SETUP_AGENT_STATE','ready');
        console.log(`Updated private agent ${agentId}`);
      }catch(error){
        if(definitivelyRejected(error)){await setEnv('ANTHROPIC_SETUP_AGENT_STATE','rejected');throw new Error(`Anthropic rejected private agent update (${safeApiDetail(error)}). Check configuration, then rerun.`);}
        throw new Error(`Private agent update outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
      }
    }
  }
  let workflowAgentId=process.env.ANTHROPIC_WORKFLOW_AGENT_ID;
  if(!workflowAgentId){
    await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','creating');
    try{
      const agent=await client.beta.agents.create({name:'Joystick mission work agent',model,system:AGENT_RUN_SYSTEM,tools:agentTools,workspace_id:workspaceId},{maxRetries:0});
      workflowAgentId=agent.id;
      await setEnv('ANTHROPIC_WORKFLOW_AGENT_ID',workflowAgentId);
      await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','ready');
      console.log(`Created workflow agent ${workflowAgentId}`);
    }catch(error){
      if(definitivelyRejected(error)){await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','rejected');throw new Error(`Anthropic rejected workflow agent creation (${safeApiDetail(error)}). Check tool configuration, then rerun.`);}
      throw new Error(`Workflow agent creation outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
    }
  } else {
    const existing=await client.beta.agents.retrieve(workflowAgentId,{workspace_id:workspaceId});
    const customTools=existing.tools.filter(t=>t.type==='custom');
    const configured=existing.system===AGENT_RUN_SYSTEM&&[...AGENT_RUN_TOOLS,...APP_TOOLS].every(t=>customTools.some(existingTool=>existingTool.name===t.name&&existingTool.description===t.description&&JSON.stringify(existingTool.input_schema)===JSON.stringify(t.input_schema)))&&existing.tools.some(t=>t.type==='agent_toolset_20260401');
    if(!configured){
      await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','updating');
      try{
        await client.beta.agents.update(workflowAgentId,{system:AGENT_RUN_SYSTEM,tools:agentTools,version:existing.version,workspace_id:workspaceId},{maxRetries:0});
        await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','ready');
        console.log(`Updated workflow agent ${workflowAgentId}`);
      }catch(error){
        if(definitivelyRejected(error)){await setEnv('ANTHROPIC_SETUP_WORKFLOW_AGENT_STATE','rejected');throw new Error(`Anthropic rejected workflow agent update (${safeApiDetail(error)}). Check tool configuration, then rerun.`);}
        throw new Error(`Workflow agent update outcome is unknown (${safeApiDetail(error)}). Check Anthropic Console before rerunning.`);
      }
    }
  }
  console.log('Managed agent configuration is ready. No session was started.');
}
await main();
