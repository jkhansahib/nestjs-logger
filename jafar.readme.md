  402  npm i -g @nestjs/cli\n
  403  cd nestjs
  404  ls
  405  nest new nestjs-boilerplate\n
  406  ls
  407  cd nestjs-boilerplate
  408  npm install @nestjs/config\n
  409  npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt\n
  410  npm install --save @nestjs/swagger swagger-ui-express\n
  411  npm install prisma --save-dev\nnpm install @prisma/client\nnpx prisma init\n
  412  npm run start:dev\n


  npm install winston
npm install nest-winston

npm install winston winston-daily-rotate-file

npm i @nestjs/common @nestjs/core @nestjs/platform-express class-validator class-transformer winston nest-winston


# supabase:


```
create table public.profiles (
  id uuid references auth.users on delete cascade not null,
  role text default 'user',
  primary key (id)
);

insert into public.profiles (id, role)
values ('370cc6af-0f13-42aa-a473-5d36181f6717', 'admin');

```

```
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user'); -- default role
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
```


```
-- Allow users to read only their own profile
create policy "Individuals can view their profile" 
on profiles for select
using (auth.uid() = id);

-- Allow only admins to see all profiles
create policy "Admins can view all profiles"
on profiles for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
));
```

```
-- enable RLS if not already
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- allow users to select only their own profile
CREATE POLICY "Select own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
  ```



  npm install @prisma/client\nnpm install -D prisma
 1265  npx prisma generate
 1266  ls node_modules/.prisma/client




npm install @prisma/client
npm install -D prisma
npx prisma generate


