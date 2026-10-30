import { api, live } from './game-client.js';

export const pushState={supported:false,installed:false,enabled:false,subscribed:false,permission:'default',busy:false,error:''};
const listeners=new Set();
const changed=()=>listeners.forEach(listener=>listener());
export const onPushChange=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
let generation=0;
export function resetPush(){
  generation++;
  Object.assign(pushState,{supported:false,installed:false,enabled:false,subscribed:false,permission:'default',busy:false,error:''});
  changed();
}
const supported=()=>window.isSecureContext && !!navigator.serviceWorker && !!window.PushManager && !!window.Notification;
const installed=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
const keyBytes=value=>{const base64=value.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='));return Uint8Array.from(raw,character=>character.charCodeAt(0));};

export async function refreshPush(){
  const currentGeneration=++generation;
  const account=live.user;
  Object.assign(pushState,{supported:supported(),installed:installed(),enabled:false,subscribed:false,permission:typeof Notification!=='undefined'?Notification.permission:'default',busy:false,error:''});
  changed();
  if(!account || !pushState.supported){Object.assign(pushState,{enabled:false,subscribed:false});changed();return;}
  try{
    const status=await api('/push/status');
    if(live.user!==account || generation!==currentGeneration)return;
    pushState.enabled=!!status.enabled;
    await navigator.serviceWorker.register('/sw.js');
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(live.user!==account || generation!==currentGeneration)return;
    const endpointHash=subscription?await hashEndpoint(subscription.endpoint):null;
    if(live.user!==account || generation!==currentGeneration)return;
    pushState.subscribed=!!endpointHash && status.endpointHashes?.includes(endpointHash);
  }catch(error){if(live.user===account && generation===currentGeneration)pushState.error=error.message;}
  if(generation===currentGeneration)changed();
}

async function hashEndpoint(endpoint){
  const bytes=new TextEncoder().encode(endpoint),digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function enablePush(){
  if(pushState.busy || !supported() || !live.user)return;
  const account=live.user;
  const currentGeneration=generation;
  const current=()=>live.user===account && generation===currentGeneration;
  // This call must happen directly inside the user's click handler on iOS.
  const permissionPromise=Notification.requestPermission();
  pushState.busy=true;pushState.error='';changed();
  try{
    const permission=await permissionPromise;
    if(!current())return;
    pushState.permission=permission;
    if(permission!=='granted')throw new Error('Notifications are blocked. Allow them in your device settings to turn them on.');
    const status=await api('/push/status');
    if(!current())return;
    if(!status.enabled || !status.publicKey)throw new Error('Notifications are not configured yet.');
    await navigator.serviceWorker.register('/sw.js');
    const registration=await navigator.serviceWorker.ready;
    if(!current())return;
    let subscription=await registration.pushManager.getSubscription();
    if(!current())return;
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(status.publicKey)});
    if(!current())return;
    await api('/push/subscribe',{method:'POST',body:JSON.stringify(subscription.toJSON())});
    if(!current())return;
    pushState.subscribed=true;
  }catch(error){if(current())pushState.error=error.message||'Could not turn on notifications.';}
  finally{if(current()){pushState.busy=false;changed();}}
}

export async function disablePush(){
  if(pushState.busy || !supported() || !live.user)return;
  const account=live.user;
  const currentGeneration=generation;
  const current=()=>live.user===account && generation===currentGeneration;
  pushState.busy=true;pushState.error='';changed();
  try{
    await navigator.serviceWorker.register('/sw.js');
    const registration=await navigator.serviceWorker.ready;
    if(!current())return;
    const subscription=await registration.pushManager.getSubscription();
    if(!current())return;
    if(subscription){
      await api('/push/unsubscribe',{method:'POST',body:JSON.stringify({endpoint:subscription.endpoint})});
      if(!current())return;
      await subscription.unsubscribe();
    }
    pushState.subscribed=false;
  }catch(error){if(current())pushState.error=error.message||'Could not turn off notifications.';}
  finally{if(current()){pushState.busy=false;changed();}}
}
