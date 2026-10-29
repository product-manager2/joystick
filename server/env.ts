import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const requested = process.env.JOYSTICK_ENV_FILE;
if (requested && !isAbsolute(requested)) throw new Error('JOYSTICK_ENV_FILE must be an absolute path');
export const selectedEnvPath = requested ?? resolve(process.cwd(),process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local');
if (existsSync(selectedEnvPath)) loadEnvFile(selectedEnvPath);
else if (requested) throw new Error('Selected environment file does not exist');
else if (process.env.NODE_ENV === 'production' && !process.env.DIRECT_DATABASE_URL) throw new Error('Selected environment file does not exist and DIRECT_DATABASE_URL is not injected');
