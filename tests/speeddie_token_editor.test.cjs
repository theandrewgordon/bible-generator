const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}}
const context=vm.createContext({ImageData});vm.runInContext(fs.readFileSync(require.resolve('../speeddie/token-editor.js'),'utf8'),context);
function picture(){const data=new Uint8ClampedArray(8*8*4);data.fill(255);for(let y=2;y<6;y++)for(let x=2;x<6;x++){data[(y*8+x)*4+1]=0;data[(y*8+x)*4+2]=0;}for(let c=0;c<3;c++)data[(3*8+3)*4+c]=255;return new ImageData(data,8,8);}
test('plain-background flood fill removes edges but preserves character and enclosed details',()=>{
 const original=picture(),result=context.removeTokenBackground(original,0,45);
 assert.equal(result.data[3],0);assert.equal(result.data[(2*8+2)*4+3],255);assert.equal(result.data[(3*8+3)*4+3],255);assert.equal(original.data[3],255);
});
test('choosing an interior background spot removes that region too',()=>{
 const result=context.removeTokenBackground(picture(),3*8+3,45);assert.equal(result.data[(3*8+3)*4+3],0);assert.equal(result.data[(2*8+2)*4+3],255);
});
