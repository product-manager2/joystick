import './env.js';
import { createPool } from './db.js';
import { readConfig, agentAvailable, pushAvailable } from './config.js';
import { anthropicClient, dispatchNext, reconcileSession } from './agent.js';
import { startWorker, monitorWorkerLock } from './worker-lock.js';
import { runProvider, recoverRunDispatches, startNextRun, reconcileActiveRuns, interruptCancelledRuns } from './agent-runs/worker.js';
import { recoverPrivateToolSends } from './private-agent-tools.js';
import { deliverNextPush, webPushSender } from './push.js';
import { processNextSubmissionCheck } from './game/submission-checks.js';

const config = readConfig();
const pool = createPool(config);
const lock=await startWorker(pool);
if (!lock) { console.error('Another Joystick agent worker holds the singleton lock'); await pool.end(); process.exit(1); }
const stopMonitoring=monitorWorkerLock(lock,()=>{console.error('Agent worker lost its database lock connection');process.exit(1);});
const heartbeat=setInterval(()=>{void lock.query('SELECT 1').catch(()=>{console.error('Agent worker database lock heartbeat failed');process.exit(1);});},10_000);
const client = agentAvailable(config) ? anthropicClient(config) : null;
const runs = agentAvailable(config) && config.anthropicWorkflowAgentId ? runProvider(config) : null;
const push = pushAvailable(config) ? webPushSender(config) : null;
if(runs)await recoverRunDispatches(pool);
await recoverPrivateToolSends(pool);
let running = true;
process.on('SIGINT',()=>{running=false;});
process.on('SIGTERM',()=>{running=false;});
// This pilot runs one worker process. An interrupted provider mutation has unknown outcome.
const sleep = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
async function dispatchLoop() {
  if(!client)return;
  while (running) {
    try { if (!await dispatchNext(pool,config,client)) await sleep(500); }
    catch (error) { console.error('Managed agent dispatch failed',error); await sleep(2000); }
  }
}
async function reconcileLoop() {
  if(!client)return;
  while (running) {
    try {
      const sessions = await pool.query(`SELECT id,provider_session_id FROM rooms WHERE provider_session_id IS NOT NULL`);
      for (const row of sessions.rows) {
        if (!running) break;
        try { await reconcileSession(pool,client,row.id,row.provider_session_id,config); }
        catch (error) { console.error('Could not reconcile managed session',row.id,error); }
      }
    } catch (error) { console.error('Could not list managed sessions',error); }
    await sleep(3000);
  }
}
async function pushLoop(){
  if(!push)return;
  while(running){
    try{if(!await deliverNextPush(pool,push))await sleep(500);}
    catch(error){console.error('Web Push delivery failed',error);await sleep(2000);}
  }
}
async function runLoop(){
  if(!runs)return;
  while(running){
    try{const started=await startNextRun(pool,config,runs);await reconcileActiveRuns(pool,runs);await interruptCancelledRuns(pool,runs);if(!started)await sleep(1000);}
    catch(error){console.error('Agent run processing failed',error);await sleep(2000);}
  }
}
async function submissionCheckLoop(){
  while(running){
    try{if(!await processNextSubmissionCheck(pool,config))await sleep(500);}
    catch(error){console.error('Submission check processing failed',error);await sleep(2000);}
  }
}
try { await Promise.all([dispatchLoop(),dispatchLoop(),dispatchLoop(),dispatchLoop(),reconcileLoop(),runLoop(),pushLoop(),submissionCheckLoop()]); }
finally { clearInterval(heartbeat); stopMonitoring(); lock.release(true); await pool.end(); }
