#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const renderer=require('../core/games/murdermystery/halloweenCards');
async function main(){
  const expected=['guide','lobby','intro','role','character','night','morning','body','clue','evidence','ritual','blackmail','escape','vote','final','collectible'];
  for(const kind of expected) assert.ok(renderer.PRESETS[kind],'missing card preset: '+kind);
  for(const kind of ['guide','lobby','clue','ritual','blackmail','escape']){
    const buf=await renderer.render({kind:kind,title:'QA '+kind,subtitle:'Halloween render smoke test',lines:['Evidence alpha','Evidence beta'],prefix:'.j',playerCount:4,maxPlayers:12,prize:10000});
    assert.ok(Buffer.isBuffer(buf),kind+' should produce a PNG Buffer');
    assert.equal(buf.readUInt32BE(0),0x89504e47,kind+' must be PNG');
  }
  console.log('Halloween renderer QA passed ('+expected.length+' presets; 6 PNG smoke tests).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
