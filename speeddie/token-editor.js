/* Plain-background cutouts run entirely in this browser. */
const tokenEditors=new WeakMap();
function removeTokenBackground(source,sample,tolerance){
  const {width:w,height:h}=source,data=new Uint8ClampedArray(source.data),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const color=[source.data[sample*4],source.data[sample*4+1],source.data[sample*4+2]];
  const visit=i=>{if(i<0||i>=w*h||seen[i])return;seen[i]=1;const n=i*4;
    if(data[n+3]===0||Math.hypot(data[n]-color[0],data[n+1]-color[1],data[n+2]-color[2])<=tolerance)queue[tail++]=i;};
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}visit(sample);
  while(head<tail){const i=queue[head++];data[i*4+3]=0;if(i%w)visit(i-1);if(i%w<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<w*(h-1))visit(i+w);}
  return new ImageData(data,w,h);
}
async function tokenCanvas(source){
  const file=typeof source!=='string';
  if(file)G.assert(['image/jpeg','image/png','image/webp','image/gif'].includes(source.type)&&source.size<=10000000,'Choose a JPG, PNG, WebP, or GIF image under 10 MB.');
  const url=file?URL.createObjectURL(source):source;
  try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=128;const scale=Math.min(128/img.width,128/img.height);c.getContext('2d').drawImage(img,(128-img.width*scale)/2,(128-img.height*scale)/2,img.width*scale,img.height*scale);return c;}
  finally{if(file)URL.revokeObjectURL(url);}
}
function encodeTokenCanvas(canvas){
  // PNG keeps the cutout transparent; shrink if needed to meet the existing save limit.
  let output=canvas.toDataURL('image/png');
  for(const size of [112,96,80,64]){if(output.length<60000)break;const smaller=document.createElement('canvas');smaller.width=smaller.height=size;smaller.getContext('2d').drawImage(canvas,0,0,size,size);output=smaller.toDataURL('image/png');}
  G.assert(output.length<60000,'This picture is too detailed. Choose a smaller image.');return output;
}
function mountTokenEditor(input,existing='',restore=null){
  restore=restore?.original?restore:null;
  const panel=document.createElement('div');panel.className='token-cutout';panel.hidden=true;input.closest('label').after(panel);
  const editor={dirty:restore?.dirty||false,ready:Promise.resolve(),canvas:null,error:null,version:0};tokenEditors.set(input,editor);
  const load=source=>{
    const version=++editor.version;editor.error=null;
    editor.ready=(async()=>{try{
      const original=restore?.original||await tokenCanvas(source);if(version!==editor.version)return;
      const originalData=original.getContext('2d').getImageData(0,0,128,128);let sample=0;while(sample<128*128-1&&originalData.data[sample*4+3]===0)sample++;
      if(restore)sample=restore.sample;
      let removed=restore?.removed||false;
      panel.hidden=false;panel.innerHTML='<p><strong>Token preview</strong></p><canvas width="128" height="128" aria-label="Token preview. Tap the background color to remove it."></canvas><div class="button-row"><button class="button secondary cutout-remove" type="button">Remove plain background</button><button class="button quiet cutout-restore" type="button">Undo background removal</button></div><label class="field"><span>Background removal strength</span><input class="cutout-strength" type="range" min="0" max="160" value="45"></label><p class="muted small">Best with a plain wall or solid background. Tap the background in the preview to choose its color. Busy scenes and fur edges may not cut out cleanly. The checkerboard means transparent. Nothing is uploaded to a background-removal service.</p>';
      const preview=panel.querySelector('canvas'),ctx=preview.getContext('2d'),slider=panel.querySelector('input');
      if(restore)slider.value=restore.strength;
      const draw=()=>{panel.querySelector('.cutout-restore').disabled=!removed;Object.assign(editor,{original,sample,removed,strength:Number(slider.value)});ctx.putImageData(removed?removeTokenBackground(originalData,sample,Number(slider.value)):originalData,0,0);editor.canvas=preview;};
      panel.querySelector('.cutout-remove').onclick=()=>{removed=true;editor.dirty=true;draw();};
      panel.querySelector('.cutout-restore').onclick=()=>{removed=false;editor.dirty=true;draw();};
      preview.onclick=e=>{const bounds=preview.getBoundingClientRect(),x=Math.min(127,Math.max(0,Math.floor((e.clientX-bounds.left)*128/bounds.width))),y=Math.min(127,Math.max(0,Math.floor((e.clientY-bounds.top)*128/bounds.height)));sample=y*128+x;removed=true;editor.dirty=true;draw();};
      slider.oninput=()=>{removed=true;editor.dirty=true;draw();};draw();
    }catch(e){if(version!==editor.version)return;editor.error=e;panel.hidden=false;panel.textContent=e.message;}})();
  };
  input.onchange=()=>{restore=null;editor.dirty=!!input.files[0];editor.canvas=null;if(input.files[0])load(input.files[0]);else{editor.version++;editor.error=null;panel.hidden=true;}};
  if(input.files[0]){editor.dirty=true;load(input.files[0]);}else if(existing.startsWith('data:image/'))load(existing);
}
async function readTokenImage(input){
  const editor=tokenEditors.get(input);
  if(editor){await editor.ready;if(editor.error)throw editor.error;if(editor.dirty&&editor.canvas)return encodeTokenCanvas(editor.canvas);}
  return input.files[0]?imageToken(input.files[0]):null;
}
