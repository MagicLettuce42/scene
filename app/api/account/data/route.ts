import { requireSceneMember, authConfigured } from "../../../../lib/auth/server";
import { readAccountDeletion } from "../../../../supabase/functions/_shared/account-data-request";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(req: Request) {
 const auth=await requireSceneMember(req);if(auth.error)return auth.error;
 const action=new URL(req.url).searchParams.get("action");
 if(action!=="export"&&action!=="summary")return Response.json({error:"Invalid data request."},{status:400,headers});
 const {data,error}=await auth.client.rpc("scene_account_data",{p_action:action});
 if(error||!data)return Response.json({error:"Your account data could not load. Please try again."},{status:503,headers});
 const metadata=auth.user.user_metadata || {};
 const policyAcceptance=action==="export"?{policyAcceptance:{termsVersion:typeof metadata.terms_version==="string"?metadata.terms_version:null,acceptedAt:typeof metadata.terms_accepted_at==="string"?metadata.terms_accepted_at:null}}:{};
 return Response.json({...data,...policyAcceptance},{headers:{...headers,...(action==="export"?{"Content-Disposition":'attachment; filename="scene-account-data.json"'}:{})}});
}
export async function POST(req: Request) {
 if(req.headers.get("sec-fetch-site")==="cross-site"||req.headers.get("origin")&&req.headers.get("origin")!==new URL(req.url).origin)return Response.json({error:"Invalid origin."},{status:403,headers});
 if(!authConfigured())return Response.json({error:"Scene accounts are being set up."},{status:503,headers});
 const body=await readAccountDeletion(req);if(body instanceof Response)return body;
 const auth=await requireSceneMember(req);if(auth.error)return auth.error;
 try{
  const r=await fetch(process.env.SUPABASE_URL+"/functions/v1/scene-account-data",{
   method:"POST",headers:{"Content-Type":"application/json",apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,Authorization:req.headers.get("authorization")!},
   body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
  });
  const d=await r.json() as {deleted?:boolean;error?:string;code?:string};
  const retry=r.headers.get("Retry-After");
  return Response.json(r.ok?{deleted:d.deleted===true}:{error:typeof d.error==="string"?d.error:"Deletion could not finish.",code:d.code},
   {status:r.status,headers:{...headers,...(retry&&/^\d{1,5}$/.test(retry)?{"Retry-After":retry}:{})}});
 }catch{return Response.json({error:"Deletion could not be confirmed. Sign in again to check your account before retrying."},{status:503,headers});}
}
