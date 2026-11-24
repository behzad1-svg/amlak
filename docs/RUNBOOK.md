# ران‌بوک عملیات CRM ساج — املاک ساج (بوشهر)

> راهنمای عملیات روزمره و عیب‌یابی. آخرین بازبینی: **۱ آذر ۱۴۰۵**.
> این سند **هیچ رازی ندارد**: پسورد، DSN و توکن اینجا نوشته نمی‌شود؛ فقط محل نگهداری‌شان ذکر شده است.
> پیش‌نیاز همهٔ دستورهای سرور: دسترسی SSH با کلید `~/.ssh/saj-vps` از طریق پروکسی خروجی. دستور پایه:
>
> ```bash
> ssh -o "ProxyCommand=nc -X connect -x 198.19.0.1:3128 %h %p" \
>     -o UserKnownHostsFile=~/workspace/.ssh/known_hosts \
>     -i ~/.ssh/saj-vps root@94.184.46.149
> ```
>
> اثر انگشت هاست (ED25519): `SHA256:TlablZatExCcxOoRc1KhpKai0aiE8E5yFMmLCiCXgGs`.
> **روی سرور git را به‌عنوان `saj` اجرا کنید** (root خطای dubious ownership می‌دهد).

## ۱. نمای سریع سیستم

| مورد | مقدار |
|---|---|
| سایت | `https://crm.amlaksaj.ir` |
| سرور | ParsPack irVPS3 — `94.184.46.149`، Ubuntu 24.04، ۲ گیگ رم + ۲ گیگ swap |
| اپ | Next.js روی `127.0.0.1:3000` — سرویس systemd ‏`saj-crm` |
| وب‌سرور | Caddy — `https://crm.amlaksaj.ir` را به `localhost:3000` می‌رساند |
| دیتابیس | PostgreSQL 16 روی `127.0.0.1:5432` — دیتابیس `saj_crm_db`، کاربر `sajcrm` |
| کد روی سرور | `/opt/saj-crm` (شاخهٔ `main` مخزن `behzad1-svg/amlak`) |
| متغیرهای محیطی | `/opt/saj-crm/.env.local` — **تنها نسخهٔ معتبر رازها؛ هرگز کپی نکنید** |
| بکاپ | شبانه ۰۳:۰۰ تهران → `/opt/saj-crm/backups/` (۷ روز) + Google Drive |
| سلامت | `GET /api/health` → `{"status":"ok","dbMs":N}` |

## ۲. دیپلوی نسخهٔ تازه (روند استاندارد)

**قانون طلایی: اول commit + push، بعد دیپلوی.** هرگز تغییر commitنشده را با rsync روی سرور نریزید مگر push مسدود باشد — و در آن صورت همان جلسه درخت سرور را با `main` هم‌تراز کنید.

### ۲.۱ روی ماشین لوکال

```bash
cd ~/workspace/amlak-review/bb
git status            # درخت باید تمیز باشد
git log --oneline -3  # HEAD را یادداشت کنید
npm test              # ۲۵۴ تست باید پاس شود
npx tsc --noEmit      # تمیز
git add <فایل‌ها> && git commit -m "..."
git push              # اول از طریق GitHub connector؛ توکن فقط آخرین راه‌حل است و مقدارش هرگز ثبت نمی‌شود
git log origin/main --oneline -1   # HEAD راه‌دور باید با HEAD لوکال یکی باشد
```

### ۲.۲ اگر تغییر اسکیما دارد — **قبل از دیپلوی**

```bash
# روی سرور، به‌عنوان saj، اول pull، بعد db push:
sudo -u saj bash -lc 'cd /opt/saj-crm && git pull --ff-only origin main'
sudo -u saj bash -lc 'cd /opt/saj-crm && DATABASE_URL=$(grep ^DATABASE_URL /opt/saj-crm/.env.local | cut -d= -f2-) npx prisma db push'
```

- خروجی باید جملهٔ **«Your database is now in sync»** را داشته باشد؛ اگر نداشت، **دیپلوی نکنید**.
- **هرگز `prisma db push` را از `tail` رد نکنید** (`... | tail` کد خروج tail را برمی‌گرداند که همیشه ۰ است و خطای push پنهان می‌ماند — همین اشتباه ۲۶ آبان همهٔ صفحات لاگین‌کرده را پایین آورد).
- `deploy.sh` خودش migration اجرا **نمی‌کند**.

### ۲.۳ دیپلوی

```bash
cd /opt/saj-crm && sudo -u saj bash deploy.sh
```

`deploy.sh` این کارها را می‌کند: سرویس را متوقف می‌کند → `git pull --ff-only origin main` → `npm ci` → بیلد تمیز (`rm -rf .next`؛ بیلد قبلی در `.next.bak` نگه داشته می‌شود) → سرویس را بالا می‌آورد → سلامت را با `curl http://localhost:3000/api/health` چک می‌کند و `DEPLOY OK` می‌گوید. **اگر بیلد خراب شود، `.next` قبلی خودکار برگردانده می‌شود و سایت با نسخهٔ قبلی بالا می‌آید.**

- قطعی مورد انتظار موقع دیپلوی: حدود **۷۷ ثانیه** (توقف/شروع سرویس) — مانیتور آپتایم ممکن است هشدار بدهد؛ طبیعی است.
- اگر `git pull` روی تغییرات محلی سرور گیر کرد: اول `git diff origin/main` را بخوانید. فقط اگر diff دقیقاً همان تغییری بود که upstream هم commit شده، `git checkout -- .` و دوباره pull کنید. اگر diff چیز دیگری بود، **دست نزنید و بپرسید**.

### ۲.۴ راستی‌آزمایی بعد از دیپلوی

```bash
curl -s https://crm.amlaksaj.ir/api/health        # باید {"status":"ok",...} بدهد
# بعد در مرورگر: ورود به‌عنوان مدیر، داشبورد، یک فایل، یک مشتری
# و در پایان: git log لوکال، راه‌دور و سرور باید یکی باشند
```

## ۳. بکاپ و بازیابی

### ۳.۱ بکاپ شبانه (خودکار)

- کرون root ساعت **۰۳:۰۰ تهران**: `/opt/saj-crm/backup.sh`
- خروجی: `pg_dump -Fc` + gzip → `/opt/saj-crm/backups/saj-crm-YYYY-MM-DD_HHMM.dump.gz`؛ چرخش ۷ روزه روی سرور؛ کپی به Google Drive با rclone (پوشهٔ `saj-crm-backups`، بدون چرخش).
- لاگ: `/var/log/saj-backup.log`؛ هر بکاپ در جدول `BackupLog` و صفحهٔ مدیریت CRM هم ثبت می‌شود.
- چک سریع: `ls -lt /opt/saj-crm/backups | head` — باید بکاپ ساعت ۰۳:۰۰ امروز باشد.

### ۳.۲ بکاپ دستی

مدیر از صفحهٔ مدیریت CRM یا `POST /api/admin/backup` (فقط OWNER) خروجی `pg_dump` را مستقیم دانلود می‌کند. فقط یک بکاپ دستی هم‌زمان می‌تواند در جریان باشد (قفل درون‌پروسه‌ای، تایم‌اوت ۵ دقیقه).

### ۳.۳ بازیابی (restore) — فقط با تأیید مدیر

> **بازیابی روی سرور زنده، دادهٔ فعلی را جایگزین می‌کند. بدون دستور صریح مدیر انجام ندهید.** تست کامل wipe-and-restore روی سرور زنده هنوز تأیید نشده؛ روش زیر همان روشی است که در دیتابیس تست و در Neon آزموده شد.

```bash
# ۱. روی سرور، سرویس را متوقف کنید تا کسی وسط بازیابی ننویسد
systemctl stop saj-crm

# ۲. بکاپ را انتخاب کنید (تازه‌ترین فایل سالم)
ls -lt /opt/saj-crm/backups/

# ۳. دیتابیس تازه بسازید و بازیابی کنید (پسورد دیتابیس در /root/.saj-db-pw است — مقدارش را تایپ/کپی نکنید)
PGPASSWORD=$(cat /root/.saj-db-pw) psql -h localhost -U sajcrm -d postgres -c "DROP DATABASE saj_crm_db;"
PGPASSWORD=$(cat /root/.saj-db-pw) psql -h localhost -U sajcrm -d postgres -c "CREATE DATABASE saj_crm_db;"
gunzip -c /opt/saj-crm/backups/saj-crm-YYYY-MM-DD_HHMM.dump.gz | \
  PGPASSWORD=$(cat /root/.saj-db-pw) pg_restore -h localhost -U sajcrm -d saj_crm_db

# ۴. شمارش جداول/ردیف‌ها را با بکاپ مقایسه کنید، بعد سرویس را بالا بیاورید
systemctl start saj-crm
curl -s https://crm.amlaksaj.ir/api/health
```

- **بازیابی روی دیتابیس تست (روش امن برای تمرین):** همین دستورها با یک دیتابیس تازهٔ دیگر (مثلاً `saj_crm_restore_test`) — سرویس زنده دست نمی‌خورد.
- بکاپ فقط **داده** را برمی‌گرداند؛ رازها (`.env.local`)، لاگین rclone و پیکربندی سرور را **نه**. اگر سرور از صفر ساخته می‌شود، آن‌ها را باید دستی بازسازی کرد و Drive را با لاگین گوگل مدیر دوباره وصل کرد.

### ۳.۴ اگر بکاپ شبانه ناموفق بود

1. `/var/log/saj-backup.log` را بخوانید — `DUMP FAILED` یعنی `pg_dump` خطا داده، `DRIVE UPLOAD FAILED` یعنی فقط آپلود Drive ناموفق بوده و نسخهٔ محلی سالم است.
2. فضای دیسک را چک کنید (بخش ۵.۵).
3. بکاپ دستی بگیرید (بخش ۳.۲) و از سالم‌بودنش مطمئن شوید.

## ۴. عملیات کاربران

### ۴.۱ ساخت کاربر تازه (مشاور)

مدیر از صفحهٔ **کاربران** (`/users`) می‌سازد: نام، شماره موبایل، نقش (AGENT)، پسورد (حداقل ۱۲ کاراکتر، حروف لاتین + عدد). مجوزهای دانه‌ای (ثبت فایل، حذف فایل و…) همان‌جا تیک می‌خورد. **پسورد را فقط به خود کاربر بدهید؛ در چت یا فایل ننویسید.**

### ۴.۲ ریست پسورد کاربر

- **روش عادی:** مدیر از `/users` پسورد کاربر را ریست می‌کند؛ نشست‌های قبلی آن کاربر خودکار بی‌اعتبار می‌شوند (`tokenVersion` زیاد می‌شود).
- **اگر کاربر پسوردش را فراموش کرده:** بازیابی پسورد (ایمیل/پیامک) **وجود ندارد** — تصمیم مدیر. همان ریست توسط مدیر انجام می‌شود.
- **اگر هیچ مدیری نمی‌تواند وارد شود:** روی سرور، به‌عنوان `saj`، از ریشهٔ پروژه اسکریپت آماده را اجرا کنید:
  `node scripts/reset-password.mjs --phone <شمارهٔ ۱۱ رقمی> --password '<رمز-تازه>'`
  رمز تازه حداقل ۱۲ کاراکتر، با حداقل یک حرف لاتین و یک رقم است؛ با bcrypt هش می‌شود و نشست‌های قبلی کاربر با زیادشدن `tokenVersion` خودکار بی‌اعتبار می‌شوند. اول با `--dry-run` بررسی کنید که کاربر پیدا می‌شود و چیزی نوشته نمی‌شود. **پسورد تازه را فقط به خود کاربر بدهید؛ در چت یا فایل ننویسید.**

### ۴.۳ غیرفعال‌کردن کاربر

از `/users`: غیرفعال‌کردن، نشست‌های او را هم بی‌اعتبار می‌کند. داده‌های او (فایل‌ها، مشتری‌ها) پاک نمی‌شوند.

## ۵. عیب‌یابی خرابی‌های رایج

### ۵.۱ سایت پایین است (مانیتور هشدار داد یا مرورگر باز نمی‌شود)

به‌ترتیب چک کنید — معمولاً مشکل در همین زنجیره است:

```bash
# ۱. سرویس اپ بالا هست؟
systemctl is-active saj-crm        # باید active باشد
systemctl status saj-crm --no-pager | head -20
journalctl -u saj-crm -n 100 --no-pager   # خطای آخر را نشان می‌دهد

# ۲. اپ مستقیم جواب می‌دهد؟ (دور زدن Caddy و WCDN)
curl -s http://localhost:3000/api/health

# ۳. Caddy بالا هست؟
systemctl is-active caddy
journalctl -u caddy -n 50 --no-pager

# ۴. دیتابیس بالا هست؟ (بخش ۵.۲)
```

- اگر `curl localhost:3000/api/health` سالم است ولی سایت از بیرون باز نمی‌شود → مشکل در Caddy یا WCDN است، نه اپ. لاگ Caddy را بخوانید.
- اگر سرویس `failed` است: `systemctl restart saj-crm` و دوباره سلامت را چک کنید. سرویس `Restart=always` دارد و خودش هم تلاش می‌کند.
- اگر بعد از دیپلوی سایت بالا نیامد: `deploy.sh` خودش `.next` قبلی را برگردانده است؛ لاگ دیپلوی و `journalctl -u saj-crm` را بخوانید و نسخهٔ قبلی را نگه دارید تا علت پیدا شود.

### ۵.۲ دیتابیس پایین است (`/api/health` مقدار ۵۰۰ می‌دهد یا `dbMs` خطا دارد)

```bash
systemctl is-active postgresql
systemctl status postgresql --no-pager | head -20
# اتصال دستی (پسورد در /root/.saj-db-pw):
PGPASSWORD=$(cat /root/.saj-db-pw) psql -h localhost -U sajcrm -d saj_crm_db -c "SELECT 1;"
# فضای دیسک و رم:
df -h / ; free -h
```

- اگر PostgreSQL بالا نمی‌آید، اول **دیسک پر** را چک کنید (بخش ۵.۵) — شایع‌ترین علت است.
- هرگز بدون بکاپ تازه، فایل‌های دیتابیس را دست‌کاری نکنید.

### ۵.۳ دیپلوی ناموفق

- `deploy.sh` موقع خطای بیلد، `.next.bak` را برمی‌گرداند و سرویس را با نسخهٔ قبلی بالا می‌آورد — پس سایت معمولاً بالا می‌ماند؛ خروجی دیپلوی را تا انتها بخوانید تا علت (خطای بیلد، `npm ci`، pull) معلوم شود.
- اگر سرویس بعد از دیپلوی `failed` شد: `journalctl -u saj-crm -n 100`؛ اگر علت خطای اسکیما است (`SessionCard` یا جدول تازه)، یعنی `prisma db push` (بخش ۲.۲) انجام نشده یا ناموفق بوده — اول خروجی push را چک کنید.
- اگر pull روی درخت کثیف سرور گیر کرد: بخش ۲.۳، «git diff origin/main».

### ۵.۴ گواهی TLS منقضی / خطای گواهی

- گواهی Let's Encrypt را **Caddy خودکار** با HTTP-01 تمدید می‌کند؛ شرطش باز بودن پورت **۸۰** است. انقضای فعلی: **۲۴ بهمن ۱۴۰۵** — پیش از آن تمدید را چک کنید.
- چک: `curl -v https://crm.amlaksaj.ir 2>&1 | grep -i "expire\|issuer"` و `journalctl -u caddy -n 50` (خطای تمدید آنجا می‌آید).
- اگر تمدید گیر کرده: مطمئن شوید UFW پورت ۸۰ را باز گذاشته و WCDN ترافیک HTTP-01 را رد می‌کند؛ **بدون هماهنگی با مدیر روی CDN دست نزنید.**

### ۵.۵ دیسک پر شد

```bash
df -h /
du -sh /opt/saj-crm/backups /opt/saj-crm/.next* /var/log 2>/dev/null
```

- فضای معمول: کل دیسک ۴۸ گیگ؛ مصرف عادی ~۷ گیگ. بکاپ‌ها فقط ۷ روز روی سرور می‌مانند (چرخش خودکار در `backup.sh`).
- پاک‌کردنی‌های امن: بکاپ‌های قدیمی‌تر از ۷ روز (اگر چرخش کار نکرده)، `.next.bak` مانده از دیپلوی ناموفق، لاگ‌های قدیمی `/var/log`.
- **هرگز** دیتابیس، `.env.local` و بکاپِ روز جاری را پاک نکنید.

### ۵.۶ کاربر نمی‌تواند وارد شود

- «رمز اشتباه است» با وجود درست‌بودن رمز → محدودیت نرخ: هر شماره **۵ تلاش ناموفق در ۱۵ دقیقه** قفل می‌شود؛ ۱۵ دقیقه صبر کنید. (مدیر می‌تواند از `/users` پسورد را ریست کند که قفل را هم باز می‌کند.)
- اگر ورود برای همه خراب است → اول `/api/health`؛ اگر سالم است، لاگ اپ را بخوانید (`journalctl -u saj-crm`) — احتمالاً `JWT_SECRET` یا اتصال دیتابیس مشکل دارد.
- **رمز را در چت نپرسید و نفرستید.**

### ۵.۷ اعلان یادآوری نمی‌آید

- کرون ساعتی root را چک کنید: `crontab -l` (باید خط `cron-reminders.sh` هر ساعت باشد) و `/var/log/saj-cron.log`.
- دستی تست کنید: `bash /opt/saj-crm/cron-reminders.sh` و بعد اعلان‌های تازه در CRM را ببینید. این اسکریپت با `CRON_SECRET` به `/api/cron/reminders` صدا می‌زند؛ اگر راز عوض شده باشد، ۴۰۱ می‌گیرد.

### ۵.۸ خطای ۵۰۰ یا صفحهٔ سفید بعد از یک تغییر

1. `journalctl -u saj-crm -n 100` — استک‌تریس را بخوانید.
2. Sentry (پروژهٔ `saj-crm`) را چک کنید — خطا آنجا با جزئیات ثبت می‌شود.
3. اگر خطا `SessionCard` یا جدول تازه را می‌گوید → اسکیما با کد هم‌تراز نیست؛ بخش ۲.۲.
4. اگر فقط یک صفحه خراب است، بقیهٔ صفحات سالم‌اند → مشکل همان صفحه است، نه کل سایت؛ لاگ همان مسیر را بخوانید.

### ۵.۹ بکاپ Drive آپلود نمی‌شود

- `rclone listremotes` روی سرور باید `saj-drive:` را نشان بدهد؛ اگر لاگین rclone از بین رفته باشد، فقط نسخهٔ محلی می‌ماند و لاگ می‌گوید `DRIVE UPLOAD FAILED`.
- وصل‌کردن دوبارهٔ Drive به **لاگین گوگل مدیر** نیاز دارد — بدون او انجام نمی‌شود.

## ۶. دستورهای مرجع (فقط خواندنی)

```bash
# وضعیت همهٔ سرویس‌ها
systemctl is-active saj-crm postgresql caddy fail2ban

# لاگ زندهٔ اپ
journalctl -u saj-crm -f

# سلامت
curl -s https://crm.amlaksaj.ir/api/health

# نسخهٔ مستقر روی سرور + تمیزی درخت
sudo -u saj bash -lc 'cd /opt/saj-crm && git log --oneline -1 && git status --short'

# شمارش داده (پسورد در /root/.saj-db-pw)
PGPASSWORD=$(cat /root/.saj-db-pw) psql -h localhost -U sajcrm -d saj_crm_db \
  -c "SELECT (SELECT count(*) FROM \"User\") users, (SELECT count(*) FROM \"Customer\" WHERE \"deletedAt\" IS NULL) customers, (SELECT count(*) FROM \"Property\" WHERE \"deletedAt\" IS NULL) files;"

# IPهای بن‌شدهٔ fail2ban
fail2ban-client status sshd

# قوانین فایروال
ufw status numbered
```

## ۷. موارد ممنوعه

- **هرگز** پسورد، DSN، توکن یا connection string را در چت، فایل، کامیت یا اسکریپت ننویسید.
- **هرگز** بدون تأیید مدیر روی سرور زنده wipe/restore انجام ندهید.
- **هرگز** بکاپ‌ها را رمزگذاری نکنید، مگر مدیر بگوید (تصمیم فعلی: بدون رمزگذاری).
- **هرگز** بدون هماهنگی با مدیر روی CDN/WCDN دست نزنید (قانون مدیر: فقط CDN نیاز به هماهنگی دارد).
- **هرگز** SSH با پسورد و لاگین root را نبندید، مگر بعد از ساختن و تست کلید SSH مدیر (پارک‌شده تا لانچ).
- **هرگز** `prisma db push` را از `tail` رد نکنید (بخش ۲.۲).
