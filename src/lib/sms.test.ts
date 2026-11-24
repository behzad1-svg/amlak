// پیامک SMS.ir — بدنهٔ درخواست، سربرگ احراز هویت و مدیریت خطا،
// بدون اینکه کلید واقعی جایی دیده شود (مقدار تستی ساختگی است).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SMS_IR_LINE_NUMBER, sendSms, sendVerificationCode, sessionCardSmsText, smsVerifyTemplateId } from "./sms";

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("sendSms", () => {
  beforeEach(() => {
    process.env.SMS_IR_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.SMS_IR_API_KEY;
    vi.restoreAllMocks();
  });

  it("sends a bulk message from the SAJ line with the API key header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 1, message: "ok", data: { messageIds: [123], cost: 260 } }));
    const r = await sendSms("09170000001", "سلام", fetchFn);
    expect(r).toEqual({ messageId: 123, cost: 260 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sms.ir/v1/send/bulk");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string)).toEqual({
      lineNumber: SMS_IR_LINE_NUMBER,
      messageText: "سلام",
      mobiles: ["09170000001"],
    });
    expect(SMS_IR_LINE_NUMBER).toBe(500037468379280);
  });

  it("throws when the API reports a non-1 status", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 0, message: "insufficient credit", data: null }));
    await expect(sendSms("09170000001", "سلام", fetchFn)).rejects.toThrow("insufficient credit");
  });

  it("throws when the HTTP status is not ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null } as unknown as Response);
    await expect(sendSms("09170000001", "سلام", fetchFn)).rejects.toThrow("500");
  });

  it("throws when no API key is configured", async () => {
    delete process.env.SMS_IR_API_KEY;
    const fetchFn = vi.fn();
    await expect(sendSms("09170000001", "سلام", fetchFn)).rejects.toThrow("SMS_IR_API_KEY");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("sendVerificationCode", () => {
  beforeEach(() => {
    process.env.SMS_IR_API_KEY = "test-key";
    process.env.SMS_IR_VERIFY_TEMPLATE_ID = "100000";
  });
  afterEach(() => {
    delete process.env.SMS_IR_API_KEY;
    delete process.env.SMS_IR_VERIFY_TEMPLATE_ID;
    vi.restoreAllMocks();
  });

  it("sends the code with the configured template id and a Code parameter", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 1, message: "ok", data: { messageId: 456, cost: 200 } }));
    const r = await sendVerificationCode("09170000001", "123456", fetchFn);
    expect(r).toEqual({ messageId: 456, cost: 200 });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sms.ir/v1/send/verify");
    expect(JSON.parse(init.body as string)).toEqual({
      mobile: "09170000001",
      templateId: 100000,
      parameters: [{ name: "Code", value: "123456" }],
    });
  });

  it("throws when no template id is configured", async () => {
    delete process.env.SMS_IR_VERIFY_TEMPLATE_ID;
    const fetchFn = vi.fn();
    await expect(sendVerificationCode("09170000001", "123456", fetchFn)).rejects.toThrow("SMS_IR_VERIFY_TEMPLATE_ID");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("smsVerifyTemplateId returns null for missing or invalid values", () => {
    delete process.env.SMS_IR_VERIFY_TEMPLATE_ID;
    expect(smsVerifyTemplateId()).toBeNull();
    process.env.SMS_IR_VERIFY_TEMPLATE_ID = "abc";
    expect(smsVerifyTemplateId()).toBeNull();
    process.env.SMS_IR_VERIFY_TEMPLATE_ID = "0";
    expect(smsVerifyTemplateId()).toBeNull();
    process.env.SMS_IR_VERIFY_TEMPLATE_ID = "100000";
    expect(smsVerifyTemplateId()).toBe(100000);
  });
});

describe("sessionCardSmsText", () => {
  it("builds the exact message Behzad specified", () => {
    expect(sessionCardSmsText("بهزاد افشار")).toBe("بهزاد افشار کارت جلسه ثبت کرد لطفا سایت رو چک کنید — املاک ساج");
  });
});
