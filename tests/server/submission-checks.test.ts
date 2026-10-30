import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateSubmission } from '../../server/game/submission-checks.js';
import type { Config } from '../../server/config.js';

const input={requirements:{title:'Publish a result',description:'Document the completed survey',expectedOutput:'Survey report',doneWhen:'Report includes ten responses',handIn:'Report',requestedChanges:''},artifact:{title:'Report',content:'Survey report with ten responses and methodology.'}};
const config={aiGatewayApiKey:'fake',anthropicApiKey:'fake',jevModel:'typesafe-ai/jev',submissionReviewModel:'claude-haiku-5-5'} as Config;
const answer=(scores:number[])=>new Response(JSON.stringify({model:'resolved/jev-version',answers:Object.fromEntries(['deliverable','task','output'].map((id,index)=>[id,{type:'noul',noul:scores[index]}]))}),{status:200,headers:{'content-type':'application/json'}});

test('Jev pass is provisional and skips the paid fallback',async()=>{
  const calls:string[]=[];
  const result=await evaluateSubmission(config,input,{fetch:async url=>{calls.push(String(url));return answer([.9,.8,.7]);}});
  assert.equal(result.status,'passed');assert.equal(result.source,'jev');assert.equal(calls.length,1);
});
test('a clear Jev failure returns specific guidance without a fallback',async()=>{
  const result=await evaluateSubmission(config,input,{fetch:async()=>answer([.9,.2,.9])});
  assert.equal(result.status,'needs_attention');assert.match(result.feedback,/addresses the task/);
});
test('ambiguous Jev evidence uses a bounded, forced-tool Haiku result',async()=>{
  let calls=0;
  const result=await evaluateSubmission(config,input,{fetch:async (_url,init)=>{calls++;if(calls===1)return answer([.5,.9,.9]);const body=JSON.parse(String(init?.body));assert.equal(body.tool_choice.name,'report_check');assert.equal(body.model,'claude-haiku-5-5');for(const field of ['temperature','top_p','top_k'])assert.equal(Object.hasOwn(body,field),false);return new Response(JSON.stringify({stop_reason:'tool_use',content:[{type:'text',text:'Unrelated preface'},{type:'tool_use',name:'report_check',input:{status:'needs_attention',feedback:'Include the survey evidence.'}}]}),{status:200});}});
  assert.equal(calls,2);assert.equal(result.source,'llm');assert.equal(result.status,'needs_attention');
});
test('oversized evidence is unavailable and never sent to a provider',async()=>{
  const result=await evaluateSubmission(config,{...input,artifact:{...input.artifact,content:'x'.repeat(33_000)}},{fetch:async()=>{throw new Error('provider called');}});
  assert.equal(result.status,'unavailable');assert.equal(result.source,null);
});
test('provider failures are not classified as a failed submission',async()=>{
  await assert.rejects(()=>evaluateSubmission(config,input,{fetch:async()=>new Response('error',{status:503})}),/submission_review_unavailable/);
});
for(const stopReason of ['refusal','max_tokens'])test(`${stopReason} cannot pass through a tool block`,async()=>{
  let calls=0;
  await assert.rejects(()=>evaluateSubmission(config,input,{fetch:async()=>{calls++;return calls===1?answer([.5,.9,.9]):new Response(JSON.stringify({stop_reason:stopReason,content:[{type:'tool_use',name:'report_check',input:{status:'passed',feedback:'Passed'}}]}),{status:200});}}),/submission_review_unavailable/);
});
