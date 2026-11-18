(()=>{
"use strict";
const $=(id)=>document.getElementById(id);
const escape=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qbank=[
{level:"Sentence Seeds",title:"The first two branches",sentence:"Birds sing.",shape:"basic",parts:[["s","Birds","Simple subject"],["v","sing","Predicate verb"]],why:"Birds tells who acts. Sing is the verb that tells what the birds do."},
{level:"Sentence Seeds",title:"Who or what?",sentence:"Flowers bloom.",shape:"basic",parts:[["s","Flowers","Simple subject"],["v","bloom","Predicate verb"]],why:"Flowers is the simple subject; bloom is the predicate verb."},
{level:"Growing Details",title:"An article",sentence:"The birds sing.",shape:"basic",parts:[["s","birds","Simple subject"],["v","sing","Predicate verb"],["m1","The","Article modifying birds"]],mods:[["m1","s"]],why:"The is an article that modifies birds. Articles go on slanted lines beneath the nouns they describe."},
{level:"Growing Details",title:"Adjectives and adverbs",sentence:"The little birds sing softly.",shape:"basic",parts:[["s","birds","Simple subject"],["v","sing","Predicate verb"],["m1","The","Article modifying birds"],["m2","little","Adjective modifying birds"],["m3","softly","Adverb modifying sing"]],mods:[["m1","s"],["m2","s"],["m3","v"]],why:"The and little modify birds; softly modifies sing by telling how the birds sing."},
{level:"Branching Sentences",title:"The direct object",sentence:"Maya planted seeds.",shape:"object",parts:[["s","Maya","Simple subject"],["v","planted","Predicate verb"],["o","seeds","Direct object"]],why:"Seeds receives the action of planted and answers planted what? The direct-object separator rises from the baseline."},
{level:"Branching Sentences",title:"A colorful harvest",sentence:"The gardener gathered bright flowers.",shape:"object",parts:[["s","gardener","Simple subject"],["v","gathered","Predicate verb"],["o","flowers","Direct object"],["m1","The","Article modifying gardener"],["m2","bright","Adjective modifying flowers"]],mods:[["m1","s"],["m2","o"]],why:"Flowers is the direct object. The modifies gardener, and bright describes flowers."},
{level:"Winding Paths",title:"Into the garden",sentence:"The children played in the garden.",shape:"basic",parts:[["s","children","Simple subject"],["v","played","Predicate verb"],["m1","The","Article modifying children"],["p1","in","Preposition"],["p2","garden","Object of preposition"],["pm1","the","Article modifying garden"]],mods:[["m1","s"]],prep:{word:"p1",object:"p2",attach:"v",modifiers:["pm1"]},why:"In the garden is a prepositional phrase telling where the children played. The preposition rests on a diagonal line, with garden on a raised horizontal line."},
{level:"Winding Paths",title:"The woodland branch",sentence:"A robin rested on a branch.",shape:"basic",parts:[["s","robin","Simple subject"],["v","rested","Predicate verb"],["m1","A","Article modifying robin"],["p1","on","Preposition"],["p2","branch","Object of preposition"],["pm1","a","Article modifying branch"]],mods:[["m1","s"]],prep:{word:"p1",object:"p2",attach:"v",modifiers:["pm1"]},why:"On a branch is a prepositional phrase modifying rested. A modifies robin, and a modifies branch."},
{level:"The Canopy",title:"A linking verb",sentence:"The grass is green.",shape:"predicate",parts:[["s","grass","Simple subject"],["v","is","Linking verb"],["pa","green","Predicate adjective"],["m1","The","Article modifying grass"]],mods:[["m1","s"]],why:"Is links grass to green. Green describes grass and is a predicate adjective, separated from the verb by a slanted line."},
{level:"The Canopy",title:"A predicate noun",sentence:"Maya is a gardener.",shape:"predicate",parts:[["s","Maya","Simple subject"],["v","is","Linking verb"],["pa","gardener","Predicate nominative"],["m1","a","Article modifying gardener"]],mods:[["m1","pa"]],why:"Gardener renames Maya, so it is a predicate nominative. The slanted separator distinguishes a subject complement from a direct object."},
{level:"Master Diagrammer",title:"Compound subjects",sentence:"Maya and Leo laughed.",shape:"compound-subject",parts:[["s","Maya","First subject"],["s2","Leo","Second subject"],["join","and","Coordinating conjunction"],["v","laughed","Predicate verb"]],why:"Maya and Leo form a compound subject. Separate branches and a connecting conjunction show that both perform the same action."},
{level:"Master Diagrammer",title:"Compound predicates",sentence:"Birds sing and dance.",shape:"compound-verb",parts:[["s","Birds","Simple subject"],["v","sing","First predicate verb"],["v2","dance","Second predicate verb"],["join","and","Coordinating conjunction"]],why:"Both sing and dance are verbs with the same subject. The predicate splits into two branches joined by and."}
];
const wordbank=[
{sentence:"The silver leaves shimmer softly.",word:"silver",options:["Noun","Adjective","Adverb","Verb"],answer:"Adjective",why:"Silver describes the noun leaves."},
{sentence:"The silver leaves shimmer softly.",word:"softly",options:["Noun","Adjective","Adverb","Verb"],answer:"Adverb",why:"Softly modifies the verb shimmer, explaining how."},
{sentence:"Young rabbits explore the meadow.",word:"rabbits",options:["Noun","Adjective","Preposition","Verb"],answer:"Noun",why:"Rabbits names animals."},
{sentence:"Young rabbits explore the meadow.",word:"explore",options:["Verb","Pronoun","Conjunction","Adjective"],answer:"Verb",why:"Explore expresses the action."},
{sentence:"She carried a lantern.",word:"She",options:["Pronoun","Noun","Article","Adverb"],answer:"Pronoun",why:"She is a pronoun standing in for a noun."},
{sentence:"The book rests beside the window.",word:"beside",options:["Preposition","Conjunction","Verb","Adverb"],answer:"Preposition",why:"Beside begins a prepositional phrase."},
{sentence:"The moon and stars shone.",word:"and",options:["Conjunction","Article","Pronoun","Verb"],answer:"Conjunction",why:"And joins moon and stars."},
{sentence:"An owl hooted.",word:"An",options:["Article","Noun","Adverb","Verb"],answer:"Article",why:"An is an indefinite article modifying owl."}
];
let mode="home",index=0,selected=null,placements={},checked=false,players=1,turn=0,scores=[0,0];
const total=()=>mode==="diagram"?qbank.length:mode==="words"?wordbank.length:1;
function activeQuestion(){return mode==="diagram"?qbank[index]:wordbank[index]}
function score(){ $("score").textContent=players===2?"Player 1: "+scores[0]+" · Player 2: "+scores[1]:"Score: "+scores[0];$("turn").textContent=players===2?"Player "+(turn+1)+" playing":"Solo adventure";}
function goHome(){mode="home";$("menu").hidden=false;$("play").hidden=true;$("location").textContent="Welcome to the Grove";score();}
function start(next){mode=next;index=0;turn=0;setup();}
function showFeedback(good,message){$("feedback").className="feedback "+(good?"correct":"incorrect");$("feedback").textContent=message;}
function clearFeedback(){$("feedback").className="feedback";$("feedback").textContent="";}
function setup(){
 selected=null;placements={};checked=false;$("menu").hidden=true;$("play").hidden=false;
 $("location").textContent=mode==="diagram"?"Diagram Builder":mode==="words"?"Word Garden":"Sentence Workshop";
 $("next").hidden=true;$("check").hidden=false;$("hint").hidden=false;clearFeedback();
 $("number").textContent=(index+1)+" / "+total();score();
 if(mode==="diagram") renderDiagram();
 else if(mode==="words")renderWords();
 else renderWorkshop();
}
function svgLine(x1,y1,x2,y2,cls=""){return '<line class="'+cls+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"/>';}
function txt(id,x,y,rotation=0){
 const token=activeQuestion().parts.find(p=>p[0]===id);if(!token)return"";
 const position=activeQuestion().parts.findIndex(p=>p[0]===id);
 const chosen=placements[id]===undefined?"":activeQuestion().parts[placements[id]][1];
 const str=chosen||"?";
 const transform=rotation?' transform="rotate('+rotation+" "+x+" "+y+')"':'';
 return '<text text-anchor="middle" x="'+x+'" y="'+y+'" font-size="'+(str.length>11?18:24)+'"'+transform+'>'+escape(str)+'</text>';
}
function drawDiagram(){
 const q=activeQuestion();
 let d='<svg viewBox="0 0 900 385" role="img" aria-label="Reed–Kellogg sentence diagram. Select a word and place it in the matching labeled slot below.">';
 const baseline=115;
 const variant=q.shape;
 if(variant==="compound-subject"){
   d+=svgLine(40,baseline,160,baseline)+svgLine(330,baseline,860,baseline)+svgLine(360,38,360,195);
   d+='<path d="M160 115 L210 67 L330 67 M160 115 L210 163 L330 163" fill="none" />';
   d+=svgLine(255,85,255,141,"dotted");
   d+=txt("s",271,56)+txt("s2",271,152)+txt("join",253,120)+txt("v",575,103);
 }else if(variant==="compound-verb"){
   d+=svgLine(40,baseline,285,baseline)+svgLine(285,baseline,365,baseline)+svgLine(365,baseline,365,35);
   d+='<path d="M365 115 L420 67 L825 67 M365 115 L420 163 L825 163" fill="none"/>';
   d+=svgLine(525,87,525,143,"dotted");
   d+=txt("s",169,102)+txt("v",602,56)+txt("v2",602,152)+txt("join",525,119);
 }else{
   const sep=variant==="object"||variant==="predicate"?335:390;
   d+=svgLine(35,baseline,865,baseline)+svgLine(sep,37,sep,180);
   d+=txt("s",sep/2+12,103)+txt("v",variant==="basic"?611:468,103);
   if(variant==="object"){d+=svgLine(635,39,635,115)+txt("o",754,103);}
   if(variant==="predicate"){d+='<path d="M635 115 L680 37"/>'+txt("pa",766,103);}
   const positions={s:[175,335],v:[520,390],o:[740,635],pa:[780,635]};
   const byAnchor={};
   (q.mods||[]).forEach(([id,anchor])=>{
      const n=byAnchor[anchor]||0;byAnchor[anchor]=n+1;
      const info=positions[anchor]||[350,335];
      const x=info[0]+(n?52:-20),y=115, y2=194+(n?33:0);
      d+=svgLine(x,y,x-45,y2)+txt(id,x-70,y2+16,-48);
   });
   if(q.prep){
     const p=q.prep,attach=p.attach==="s"?245:575;
     d+=svgLine(attach,115,648,244)+svgLine(648,244,853,244);
     d+=txt(p.word,621,209,-43)+txt(p.object,754,232);
     (p.modifiers||[]).forEach((id,i)=>{const x=732+i*48;d+=svgLine(x,244,x-40,325)+txt(id,x-65,337,-48);});
   }
 }
 d+='</svg>';$("diagram").innerHTML=d;
}
function used(index){return Object.values(placements).includes(index);}
function renderDiagram(){
 const q=activeQuestion();
 $("chapter").textContent=q.level;$("challenge-title").textContent=q.title;
 $("instruction").textContent="Tap a word tile, then the matching labeled diagram slot. Tap a placed slot to change it. Every tile has one home.";
 $("sentence").textContent=q.sentence;
 $("play-area").innerHTML='<div class="word-tiles" id="tiles"></div><div class="diagram" id="diagram"></div><h3 class="slots-title">Place the words in their diagram positions</h3><div class="slot-grid" id="slots"></div>';
 $("tiles").innerHTML=q.parts.map((p,i)=>'<button class="tile" type="button" data-token="'+i+'">'+escape(p[1])+'</button>').join("");
 $("slots").innerHTML=q.parts.map(p=>'<button class="slot" type="button" data-slot="'+escape(p[0])+'"><strong>Place word here</strong><small>'+escape(p[2])+'</small></button>').join("");
 $("tiles").addEventListener("click",e=>{const btn=e.target.closest("[data-token]");if(!btn||checked)return;selected=Number(btn.dataset.token);paint();});
 $("slots").addEventListener("click",e=>{const btn=e.target.closest("[data-slot]");if(!btn||checked)return;
   const id=btn.dataset.slot;
   if(selected===null){if(placements[id]!==undefined){selected=placements[id];delete placements[id];}}
   else{const existing=Object.entries(placements).find(([k,v])=>v===selected);if(existing)delete placements[existing[0]];
     const previous=placements[id];placements[id]=selected;selected=previous===undefined?null:previous;}
   paint();});
 paint();
}
function paint(){
 if(mode!=="diagram")return;const q=activeQuestion();
 $("tiles").querySelectorAll("button").forEach(btn=>{const i=Number(btn.dataset.token);btn.classList.toggle("selected",selected===i);btn.disabled=used(i)&&selected!==i;});
 $("slots").querySelectorAll("button").forEach(btn=>{const i=placements[btn.dataset.slot];btn.querySelector("strong").textContent=i===undefined?"Place word here":q.parts[i][1];});
 drawDiagram();
}
function renderWords(){
 const q=activeQuestion();$("chapter").textContent="Word Garden · "+(index+1);$("challenge-title").textContent="What does this word do?";
 $("instruction").textContent="Choose the part of speech for “"+q.word+"”.";$("sentence").textContent=q.sentence;
 $("play-area").innerHTML='<div class="choice-grid">'+q.options.map(v=>'<button type="button" class="tile" data-choice="'+escape(v)+'">'+escape(v)+'</button>').join("")+'</div>';
 $("play-area").addEventListener("click",chooseWord,{once:false});
}
function chooseWord(e){if(mode!=="words"||checked)return;const btn=e.target.closest("[data-choice]");if(!btn)return;selected=btn.dataset.choice;
 $("play-area").querySelectorAll("[data-choice]").forEach(b=>b.classList.toggle("selected",b===btn));}
function renderWorkshop(){
 $("chapter").textContent="Sentence Workshop";$("challenge-title").textContent="Grow your own sentence";
 $("instruction").textContent="Choose a subject, a transitive verb, and a direct object. Watch the Reed–Kellogg framework change.";
 $("play-area").innerHTML='<div class="choice-grid"><label>Subject<select id="make-subject"><option>Birds</option><option>Gardeners</option><option>Children</option><option>Rabbits</option></select></label><label>Action verb<select id="make-verb"><option>gather</option><option>carry</option><option>find</option><option>watch</option></select></label><label>Direct object<select id="make-object"><option>seeds</option><option>flowers</option><option>lanterns</option><option>clouds</option></select></label></div><div class="diagram" id="diagram"></div>';
 ["make-subject","make-verb","make-object"].forEach(id=>$(id).addEventListener("change",drawWorkshop));drawWorkshop();
}
function drawWorkshop(){
 const a=$("make-subject").value,b=$("make-verb").value,c=$("make-object").value;
 $("sentence").textContent=a+" "+b+" "+c+".";
 $("diagram").innerHTML='<svg viewBox="0 0 900 270" role="img" aria-label="Sentence diagram: subject, verb, direct object">'+svgLine(40,135,860,135)+svgLine(330,45,330,210)+svgLine(630,45,630,135)+'<text x="180" y="122" font-size="30" text-anchor="middle">'+escape(a)+'</text><text x="470" y="122" font-size="30" text-anchor="middle">'+escape(b)+'</text><text x="737" y="122" font-size="30" text-anchor="middle">'+escape(c)+'</text></svg>';
}
function complete(ok,why){
 checked=true;$("check").hidden=true;$("hint").hidden=true;$("next").hidden=false;
 if(ok){scores[turn]+=10;score();}
 showFeedback(ok,(ok?"✓ Well done! ":"Not quite. ")+why);
 $("next").textContent=index+1>=total()?"Finish & return to Grove":"Next challenge →";
}
$("check").onclick=()=>{
 if(checked)return;
 if(mode==="diagram"){
   const q=activeQuestion();if(Object.keys(placements).length!==q.parts.length){showFeedback(false,"Place every word before checking.");return;}
   complete(q.parts.every((p,i)=>placements[p[0]]===i),q.why);
 }else if(mode==="words"){
   const q=activeQuestion();if(selected===null){showFeedback(false,"Choose an answer first.");return;}
   complete(selected===q.answer,q.why+(selected===q.answer?"":" Correct answer: "+q.answer+"."));
 }else complete(true,"You built a complete sentence with a direct object. The upright line after the verb separates that object.");
};
$("hint").onclick=()=>{
 if(mode==="diagram"){const q=activeQuestion();showFeedback(true,q.shape==="object"?"The subject performs the action, the verb tells the action, and the direct object receives it.":q.prep?"A preposition introduces a phrase; its object rests on a raised horizontal line.":"Look for the subject and the verb first. Modifier words go below the words they describe.");}
 else if(mode==="words")showFeedback(true,"Ask whether the word names, acts, describes, replaces a noun, joins words, or begins a phrase.");
 else showFeedback(true,"The subject acts, the verb names the action, and the object receives the action.");
};
$("next").onclick=()=>{index++;if(players===2)turn=(turn+1)%2;if(index>=total()){goHome();return;}setup();};
document.querySelectorAll("[data-mode]").forEach(btn=>btn.addEventListener("click",()=>start(btn.dataset.mode)));
$("home").onclick=goHome;$("reset").onclick=()=>{scores=[0,0];turn=0;score();};
$("players").onchange=()=>{players=Number($("players").value);scores=[0,0];turn=0;score();};
$("read").onclick=()=>{const text=$("sentence").textContent;if("speechSynthesis" in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.84;window.speechSynthesis.speak(u);}else showFeedback(false,"Read-aloud is not supported by this browser.");};
goHome();
})();