// نقد ۱ — کمک‌کنندهٔ مرکزی برای همهٔ فراخوانی‌های fetch سمت کلاینت.
// - 401 → هدایت به صفحهٔ ورود (نشست منقضی شده)
// - خطای شبکه یا خطای API → پرتاب ApiError با پیام سرور
// - موفق → همان Response (caller خودش .json() می‌کند) یا با apiJson مستقیم JSON می‌گیرد.
// صفحهٔ ورود از این کمک‌کننده استفاده نمی‌کند: آنجا 401 یعنی «رمز اشتباه»
// و باید پیام خودش را نشان دهد، نه اینکه به خودش هدایت شود.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined") {
    // هدایت سخت عمدی است: نشست منقضی شده و باید همهٔ state کلاینت از اول ساخته شود
    // (router.push state کهنه را نگه می‌دارد)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    // no-store پیش‌فرض: فراخوانی‌های API نباید از کش مرورگر برگردند (F4).
    res = await fetch(input, { ...init, cache: init?.cache ?? "no-store" });
  } catch {
    throw new ApiError(0, "ارتباط با سرور برقرار نشد — اینترنت را بررسی کنید و دوباره تلاش کنید.");
  }
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "نشست شما منقضی شده است — دوباره وارد شوید.");
  }
  if (!res.ok) {
    let message = `خطای سرور (${res.status})`;
    try {
      const data = await res.clone().json();
      if (data && typeof data.error === "string" && data.error.trim()) message = data.error;
    } catch {
      // بدنه JSON نیست؛ همان پیام عمومی می‌ماند
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  return (await res.json()) as T;
}

/** پیام قابل نمایش برای خطا (ApiError یا هر چیز دیگر). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message || "خطای ناشناخته رخ داد.";
  return "خطای ناشناخته رخ داد.";
}
