FROM node:22-bookworm

WORKDIR /app

# ۱. تنظیم رجیستری npm روی آینه‌ی چینی (برای دور زدن تحریم و جلوگیری از ETIMEDOUT)
RUN npm config set registry https://registry.npmmirror.com

# ۲. ابتدا فقط فایل‌های پکیج را کپی می‌کنیم (برای استفاده از کش داکر)
COPY package*.json ./

# ۳. وابستگی‌ها را قطعی نصب می‌کنیم (npm ci به‌جای npm install --legacy-peer-deps)
RUN npm ci

# ۴. حالا بقیه‌ی کدهای پروژه را کپی می‌کنیم
COPY . .

# ۵. Prisma Client را می‌سازیم — بدون آن، بیلد با خطای
# «Cannot find module '.prisma/client/default'» شکست می‌خورد
RUN npx prisma generate

# ۶. پروژه را بیلد می‌کنیم
RUN npm run build

EXPOSE 3000

# ۷. در استارت، اسکیما را روی دیتابیس اعمال می‌کنیم؛
# پوشه prisma/migrations وجود ندارد، پس به‌جای migrate deploy از db push استفاده می‌شود.
# (DATABASE_URL باید در زمان اجرا به کانتینر داده شود)
CMD ["sh", "-c", "npx prisma db push && npm start"]
