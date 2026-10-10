# Anand Adda production setup

The website and Owner Panel are static files. Supabase holds the shop data, images, login, and permissions. The only public credentials in the project are the Supabase project URL and publishable key in `supabase-config.js`; this is intentional and safe for browser use. Never add a Supabase service-role key to this repository, Vercel, or browser code.

## One-time Supabase setup

1. Sign in to [Supabase](https://supabase.com/dashboard) and open the Anand Adda project.
2. In the left menu, choose **SQL Editor**, then **New query**.
3. Open `supabase/migrations/20260910_owner_managed_site.sql` in this repository, copy all of it, paste it into the query editor, and click **Run**.
4. The script preserves existing products, offers, settings, and existing product image URLs. It creates the `weekly_updates` and `reviews` tables, adds the new image columns, creates all required Storage buckets, and applies the Row Level Security policies.
5. Create the Owner Panel account: choose **Authentication** → **Users** → **Add user** → **Create new user**. Enter the owner email address and password. If Supabase asks about email confirmation, confirm the account.
6. Return to **SQL Editor**, make a new query, replace `OWNER@EXAMPLE.COM` below with that exact email address, then run it:

```sql
insert into public.profiles (id, role)
select id, 'owner'
from auth.users
where lower(email) = lower('OWNER@EXAMPLE.COM')
on conflict (id) do update set role = excluded.role;
```

7. In **Authentication** → **URL Configuration**, set **Site URL** to the final public website URL. Under **Redirect URLs**, add all three of these addresses:
   - `https://YOUR-DOMAIN/`
   - `https://YOUR-DOMAIN/admin.html`
   - `https://YOUR-DOMAIN/reset-password.html`

   Replace `YOUR-DOMAIN` with the real website address. The final address is needed for the Owner Panel's **Forgot your password?** link.

The migration creates these public image buckets with a 5 MB limit and JPG/PNG/WebP support:

- `product-images` → `products/<product-id>/...`
- `site-media` → `logos/...` and `shop/...`
- `weekly-update-images` → `updates/<update-id>/...`
- `offer-images` → `offers/<offer-id>/...`

It also replaces Storage object policies with owner-only upload/update/delete rules. Run it only in the Supabase project dedicated to Anand Adda, because it intentionally removes old Storage object policies from that project before creating the secure rules.

## One-time GitHub and Vercel setup

### GitHub

1. Before pushing, open the Anand Adda repository in GitHub and click the green **Code** button.
2. Choose **HTTPS** and copy the repository address. The configured address in this checkout ends with `anandadda..git` (two periods), so compare it carefully with GitHub's copied address before the first push. Do not change the address merely because of this note—only change it if GitHub shows a different address.
3. Commit the changed files to the existing `main` branch and push them to that existing repository. The files to include are the six updated website files, `SETUP.md`, and `supabase/migrations/20260910_owner_managed_site.sql`.

### Vercel

1. Sign in at [Vercel](https://vercel.com/dashboard) and open the **existing Anand Adda project**. Do not create a second project unless the existing one is unavailable.
2. Click **Settings** → **Git**. Confirm the connected repository is the Anand Adda GitHub repository and that the production branch is `main`.
3. Click **Settings** → **General**. The **Root Directory** must be the repository root—the folder containing `index.html` and `admin.html`. For this static site, the framework may be **Other**. Leave **Build Command** and **Output Directory** empty.
4. Click **Settings** → **Environment Variables**. No variables are needed. In particular, do **not** add a Supabase service-role key anywhere in Vercel.
5. After GitHub receives the commit, Vercel normally starts a deployment automatically. If it does not, open the **Deployments** tab, select the latest commit, and click **Redeploy**.
6. When deployment says **Ready**, open the production URL. The public site is `/`; the Owner Panel is `/admin.html`.

No Vercel environment variables are required for this static project. Do not create a service-role environment variable. The browser uses only the publishable Supabase key already in `supabase-config.js`.

## Normal Owner Panel use

Open `https://YOUR-DOMAIN/admin.html`, sign in with the owner account, and choose a section.

### Reset a forgotten Owner Panel password

1. Open `https://YOUR-DOMAIN/admin.html`.
2. Click **Forgot your password?**.
3. Enter the owner email address and click **Email me a reset link**.
4. Open the email from Supabase (also check Spam), click its link, and choose a new password.
5. Return to the Owner Panel and sign in with the new password.

### Change the logo or shop photo

1. Open **Website photos**.
2. Choose the logo or shop-photo file. Use JPG, PNG, or WebP, no larger than 5 MB.
3. Check the preview, then click **Save website photos**.
4. To remove an existing image, click its **Remove** button and then save. The public site updates automatically.

### Change shop information

1. Open **Shop details**.
2. Change the required text, phone number, WhatsApp number, Instagram handle, or Google Maps link.
3. Click **Save shop details**. The public site updates automatically.

### Add or manage a product

1. Open **Products**.
2. Enter the product name and the other details you want to show.
3. Add one or more product photos, then click **Add product**.
4. To change a product, use **Edit** next to it. You can change any detail, add photos, or remove individual photos, then press **Save product**.
5. Untick **Show this product on the public website** to hide it without deleting it. Use **Delete** only for a product you no longer need.

### Publish a weekly update

1. Open **Weekly updates**.
2. Add the title, date/time, short caption, optional longer description, and image.
3. Leave **Show this update on the public website** ticked and click **Publish update**.
4. Use **Edit** later to change, hide, replace its photo, or delete the post. Newest visible updates appear first publicly.

### Change the current offer

1. Open **Offers**.
2. Enter the title, details, and optional offer photo.
3. Leave **Make this the current public offer** ticked, then click **Publish offer**.
4. The new offer becomes public and the previous current offer becomes inactive automatically. Older offers remain in the list as history.

### Approve a customer review

1. Open **Reviews**.
2. New customer submissions are marked **pending**.
3. Click **Approve** to show one publicly, **Hide** to reject it, or **Delete** only when it should be permanently removed.

Changes saved in the Owner Panel are read directly by the public website from Supabase, so they appear automatically without editing code or redeploying.

## Before going live: exact check list

Use the real owner account after the migration is run. The repository contains no password, and no test data is automatically created in the live shop.

1. Sign in at `/admin.html`. A non-owner account must receive the “not an Owner Panel account” message.
2. In **Website photos**, upload a temporary logo and shop photo, save them, and confirm they appear on the public site. Replace them with the final files.
3. Add a temporary product with a photo; edit it; hide it; confirm it disappears publicly; activate it; confirm it returns. Delete the temporary product if it is not wanted.
4. Create a temporary weekly update, edit it, hide it, and delete it if it is not wanted.
5. Publish one offer, then publish a second. Confirm only the second appears publicly and the first is marked as a past offer in the Owner Panel.
6. From a private/incognito browser window, submit a review. Confirm the success message appears, the review is pending in the Owner Panel, and it is not visible on the public site until you approve it.
7. Approve the review and refresh the public site. Confirm it appears with the name, stars, text, and date. Hide it and confirm it disappears.
8. From a private/incognito window, try to open `/admin.html` and confirm the dashboard remains hidden until an owner signs in.

If any test fails, do not weaken the RLS policies to make it work. Use the error shown in the Owner Panel and check that the SQL migration and owner-profile query above were run in the same Supabase project named in `supabase-config.js`.
