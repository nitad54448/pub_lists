const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../scanner.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function harness({fail=false,empty=false}={}){
  const nodes=new Map(),blobs=[],node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',style:{},insertAdjacentHTML(){}});return nodes.get(id);};
  node('authorName').value='Alice Doe';node('pubType').value='all';
  const works=empty?[]:[{title:'A paper',authorships:[{author:{display_name:'Alice Doe'}}],publication_year:2025,doi:'https://doi.org/10.test/1'}];
  const ctx=vm.createContext({window:{},Blob,alert(){},document:{getElementById:node,createElement:()=>({click(){}}),body:{appendChild(){},removeChild(){}}},
    URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},
    fetch:async url=>({ok:!(fail&&url.includes('crossref')),status:503,json:async()=>url.includes('openalex')?{results:works,meta:{count:101}}:url.includes('crossref')?{message:{items:[],'total-results':0}}:{response:{docs:[],numFound:0}}})});
  vm.runInContext(script,ctx);return {ctx,node,blobs};
}
test('coverage explicitly states the first-100 limit and each reported total',async()=>{
  const h=harness();await h.ctx.performSearch();
  const message=h.node('coverageNotice').textContent;
  assert.match(message,/only the first 100/);assert.match(message,/1 records fetched of 101 reported; truncated/);
  assert.match(message,/not an exhaustive publication list/);assert.equal(h.ctx.window.currentScanResults.length,1);
});
test('service failures are reported as incomplete coverage rather than empty success',async()=>{
  const h=harness({fail:true});await h.ctx.performSearch();assert.match(h.node('coverageNotice').textContent,/Crossref: unavailable; coverage incomplete/);
});
test('ACS export preserves the incomplete-coverage notice',async()=>{
  const h=harness();await h.ctx.performSearch();h.ctx.exportToACS();
  const content=await h.blobs[0].text();assert.match(content,/first 100/);assert.match(content,/truncated/);assert.match(content,/A paper/);
});
test('a new empty search cannot export previous results',async()=>{
  const h=harness({empty:true});h.ctx.window.currentScanResults=[{title:'old'}];await h.ctx.performSearch();assert.equal(h.ctx.window.currentScanResults.length,0);
});
