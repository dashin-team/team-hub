-- 名單擴充與五項度客戶分析。
-- 在已經跑過 202411170001、202411170002 的專案執行一次。
-- 仍不存放身分證、病歷文件、完整保單號碼、銀行帳戶或信用卡。
-- birth_date 是生日（含年份），畫面用民國年顯示。birthday_md 繼續只留月日，給生日提醒用。

alter table public.customers
  add column nickname text,
  add column birth_date date,
  add column gender text,
  add column referrer text,
  add column contact_method text,
  add column hobbies text,
  add column lead_source text,
  add column relation_social smallint,
  add column relation_business smallint,
  add column analysis_worry text,
  add column analysis_dream text,
  add column analysis_work text,
  add column analysis_existing text,
  add column analysis_insured text,
  add column analysis_beneficiary text,
  add column analysis_pay_method text,
  add column analysis_decision text,
  add column analysis_health text,
  add column analysis_next text,
  add column analysis_family text;

alter table public.customers
  add constraint customers_nickname_len check (nickname is null or char_length(nickname) <= 80),
  add constraint customers_gender_chk check (gender is null or gender in ('男', '女')),
  add constraint customers_referrer_len check (referrer is null or char_length(referrer) <= 80),
  add constraint customers_contact_len check (contact_method is null or char_length(contact_method) <= 120),
  add constraint customers_hobbies_len check (hobbies is null or char_length(hobbies) <= 200),
  add constraint customers_source_len check (lead_source is null or char_length(lead_source) <= 80),
  add constraint customers_relation_social_chk check (relation_social is null or relation_social between 1 and 10),
  add constraint customers_relation_business_chk check (relation_business is null or relation_business between 1 and 10),
  add constraint customers_analysis_worry_len check (analysis_worry is null or char_length(analysis_worry) <= 4000),
  add constraint customers_analysis_dream_len check (analysis_dream is null or char_length(analysis_dream) <= 4000),
  add constraint customers_analysis_work_len check (analysis_work is null or char_length(analysis_work) <= 4000),
  add constraint customers_analysis_existing_len check (analysis_existing is null or char_length(analysis_existing) <= 4000),
  add constraint customers_analysis_insured_len check (analysis_insured is null or char_length(analysis_insured) <= 80),
  add constraint customers_analysis_beneficiary_len check (analysis_beneficiary is null or char_length(analysis_beneficiary) <= 80),
  add constraint customers_analysis_pay_len check (analysis_pay_method is null or char_length(analysis_pay_method) <= 80),
  add constraint customers_analysis_decision_len check (analysis_decision is null or char_length(analysis_decision) <= 4000),
  add constraint customers_analysis_health_len check (analysis_health is null or char_length(analysis_health) <= 4000),
  add constraint customers_analysis_next_len check (analysis_next is null or char_length(analysis_next) <= 4000),
  add constraint customers_analysis_family_len check (analysis_family is null or char_length(analysis_family) <= 4000);

create or replace function public.sync_customer_birthday_md()
returns trigger
language plpgsql
as $$
begin
  if new.birth_date is not null then
    new.birthday_md := to_char(new.birth_date, 'MM-DD');
  end if;
  return new;
end;
$$;

create trigger trg_customers_birthday_md
before insert or update of birth_date on public.customers
for each row execute function public.sync_customer_birthday_md();

revoke all on function public.sync_customer_birthday_md() from public, anon;
grant execute on function public.sync_customer_birthday_md() to authenticated, service_role;

comment on column public.customers.birth_date is '生日（含年份）。畫面顯示民國年。不存身分證。';
comment on column public.customers.relation_social is '關係定位：社交 1 到 10 分。';
comment on column public.customers.relation_business is '關係定位：商業 1 到 10 分。';
comment on column public.customers.analysis_health is '五項度自由筆記。不要貼病歷或理賠文件。';
