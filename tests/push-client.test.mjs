import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function worker(){
  const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  const handlers=new Map(),shown=[],opened=[],windows=[];
  const self={
    location:{origin:'https://joystick.example.test'},
    addEventListener(name,handler){handlers.set(name,handler);},
    registration:{showNotification:async(title,options)=>{shown.push({title,options});}},
    clients:{matchAll:async()=>windows,openWindow:async url=>{opened.push(url);}},
  };
  vm.runInNewContext(source,{self,URL,location:{origin:self.location.origin}});
  return {handlers,shown,opened,windows};
}

test('every push displays a generic alert and a valid room opens on the same origin',async()=>{
  const fixture=await worker();
  const roomId='11111111-1111-4111-8111-111111111111';
  let pending;
  fixture.handlers.get('push')({data:{json:()=>({roomId,messageId:'22222222-2222-4222-8222-222222222222',text:'Secret content'})},waitUntil(promise){pending=promise;}});
  await pending;
  assert.equal(fixture.shown.length,1);
  assert.equal(fixture.shown[0].title,'New Joystick message');
  assert.ok(!JSON.stringify(fixture.shown[0]).includes('Secret content'));
  let navigation;
  fixture.handlers.get('notificationclick')({notification:{data:fixture.shown[0].options.data,close(){}},waitUntil(promise){navigation=promise;}});
  await navigation;
  assert.deepEqual(fixture.opened,[`https://joystick.example.test/?room=${roomId}`]);
});

test('malformed pushes still show an alert; forged notification targets cannot navigate away',async()=>{
  const fixture=await worker();
  let pending;
  fixture.handlers.get('push')({data:{json:()=>{throw new Error('bad JSON');}},waitUntil(promise){pending=promise;}});
  await pending;
  assert.equal(fixture.shown.length,1);
  assert.equal(fixture.shown[0].options.data.target,'/');
  const event={notification:{data:{target:'https://evil.example.test/phish'},close(){}},waitUntil(){throw new Error('Untrusted URL was opened');}};
  fixture.handlers.get('notificationclick')(event);
  assert.deepEqual(fixture.opened,[]);
});

test('notification tap reuses and focuses an existing same-origin app window',async()=>{
  const fixture=await worker(),navigated=[];
  fixture.windows.push({url:'https://joystick.example.test/',async navigate(url){navigated.push(url);},async focus(){navigated.push('focused');}});
  let pending;
  fixture.handlers.get('notificationclick')({notification:{data:{target:'/?room=11111111-1111-4111-8111-111111111111'},close(){}},waitUntil(promise){pending=promise;}});
  await pending;
  assert.deepEqual(navigated,['https://joystick.example.test/?room=11111111-1111-4111-8111-111111111111','focused']);
  assert.deepEqual(fixture.opened,[]);
});
