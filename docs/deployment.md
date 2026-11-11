# Deployment

## 1. Database

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
```

This applies everything in `supabase/migrations`, including storage buckets. Do it on staging first.

## 2. First Owner

There is no public sign-up. Create the first Owner once, by hand:

1. Supabase dashboard > Authentication > Users > Add user (email and a temporary password).
2. SQL editor, with that user's id:

```sql
insert into public.profiles (id, full_name, email, role)
values ('USER-UUID', 'Owner name', 'owner@example.com', 'owner');
```

3. Sign in at `/login`. You will be asked to set up two-step sign in. Then add branches under Branch details, the price list under Prices and content, and invite managers and staff under Users.

## 3. Application

Any host that runs Node 22:

```bash
npm ci
npm run build
npm start        # serves on $PORT (default 3000)
```

**Vercel or Netlify.** Their React Router adapters were not installed or tested in this build. Check that the adapter supports React Router 8 before adopting it; if not, deploy the Node server above on a container host. Record the choice here.

Set the variables from environment.md on the host. Put the site behind HTTPS.

## 4. Scheduled job

Call `select public.purge_expired_enquiries();` daily (Supabase cron, service role) to apply the enquiry retention period.

## 5. Before launch (SRS section 17)

- Load real branch data, hours, prices; agree and load the redirect map; verify each old URL returns 301.
- Verify the domain in Google Search Console; point each Google Business Profile at its branch page.
- Run Lighthouse on home, a branch page and a service page on a mid-range phone profile.
- Validate a branch page and a service page in Google's Rich Results Test.
- Perform and record a database restore from backup.
- Replace the draft legal pages with the client's approved wording.
- Add uptime monitoring and error tracking (not yet integrated).
