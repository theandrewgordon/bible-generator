// Extract reviewed chapter data without running gameplay or modifying the vendor release.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'faithsparks/content/scroll_quest');
const chapters={};
const engine=fs.readFileSync(path.join(dir,'engine.js'),'utf8');
const objectLiteral=name=>{const match=engine.match(new RegExp('  const '+name+' = (\\{[\\s\\S]*?\\n  \\});'));if(!match)throw Error('Reviewed engine data not found: '+name);return vm.runInNewContext('('+match[1]+')');};
const armor=objectLiteral('ARMOR'),bridges=objectLiteral('CHAPTER_BRIDGES');
for(const filename of fs.readdirSync(dir).filter(n=>/^level-.*\.js$/.test(n)).sort()){
 const context={};vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(dir,'three.min.js'),'utf8'),context);
 const source=fs.readFileSync(path.join(dir,filename),'utf8');
 vm.runInContext(source+';globalThis.chapter=LEVEL;',context);
 const L=context.chapter,pages=[];
 for(const p of [...(L.intro||[]),...(L.introStory||[]),...(L.story||[]),...(L.ending?.story||[])])if(p&&typeof p.text==='string')pages.push({title:p.title||'',text:p.text,ref:p.ref||'',kind:p.ref?'scripture':'narration'});
 if(L.memoryVerse)pages.push({...L.memoryVerse,title:'Memory verse',kind:'scripture'});
 if(L.ending?.verse)pages.push({...L.ending.verse,title:'Closing verse',kind:'scripture'});
 if(L.bibleConnection)pages.push({title:'Bible connection',text:L.bibleConnection.text,ref:'',passage:L.bibleConnection.passage,kind:'explanation'});
 for(const item of Object.values(armor))pages.push({title:item.name,text:item.verse,ref:item.ref,kind:'scripture'});
 if(bridges[L.id])pages.push({title:'The story so far',text:bridges[L.id].text,ref:'',passage:bridges[L.id].passage,kind:'narration'});
 // Literal authored dialogue also becomes a fixed narration cue. Dynamic text retains device speech.
 for(const m of source.matchAll(/\btext\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)){
  const text=vm.runInNewContext(m[1]);const following=source.slice(m.index+m[0].length).match(/^\s*,\s*ref\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/);const ref=following?vm.runInNewContext(following[1]):'';if(typeof text==='string'&&text.length>15&&!pages.some(p=>p.text===text))pages.push({title:ref?'Bible passage':'Game dialogue',text,ref,kind:ref?'scripture':'dialogue'});
 }
 const cues={};for(const p of pages){const id=crypto.createHash('sha256').update(p.text).digest('hex').slice(0,16);cues[id]=p;}
 chapters[L.id]={id:L.id,title:L.title,bounds:L.bounds||null,page:'world-'+filename.slice(6,-3)+'.html',passage:L.bibleConnection?.passage||L.memoryVerse?.ref||'',connection:L.bibleConnection?.text||'',memoryVerse:L.memoryVerse||null,intro:L.introStory||L.intro||[],ending:{message:L.ending?.message||'',verse:L.ending?.verse||null},tasks:L.tasks||[],quiz:L.quiz||[],startMessage:L.startMessage||'',cues};
}
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'release-manifest.json'),'utf8'));
const result={version:1,release:manifest.version,engineSha256:manifest.engineSha256,chapters};
const output=JSON.stringify(result,null,2)+'\n',target=path.join(root,'faithsparks/content/scroll_quest_learning.json');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('Scroll Quest learning catalog needs regeneration');}
else fs.writeFileSync(target,output);
console.log('Verified learning catalog: '+Object.keys(chapters).length+' chapters');
