import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,validate} from '../src/builder.ts';
const input=JSON.parse(await readFile(new URL('../sample-data/input.json',import.meta.url),'utf8'));
test('sample has closed references and header first',()=>{
 const bundle=build(input);assert.deepEqual(validate(bundle),[]);assert.equal(bundle.entry[0].resource.resourceType,'MessageHeader');
 const urls=new Set(bundle.entry.map(e=>e.fullUrl));assert.equal(urls.size,bundle.entry.length);
 assert.equal(bundle.entry.length,6);
});
test('rejects missing identifiers',()=>{assert.throws(()=>build({...input,memberId:''}),/memberId/);});
test('rejects impossible calendar dates',()=>{assert.throws(()=>build({...input,serviceDate:'2026-02-30'}),/date/);});
test('detects dangling references',()=>{
 const b=build(input);b.entry.pop();assert.ok(validate(b).some(e=>e.includes('Unresolved reference')));
});
test('detects wrong message order and event',()=>{
 const b=build(input);b.entry.reverse();assert.ok(validate(b).length);
});
test('detects duplicate resource URLs',()=>{const b=build(input);b.entry.push(b.entry[1]);assert.ok(validate(b).length);});
test('does not assert IG profile conformance',()=>{const b=build(input);assert.equal((b.meta as any).profile,undefined);assert.equal(b.meta.tag[0].code,'synthetic-not-exchange-validated');});

test('malformed JSON shapes return findings without throwing',()=>{
 const variants:any[]=[null,[],{},'bad',42,
  {resourceType:'Bundle',type:'message',entry:{}},
  {resourceType:'Bundle',type:'message',entry:[null]},
  {resourceType:'Bundle',type:'message',entry:[{}]},
  {resourceType:'Bundle',type:'message',entry:[{resource:null}]},
  {resourceType:'Bundle',type:'message',entry:[{resource:{resourceType:'MessageHeader',id:'header'}}]},
 ];
 for(const value of variants){let findings:string[]=[];assert.doesNotThrow(()=>{findings=validate(value);});assert.ok(findings.length>0);}
});
test('non-array entries and null members never bypass validation',()=>{
 for(const entry of [null,{},'text',[null],[1],[{fullUrl:null,resource:null}]]){
  const b:any=build(input);b.entry=entry;assert.ok(validate(b).length);
 }
});
