-- 名單加上財務與決策的自由文字。欄位可空，最長 200 字。
-- 不改權限。請自己在 SQL Editor 執行，這次沒有套到正式資料庫。

alter table public.customers
  add column if not exists work_role text,
  add column if not exists income text,
  add column if not exists expense text,
  add column if not exists debt text,
  add column if not exists decision_maker text,
  add column if not exists influence_factor text,
  add column if not exists competitor text;

alter table public.customers
  drop constraint if exists customers_work_role_len,
  drop constraint if exists customers_income_len,
  drop constraint if exists customers_expense_len,
  drop constraint if exists customers_debt_len,
  drop constraint if exists customers_decision_maker_len,
  drop constraint if exists customers_influence_factor_len,
  drop constraint if exists customers_competitor_len;

alter table public.customers
  add constraint customers_work_role_len check (work_role is null or char_length(work_role) <= 200),
  add constraint customers_income_len check (income is null or char_length(income) <= 200),
  add constraint customers_expense_len check (expense is null or char_length(expense) <= 200),
  add constraint customers_debt_len check (debt is null or char_length(debt) <= 200),
  add constraint customers_decision_maker_len check (decision_maker is null or char_length(decision_maker) <= 200),
  add constraint customers_influence_factor_len check (influence_factor is null or char_length(influence_factor) <= 200),
  add constraint customers_competitor_len check (competitor is null or char_length(competitor) <= 200);

comment on column public.customers.work_role is '工作。自由文字，不要貼身分證或完整帳戶。';
comment on column public.customers.income is '收入。自由文字。';
comment on column public.customers.expense is '支出。自由文字。';
comment on column public.customers.debt is '負債。自由文字。';
comment on column public.customers.decision_maker is '決策者。自由文字。';
comment on column public.customers.influence_factor is '影響因子。自由文字。';
comment on column public.customers.competitor is '競爭者。自由文字。';
