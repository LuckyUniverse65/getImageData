'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;

class CDP {
    constructor(url, {signal} = {}) {
        signal?.throwIfAborted();
        this.pending = new Map();
        this.sequence = 0;
        this.socket = new WebSocket(url);
        this.ready = new Promise((resolve, reject) => {
            const cancel=()=>{clearTimeout(timer);reject(new Error('CDP connection cancelled'));this.socket.close();};
            const timer = setTimeout(() => {
                reject(new Error('CDP connection timed out. Check the existing Chrome remote debugging permission.'));
                this.socket.close();
            }, 120000);
            signal?.addEventListener('abort',cancel,{once:true});
            this.socket.addEventListener('open', () => { clearTimeout(timer); signal?.removeEventListener('abort',cancel); resolve(); }, {once:true});
            this.socket.addEventListener('error', () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort',cancel);
                reject(new Error('Cannot connect to the existing Chrome CDP socket'));
            }, {once:true});
            this.socket.addEventListener('close', () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort',cancel);
                reject(new Error('Chrome closed the CDP connection'));
                for (const {reject, timer} of this.pending.values()) {
                    clearTimeout(timer); reject(new Error('CDP connection closed'));
                }
                this.pending.clear();
            });
        });
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            const pending = this.pending.get(message.id);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
            else pending.resolve(message.result);
        });
    }
    async send(method, params = {}, sessionId) {
        await this.ready;
        if (this.socket.readyState !== WebSocket.OPEN) throw new Error('CDP is not connected');
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id); reject(new Error(`${method} timed out`));
            }, 30000);
            this.pending.set(id, {resolve, reject, timer, method});
            this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
        });
    }
    close() { this.socket.close(); }
}

async function browserSocket(port) {
    // Chrome's opt-in remote debugging can expose only the WebSocket, with
    // /json/version returning 404. Use the existing profile's discovery file.
    const activeFile = process.env.CHROME_DEVTOOLS_ACTIVE_PORT_FILE ||
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data/DevToolsActivePort');
    if (fs.existsSync(activeFile)) {
        const [activePort, endpoint] = fs.readFileSync(activeFile, 'utf8').trim().split(/\r?\n/);
        if (Number(activePort) === port && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint)) {
            return `ws://127.0.0.1:${port}${endpoint}`;
        }
    }
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`CDP discovery returned HTTP ${response.status}; check the existing Chrome DevToolsActivePort file`);
    const version = await response.json();
    const url = new URL(version.webSocketDebuggerUrl);
    if (url.protocol !== 'ws:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) {
        throw new Error('Expected a local Chrome debugging socket');
    }
    return url.href;
}

async function captureWithConnection(cdp, {script = 'demo.js', outputName = 'cdp-demo', port = Number(process.env.CHROME_DEBUG_PORT || 9222)} = {}) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CDP port');
    if (!/^[a-zA-Z0-9_-]+$/.test(outputName)) throw new Error('Invalid capture output name');
    const scriptFile = path.resolve(root, script);
    const relative = path.relative(root, scriptFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Test script must be inside the project');
    const source = fs.readFileSync(scriptFile, 'utf8');
    const scriptSHA256 = crypto.createHash('sha256').update(source).digest('hex').toUpperCase();
    const runId = crypto.randomUUID().replaceAll('-', '');
    let targetId;
    try {
        const version = await cdp.send('Browser.getVersion');
        // A background target in the user's existing browser/profile. Never
        // activate it, inject input, use the clipboard, or touch existing tabs.
        ({targetId} = await cdp.send('Target.createTarget', {url:'about:blank', background:true}));
        const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten:true});
        const expression = `(async()=>{document.title='Canvas verification (CDP)';globalThis.__canvasResult=undefined;${source}\n;const value=await(globalThis.__canvasResult===undefined?Array.from(globalThis.data):globalThis.__canvasResult);return {runId:${JSON.stringify(runId)},value};})()`;
        const evaluation = await cdp.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}, sessionId);
        if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
        const returned = evaluation.result.value;
        if (!returned || returned.runId !== runId) throw new Error('CDP result does not match this run');
        const result = {runId, capturedAt:new Date().toISOString(), browserMode:'user-chrome-cdp',
            chromeVersion:version.product.replace(/^Chrome\//,''), browserRevision:version.revision,
            debuggingPort:port, connectionId:cdp.connectionId, targetId, backgroundTarget:true, script:relative.replaceAll('\\','/'),
            scriptSHA256, value:returned.value};
        fs.mkdirSync(path.join(root,'out'), {recursive:true});
        fs.writeFileSync(path.join(root,'out',outputName+'-browser.json'), JSON.stringify(result)+'\n');
        return result;
    } finally {
        // Close only the target created by this call, even when evaluation fails.
        if (targetId) await cdp.send('Target.closeTarget', {targetId});
    }
}

async function capture(options = {}) {
    return require('./cdp-session.cjs').request('capture', options, {start:true});
}

module.exports = {capture, captureWithConnection, CDP, browserSocket};
if (require.main === module) {
    const action=process.argv[2];
    const result=action?.startsWith('--session-')
        ? require('./cdp-session.cjs').request(action.slice('--session-'.length), {}, {start:action==='--session-start'})
        : capture({script:action || 'demo.js', outputName:process.argv[3] || 'cdp-demo'});
    result.then(({value,...metadata}) => console.log(JSON.stringify(metadata)))
        .catch(error => { console.error(error.message); process.exitCode=1; });
}
