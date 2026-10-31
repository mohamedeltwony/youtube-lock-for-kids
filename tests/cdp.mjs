// A small DevTools pipe client for driving real Chrome in tests.
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export class Browser {
  constructor() { this.id = 0; this.pending = new Map(); this.buffer = ''; }
  start(profile, extraArgs = []) {
    this.proc = spawn(CHROME, [
      '--headless=new', ...extraArgs, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    this.proc.stdio[4].on('data', chunk => {
      this.buffer += chunk.toString();
      let at;
      while ((at = this.buffer.indexOf('\0')) >= 0) {
        const msg = JSON.parse(this.buffer.slice(0, at));
        this.buffer = this.buffer.slice(at + 1);
        const wait = this.pending.get(msg.id);
        if (wait) {
          this.pending.delete(msg.id);
          msg.error ? wait.reject(new Error(JSON.stringify(msg.error))) : wait.resolve(msg.result);
        }
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.proc.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`));
      }, 30000);
    });
  }
  async stop() {
    await this.send('Browser.close').catch(() => {});
    await new Promise(r => { this.proc.once('exit', r); setTimeout(r, 4000); });
    this.proc.kill('SIGKILL');
  }
}

