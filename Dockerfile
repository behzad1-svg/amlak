FROM node:20-bookworm

WORKDIR /app

# ۱. تنظیم رجیستری npm روی آینه‌ی چینی (برای دور زدن تحریم و جلوگیری از ETIMEDOUT)
RUN npm config set registry https://registry.npmmirror.com

# ۲. ابتدا فقط فایل‌های پکیج را کپی می‌کنیم (برای استفاده از کش داکر)
COPY package*.json ./

# ۳. تمام وابستگی‌ها را نصب می‌کنیم (با گزینه legacy-peer-deps برای جلوگیری از تداخل نسخه‌ها)
RUN npm install --legacy-peer-deps

# ۴. حالا بقیه‌ی کدهای پروژه را کپی می‌کنیم
COPY . .

# ۵. پروژه را بیلد می‌کنیم
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]