import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultCategoryGroups } from "@/lib/categories/default-taxonomy";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import type { Movement, Budget } from "@/types/domain";

const a="10000000-0000-4000-8000-000000000011", b="10000000-0000-4000-8000-000000000012", other="10000000-0000-4000-8000-000000000013";
const h="60000000-0000-4000-8000-000000000011", h2="60000000-0000-4000-8000-000000000012";
let db: PGlite;
let personalA: string, personalB: string, family: string, foreignFamily: string, bankA: string, bankB: string;
let before: unknown;
let relatedBefore: unknown;
async function scalar(sql: string) { return (await db.query<Record<string,string>>(sql)).rows[0].id; }
async function actor(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
}
async function category(name: string, owner: string|null, household: string|null=null) {
  return scalar(`select c.id from categories c join macro_categories mc on mc.id=c.macro_category_id where c.name='${name}' and mc.owner_user_id ${owner?`='${owner}'`:'is null'} and mc.household_id ${household?`='${household}'`:'is null'} limit 1`);
}

describe("personal and household category taxonomies on PostgreSQL",()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      grant usage on schema auth to authenticated,anon,service_role;`);
    const dir=join(process.cwd(),"supabase/migrations");
    for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
      if(file.startsWith('044_')){
        await db.exec(`insert into auth.users(id,email) values ('${a}','a@example.test'),('${b}','b@example.test'),('${other}','c@example.test');
          insert into households(id,name,created_by) values ('${h}','Shared','${a}'),('${h2}','Separate','${other}');
          insert into household_members(household_id,user_id,role,status,joined_at) values ('${h}','${a}','owner','ACTIVE',now()),('${h}','${b}','member','ACTIVE',now()),('${h2}','${other}','owner','ACTIVE',now());
          insert into accounts(owner_user_id,name,type) values ('${a}','A','bank'),('${b}','B','bank');
          insert into macro_categories(owner_user_id,name) values ('${a}','ALIMENTARI'),('${b}',' alimentari '),('${a}','CASA');
          insert into categories(macro_category_id,name) select id,case when owner_user_id='${a}' then 'Supermercato' else ' supermercato ' end from macro_categories where lower(trim(name))='alimentari';
          insert into categories(macro_category_id,name) select id,'Casa Tiggiano' from macro_categories where name='CASA';`);
        personalA=await category('Supermercato',a); personalB=await category(' supermercato ',b);
        bankA=await scalar(`select id from accounts where owner_user_id='${a}'`); bankB=await scalar(`select id from accounts where owner_user_id='${b}'`);
        const custom=await category('Casa Tiggiano',a);
        await db.exec(`insert into movements(owner_user_id,household_id,shared_with_family,account_id,category_id,type,amount,occurred_on,description,created_by,updated_by) values
          ('${a}','${h}',true,'${bankA}','${personalA}','expense',10,current_date,'legacy A','${a}','${a}'),
          ('${b}','${h}',true,'${bankB}','${personalB}','expense',20,current_date,'legacy B','${b}','${b}'),
          ('${a}','${h}',true,'${bankA}','${custom}','expense',30,current_date,'custom history','${a}','${a}'),
          ('${a}',null,false,'${bankA}','${personalA}','expense',5,current_date,'private','${a}','${a}');`);
        await db.exec(`insert into fixed_expenses(owner_user_id,household_id,shared_with_family,account_id,category_id,amount,description,starts_on,ends_on,day_of_month)
          values ('${b}','${h}',true,'${bankB}','${personalB}',8,'Legacy recurring',current_date+1,current_date+1,extract(day from current_date+1)::int);
          insert into movement_requests(household_id,created_by_user_id,recipient_user_id,description,movement_type,amount,category_id,movement_date)
          values ('${h}','${a}','${b}','Legacy request','expense',4,'${personalA}',current_date);
          insert into fixed_expense_requests(household_id,created_by_user_id,recipient_user_id,description,amount,category_id,starts_on,day_of_month)
          values ('${h}','${a}','${b}','Legacy recurring request',4,'${personalA}',current_date,1);
          insert into budgets(owner_type,household_id,month,category_id,amount)
          values ('HOUSEHOLD','${h}',date_trunc('month',current_date),'${personalA}',100);
          insert into budgets(owner_type,household_id,month,macro_category_id,amount)
          select 'HOUSEHOLD','${h}',date_trunc('month',current_date),id,200 from macro_categories where name='CASA' and owner_user_id='${a}';`);
        before=(await db.query(`select to_jsonb(m)-'category_id' as row from movements m order by id`)).rows;
        relatedBefore=(await db.query(`select * from (select 'rule' as kind,to_jsonb(r)-'category_id' as row from fixed_expenses r
          union all select 'request',to_jsonb(r)-'category_id' from movement_requests r
          union all select 'fixed_request',to_jsonb(r)-'category_id' from fixed_expense_requests r
          union all select 'budget',to_jsonb(r)-'category_id'-'macro_category_id' from budgets r) records order by kind,row::text`)).rows;
      }
      await db.exec(readFileSync(join(dir,file),'utf8').replace('create extension if not exists pgcrypto;',''));
    }
    family=await category('Supermercato',null,h); foreignFamily=await category('Supermercato',null,h2);
    await db.exec(`grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
      revoke insert,update,delete on recurring_occurrences from authenticated;`);
  },60000);
  beforeEach(async()=>{await db.exec('reset role');});
  afterAll(async()=>{await db?.close();});

  it('uses exactly the requested defaults for new taxonomies, with no user-specific labels',async()=>{
    expect((await db.query('select category_default_taxonomy() as taxonomy')).rows[0]).toEqual({taxonomy:defaultCategoryGroups});
    await actor(a); await db.exec('select initialize_personal_categories()');
    expect(await category('Stipendio',a)).toBeTruthy();
    expect((await db.query(`select c.name from categories c join macro_categories mc on mc.id=c.macro_category_id where mc.household_id='${h2}' and c.name in ('Casa Tiggiano','Vespa')`)).rows).toEqual([]);
  });
  it('A and B see only their own personal categories; identical names do not interfere (A,B,F,G)',async()=>{
    await actor(a); expect((await db.query('select id from categories where id=$1',[personalB])).rows).toEqual([]);
    expect((await db.query('select id from categories where id=$1',[personalA])).rows).toHaveLength(1);
    await actor(b); expect((await db.query('select id from categories where id=$1',[personalA])).rows).toEqual([]);
    expect((await db.query('select id from categories where id=$1',[personalB])).rows).toHaveLength(1);
  });
  it('migrates history by household+trimmed macro+category and preserves every other movement field (H,I)',async()=>{
    expect((await db.query(`select to_jsonb(m)-'category_id' as row from movements m order by id`)).rows).toEqual(before);
    expect((await db.query(`select count(distinct category_id)::int as n from movements where description in ('legacy A','legacy B')`)).rows[0]).toEqual({n:1});
    expect((await db.query(`select category_id from movements where description='legacy A'`)).rows[0]).toEqual({category_id:family});
    expect(await category('Casa Tiggiano',null,h)).toBeTruthy();
    expect(await category('Casa Tiggiano',a)).toBeTruthy();
    expect((await db.query(`select * from (select 'rule' as kind,to_jsonb(r)-'category_id' as row from fixed_expenses r
      union all select 'request',to_jsonb(r)-'category_id' from movement_requests r
      union all select 'fixed_request',to_jsonb(r)-'category_id' from fixed_expense_requests r
      union all select 'budget',to_jsonb(r)-'category_id'-'macro_category_id' from budgets r) records order by kind,row::text`)).rows).toEqual(relatedBefore);
    expect((await db.query(`select category_id from movement_requests where description='Legacy request'`)).rows[0]).toEqual({category_id:family});
    expect((await db.query(`select mc.household_id from budgets b join macro_categories mc on mc.id=b.macro_category_id where b.household_id='${h}'`)).rows).toEqual([{household_id:h}]);
  });
  it('shares one household category and lets B use a custom category created by authorized A (C,D,E)',async()=>{
    await actor(a);
    const macro=await scalar(`select id from macro_categories where household_id='${h}' and name='CASA'`);
    await db.query(`insert into categories(macro_category_id,name) values ($1,'Family custom')`,[macro]);
    const id=await category('Family custom',null,h);
    await actor(b); expect(await category('Family custom',null,h)).toBe(id);
    await db.query(`insert into movements(owner_user_id,household_id,shared_with_family,account_id,category_id,type,amount,occurred_on) values ('${b}','${h}',true,'${bankB}',$1,'expense',1,current_date)`,[id]);
  });
  it('rejects crossing personal/family scopes and another household, including service writers (J,K,L)',async()=>{
    await actor(a);
    const insert=(cat:string,shared:boolean,household:string|null)=>db.query(`insert into movements(owner_user_id,household_id,shared_with_family,account_id,category_id,type,amount,occurred_on) values ($1,$2,$3,$4,$5,'expense',1,current_date)`,[a,household,shared,bankA,cat]);
    await expect(insert(personalB,false,null)).rejects.toThrow();
    await expect(insert(family,false,null)).rejects.toThrow();
    await expect(insert(personalA,true,h)).rejects.toThrow();
    await expect(insert(foreignFamily,true,h)).rejects.toThrow();
    expect((await db.query('select id from categories where id=$1',[foreignFamily])).rows).toEqual([]);
    await db.exec('reset role'); await expect(insert(personalA,true,h)).rejects.toThrow(/taxonomy/);
    await expect(db.exec(`update movements set shared_with_family=true,household_id='${h}' where description='private'`)).rejects.toThrow(/taxonomy/);
    await expect(db.exec(`update movements set shared_with_family=false,household_id=null where description='legacy A'`)).rejects.toThrow(/taxonomy/);
  });
  it('family budgets use only household taxonomy and report referential deletion protection (M,O)',async()=>{
    await actor(a);
    const macro=await scalar(`select id from macro_categories where owner_user_id='${a}' and name='CASA'`);
    await expect(db.query(`insert into budgets(owner_type,household_id,month,category_id,amount) values ('HOUSEHOLD','${h}',date_trunc('month',current_date),$1,10)`,[personalA])).rejects.toThrow();
    await db.query(`insert into budgets(owner_type,owner_user_id,month,macro_category_id,amount) values ('USER','${a}',date_trunc('month',current_date),$1,10)`,[macro]);
    const info=await db.query<{reasons:string[]}>(`select reasons from get_category_deletion_info('{}',array['${macro}'::uuid])`);
    expect(info.rows[0].reasons).toContain('budget');
    await expect(db.query('select delete_category_if_unused($1)',[family])).rejects.toThrow(/referenziata/);
    await expect(db.query('select delete_macro_category_if_unused($1)',[macro])).rejects.toThrow(/referenziata|categorie figlie/);
    await actor(b); expect((await db.query(`select * from get_category_deletion_info(array['${personalA}'::uuid],'{}')`)).rows).toEqual([]);
  });
  it('family recurring rules generate household occurrences and retain lifecycle after deletion (N)',async()=>{
    await actor(a);
    await db.query(`insert into fixed_expenses(owner_user_id,household_id,shared_with_family,account_id,category_id,amount,description,starts_on,ends_on,day_of_month) values ('${a}','${h}',true,'${bankA}',$1,3,'Scoped recurring',public.financial_today(),public.financial_today(),extract(day from public.financial_today())::int)`,[family]);
    await db.query('select sync_financial_automation($1)',[a]);
    expect((await db.query(`select category_id,fixed_expense_id from movements where description='Scoped recurring'`)).rows).toEqual([{category_id:family,fixed_expense_id:null}]);
    await db.exec(`update movements set deleted_at=now() where description='Scoped recurring'`);
    await db.query('select sync_financial_automation($1)',[a]);
    expect((await db.query(`select count(*)::int as n from movements where description='Scoped recurring'`)).rows[0]).toEqual({n:1});
  });
  it('creates valid independent personal movements for A and B (A,B)',async()=>{
    for(const [owner,cat,bank] of [[a,personalA,bankA],[b,personalB,bankB]]){
      await actor(owner);
      await db.query(`insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on,description) values ($1,$2,$3,'expense',1,current_date,'new private')`,[owner,bank,cat]);
      expect((await db.query(`select owner_user_id from movements where description='new private'`)).rows).toEqual([{owner_user_id:owner}]);
    }
  });
  it('new household seeds are complete and personal default initialization is idempotent',async()=>{
    await actor(a);
    const created=await scalar(`select create_household('New test household') as id`);
    expect((await db.query(`select count(*)::int as n from categories c join macro_categories mc on mc.id=c.macro_category_id where mc.household_id=$1`,[created])).rows[0]).toEqual({n:50});
    await db.exec('select initialize_personal_categories(); select initialize_personal_categories();');
    expect((await db.query(`select count(*)::int as n from categories c join macro_categories mc on mc.id=c.macro_category_id where mc.owner_user_id='${a}' and c.name='Supermercato'`)).rows[0]).toEqual({n:1});
  });
  it('cannot move category or macro ownership across scope, even using direct SQL',async()=>{
    const familyMacro=await scalar(`select macro_category_id as id from categories where id='${family}'`);
    await expect(db.query('update categories set macro_category_id=$1 where id=$2',[familyMacro,personalA])).rejects.toThrow(/taxonomies/);
    await expect(db.query('update macro_categories set household_id=null,owner_user_id=$1 where id=$2',[a,familyMacro])).rejects.toThrow(/immutable/);
  });
  it('family statistics and budgets aggregate both owners under one household category (M)',async()=>{
    await actor(a);
    const rows=(await db.query<{id:string;category_id:string;owner_user_id:string;amount:string}>(`select id,category_id,owner_user_id,amount from movements where description in ('legacy A','legacy B')`)).rows;
    const movements:Movement[]=rows.map(r=>({id:r.id,categoryId:r.category_id,ownerUserId:r.owner_user_id,householdId:h,accountId:bankA,fundId:null,type:'expense',amount:r.amount,occurredOn:'2026-10-22',description:'fixture',isSharedWithHousehold:true,deletedAt:null,notes:'',reimbursementForMovementId:null,fixedExpenseId:null,importBatchId:null,createdBy:r.owner_user_id,updatedBy:r.owner_user_id}));
    const macro=await scalar(`select macro_category_id as id from categories where id='${family}'`);
    const info=new Map([[family,{categoryId:family,categoryName:'Supermercato',macroCategoryId:macro,macroCategoryName:'ALIMENTARI'}]]);
    expect(calculateCategoryAggregates(movements,info).categories).toEqual([expect.objectContaining({categoryId:family,netExpenses:'30.00'})]);
    expect((await db.query(`select category_id from budgets where household_id='${h}' and category_id is not null`)).rows).toEqual([{category_id:family}]);
    const budget:Budget={id:'fixture',ownerType:'HOUSEHOLD',ownerUserId:null,householdId:h,month:'2026-10-01',macroCategoryId:null,categoryId:family,amount:'100.00',deletedAt:null};
    const report=calculateBudgetReport([budget],movements,info);
    expect(report.categories[0].usage.used).toBe('30.00');
  });
  it('category archival does not block existing recurring financial synchronization',async()=>{
    await actor(a);
    await db.query('select deactivate_category($1)',[personalA]);
    await db.query(`insert into fixed_expenses(owner_user_id,account_id,category_id,amount,description,starts_on,ends_on,day_of_month) values ('${a}','${bankA}',$1,2,'Archived category recurring',public.financial_today(),public.financial_today(),extract(day from public.financial_today())::int)`,[personalA]);
    await expect(db.query('select sync_financial_automation($1)',[a])).resolves.toBeDefined();
    expect((await db.query(`select count(*)::int as n from movements where description='Archived category recurring'`)).rows[0]).toEqual({n:1});
  });
});
