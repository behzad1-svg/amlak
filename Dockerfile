FROM node:22-bookworm

WORKDIR /app

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

USER node

# ۷. استارت: فقط اجرای سرور؛ ساخت اسکیما با db push روی سرور، نه اینجا.
# (DATABASE_URL باید در زمان اجرا به کانتینر داده شود)
CMD ["npm", "start"]
