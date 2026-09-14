'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createSession,serve}=require('../cdp-session.cjs');

function fixture(capture=async(c)=>({connectionId:c.connectionId})) {
    let connections=0,closed=0;
    const socket=new EventTarget();
    const session=createSession({connect:async()=>{connections++;return {socket,close(){closed++;socket.dispatchEvent(new Event('close'));}};},capture});
    return {session,socket,get connections(){return connections;},get closed(){return closed;}};
}

test('concurrent start and successive captures share one connection',async()=>{
    const f=fixture();
    const starts=await Promise.all([f.session.dispatch('start'),f.session.dispatch('start')]);
    const first=await f.session.dispatch('capture',{script:'demo.js'});
    const second=await f.session.dispatch('capture',{script:'tests/fourth-round-cases.js'});
    assert.equal(first.connectionId,second.connectionId);
    assert.equal(first.connectionId,starts[0].connectionId);
    assert.equal(f.connections,1);assert.equal(f.closed,0);
    await f.session.dispatch('stop');assert.equal(f.closed,1);
});

test('failed consent and disconnect never automatically reconnect',async()=>{
    let attempts=0;
    const session=createSession({connect:async()=>{attempts++;throw new Error('consent timeout');},capture:()=>{throw new Error('unreachable');}});
    await assert.rejects(session.dispatch('start'),/consent timeout/);
    await assert.rejects(session.dispatch('capture'),/consent timeout/);
    assert.equal(attempts,1);assert.equal(session.status().state,'failed');
    const f=fixture();await f.session.dispatch('start');
    f.socket.dispatchEvent(new Event('close'));
    await assert.rejects(f.session.dispatch('capture'),/No automatic reconnection/);
    assert.equal(f.connections,1);
});

test('capture errors release queue without closing or reconnecting',async()=>{
    const order=[];
    const f=fixture(async(c,o)=>{
        order.push(o.outputName);
        await new Promise(resolve=>setTimeout(resolve,10));
        if(o.outputName==='bad')throw new Error('evaluation failed');
        order.push('finished');return {connectionId:c.connectionId};
    });
    const first=f.session.dispatch('capture',{outputName:'bad'});
    const next=f.session.dispatch('capture',{outputName:'good'});
    await assert.rejects(first,/evaluation failed/);await next;
    assert.deepEqual(order,['bad','good','finished']);
    assert.equal(f.connections,1);assert.equal(f.closed,0);
});

test('separate Node client processes reuse a single background service',async()=>{
    const id=crypto.randomUUID();
    const endpoint=process.platform==='win32'?'\\\\.\\pipe\\canvas-cdp-test-'+id:path.join(os.tmpdir(),id+'.sock');
    const f=fixture();const server=serve(f.session,endpoint);
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const client=()=>new Promise((resolve,reject)=>{
        const code="require('./cdp-session.cjs').exchange('capture',{script:'demo.js'},process.argv[1]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;})";
        const child=spawn(process.execPath,['-e',code,endpoint],{cwd:path.resolve(__dirname,'..'),windowsHide:true});
        let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);
        child.on('error',reject);child.on('close',code=>code?reject(new Error(error)):resolve(JSON.parse(output)));
    });
    try {
        const a=await client(),b=await client();
        assert.equal(a.connectionId,b.connectionId);assert.equal(f.connections,1);assert.equal(f.closed,0);
    } finally {await f.session.dispatch('stop');await new Promise(resolve=>server.close(resolve));}
});

test('service rejects unapproved scripts and mismatched ports before connecting',async()=>{
    const f=fixture();
    await assert.rejects(f.session.dispatch('capture',{script:'../outside.js'}),/Only project/);
    await assert.rejects(f.session.dispatch('capture',{port:1234}),/port differs/);
    assert.equal(f.connections,0);
});

test('stop cancels pending consent without a second connection attempt',async()=>{
    let connections=0;
    const session=createSession({connect:signal=>new Promise((resolve,reject)=>{
        connections++;
        if(signal.aborted)reject(new Error('cancelled'));
        else signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});
    }),capture:()=>{throw new Error('unreachable');}});
    const start=session.dispatch('start');
    const rejected=assert.rejects(start,/cancelled/);
    const stopped=await session.dispatch('stop');
    await rejected;assert.equal(stopped.state,'stopped');assert.equal(connections,1);
});
