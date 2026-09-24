// Read-only compatibility with saves from earlier releases. Original keys remain as backups.
(function(){
'use strict';
const replacements = [["whits-end-ice-cream", "gordon-ice-cream-town"], ["whits-end", "gordon-ice-cream-town"], ["bernard-window-washing", "gordon-window-washing"], ["wooten-mail-sorting", "gordon-mail-run"], ["wooten-mail-route", "gordon-mail-run"], ["timothy-center-horse-racing", "gordon-family-stables"], ["timothyCenter", "gordonFamilyStables"], ["timothy", "stables"], ["ODYSSEY", "GAMES"], ["Odyssey", "Games"], ["odyssey", "games"], ["bernard", "rowan"], ["wooten", "casey"], ["whits", "icecream"]];
const customerNames = {"Connie": "Maya", "Jules": "Nina", "Jason": "Leo", "Penny": "Ada", "Olivia": "Iris", "Suzu": "Mika", "Cooper": "Ellis", "Morrie": "Arlo", "Zoe": "Lila", "Jay": "Finn", "Sophie": "Hazel", "Trey": "Theo", "Kayla": "Rhea", "Bridget": "Mae", "Wyatt": "Owen", "Ron": "Hugo", "Carla": "Alma", "Wilson": "Felix", "Wooton": "Casey"};
const rename = value => replacements.reduce((s,[a,b])=>s.split(a).join(b),value);
function migrate(value,field=''){
  if(Array.isArray(value))return value.map(item=>migrate(item,field));
  if(value && typeof value==='object'){
    const out={};
    for(const [key,item] of Object.entries(value))out[rename(key)]=migrate(item,key);
    return out;
  }
  if(typeof value!=='string')return value;
  if(field==='customer'||field==='party')return customerNames[value]||value;
  if(['gameId','lastGameId','recentGameId','game','href','url','resultId'].includes(field))return rename(value);
  if(['cleaner','id'].includes(field)&&value==='bernard')return 'rowan';
  return value;
}
for(const storageName of ['localStorage','sessionStorage']){
  try{
    const storage=window[storageName];
    const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
    for(const key of keys){
      // Restrict migration to the game's known namespaces.
      if(!/^(tessas[_A-Z]|odyssey_|wootenMail|timothyCenter|windowWash)/.test(key))continue;
      const target=rename(key);
      if(target===key||storage.getItem(target)!==null)continue;
      const raw=storage.getItem(key);
      let output=raw;
      try{output=JSON.stringify(migrate(JSON.parse(raw)));}catch(_){}
      storage.setItem(target,output);
    }
  }catch(_){} // Private mode or quota limits must not stop a game from opening.
}
})();
