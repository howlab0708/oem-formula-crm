const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const Module=require('node:module')
const ts=require('typescript')
function loadTs(relativePath) {
  const filename=path.resolve(__dirname,'..',relativePath)
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const loaded=new Module(filename,module)
  loaded.filename=filename
  loaded.paths=Module._nodeModulePaths(path.dirname(filename))
  const native=loaded.require.bind(loaded)
  loaded.require=name=>name.startsWith('.')?loadTs(path.resolve(path.dirname(filename),`${name}.ts`)):native(name)
  loaded._compile(compiled,filename)
  return loaded.exports
}
const {mainIngredientKey,uniqueMainIngredients}=loadTs('src/lib/ingredientNames.ts')
const {applyFilters,mainIngredientOptions,EMPTY_FILTERS}=loadTs('src/lib/filters.ts')
const {referencePage,referencePageButtons}=loadTs('src/lib/pagination.ts')
const {mapHeaders,rowToProduct}=loadTs('src/lib/csvSchema.ts')
const codec=loadTs('src/lib/datasetSnapshot.ts')
const base={id:'one',name:'정관장 테스트',manufacturer:'OEM 제조원',form:'정제',formRaw:'정제',weightLabel:'1g',weightMg:1000,unitWeightMg:500,mainIngredients:[],mainDetail:'원문: 기준규격',markers:[],subIngredients:[]}

test('groups equivalent ingredient names and counts each product once without changing source',()=>{
  const products=[{...base,mainIngredients:['비타민 C(고시형)','비타민C']},{...base,id:'two',mainIngredients:['비타민C(L-Ascorbic acid)']},{...base,id:'three',mainIngredients:['비타민 C 혼합분말']}]
  const original=JSON.stringify(products)
  const options=mainIngredientOptions(products)
  assert.equal(options.find(o=>o.value==='비타민C').count,2)
  assert.ok(options.find(o=>o.value==='비타민C').searchAliases.includes('비타민 C(고시형)'))
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,mains:['비타민 C(고시형)','비타민C'],mainMode:'all'}).map(p=>p.id),['one','two'])
  assert.equal(JSON.stringify(products),original)
  assert.deepEqual(uniqueMainIngredients(products[0].mainIngredients),['비타민C'])
})

test('normalizes typography and verified bilingual labels while retaining ingredient distinctions',()=>{
  assert.equal(mainIngredientKey('비타민 B-12(고시형)'),mainIngredientKey('비타민B₁₂'))
  assert.equal(mainIngredientKey('비타민 B2(Riboflavin)'),mainIngredientKey('비타민B2'))
  assert.equal(mainIngredientKey('EPA및DHA함유유지(고시형)'),mainIngredientKey('EPA 및 DHA 함유 유지'))
  for(const [a,b] of [['비타민D2','비타민D3'],['비타민B1염산염','비타민B1질산염'],['비타민C','비타민C혼합분말'],['비타민C','비타민 C(Ascorbyl Palmitate)'],['홍삼분말','홍삼농축액'],['비타민C(함량100%)','비타민C(함량50%)']]) assert.notEqual(mainIngredientKey(a),mainIngredientKey(b))
})

test('all/any ingredient combinations and additive include/exclude retain their behavior',()=>{
  const products=[{...base,mainIngredients:['비타민C(고시형)','엽산'],subIngredients:['부원료 A']},{...base,id:'two',mainIngredients:['비타민 C']},{...base,id:'three',mainIngredients:['엽산(고시형)']}]
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,mains:['비타민 C','엽산(고시형)']}).map(p=>p.id),['one'])
  assert.equal(applyFilters(products,{...EMPTY_FILTERS,mains:['비타민C','엽산'],mainMode:'any'}).length,3)
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,mains:['비타민C'],subExclude:['부원료 A']}).map(p=>p.id),['two'])
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,subInclude:['부원료 A']}).map(p=>p.id),['one'])
})

test('search finds product-name brands and supplied brand fields despite spacing, retains legacy source search',()=>{
  const products=[base,{...base,id:'two',name:'테스트 제품',brand:'뉴 트리 브랜드',manufacturer:'다른 회사'}]
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,query:'정 관 장'}).map(p=>p.id),['one'])
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,query:'뉴트리브랜드'}).map(p=>p.id),['two'])
  assert.deepEqual(applyFilters(products,{...EMPTY_FILTERS,query:'oem제조원'}).map(p=>p.id),['one'])
  assert.equal(applyFilters(products,{...EMPTY_FILTERS,query:'기준규격'}).length,2)
  assert.equal(applyFilters(products,{...EMPTY_FILTERS,query:'없는 브랜드'}).length,0)
})

test('brand column survives CSV import and snapshot round trips; absent brand stays absent',()=>{
  const mapping=mapHeaders(['제품명','제조원','브랜드명','제형','섭취방법','주원료'])
  const product=rowToProduct(['제품','제조원','브랜드','정제','1회 1정(500mg)','비타민 C(고시형)'],mapping,0)
  assert.equal(product.brand,'브랜드')
  assert.deepEqual(product.mainIngredients,['비타민 C(고시형)'])
  const meta={generation:'brand',imported_rows:2}
  assert.deepEqual(codec.unpackSnapshot(JSON.parse(JSON.stringify(codec.packSnapshot(meta,[base,product]))),meta),JSON.parse(JSON.stringify([base,product])))
  assert.throws(()=>codec.unpackSnapshot({...codec.packSnapshot(meta,[base,product]),version:2},meta))
})

test('pagination covers all 45,970 rows exactly once with 50 per page and 20 on the last',()=>{
  const visited=[]
  for(let page=1;page<=920;page++){
    const bounds=referencePage(45970,page)
    assert.equal(bounds.pages,920)
    assert.equal(bounds.end-bounds.start,page===920?20:50)
    for(let i=bounds.start;i<bounds.end;i++)visited.push(i)
    const buttons=referencePageButtons(page,bounds.pages).filter(n=>typeof n==='number')
    assert.ok(buttons.includes(1)&&buttons.includes(page)&&buttons.includes(920))
    assert.equal(new Set(buttons).size,buttons.length)
    assert.ok(buttons.length<=7)
  }
  assert.equal(visited.length,45970)
  assert.equal(new Set(visited).size,45970)
  assert.equal(visited[0],0)
  assert.equal(visited.at(-1),45969)
  assert.deepEqual(referencePage(0,920),{page:1,pages:1,start:0,end:0})
  assert.deepEqual(referencePage(3,920),{page:1,pages:1,start:0,end:3})
  assert.equal(referencePage(45970,Infinity).page,1)
})
