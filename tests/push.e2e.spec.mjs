import { createHash, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createAccountFromHero, enterSignup, finishSetup } from './helpers/onboarding.mjs';

async function passkey(context,page){
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
}

async function mockPush(page){
  await page.addInitScript(()=>{
    const endpoint='https://web.push.apple.com/test-device';
    const subscription=()=>({endpoint,toJSON:()=>({endpoint,keys:{p256dh:'test',auth:'test'}}),unsubscribe:async()=>{localStorage.removeItem('mockPushSubscription');return true;}});
    const registration={pushManager:{getSubscription:async()=>localStorage.getItem('mockPushSubscription')?subscription():null,subscribe:async()=>{localStorage.setItem('mockPushSubscription','yes');return subscription();}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>registration,ready:Promise.resolve(registration)}});
    Object.defineProperty(window,'PushManager',{configurable:true,value:localStorage.getItem('mockPushUnsupported')?undefined:class PushManager {}});
    Object.defineProperty(window,'Notification',{configurable:true,value:class Notification {
      static get permission(){return localStorage.getItem('mockPushPermission')||'default';}
      static requestPermission(){window.__pushGesture=!!navigator.userActivation?.isActive;if(window.__holdPushPermission)return new Promise(resolve=>{window.__releasePushPermission=()=>{localStorage.setItem('mockPushPermission','granted');resolve('granted');};});localStorage.setItem('mockPushPermission','granted');return Promise.resolve('granted');}
    }});
  });
}

async function seedOwnAgentMessage(page){
  return page.evaluate(async()=>{
    const rooms=await (await fetch('/api/v1/rooms',{credentials:'include'})).json();
    const roomId=rooms.rooms.find(room=>room.kind==='agent').id;
    const ticket=await (await fetch('/api/v1/ws-ticket',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'})).json();
    const address=new URL('/api/v1/ws',location.href);address.protocol=address.protocol==='https:'?'wss:':'ws:';
    const clientId=crypto.randomUUID(),socket=new WebSocket(address);
    await new Promise((resolve,reject)=>{
      socket.onerror=()=>reject(new Error('Chat socket failed'));
      socket.onopen=()=>socket.send(JSON.stringify({type:'authenticate',ticket:ticket.ticket}));
      socket.onmessage=event=>{const frame=JSON.parse(event.data);if(frame.type==='ready')socket.send(JSON.stringify({type:'message.send',roomId,clientId,text:'Push deep-link fixture'}));if(frame.type==='message.saved'&&frame.message?.clientId===clientId){socket.close();resolve();}};
    });
    return roomId;
  });
}

test('notification choice resets across accounts and requires a fresh user tap to bind the same device',async({browser})=>{
  test.setTimeout(140_000);
  const context=await browser.newContext(),page=await context.newPage();
  await passkey(context,page);await mockPush(page);
  const subscriptions=[];
  let boundCookie='';
  const endpointHash=createHash('sha256').update('https://web.push.apple.com/test-device').digest('hex');
  await page.route('**/api/v1/push/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,cookie=(await request.allHeaders()).cookie||'';
    if(path.endsWith('/status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,publicKey:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),endpointHashes:cookie===boundCookie&&boundCookie?[endpointHash]:[]})});
    if(path.endsWith('/subscribe')){boundCookie=cookie;subscriptions.push({cookie,body:request.postDataJSON()});return route.fulfill({status:200,contentType:'application/json',body:'{"subscribed":true}'});}
    if(path.endsWith('/unsubscribe')){if(cookie===boundCookie)boundCookie='';return route.fulfill({status:200,contentType:'application/json',body:'{"subscribed":false}'});}
    return route.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
  });
  try{
    await createAccountFromHero(page,'Push A',`push-a-${randomUUID()}@example.test`);
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn on'})).toBeVisible();
    await page.locator('.push-controls').getByRole('button',{name:'Turn on'}).click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn off'})).toBeVisible();
    expect(await page.evaluate(()=>window.__pushGesture)).toBe(true);
    expect(subscriptions).toHaveLength(1);

    await page.getByRole('button',{name:'Sign out'}).click();
    await enterSignup(page,'Push B',`push-b-${randomUUID()}@example.test`);
    await finishSetup(page);
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn on'})).toBeVisible();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn off'})).toHaveCount(0);
    await page.locator('.push-controls').getByRole('button',{name:'Turn on'}).click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn off'})).toBeVisible();
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1].cookie).not.toBe(subscriptions[0].cookie);
    expect(subscriptions[1].body.endpoint).toBe(subscriptions[0].body.endpoint);

    await page.evaluate(()=>localStorage.setItem('mockPushPermission','denied'));
    await page.reload();
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls')).toContainText('blocked in your device settings');
    await page.locator('.push-controls').getByRole('button',{name:'Turn off'}).click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn off'})).toHaveCount(0);

    await page.evaluate(()=>localStorage.setItem('mockPushPermission','default'));
    await page.reload();
    await page.locator('#nav [data-x="profile"]').click();
    await page.evaluate(()=>{window.__holdPushPermission=true;});
    await page.locator('.push-controls').getByRole('button',{name:'Turn on'}).click();
    await expect.poll(()=>page.evaluate(()=>typeof window.__releasePushPermission)).toBe('function');
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.getByRole('button',{name:'Start playing'}).click();
    await page.getByLabel('Your name').fill('Push C');
    await page.getByLabel('Email').fill(`push-c-${randomUUID()}@example.test`);
    await page.getByRole('button',{name:'Create account with passkey'}).click();
    await finishSetup(page);
    await page.evaluate(()=>{window.__holdPushPermission=false;window.__releasePushPermission();});
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn on'})).toBeVisible();
    expect(subscriptions).toHaveLength(2);

    const ownRoom=await seedOwnAgentMessage(page);
    await page.goto(`/?room=${ownRoom}`);
    await expect(page.locator('.chat-head')).toBeVisible();
    await expect(page.getByText('Push deep-link fixture',{exact:true})).toBeVisible();
    await expect(page).not.toHaveURL(/room=/);
    await page.goto(`/?room=${randomUUID()}`);
    await expect(page.locator('.chat-head')).toHaveCount(0);
    await expect(page).not.toHaveURL(/room=/);

    await page.evaluate(()=>localStorage.setItem('mockPushUnsupported','yes'));
    await page.reload();
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls')).toContainText('does not support push notifications');
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn on'})).toHaveCount(0);
  }finally{await context.close();}
});

test('iPhone browser explains Home Screen installation before offering push',async({browser})=>{
  test.setTimeout(70_000);
  const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();
  await passkey(context,page);
  try{
    await createAccountFromHero(page,'Push install',`push-install-${randomUUID()}@example.test`);
    await page.locator('#nav [data-x="profile"]').click();
    await expect(page.locator('.push-controls')).toContainText('Add Joystick to your Home Screen');
    await expect(page.locator('.push-controls').getByRole('button',{name:'Turn on'})).toHaveCount(0);
  }finally{await context.close();}
});
