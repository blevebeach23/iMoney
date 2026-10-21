import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";
import { buildVirtualCreditCardSettlementTransfers, getCreditCardForecasts, getCreditCardSettlementHistoryForUser } from "@/services/credit-cards/credit-card-service";
import { toDecimal } from "@/lib/calculations/money";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "10000000-0000-4000-8000-000000000001";
const stranger = "10000000-0000-4000-8000-000000000002";
const bank = "20000000-0000-4000-8000-000000000001";
const card = "20000000-0000-4000-8000-000000000002";
const cash = "20000000-0000-4000-8000-000000000003";
const category = "30000000-0000-4000-8000-000000000001";
let db: PGlite;
async function clock(date: string) {
  await db.exec(`create or replace function public.financial_today() returns date language sql stable as $$ select '${date}'::date $$;`);
}
async function sync() { return db.query<{ sync_financial_automation: number }>(`select public.sync_financial_automation('${owner}')`); }

describe("financial automation on PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      grant usage on schema auth to authenticated, service_role, anon;
    `);
    const migrations = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
      if (file.startsWith("038_")) {
        // Simulate a populated installation, including duplicates allowed before 038.
        await db.exec(`
          insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000003','legacy@example.test');
          insert into accounts(id,owner_user_id,name,type) values ('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','Legacy','bank');
          insert into macro_categories(id,owner_user_id,name) values ('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','Legacy');
          insert into categories(id,macro_category_id,name) values ('30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009','Legacy');
          insert into fixed_expenses(id,owner_user_id,account_id,category_id,amount,starts_on)
            values ('50000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000009',10,current_date-2);
          insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on,description,fixed_expense_id)
            select '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000009','expense',10,current_date-2,'Legacy','50000000-0000-4000-8000-000000000009' from generate_series(1,2);
        `);
      }
      // PGlite has core gen_random_uuid(); the pgcrypto extension is unnecessary here.
      const sql = readFileSync(join(migrations, file), "utf8").replace("create extension if not exists pgcrypto;", "");
      try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file}: ${String(error)}`); }
    }
    await clock("2026-10-28");
    await db.exec(`
      insert into auth.users(id,email) values ('${owner}','owner@example.test'), ('${stranger}','stranger@example.test');
      insert into accounts(id,owner_user_id,name,type,opening_balance,opening_balance_date) values
        ('${bank}','${owner}','Bank','bank',4250,'2026-09-01'),
        ('${card}','${owner}','Visa','credit_card',0,'2026-09-01'),
        ('${cash}','${owner}','Cash','cash',500,'2026-09-01');
      insert into macro_categories(id,owner_user_id,name) values ('40000000-0000-4000-8000-000000000001','${owner}','Home');
      insert into categories(id,macro_category_id,name) values ('${category}','40000000-0000-4000-8000-000000000001','Rent');
      select set_config('request.jwt.claim.sub','${owner}',false);
      select set_config('request.jwt.claim.role','authenticated',false);
      grant usage on schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      revoke insert, update, delete on recurring_occurrences from authenticated;
    `);
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("migrates existing rows without deleting duplicates or losing their occurrence identity", async () => {
    expect((await db.query("select count(*)::int as n from movements where description='Legacy' and fixed_expense_id is null")).rows[0]).toEqual({ n: 2 });
    expect((await db.query("select count(*)::int as n from recurring_occurrences where rule_id='50000000-0000-4000-8000-000000000009' and booked_on is not null")).rows[0]).toEqual({ n: 1 });
  });

  it("posts the 29th once, preserves edits/date changes/deletion, and continues in November", async () => {
    await db.exec(`insert into fixed_expenses(id,owner_user_id,account_id,category_id,amount,description,starts_on,ends_on,day_of_month)
      values ('50000000-0000-4000-8000-000000000001','${owner}','${bank}','${category}',100,'Monthly','2026-10-29','2026-11-29',29)`);
    await sync(); await sync();
    let rows = (await db.query<{ id: string; fixed_expense_id: string | null; amount: string }>("select * from movements where description='Monthly' order by occurred_on")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].fixed_expense_id).not.toBeNull();
    const id = rows[0].id;
    await clock("2026-10-29"); await sync(); await sync();
    expect((await db.query("select fixed_expense_id from movements where id=$1", [id])).rows[0]).toEqual({ fixed_expense_id: null });
    await clock("2026-10-30");
    await db.exec(`insert into balance_snapshots(owner_user_id,account_id,snapshot_date,balance) values ('${owner}','${bank}','2026-10-31',4150)`);
    await db.query("update movements set amount=95, occurred_on='2026-10-30' where id=$1", [id]);
    expect((await db.query("select invalidated_at is not null as invalid from balance_snapshots")).rows[0]).toEqual({ invalid: true });
    await sync();
    expect((await db.query("select amount from movements where occurred_on='2026-11-29' and description='Monthly'")).rows).toEqual([{ amount: "100.00" }]);
    await db.query("update movements set deleted_at=now() where id=$1", [id]);
    await db.exec(`insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on,description,fixed_expense_id)
      values ('${owner}','${bank}','${category}','expense',100,'2026-10-29','Replay','50000000-0000-4000-8000-000000000001')`);
    expect((await db.query("select count(*)::int as n from movements where description='Replay'")).rows[0]).toEqual({ n: 0 });
    await sync(); await sync();
    expect((await db.query("select count(*)::int as n from movements where description='Monthly' and occurred_on<'2026-11-01' and deleted_at is null")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("select booked_on::text, cancelled_at is not null as cancelled from recurring_occurrences where resource_id=$1", [id])).rows[0]).toEqual({ booked_on: "2026-10-29", cancelled: true });
    await clock("2026-11-29"); await sync();
    expect((await db.query("select amount, fixed_expense_id from movements where description='Monthly' and occurred_on='2026-11-29'")).rows).toEqual([{ amount: "100.00", fixed_expense_id: null }]);
  });

  it("catches up a missed occurrence and recurring transfer once on delayed access", async () => {
    await clock("2026-11-02");
    await db.exec(`
      insert into fixed_expenses(owner_user_id,account_id,category_id,amount,description,starts_on,ends_on,day_of_month)
        values ('${owner}','${bank}','${category}',100,'Delayed','2026-10-29','2026-10-29',29);
      insert into recurring_transfers(owner_user_id,from_account_id,to_account_id,amount,description,starts_on,ends_on,day_of_month)
        values ('${owner}','${bank}','${cash}',50,'Delayed transfer','2026-10-29','2026-10-29',29);
    `);
    await sync(); await sync();
    expect((await db.query("select count(*)::int as n from movements where description='Delayed' and fixed_expense_id is null")).rows[0]).toEqual({ n: 1 });
    expect((await db.query("select count(*)::int as n from transfers where description='Delayed transfer' and recurring_transfer_id is null")).rows[0]).toEqual({ n: 1 });
    await db.exec("update transfers set amount=45, deleted_at=now() where description='Delayed transfer'");
    await sync();
    expect((await db.query("select count(*)::int as n from transfers where description='Delayed transfer'")).rows[0]).toEqual({ n: 1 });
  });

  it("settles 800 once, then only 170 in the next cycle, rebuilding bank and card caches", async () => {
    await clock("2026-10-14");
    await db.exec(`
      insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day) values ('${card}','${bank}',14,15);
      insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on,description) values
        ('${owner}','${card}','${category}','expense',800,'2026-10-10','Card old'),
        ('${owner}','${card}','${category}','expense',100,'2026-10-16','Card new'),
        ('${owner}','${card}','${category}','expense',70,'2026-10-20','Card new');
    `);
    await sync();
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id is not null")).rows[0]).toEqual({ n: 0 });
    await clock("2026-10-15"); await sync(); await sync();
    expect((await db.query("select amount, occurred_on::text from transfers where credit_card_account_id is not null")).rows).toEqual([{ amount: "800.00", occurred_on: "2026-10-15" }]);
    await clock("2026-10-21"); await sync();
    expect((await db.query("select cached_balance from accounts where id=$1", [card])).rows[0]).toEqual({ cached_balance: "170.00" });
    await clock("2026-11-16"); await sync(); await sync();
    expect((await db.query("select amount, occurred_on::text from transfers where credit_card_account_id is not null order by occurred_on")).rows).toEqual([
      { amount: "800.00", occurred_on: "2026-10-15" }, { amount: "170.00", occurred_on: "2026-11-15" }
    ]);
    expect((await db.query("select cached_balance from accounts where id=$1", [card])).rows[0]).toEqual({ cached_balance: "0.00" });
    await db.exec("update transfers set deleted_at=now() where credit_card_account_id is not null and occurred_on='2026-10-15'");
    await sync();
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id is not null")).rows[0]).toEqual({ n: 2 });
  });

  it("deducts manual payments and carries refunds instead of charging them again", async () => {
    const secondCard = "20000000-0000-4000-8000-000000000004";
    await clock("2026-10-15");
    await db.exec(`
      insert into accounts(id,owner_user_id,name,type,opening_balance,opening_balance_date) values ('${secondCard}','${owner}','Second card','credit_card',300,'2026-09-01');
      insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day) values ('${secondCard}','${bank}',14,15);
      insert into transfers(owner_user_id,from_account_id,to_account_id,amount,occurred_on) values ('${owner}','${bank}','${secondCard}',300,'2026-10-05');
      insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on) values
        ('${owner}','${secondCard}','${category}','expense',100,'2026-10-10'),
        ('${owner}','${secondCard}','${category}','reimbursement',30,'2026-10-11'),
        ('${owner}','${secondCard}','${category}','reimbursement',100,'2026-10-16'),
        ('${owner}','${secondCard}','${category}','expense',120,'2026-11-10');
    `);
    await sync(); await sync();
    expect((await db.query("select amount from transfers where credit_card_account_id=$1", [secondCard])).rows).toEqual([{ amount: "70.00" }]);
    expect((await db.query("select cached_balance from accounts where id=$1", [secondCard])).rows[0]).toEqual({ cached_balance: "0.00" });
    await clock("2026-11-15"); await sync();
    expect((await db.query("select amount from transfers where credit_card_account_id=$1 order by occurred_on", [secondCard])).rows).toEqual([{ amount: "70.00" }, { amount: "20.00" }]);
  });

  it("keeps personal rows private and shares a single booked row with active household members", async () => {
    const household = "60000000-0000-4000-8000-000000000001";
    await clock("2026-11-02");
    await db.exec(`
      insert into households(id,name,created_by) values ('${household}','Family','${owner}');
      insert into household_members(household_id,user_id,role,status,joined_at) values
        ('${household}','${owner}','owner','ACTIVE',now()), ('${household}','${stranger}','member','ACTIVE',now());
      insert into fixed_expenses(owner_user_id,household_id,account_id,category_id,amount,description,starts_on,ends_on,day_of_month,shared_with_family)
        values ('${owner}','${household}','${bank}','${category}',30,'Family recurring','2026-10-29','2026-10-29',29,true);
    `);
    await Promise.all([sync(), sync()]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${stranger}',false)`);
    expect((await db.query("select description, fixed_expense_id from movements")).rows).toEqual([{ description: "Family recurring", fixed_expense_id: null }]);
    expect((await db.query("select * from recurring_occurrences")).rows).toEqual([]);
    await db.exec(`reset role; update household_members set status='REMOVED', removed_at=now() where user_id='${stranger}'`);
    await db.exec("set role authenticated");
    expect((await db.query("select * from movements")).rows).toEqual([]);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false)`);
  });

  it("retains a deleted settlement identity through the real history service, forecast and next posting", async () => {
    const regressionCard = "20000000-0000-4000-8000-000000000005";
    await clock("2026-10-14");
    await db.exec(`
      insert into accounts(id,owner_user_id,name,type,opening_balance,opening_balance_date)
        values ('${regressionCard}','${owner}','Regression card','credit_card',0,'2026-10-01');
      insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day)
        values ('${regressionCard}','${bank}',14,15);
      insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on) values
        ('${owner}','${regressionCard}','${category}','expense',800,'2026-10-10'),
        ('${owner}','${regressionCard}','${category}','expense',100,'2026-10-16'),
        ('${owner}','${regressionCard}','${category}','expense',70,'2026-10-20');
    `);
    // Thin PostgREST-shaped adapter: execute the history service's query on the
    // migrated PostgreSQL database, retaining its ownership and settlement filters.
    const historyClient = { from: () => ({ select: () => {
      let requestedOwner = "";
      let after: string | null = null;
      const query = {
        eq: (_column: string, value: string) => { requestedOwner = value; return query; },
        not: () => query, order: () => query, limit: () => query,
        gt: (_column: string, value: string) => { after = value; return query; },
        then: async (resolve: (value: unknown) => unknown) => {
          const result = await db.query(`select id, owner_user_id, credit_card_account_id, credit_card_cycle_end_on::text,
            amount, occurred_on::text, deleted_at::text from transfers
            where owner_user_id=$1 and credit_card_account_id is not null and ($2::uuid is null or id>$2::uuid)
            order by id limit 500`, [requestedOwner, after]);
          return resolve({ data: result.rows, error: null });
        }
      };
      return query;
    } }) } as unknown as SupabaseClient;
    const movements = (await db.query<Movement>(`select id, owner_user_id as "ownerUserId", household_id as "householdId",
      account_id as "accountId", fund_id as "fundId", category_id as "categoryId", type, amount, occurred_on::text as "occurredOn",
      description, notes, shared_with_family as "isSharedWithHousehold", reimbursement_for_movement_id as "reimbursementForMovementId",
      import_batch_id as "importBatchId", deleted_at::text as "deletedAt", created_by as "createdBy", updated_by as "updatedBy"
      from movements where account_id=$1`, [regressionCard])).rows;
    const accounts = (await db.query<Account>(`select id, owner_user_id as "ownerUserId", name, type,
      opening_balance as "openingBalance", opening_balance_date::text as "openingBalanceDate", cached_balance as "cachedBalance",
      cached_at::text as "cachedAt", deleted_at::text as "deletedAt" from accounts where id=$1 or id=$2`, [bank, regressionCard])).rows;
    const settings: CreditCardSettings[] = [{ id: "regression-settings", accountId: regressionCard, settlementAccountId: bank,
      statementClosingDay: 14, paymentDay: 15, automaticSettlement: true, createdAt: "2026-10-01", updatedAt: "2026-10-01" }];
    const forecast = async (today: string) => {
      const transfers = (await db.query<Transfer>(`select id, owner_user_id as "ownerUserId", household_id as "householdId",
        from_account_id as "fromAccountId", to_account_id as "toAccountId", from_fund_id as "fromFundId", to_fund_id as "toFundId",
        amount, occurred_on::text as "occurredOn", description, shared_with_family as "isSharedWithHousehold", deleted_at::text as "deletedAt",
        credit_card_account_id as "creditCardAccountId", credit_card_cycle_start_on::text as "creditCardCycleStartOn",
        credit_card_cycle_end_on::text as "creditCardCycleEndOn" from transfers where deleted_at is null
        and (from_account_id=$1 or to_account_id=$1)`, [regressionCard])).rows;
      const settlementHistory = await getCreditCardSettlementHistoryForUser(historyClient, owner);
      return { transfers, settlementHistory, forecasts: getCreditCardForecasts({ accounts, settings, movements, transfers, settlementHistory, today, bankBalances: [] }) };
    };
    await sync();
    await clock("2026-10-15"); await sync(); await sync();
    const posted = (await db.query<{ id: string; amount: string }>("select id, amount from transfers where credit_card_account_id=$1", [regressionCard])).rows;
    expect(posted).toHaveLength(1);
    expect(posted[0].amount).toBe("800.00");
    await clock("2026-10-21"); await sync();
    expect((await forecast("2026-10-21")).forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-15", "170.00"]]);
    const bankBefore = (await db.query<{ balance: string }>("select cached_balance as balance from accounts where id=$1", [bank])).rows[0].balance;
    await db.query("update transfers set deleted_at=now() where id=$1 and owner_user_id=$2", [posted[0].id, owner]);
    await sync(); await sync();
    const after = await forecast("2026-10-21");
    expect(after.transfers).toEqual([]);
    expect(after.settlementHistory.find((entry) => entry.creditCardAccountId === regressionCard)?.deletedAt).not.toBeNull();
    expect(after.forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-15", "170.00"]]);
    expect(buildVirtualCreditCardSettlementTransfers(owner, after.forecasts, after.settlementHistory).map((t) => t.amount)).toEqual(["170.00"]);
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id=$1", [regressionCard])).rows[0]).toEqual({ n: 1 });
    const bankAfter = (await db.query<{ balance: string }>("select cached_balance as balance from accounts where id=$1", [bank])).rows[0].balance;
    expect(toDecimal(bankAfter).minus(bankBefore).toFixed(2)).toBe("800.00");
    expect((await db.query("select cached_balance from accounts where id=$1", [regressionCard])).rows[0]).toEqual({ cached_balance: "970.00" });
    await clock("2026-11-15"); await sync(); await sync();
    expect((await db.query("select amount, deleted_at is not null as deleted from transfers where credit_card_account_id=$1 order by occurred_on", [regressionCard])).rows)
      .toEqual([{ amount: "800.00", deleted: true }, { amount: "170.00", deleted: false }]);
    expect((await forecast("2026-11-15")).forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-12-15", "0.00"]]);
    // RLS must still hide all of this owner's private settlement metadata.
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${stranger}',false)`);
    expect(await getCreditCardSettlementHistoryForUser(historyClient, owner)).toEqual([]);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false)`);
  });

  it("denies cross-owner and anonymous RPC calls and keeps the ledger private under RLS", async () => {
    await db.exec("set role authenticated");
    await expect(db.query(`select public.sync_financial_automation('${stranger}')`)).rejects.toThrow("Unauthorized");
    await db.exec(`select set_config('request.jwt.claim.sub','${stranger}',false)`);
    expect((await db.query("select * from recurring_occurrences")).rows).toEqual([]);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false)");
    await expect(sync()).rejects.toThrow("Unauthorized");
  });
});
