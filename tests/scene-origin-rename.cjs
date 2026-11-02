const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='fixture-public-key';
const { POST }=require('../app/api/access/route.ts');
const { secureRequest }=require('../lib/http-security.ts');
let forwarded;
global.fetch=async(url,options)=>{forwarded={url,options};return Response.json({emailRequired:true,expiresAt:'2026-12-01'});};
function request(origin, incoming=origin){return new Request(origin+'/api/access',{method:'POST',headers:{'Content-Type':'application/json',Origin:incoming},body:JSON.stringify({action:'inspect',token:'a'.repeat(64)})});}
(async()=>{
  for(const origin of ['https://scene.benlear439.workers.dev','https://scene.leardigital.workers.dev']){
    const req=request(origin);assert.ok(await secureRequest(req.clone()) instanceof Request);
    const result=await POST(req);assert.equal(result.status,200);assert.equal(forwarded.options.headers.Origin,origin);
    assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
  const blocked=await secureRequest(request('https://scene.leardigital.workers.dev','https://evil.invalid'));
  assert.equal(blocked.status,403,'the rename must not allow requests from untrusted pages');
  await POST(request('http://localhost:4173'));
  assert.equal(forwarded.options.headers.Origin,undefined,'local previews retain their existing canonical invitation fallback');
  console.log('PASS: old/new origins forwarded from the request URL, forged browser origin rejected, private responses uncached and local-preview fallback retained.');
})().catch(error=>{console.error(error);process.exitCode=1;});
