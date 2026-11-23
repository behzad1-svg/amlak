// تایپ سشن موک برای تست‌های روت — همان شکلی که validateSession برمی‌گرداند
// (کاربر + payload)؛ فقط تایپ است، پس در vi.hoisted هم قابل استفاده است
// (فکتوری hoisted پیش از importها اجرا می‌شود، ولی تایپ‌ها کامپایل‌تایم حذف می‌شوند).
export interface MockSessionUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
  tokenVersion: number;
  permissions: Record<string, unknown>;
}

export interface MockSession {
  user: MockSessionUser;
  payload: { userId: string; role: string; tokenVersion: number };
}
