import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPool } from '../../server/db.js';
import { history, saveUserMessage } from '../../server/chat.js';
import { processPrivateTool } from '../../server/private-agent-tools.js';
import { applyGameAction } from '../../server/game/service.js';
import type { GameActionInput } from '../../contracts/game.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw Error('TEST_DATABASE_URL is required');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};

test('a room agent offers the asker a one-tap action and changes nothing itself',async()=>{
  const pool=createPool(config);
  const users:string[]=[];let missionId:string|undefined;
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(name) VALUES($1) RETURNING id',[name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  const sent:Array<{result:any;isError:boolean}>=[];
  const provider={sendTool:async(_s:string,_e:string,result:unknown,isError:boolean)=>{sent.push({result,isError});}};
  try{
    const owner=await makeUser('Owner'),patron=await makeUser('Patron');
    let snap=await action(owner,'mission.create',undefined,{title:'Room action test',stages:[{name:'One',target:1}]});
    const mission=()=>snap.missions.find(m=>m.title==='Room action test')!;missionId=mission().id as string;
    const stage=(mission().stages as any[])[0].id;
    snap=await action(owner,'plan.create',stage,{name:'Find pipes',squad:'Pipe Finders'});
    const plan=(mission().strategies as any[])[0].id;
    snap=await action(owner,'quest.create',stage,{title:'Back Pipe Finders so they can start',role:'patron',planId:plan});
    const quest=(mission().quests as any[])[0].id;
    await action(patron,'mission.join',missionId);
    const room=(await pool.query(`INSERT INTO rooms(title,kind,scope_id) VALUES('Task','quest',$1) RETURNING id`,[quest])).rows[0].id;
    const asked=await saveUserMessage(pool,patron,room,randomUUID(),'Give them 10 dollars',true);
    const sessionId=`sess_${randomUUID()}`;
    const dispatch=(await pool.query("UPDATE agent_dispatches SET status='sent',provider_session_id=$2 WHERE message_id=$1 RETURNING id,room_id,provider_session_id,status",[asked.message.id,sessionId])).rows[0];
    await pool.query('UPDATE rooms SET provider_session_id=$2 WHERE id=$1',[room,sessionId]);
    const call={type:'agent.custom_tool_use',id:`evt_${randomUUID()}`,name:'offer_action',input:{action:'back_squad',credits:10}};
    await processPrivateTool(pool,config,provider,{...dispatch,user_id:patron},call);
    await processPrivateTool(pool,config,provider,{...dispatch,user_id:patron},call);
    assert.equal(sent.length,1);assert.equal(sent[0].isError,false);

    const offers=(await history(pool,patron,room,0)).messages.filter(m=>m.action);
    assert.equal(offers.length,1,'one button per call');
    assert.deepEqual({...offers[0].action,label:undefined},{kind:'back_squad',forUserId:patron,label:undefined,missionId,planId:plan,questId:quest,credits:10,handIn:true});
    assert.match(offers[0].action!.label,/Back Pipe Finders with 10 credits and hand in the receipt/);
    // Offering backs nothing: only the person's own tap does.
    assert.equal((await pool.query('SELECT count(*)::int n FROM game_plan_backers WHERE plan_id=$1',[plan])).rows[0].n,0);
  }finally{
    if(missionId){await pool.query(`DELETE FROM rooms WHERE scope_id IN (SELECT id FROM game_quests WHERE mission_id=$1)`,[missionId]);await pool.query('DELETE FROM game_missions WHERE id=$1',[missionId]);}
    for(const u of users)await pool.query('DELETE FROM users WHERE id=$1',[u]);
    await pool.end();
  }
});
