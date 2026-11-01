import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {handleAccountDeletion} from '../_shared/account-data-handler.ts';
Deno.serve((req:Request)=>handleAccountDeletion(req,(mode,jwt)=>{
 const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
 return createClient(Deno.env.get('SUPABASE_URL')!,mode==='admin'?(keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!):Deno.env.get('SUPABASE_ANON_KEY')!,{
  auth:{persistSession:false,autoRefreshToken:false},
  ...(mode==='caller'?{global:{headers:{Authorization:'Bearer '+jwt}}}:{})
 });
}));
