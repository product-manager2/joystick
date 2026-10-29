import './env.js';
import { readConfig } from './config.js';
import { createPool } from './db.js';
import { buildApp } from './app.js';

const config = readConfig();
const pool = createPool(config);
const {app,chat} = await buildApp(pool,config);
const listener = await pool.connect();
await listener.query('LISTEN joystick_messages');
await listener.query('LISTEN joystick_previews');
const listenerLost=()=>{app.log.error('PostgreSQL notification listener lost');process.exit(1);};
listener.on('error',listenerLost);
listener.on('end',listenerLost);
let notificationQueue=Promise.resolve();
listener.on('notification',notification => {
  notificationQueue=notificationQueue.catch(()=>{}).then(async()=>{
  try {
    const data = JSON.parse(notification.payload ?? '{}');
    if (notification.channel === 'joystick_messages' && typeof data.messageId === 'string') await chat.broadcastSavedById(data.messageId);
    if (notification.channel === 'joystick_previews' && typeof data.roomId === 'string' && typeof data.messageId === 'string' && typeof data.text === 'string') await chat.broadcastPreview(data.roomId,data.messageId,data.text);
  } catch (error) { app.log.error(error); }
  });
});
let stopping=false;
const shutdown = async () => { if(stopping) return; stopping=true; listener.off('error',listenerLost); listener.off('end',listenerLost); await app.close(); listener.release(); await pool.end(); };
process.on('SIGINT',()=>{void shutdown();});
process.on('SIGTERM',()=>{void shutdown();});
await app.listen({port:config.port,host:config.host});
