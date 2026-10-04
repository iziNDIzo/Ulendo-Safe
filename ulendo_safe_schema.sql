-- =====================================================================
-- Ulendo Safe: Supabase (Postgres) schema
-- Run in the Supabase SQL Editor on a NEW project, or compare against
-- your existing tables first (operators, customers, trips, reports,
-- sos_alerts, helpers) before running anything.
-- =====================================================================

-- ---------- 1. Associations (the verifying body) ----------
create table associations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  city          text,
  contact_phone text,
  created_at    timestamptz not null default now()
);

-- ---------- 2. Operators (kabaza riders, taxi and minibus drivers) ----------
create table operators (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,              -- e.g. KBA-4521 (printed in the QR)
  full_name      text not null,
  phone          text,                              -- E.164, e.g. +265...
  vehicle_type   text not null check (vehicle_type in ('kabaza','taxi','minibus')),
  plate_number   text,
  association_id uuid references associations(id) on delete set null,
  status         text not null default 'pending'
                 check (status in ('pending','verified','suspended')),
  verified_at    timestamptz,
  verified_by    text,                              -- association officer who approved
  created_at     timestamptz not null default now()
);

-- ---------- 3. Customers (passengers) ----------
create table customers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,                           -- e.g. C-8891
  phone      text not null unique,                  -- E.164
  full_name  text,
  created_at timestamptz not null default now()
);

-- ---------- 4. Trips ----------
create table trips (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id),
  customer_id uuid references customers(id),
  checked_by  text not null check (checked_by in ('passenger','driver')),
  origin      text,
  destination text,
  status      text not null default 'checked'
              check (status in ('checked','in_progress','completed','cancelled')),
  risk_level  text check (risk_level in ('green','yellow','red')),
  risk_reason text,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- ---------- 5. Trusted contacts (family/friends who get SOS alerts) ----------
-- Contacts must confirm they agree to receive alerts.
create table trusted_contacts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid references customers(id) on delete cascade,
  operator_id       uuid references operators(id) on delete cascade,
  contact_name      text,
  contact_phone     text not null,
  consent_confirmed boolean not null default false,
  created_at        timestamptz not null default now(),
  check ((customer_id is not null)::int + (operator_id is not null)::int = 1)
);

-- ---------- 6. Community reports (reviewed before they count) ----------
create table reports (
  id             uuid primary key default gen_random_uuid(),
  operator_id    uuid references operators(id) on delete cascade,
  customer_id    uuid references customers(id) on delete cascade,
  category       text not null
                 check (category in ('robbery','harassment','reckless_driving','fake_identity','other')),
  location       text,
  details        text,
  reporter_phone text not null,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','dismissed')),
  reviewed_by    text,                              -- association officer
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  check ((operator_id is not null)::int + (customer_id is not null)::int = 1)
);

-- One person cannot report the same subject for the same reason twice
create unique index reports_no_duplicates
  on reports (reporter_phone, coalesce(operator_id, customer_id), category);

-- ---------- 7. SOS alerts ----------
create table sos_alerts (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid references trips(id) on delete set null,
  triggered_by_phone text not null,
  lat                double precision,
  lng                double precision,
  message            text,
  language           text check (language in ('en','ny')),   -- ny = Chichewa
  triage_level       text check (triage_level in ('low','medium','high')),
  triage_summary     text,                                   -- AI summary
  status             text not null default 'open'
                     check (status in ('open','acknowledged','resolved','false_alarm')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

-- Who was notified for each alert (useful for WhatsApp message templates)
create table sos_notifications (
  id               uuid primary key default gen_random_uuid(),
  sos_alert_id     uuid not null references sos_alerts(id) on delete cascade,
  recipient_phone  text not null,
  recipient_type   text not null check (recipient_type in ('trusted_contact','helper','police','association')),
  delivery_status  text not null default 'queued'
                   check (delivery_status in ('queued','sent','delivered','failed')),
  sent_at          timestamptz
);

-- ---------- 8. Helpers (mechanics, fuel, police, clinics, towing) ----------
create table helpers (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('mechanic','fuel','police','clinic','towing')),
  name       text not null,
  phone      text,
  area       text,                                   -- e.g. Area 25
  lat        double precision,
  lng        double precision,
  price_note text,
  verified   boolean not null default false,
  opted_in   boolean not null default false,         -- agreed to be listed/contacted
  created_at timestamptz not null default now()
);

-- ---------- 9. Indexes ----------
create index trips_operator_idx     on trips (operator_id);
create index trips_customer_idx     on trips (customer_id);
create index reports_operator_idx   on reports (operator_id);
create index reports_customer_idx   on reports (customer_id);
create index sos_status_idx         on sos_alerts (status, created_at desc);
create index helpers_kind_area_idx  on helpers (kind, area);

-- ---------- 10. Risk view ----------
-- Red: suspended, or 2+ CONFIRMED reports from different people.
-- Yellow: not yet verified, or has pending reports.
-- Green: verified with no open concerns.
create view operator_risk with (security_invoker = true) as
select
  o.id,
  o.code,
  o.status,
  count(distinct r.reporter_phone) filter (where r.status = 'confirmed') as confirmed_reports,
  count(distinct r.reporter_phone) filter (where r.status = 'pending')   as pending_reports,
  case
    when o.status = 'suspended'
      or count(distinct r.reporter_phone) filter (where r.status = 'confirmed') >= 2
      then 'red'
    when o.status = 'pending'
      or count(distinct r.reporter_phone) filter (where r.status = 'pending') >= 1
      then 'yellow'
    else 'green'
  end as base_risk
from operators o
left join reports r on r.operator_id = o.id
group by o.id;

-- ---------- 11. Row Level Security ----------
-- RLS on with no policies = the public (anon) key can read/write nothing.
-- Your Express server should use the SERVICE ROLE key, kept in an
-- environment variable on the server only, never in public/index.html.
alter table associations      enable row level security;
alter table operators         enable row level security;
alter table customers         enable row level security;
alter table trips             enable row level security;
alter table trusted_contacts  enable row level security;
alter table reports           enable row level security;
alter table sos_alerts        enable row level security;
alter table sos_notifications enable row level security;
alter table helpers           enable row level security;

-- ---------- 12. DEMO SEED DATA (fake; delete before any real pilot) ----------
insert into associations (name, city) values ('Demo Association', 'Lilongwe');

insert into operators (code, full_name, vehicle_type, plate_number, association_id, status, verified_at, verified_by)
select 'KBA-4521', 'Demo Rider One', 'kabaza', 'DEMO-4521', a.id, 'verified', now(), 'demo'
from associations a where a.name = 'Demo Association';

insert into operators (code, full_name, vehicle_type, plate_number, status)
values ('KBA-9999', 'Demo Reported Rider', 'kabaza', 'DEMO-9999', 'pending');

insert into customers (code, phone, full_name) values ('C-8891', '+265000000000', 'Demo Customer');

insert into reports (operator_id, category, location, details, reporter_phone, status, reviewed_by, reviewed_at)
select o.id, 'robbery', 'Ndirande', 'Demo report', p.phone, 'confirmed', 'demo', now()
from operators o, (values ('+265000000001'), ('+265000000002')) as p(phone)
where o.code = 'KBA-9999';

insert into helpers (kind, name, phone, area, price_note, verified, opted_in) values
  ('mechanic', 'Demo Mechanic', '+265000000010', 'Area 25', 'Tyre repair from MK 3,000', true, true),
  ('fuel',     'Demo Fuel Station', null,        'Area 25', null,                          true, true),
  ('police',   'Demo Police Post',  null,        'Area 25', null,                          true, true);
