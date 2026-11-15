import {build} from 'vite';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const repo=path.resolve(root,'../..');
for(const game of ['geo','math','latin']){
 const out=path.join(repo,'static/labs/learning',game);
 await build({root:path.join(root,game),base:`/static/labs/learning/${game}/`,build:{outDir:out,emptyOutDir:true,assetsInlineLimit:0,cssCodeSplit:false,target:'es2020',rollupOptions:{input:game==='latin'?path.join(root,'latin/main.jsx'):path.join(root,game,'index.html'),output:{entryFileNames:'main-[hash].js',chunkFileNames:'[name]-[hash].js',assetFileNames:'[name]-[hash][extname]'}}}});
 if(game!=='latin')fs.copyFileSync(path.join(out,'index.html'),path.join(repo,'static/labs',game==='geo'?'geo-detectives.html':'math-fact-rally.html'));
 if(game==='latin'){
  const css=fs.readdirSync(out).find(x=>x.endsWith('.css'));const js=fs.readdirSync(out).find(x=>x.startsWith('main-')&&x.endsWith('.js'));const template=path.join(repo,'templates/labs_latin_quest.html');let s=fs.readFileSync(template,'utf8');s=s.replace(/<!-- learning-labs-style -->[\s\S]*?<!-- \/learning-labs-style -->\n?/g,'').replace(/<!-- learning-labs-entry -->[\s\S]*?<!-- \/learning-labs-entry -->\n?/g,'');
  s=s.replace("<script src=\"{{ url_for('static', filename='js/latin-quest-core.js') }}\"></script>",'').replace("<script src=\"{{ url_for('static', filename='js/latin-quest.js') }}\"></script>",'');
  // Match older templates with compact url_for spacing as well.
  s=s.replace(/<script src="\{\{\s*url_for\('static',\s*filename='js\/latin-quest(?:-core)?\.js'\)\s*\}\}"><\/script>/g,'');
  s=s.replace(/<script src="\{\{\s*url_for\('static',\s*filename='js\/latin-quest(?:-core)?\.js'\)\s*\}\}[^"]*"[^>]*><\/script>/g,'');
  s=s.replace('</style>',`</style>\n<!-- learning-labs-style --><link rel="stylesheet" href="/static/labs/learning/latin/${css}"><!-- /learning-labs-style -->`);
  if(!s.includes('id="labs-family"'))s=s.replace('{% block content %}','{% block content %}\n<div id="labs-family" data-game="latin"></div>');
  s=s.replace(/<header><h1>Latin Quest/, '<header><p class="lq-tag">THE WORD NOTEBOOK · FAITHSPARKS LABS</p><h1>Latin Quest');
  s=s.replace('{% endblock %}',match=>match);const end=s.lastIndexOf('{% endblock %}');s=s.slice(0,end)+`<!-- learning-labs-entry --><script type="module" src="/static/labs/learning/latin/${js}"></script><!-- /learning-labs-entry -->\n`+s.slice(end);fs.writeFileSync(template,s);
 }
}
// Preserve the original take-home use case without requiring the hosted assets.
const mathOut=path.join(repo,'static/labs/learning/math');
let offline=fs.readFileSync(path.join(mathOut,'index.html'),'utf8');
offline=offline.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,(_,url)=>'<script type="module">'+fs.readFileSync(path.join(mathOut,path.basename(url)),'utf8').replaceAll('</script','<\\/script')+'</script>');
offline=offline.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_,url)=>'<style>'+fs.readFileSync(path.join(mathOut,path.basename(url)),'utf8')+'</style>');
offline=offline.replace(/\/static\/labs\/learning\/math\/[A-Za-z0-9_-]+\.(?:webp|png|jpg|svg)/g,url=>{const file=path.join(mathOut,path.basename(url));const ext=path.extname(file).slice(1);return 'data:image/'+(ext==='svg'?'svg+xml':ext)+';base64,'+fs.readFileSync(file).toString('base64')});
fs.writeFileSync(path.join(repo,'static/labs/learning/math-offline.html'),offline);
