'use strict';

const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=__dirname;
const port=Number(process.env.CHROME_DEBUG_PORT || 9222);
const key=crypto.createHash('sha256').update(root.toLowerCase()+':'+port).digest('hex').slice(0,20);
const pipe=process.platform==='win32' ? '\\\\.\\pipe\\canvas-cdp-'+key : path.join(os.tmpdir(),'canvas-cdp-'+key+'.sock');
const scripts=new Set(['demo.js','tests/browser-cases.js','tests/additional-cases.js','tests/third-round-cases.js','tests/fourth-round-cases.js','tests/unicode-color-case.js','tests/twentyfirst-round-probe.js','tests/twentysecond-round-probe.js','tests/twentysecond-round-probe-b.js','tests/twentysecond-round-probe-c.js','tests/twentysecond-round-probe-d.js','tests/twentythird-round-probe.js']);

// One connection per service lifetime. Failed or disconnected sessions require
// an explicit stop/start; ordinary tests never reconnect and repeat consent.
function createSession({connect,capture,debuggingPort=port}) {
    let state='idle',connection,error,connecting;
    let queue=Promise.resolve();
    let stopping=false;
    const controller=new AbortController();
    const connectionId=crypto.randomUUID();
    const status=()=>({state,connectionId,debuggingPort,pid:process.pid,...(error?{error}: {})});
    const ensure=()=>{
        if(stopping)return Promise.reject(new Error('CDP session is stopping'));
        if(state==='connected')return Promise.resolve(connection);
        if(state==='connecting')return connecting;
        if(state!=='idle')return Promise.reject(new Error(error || 'CDP session disconnected; explicitly stop/start to reconnect'));
        state='connecting';
        connecting=Promise.resolve().then(()=>connect(controller.signal)).then(c=>{
            connection=c;c.connectionId=connectionId;
            c.socket.addEventListener('close',()=>{state='disconnected';error='Chrome disconnected. No automatic reconnection; explicitly stop/start when ready.';});
            state='connected';return c;
        },e=>{state='failed';error=e.message;throw e;});
        return connecting;
    };
    return {
        status,
        async dispatch(action,options={}) {
            if(action==='status')return status();
            if(action==='start'){await ensure();return status();}
            if(action==='capture'){
                if(!scripts.has(options.script || 'demo.js'))throw new Error('Only project Canvas verification scripts are allowed');
                if(options.port!==undefined && options.port!==debuggingPort)throw new Error('CDP port differs from the persistent session');
                if(stopping)throw new Error('CDP session is stopping');
                const task=queue.then(async()=>capture(await ensure(),{...options,port:debuggingPort}));
                queue=task.catch(()=>{});
                return task;
            }
            if(action==='stop'){
                stopping=true;
                if(state==='connecting')controller.abort();
                await queue;
                if(connecting)await connecting.catch(()=>{});
                connection?.close();state='stopped';return status();
            }
            throw new Error('Unknown CDP session command');
        }
    };
}

function serve(session,endpoint=pipe) {
    const server=net.createServer(socket=>{
        socket.setEncoding('utf8');
        let input='';
        socket.on('error',()=>{});
        socket.on('data',async chunk=>{
            input+=chunk;
            if(input.length>16384){socket.destroy();return;}
            if(!input.includes('\n'))return;
            socket.removeAllListeners('data');
            try {
                const {action,options}=JSON.parse(input.trim());
                const result=await session.dispatch(action,options);
                socket.end(JSON.stringify({result})+'\n');
                if(action==='stop')server.close();
            } catch(e){socket.end(JSON.stringify({error:e.message})+'\n');}
        });
    });
    return server.listen(endpoint);
}

function exchange(action,options,endpoint=pipe) {
    return new Promise((resolve,reject)=>{
        const socket=net.createConnection(endpoint);
        socket.setEncoding('utf8');
        const timer=setTimeout(()=>socket.destroy(new Error('Persistent CDP session request timed out')),180000);
        let data='',ended=false;
        socket.on('connect',()=>socket.write(JSON.stringify({action,options})+'\n'));
        socket.on('data',chunk=>{data+=chunk;});
        socket.on('end',()=>{
            ended=true;
            clearTimeout(timer);
            try{const reply=JSON.parse(data);if(reply.error)reject(new Error(reply.error));else resolve(reply.result);}catch(e){reject(e);}
        });
        socket.on('error',e=>{clearTimeout(timer);reject(e);});
        socket.on('close',()=>{clearTimeout(timer);if(!ended)reject(new Error('Persistent CDP service closed before replying'));});
    });
}

async function request(action,options={}, {start=false}={}) {
    try{return await exchange(action,options);}
    catch(e){
        if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;
        if(!start){if(action==='status'||action==='stop')return {state:'not-running',debuggingPort:port};throw e;}
    }
    fs.mkdirSync(path.join(root,'out'),{recursive:true});
    const log=fs.openSync(path.join(root,'out/cdp-session.log'),'a');
    try {
        const child=spawn(process.execPath,[__filename,'--serve'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log]});
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
        child.unref();
    } finally {fs.closeSync(log);}
    // Concurrent starts race only to bind the pipe; only its owner can connect
    // to Chrome. Losing processes exit without opening a browser connection.
    for(let i=0;i<50;i++){
        try{return await exchange(action,options);}
        catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;}
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Cannot start persistent CDP service; inspect out/cdp-session.log');
}

module.exports={createSession,serve,exchange,request};
if(require.main===module && process.argv[2]==='--serve'){
    const {CDP,browserSocket,captureWithConnection}=require('./capture-cdp.cjs');
    const session=createSession({
        connect:async signal=>{const c=new CDP(await browserSocket(port),{signal});await c.ready;return c;},
        capture:captureWithConnection
    });
    const server=serve(session);
    server.on('error',e=>{if(e.code!=='EADDRINUSE')console.error(e.message);process.exitCode=e.code==='EADDRINUSE'?0:1;});
}
