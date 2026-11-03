const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
 const {PGlite}=await import(pathToFileURL(process.argv[2]).href),db=new PGlite(),repo=process.cwd();
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table organizations(id bigint primary key);insert into organizations values(1),(2);insert into auth.users values('00000000-0000-4000-8000-000000000001');grant usage on schema public to service_role;");
 for(const f of ['20261026170947_marketing_ideas_and_measurement.sql','20261028171217_marketing_content_calendar.sql','20261103181708_marketing_calendar_execution.sql'])await db.exec(fs.readFileSync(path.join(repo,'supabase/migrations',f),'utf8'));
 const actor='00000000-0000-4000-8000-000000000001',entry='00000000-0000-4000-8000-000000000010',calendar='00000000-0000-4000-8000-000000000020',pub='00000000-0000-4000-8000-000000000030';
 await db.query("insert into marketing_calendars(id,organization_id,fingerprint,period_from,period_to,source_cutoff,source_checked_at,method_version,config,summary,limitations,created_by)values($1,1,repeat('a',64),current_date,current_date,current_date,now(),'v5','{}','{}','[]',$2)",[calendar,actor]);
 await db.query("insert into marketing_calendar_entries(id,organization_id,calendar_id,slot_key,scheduled_on,format,product_id,title,brief,status,evidence,created_by,updated_by)values($1,1,$2,'slot',current_date,'banner','10','Colección','Borrador','reviewed',jsonb_build_object('targetWeek',jsonb_build_object('from',current_date,'to',current_date)),$3,$3)",[entry,calendar,actor]);
 const rpc=(org,version,task,publication)=>db.query('select marketing_record_execution($1,$2,$3,$4,$5::jsonb,$6::jsonb) id',[org,actor,entry,version,task?JSON.stringify(task):null,publication?JSON.stringify(publication):null]);
 await assert.rejects(()=>rpc(2,0,{stage:'preparing',owner:'Equipo',notes:''},null));
 await assert.rejects(()=>rpc(1,0,{stage:'ready',owner:'',assetUrl:null,notes:''},null));
 await rpc(1,0,{stage:'preparing',owner:'Equipo',assetUrl:'https://example.test/creative',notes:'En producción'},null);
 await assert.rejects(()=>rpc(1,0,{stage:'ready',owner:'Equipo',assetUrl:'https://example.test/creative',notes:''},null));
 const payload={id:pub,channel:'web',destinationUrl:'https://www.dmultisport.cl/brand/penn',publicationUrl:null,publishedAt:new Date(Date.now()-60000).toISOString(),activeUntil:null,assetUrl:'https://example.test/creative',notes:'Dos carretes',utm_source:'web',utm_medium:'internal',utm_campaign:'facto_contenido',utm_content:entry+'-web',snapshot:{title:'Colección',format:'banner',members:[{id:'10',name:'Carrete A',family:'Carretes'},{id:'11',name:'Carrete B',family:'Carretes'}]}};
 await assert.rejects(()=>rpc(1,1,null,{...payload,publishedAt:new Date(Date.now()+86400000).toISOString()}));
 await db.exec('set role service_role');
 await rpc(1,1,null,payload);
 await rpc(1,0,null,payload); // Same request retries safely even with an old task version.
 assert.equal((await db.query('select count(*)::int n from marketing_publications')).rows[0].n,1);
 assert.equal((await db.query('select status from marketing_calendar_entries')).rows[0].status,'done');
 assert.equal((await db.query("select jsonb_array_length(content_snapshot->'members') n from marketing_publications")).rows[0].n,2);
 await assert.rejects(()=>db.query("update marketing_calendar_entries set status='proposed' where id=$1",[entry]));
 await assert.rejects(()=>db.query("update marketing_calendar_entries set evidence='{}' where id=$1",[entry]));
 await assert.rejects(()=>rpc(1,1,null,{...payload,id:'00000000-0000-4000-8000-000000000031'}));
 const before=(await db.query('select count(*)::int n from marketing_workflow_events')).rows[0].n;
 assert.equal(before,3); // Preparation + planning status transition + publication.
 await db.exec('reset role');
 const acl=(await db.query("select relrowsecurity,has_table_privilege('anon',oid,'select') a,has_table_privilege('authenticated',oid,'select') b,has_table_privilege('service_role',oid,'insert') s from pg_class where oid in('public.marketing_entry_workflow'::regclass,'public.marketing_workflow_events'::regclass)")).rows;
 assert(acl.every(r=>r.relrowsecurity&&!r.a&&!r.b&&r.s));
 assert.equal((await db.query("select has_function_privilege('anon','marketing_record_execution(bigint,uuid,uuid,integer,jsonb,jsonb)','execute') x")).rows[0].x,false);
 await db.close();console.log('PASS: transactional publication, retries, concurrent edits, tenant FKs, real dates, multi-product snapshot, audit, immutable evidence, private ACL/RLS.');
})().catch(e=>{console.error(e);process.exit(1)});
