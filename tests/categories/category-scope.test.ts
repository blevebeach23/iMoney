import { describe, expect, it } from "vitest";
import { categoryOptionsForScope, categoryAfterScopeChange } from "@/lib/categories/scope";
import { personalViewMovements } from "@/lib/movements/view-scope";
import type { CategoryTreeItem } from "@/services/categories/category-service";

function tree(id:string, ownerUserId:string|null, householdId:string|null):CategoryTreeItem {
 return {id,name:"ALIMENTARI",ownerUserId,householdId,sortOrder:0,deletedAt:null,deletion:{canDelete:true,reasons:[]},
  categories:[{id:id+"-category",name:"Supermercato",macroCategoryId:id,sortOrder:0,deletedAt:null,deletion:{canDelete:true,reasons:[]}}]};
}
describe('category scope selectors',()=>{
 const categories=[tree('personal','A',null),tree('family',null,'H'),tree('other-family',null,'J')];
 it('offers only personal categories in the personal form',()=>{
  expect(categoryOptionsForScope(categories,null).map(c=>c.value)).toEqual(['personal-category']);
 });
 it('offers only categories of the selected household',()=>{
  expect(categoryOptionsForScope(categories,'H').map(c=>c.value)).toEqual(['family-category']);
 });
 it('clears a personal selection on change to Family (K)',()=>{
  expect(categoryAfterScopeChange(null,'H','personal-category')).toBe('');
 });
 it('clears a Family selection on change to Personal or another household (L)',()=>{
  expect(categoryAfterScopeChange('H',null,'family-category')).toBe('');
  expect(categoryAfterScopeChange('H','J','family-category')).toBe('');
 });
 it('retains selection only within the same scope',()=>{
  expect(categoryAfterScopeChange('H','H','family-category')).toBe('family-category');
 });
 it('defaults the personal view to non-shared rows and can include only the supplied owned shared rows',()=>{
  const owned=[{id:'private',isSharedWithHousehold:false},{id:'shared',isSharedWithHousehold:true}];
  expect(personalViewMovements(owned).map(m=>m.id)).toEqual(['private']);
  expect(personalViewMovements(owned,true)).toEqual(owned);
 });
});
