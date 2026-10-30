import { Composio } from '@composio/core';
import type { BetaManagedAgentsCustomToolParams } from '@anthropic-ai/sdk/resources/beta/agents/agents.js';

// Composio stores every connection under the Joystick user ID, so an agent only ever
// reaches the apps that the person who sent the current message connected.
let client: Composio | null | undefined;
export function composioAvailable(): boolean { return !!process.env.COMPOSIO_API_KEY; }
function composio(): Composio {
  if (client === undefined) client = composioAvailable() ? new Composio({apiKey:process.env.COMPOSIO_API_KEY!}) : null;
  if (!client) throw Error('Connected apps are not configured on this server');
  return client;
}
const sessions = new Map<string,{session:Promise<Awaited<ReturnType<Composio['create']>>>;until:number}>();
function session(userId: string) {
  const cached = sessions.get(userId);
  if (cached && cached.until > Date.now()) return cached.session;
  // Connections are made from Profile, never from a link an agent posts into a shared room.
  const created = composio().create(userId, {manageConnections:false});
  created.catch(() => sessions.delete(userId));
  sessions.set(userId, {session:created, until:Date.now()+10*60_000});
  return created;
}

const schema = (properties:Record<string,unknown>,required:string[]):BetaManagedAgentsCustomToolParams['input_schema'] => ({type:'object',properties,required,additionalProperties:false});
export const APP_TOOLS: BetaManagedAgentsCustomToolParams[] = [
  {type:'custom',name:'app_connections',description:'List the outside apps (Gmail, Google Drive, GitHub, Slack, Notion and others) that the person who sent the current message has connected, and which are not connected yet.',input_schema:schema({},[])},
  {type:'custom',name:'app_search',description:'Find actions in the sender\'s connected apps for a use case, such as "find the curriculum spreadsheet in Drive" or "open an issue on GitHub". Returns tool slugs with their input schemas and whether the app is connected.',input_schema:schema({query:{type:'string',minLength:1,maxLength:500},toolkits:{type:'array',items:{type:'string',maxLength:60},maxItems:10,description:'Optional app slugs to limit the search, such as gmail or googledrive.'}},['query'])},
  {type:'custom',name:'app_execute',description:'Run one action from app_search as the person who sent the current message, using their connected account. Reading is fine whenever it helps. Only send, post, create, edit, share or delete something when that person has clearly asked for it in this conversation. If the app is not connected, ask them to connect it from Profile, Connected apps.',input_schema:schema({tool:{type:'string',minLength:1,maxLength:120,description:'Exact tool slug from app_search, such as GOOGLEDRIVE_FIND_FILE.'},arguments:{type:'object',description:'Arguments that match the tool\'s input schema.'}},['tool'])},
];
const APP_TOOL_NAMES = new Set(APP_TOOLS.map(tool=>tool.name));
export const isAppTool = (name:string|undefined) => !!name && APP_TOOL_NAMES.has(name);

// Results go back to the model, so keep them bounded.
const bounded = (value:unknown) => { const text = JSON.stringify(value ?? null); return text.length > 60_000 ? {truncated:true,json:text.slice(0,60_000)} : value; };
export async function runAppTool(userId: string, name: string, input: Record<string,unknown>): Promise<unknown> {
  if (!composioAvailable()) return {ok:false,summary:'Connected apps are not set up on this server yet.'};
  const s = await session(userId);
  if (name === 'app_connections') {
    const {items} = await s.toolkits({isConnected:true});
    return {connected:items.map(t=>({slug:t.slug,name:t.name})),connectFrom:'Profile, Connected apps'};
  }
  if (name === 'app_search') {
    const query = typeof input.query === 'string' ? input.query.slice(0,500) : '';
    if (!query) throw Error('Describe what you want to do');
    const toolkits = Array.isArray(input.toolkits) ? input.toolkits.filter((t):t is string=>typeof t==='string').slice(0,10) : undefined;
    return bounded(await s.search({query,...(toolkits?.length?{toolkits}:{})}));
  }
  if (name === 'app_execute') {
    const tool = typeof input.tool === 'string' ? input.tool.slice(0,120) : '';
    if (!/^[A-Z0-9_]+$/.test(tool) || tool.startsWith('COMPOSIO_')) throw Error('Use an exact app tool slug from app_search');
    const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments) ? input.arguments as Record<string,unknown> : {};
    return bounded(await s.execute(tool,args));
  }
  throw Error('Unknown app tool');
}

// The apps Profile offers first; anything else the person connects is listed after them.
export const FEATURED_APPS = ['gmail','googledrive','googledocs','googlesheets','googlecalendar','github','slack','notion','linear','outlook'];
export async function listAppConnections(userId: string) {
  const s = await session(userId);
  const [featured,connected] = await Promise.all([s.toolkits({toolkits:FEATURED_APPS,limit:FEATURED_APPS.length}),s.toolkits({isConnected:true,limit:50})]);
  const seen = new Set<string>();
  return [...featured.items,...connected.items].filter(t=>!seen.has(t.slug)&&seen.add(t.slug)).map(t=>({slug:t.slug,name:t.name,logo:t.logo??null,connected:!!t.connection?.isActive}));
}
export async function startAppConnection(userId: string, toolkit: string, callbackUrl: string): Promise<string> {
  if (!/^[a-z0-9_-]{1,60}$/.test(toolkit)) throw Error('Unknown app');
  const request = await (await session(userId)).authorize(toolkit,{callbackUrl});
  if (!request.redirectUrl) throw Error('This app did not return a sign-in link');
  return request.redirectUrl;
}
