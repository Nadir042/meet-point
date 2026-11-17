'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('pending recommendation rejects duplicate clicks and resets after success or error',async()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const fragment=source.slice(source.indexOf('  let recommendationJob = null;'),source.indexOf('  function avatar('));
 let finish,calls=0;const messages=[];
 const context={document:{querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>({setAttribute(){}}),querySelector:()=>null},setInterval:()=>1,clearInterval(){},isShared:()=>true,active:()=>({id:'a',members:[{id:'me'}]}),viewer:()=> 'me',perform:()=>{calls++;return new Promise(resolve=>{finish=resolve})},save(){},render(){},toast:m=>messages.push(m),Date};
 vm.createContext(context);vm.runInContext(fragment+';globalThis.runTest=run;',context);
 const first=context.runTest('recommend');assert.equal(calls,1);assert.equal(await context.runTest('recommend'),false);assert.equal(calls,1);finish();assert.equal(await first,true);
 context.perform=async()=>{throw Error('map failed')};assert.equal(await context.runTest('recommend'),false);assert.equal(messages.at(-1),'map failed');
 context.perform=async()=>{};assert.equal(await context.runTest('recommend'),true);
});
