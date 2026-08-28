FROM node:20-bookworm

WORKDIR /app

# ۱. ابتدا فقط فایل‌های پکیج را کپی می‌کنیم (برای استفاده از کش داکر)
COPY package*.json ./

# ۲. تمام وابستگی‌ها (از جمله Prisma) را نصب می‌کنیم
RUN npm install

# ۳. حالا بقیه‌ی کدهای پروژه را کپی می‌کنیم
COPY . .

# ۴. پروژه را بیلد می‌کنیم
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]