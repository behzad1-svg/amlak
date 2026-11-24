// پیامک با SMS.ir — ارسال ساده (bulk) و کد تایید با پترن.
// کلید API فقط از متغیر محیطی SMS_IR_API_KEY خوانده می‌شود و شناسهٔ پترن
// فقط از SMS_IR_VERIFY_TEMPLATE_ID؛ هیچ‌کدام هرگز در فایل، لاگ یا گزارش
// نوشته نمی‌شوند. مستندات: https://api.sms.ir/swagger/v1/swagger.json
const SMS_IR_BASE = "https://api.sms.ir/v1";

/** خط ارسال پیامک املاک ساج (تبلیغاتی، فعال و تاییدشده). */
export const SMS_IR_LINE_NUMBER = 500037468379280;

/** شناسهٔ عددی پترن کد تایید در پنل SMS.ir — از متغیر محیطی می‌آید؛ اگر
 *  پنل هنوز پترنی ندارد، null است و ارسال کد تایید ممکن نیست. */
export function smsVerifyTemplateId(): number | null {
  const raw = process.env.SMS_IR_VERIFY_TEMPLATE_ID;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface SmsSendResult {
  messageId?: number;
  cost?: number;
}

function apiKey(): string {
  const key = process.env.SMS_IR_API_KEY;
  if (!key) throw new Error("کلید SMS.ir تنظیم نشده است (SMS_IR_API_KEY)");
  return key;
}

async function postJson(
  path: string,
  body: unknown,
  fetchFn: typeof fetch
): Promise<{ status: number; message?: string | null; data?: unknown }> {
  const res = await fetchFn(`${SMS_IR_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as {
    status?: number;
    message?: string | null;
    data?: unknown;
  } | null;
  if (!res.ok || !data || data.status !== 1) {
    // فقط وضعیت و پیام API در خطا می‌آید؛ سربرگ‌ها (کلید) هرگز.
    throw new Error(
      `ارسال پیامک ناموفق بود (وضعیت ${data?.status ?? res.status}${data?.message ? `: ${data.message}` : ""})`
    );
  }
  return { status: data.status, message: data.message ?? null, data: data.data };
}

/** ارسال پیامک ساده به یک شماره، از خط املاک ساج. */
export async function sendSms(mobile: string, text: string, fetchFn: typeof fetch = fetch): Promise<SmsSendResult> {
  const r = await postJson(
    "/send/bulk",
    { lineNumber: SMS_IR_LINE_NUMBER, messageText: text, mobiles: [mobile] },
    fetchFn
  );
  const d = (r.data ?? {}) as { messageIds?: number[]; cost?: number };
  return { messageId: d.messageIds?.[0], cost: d.cost };
}

/** ارسال کد تایید ۶ رقمی با پترن تاییدشدهٔ پنل SMS.ir — پارامتر پترن
 *  باید در پنل «Code» نام داشته باشد. */
export async function sendVerificationCode(
  mobile: string,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<SmsSendResult> {
  const templateId = smsVerifyTemplateId();
  if (templateId === null) throw new Error("شناسهٔ پترن کد تایید تنظیم نشده است (SMS_IR_VERIFY_TEMPLATE_ID)");
  const r = await postJson(
    "/send/verify",
    { mobile, templateId, parameters: [{ name: "Code", value: code }] },
    fetchFn
  );
  const d = (r.data ?? {}) as { messageId?: number; cost?: number };
  return { messageId: d.messageId, cost: d.cost };
}

/** متن پیامک کارت جلسه برای مدیر قرارداد — دقیقاً به همین شکل. */
export function sessionCardSmsText(advisorName: string): string {
  return `${advisorName} کارت جلسه ثبت کرد لطفا سایت رو چک کنید — املاک ساج`;
}
