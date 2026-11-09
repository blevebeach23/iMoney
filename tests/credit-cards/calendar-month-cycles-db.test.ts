import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "10000000-0000-4000-8000-000000000001";
const bank = "20000000-0000-4000-8000-000000000001";
const card = "20000000-0000-4000-8000-000000000002";
const category = "30000000-0000-4000-8000-000000000001";
let db: PGlite;
let legacyTransfer: Record<string, unknown>;

async function clock(date: string) {
  await db.exec(`create or replace function public.financial_today() returns date language sql stable as $$ select '${date}'::date $$;`);
}
async function sync() {
  return db.query(`select public.sync_financial_automation('${owner}')`);
}

describe("calendar-month card migration on PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
      if (file.startsWith("048_")) {
        await clock("2026-11-09");
        await db.exec(`
          insert into auth.users(id,email) values ('${owner}','calendar@example.test');
          select set_config('request.jwt.claim.sub','${owner}',false);
          select set_config('request.jwt.claim.role','authenticated',false);
          insert into accounts(id,owner_user_id,name,type,opening_balance,opening_balance_date) values
            ('${bank}','${owner}','Bank','bank',1000,'2026-01-01'),
            ('${card}','${owner}','Legacy card','credit_card',0,'2026-01-01');
          insert into macro_categories(id,owner_user_id,name) values ('40000000-0000-4000-8000-000000000001','${owner}','Home');
          insert into categories(id,macro_category_id,name) values ('${category}','40000000-0000-4000-8000-000000000001','Groceries');
          insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day)
            values ('${card}','${bank}',30,5);
          insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on) values
            ('${owner}','${card}','${category}','expense',200,'2026-10-30'),
            ('${owner}','${card}','${category}','expense',50,'2026-10-31'),
            ('${owner}','${card}','${category}','expense',120,'2026-11-10');
          insert into transfers(owner_user_id,from_account_id,to_account_id,amount,occurred_on,
            credit_card_account_id,credit_card_cycle_start_on,credit_card_cycle_end_on)
            values ('${owner}','${bank}','${card}',200,'2026-11-05','${card}','2026-10-01','2026-10-30');
          insert into accounts(id,owner_user_id,name,type) values
            ('20000000-0000-4000-8000-000000000003','${owner}','Archived card','credit_card'),
            ('20000000-0000-4000-8000-000000000004','${owner}','Archived bank','bank');
          insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day)
            values ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',14,15);
          update accounts set deleted_at=now() where id in ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004');
        `);
        legacyTransfer = (await db.query<Record<string, unknown>>("select * from transfers where credit_card_account_id=$1", [card])).rows[0];
      }
      await db.exec(readFileSync(join(directory, file), "utf8").replace("create extension if not exists pgcrypto;", ""));
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("migrates settings, preserves historical transfers exactly and never reposts the legacy month", async () => {
    expect((await db.query("select statement_closing_day,payment_day from credit_card_settings where account_id=$1", [card])).rows[0])
      .toEqual({ statement_closing_day: 31, payment_day: 5 });
    expect((await db.query("select statement_closing_day,payment_day from credit_card_settings where account_id='20000000-0000-4000-8000-000000000003'")).rows[0])
      .toEqual({ statement_closing_day: 31, payment_day: 15 });
    expect((await db.query("select tgenabled from pg_trigger where tgname='credit_card_settings_validate_row'")).rows[0]).toEqual({ tgenabled: "O" });
    expect((await db.query("select * from transfers where credit_card_account_id=$1", [card])).rows).toEqual([legacyTransfer]);
    await sync(); await sync();
    expect((await db.query("select * from transfers where credit_card_account_id=$1", [card])).rows).toEqual([legacyTransfer]);
    // Even an explicit attempt to insert the normalized identity is idempotent.
    await db.exec(`insert into transfers(owner_user_id,from_account_id,to_account_id,amount,occurred_on,
      credit_card_account_id,credit_card_cycle_start_on,credit_card_cycle_end_on)
      values ('${owner}','${bank}','${card}',250,'2026-11-05','${card}','2026-10-01','2026-10-31')`);
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id=$1", [card])).rows[0]).toEqual({ n: 1 });
  });

  it("preserves deleted legacy allocation and settles only the unpaid carry plus the next calendar month", async () => {
    await db.query("update transfers set deleted_at=now() where id=$1", [legacyTransfer.id]);
    await sync();
    expect((await db.query("select cached_balance from accounts where id=$1", [bank])).rows[0]).toEqual({ cached_balance: "1000.00" });
    await clock("2026-12-04"); await sync();
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id=$1", [card])).rows[0]).toEqual({ n: 1 });
    await clock("2026-12-05"); await sync(); await sync();
    expect((await db.query(`select amount,occurred_on::text,credit_card_cycle_start_on::text,credit_card_cycle_end_on::text
      from transfers where credit_card_account_id=$1 and deleted_at is null`, [card])).rows).toEqual([
      { amount: "170.00", occurred_on: "2026-12-05", credit_card_cycle_start_on: "2026-11-01", credit_card_cycle_end_on: "2026-11-30" }
    ]);
    expect((await db.query("select cached_balance from accounts where id=$1", [bank])).rows[0]).toEqual({ cached_balance: "830.00" });
    // Deleted payment still increases actual debt, while its closed allocation is preserved.
    expect((await db.query("select cached_balance from accounts where id=$1", [card])).rows[0]).toEqual({ cached_balance: "200.00" });
    expect((await db.query("select credit_card_cycle_end_on::text from transfers where id=$1", [legacyTransfer.id])).rows[0]).toEqual({ credit_card_cycle_end_on: "2026-10-30" });
  });

  it("rejects new mid-month settings and new non-calendar settlement identities", async () => {
    await expect(db.query("update credit_card_settings set statement_closing_day=14 where account_id=$1", [card])).rejects.toThrow();
    await expect(db.exec(`insert into transfers(owner_user_id,from_account_id,to_account_id,amount,occurred_on,
      credit_card_account_id,credit_card_cycle_start_on,credit_card_cycle_end_on)
      values ('${owner}','${bank}','${card}',10,'2027-02-05','${card}','2027-01-01','2027-01-30')`)).rejects.toThrow("calendar month");
  });

  it.each([
    ["2026-01-31", "2026-02-05"], ["2026-02-28", "2026-03-05"],
    ["2028-02-29", "2028-03-05"], ["2026-04-30", "2026-05-05"], ["2026-12-31", "2027-01-05"]
  ])("includes the last-day purchase on %s in the payment on %s", async (closing, payment) => {
    const boundaryCard = crypto.randomUUID();
    await db.query(`insert into accounts(id,owner_user_id,name,type,opening_balance_date) values ($1,$2,$3,'credit_card',$4)`, [boundaryCard, owner, `Boundary ${closing}`, closing.slice(0, 7) + "-01"]);
    await db.query(`insert into credit_card_settings(account_id,settlement_account_id,statement_closing_day,payment_day) values ($1,$2,31,5)`, [boundaryCard, bank]);
    await db.query(`insert into movements(owner_user_id,account_id,category_id,type,amount,occurred_on) values ($1,$2,$3,'expense',10,$4)`, [owner, boundaryCard, category, closing]);
    await clock(closing); await sync();
    expect((await db.query("select count(*)::int as n from transfers where credit_card_account_id=$1", [boundaryCard])).rows[0]).toEqual({ n: 0 });
    await clock(payment); await sync(); await sync();
    expect((await db.query(`select amount,occurred_on::text,credit_card_cycle_start_on::text,credit_card_cycle_end_on::text
      from transfers where credit_card_account_id=$1`, [boundaryCard])).rows).toEqual([
      { amount: "10.00", occurred_on: payment, credit_card_cycle_start_on: closing.slice(0, 7) + "-01", credit_card_cycle_end_on: closing }
    ]);
  });
});
