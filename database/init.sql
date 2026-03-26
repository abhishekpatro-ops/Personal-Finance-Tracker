create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  password_hash text not null,
  display_name varchar(120) not null,
  created_at timestamp not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token text not null unique,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  is_revoked boolean not null default false
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name varchar(100) not null,
  type varchar(30) not null,
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  is_primary boolean not null default false,
  institution_name varchar(120),
  created_at timestamp not null default now(),
  last_updated_at timestamp not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name varchar(100) not null,
  type varchar(20) not null,
  color varchar(20),
  icon varchar(50),
  is_archived boolean not null default false
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  created_by_user_id uuid not null references users(id),
  account_id uuid not null references accounts(id),
  destination_account_id uuid references accounts(id),
  category_id uuid references categories(id),
  type varchar(20) not null,
  amount numeric(12,2) not null,
  transaction_date date not null,
  merchant varchar(200),
  note text,
  payment_method varchar(50),
  recurring_transaction_id uuid,
  tags jsonb not null default '[]',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  category_id uuid not null references categories(id),
  month int not null,
  year int not null,
  amount numeric(12,2) not null,
  alert_threshold_percent int default 80,
  unique(user_id, category_id, month, year)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name varchar(120) not null,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) not null default 0,
  target_date date,
  linked_account_id uuid,
  icon varchar(50),
  color varchar(20),
  status varchar(30) not null default 'active'
);

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  title varchar(120) not null,
  type varchar(20) not null,
  amount numeric(12,2) not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  frequency varchar(20) not null,
  start_date date not null,
  end_date date,
  next_run_date date not null,
  auto_create_transaction boolean not null default true,
  is_paused boolean not null default false
);

create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  priority int not null default 100,
  name varchar(140) not null,
  condition_json jsonb not null,
  action_json jsonb not null,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role varchar(20) not null,
  invited_by_user_id uuid not null references users(id),
  created_at timestamp not null default now(),
  unique(account_id, user_id)
);