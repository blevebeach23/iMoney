import { describe, expect, it } from "vitest";
import { buildImportPreview, type ImportMapping, type ScopedImportCategory } from "@/lib/imports/mapping";
import type { Account } from "@/types/domain";

const accounts:Account[]=[{id:'bank',ownerUserId:'A',name:'Bank',type:'bank',openingBalance:'0.00',cachedBalance:'0.00',cachedAt:null,deletedAt:null}];
const categories:ScopedImportCategory[]=[
 {id:'personal',macroCategoryId:'P',name:'Supermercato',householdId:null,sortOrder:0,deletedAt:null},
 {id:'family',macroCategoryId:'F',name:'Supermercato',householdId:'H',sortOrder:0,deletedAt:null},
 {id:'foreign',macroCategoryId:'X',name:'Supermercato',householdId:'J',sortOrder:0,deletedAt:null}
];
const mapping:ImportMapping={columns:{date:'date',amount:'amount',category:'category',shared:'shared'},defaults:{categoryId:'personal',containerId:'account:bank',type:'expense',sharedWithFamily:false,householdId:'H',notes:''},missingCategoryStrategy:'create'};
function preview(rows:Record<string,string>[], opts:Partial<ImportMapping>={}, cats=categories){return buildImportPreview({rows,mapping:{...mapping,...opts},categories:cats,accounts,funds:[],existingMovements:[]});}
describe('CSV category scopes',()=>{
 it('resolves identical names independently for personal and household rows',()=>{
  const result=preview([{date:'22/10/2026',amount:'1,00',category:'Supermercato',shared:'no'},{date:'22/10/2026',amount:'2,00',category:'Supermercato',shared:'si'}]);
  expect(result.rows.map(r=>r.movement?.categoryId)).toEqual(['personal','family']);
 });
 it('never uses another household category as fallback',()=>{
  const result=preview([{date:'22/10/2026',amount:'1,00',category:'Supermercato',shared:'si'}],{missingCategoryStrategy:'default'},categories.filter(c=>c.id!=='family'));
  expect(result.rows[0].valid).toBe(false);
 });
 it('marks unknown names for explicit creation in the row scope',()=>{
  const result=preview([{date:'22/10/2026',amount:'1,00',category:'Custom family',shared:'si'}]);
  expect(result.rows[0].movement).toEqual(expect.objectContaining({categoryId:'',householdId:'H',sharedWithFamily:true,createCategoryName:'Custom family'}));
 });
 it('does not guess between same-name categories in different macros of the same scope',()=>{
  const result=preview([{date:'22/10/2026',amount:'1,00',category:'Supermercato',shared:'si'}],{},[...categories,{...categories[1],id:'second-family',macroCategoryId:'OTHER'}]);
  expect(result.rows[0].valid).toBe(false);
  expect(result.rows[0].errors.join(' ')).toContain('omonima');
 });
});
