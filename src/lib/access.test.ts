// قانون بهزاد ۱۴۰۵/۰۸/۳۰ — نمای تیمی فایل (TEAM_VISIBLE دیگران):
// قیمت باز، مالک بسته، آدرس دقیق هرگز؛ فقط محدوده/محله (مثلاً تنگک، عاشوری، سنگی).
import { describe, it, expect } from "vitest";
import { maskPropertyForTeam } from "./access";

function teamFile() {
  return {
    id: "p1",
    code: "F-0027",
    title: "ویلای تست متری تنگک",
    type: "VILLA",
    dealType: "SALE",
    salePriceToman: "4000000000",
    depositToman: null,
    monthlyRentToman: null,
    status: "SOLD",
    region: "تنگک",
    address: "خیابان سردار ۱۴، پلاک ۳",
    description: "مالک عجله دارد؛ قیمت قابل مذاکره است",
    sizeSqm: 200,
    landSizeSqm: 200,
    beds: 3,
    visibility: "TEAM_VISIBLE",
    isOfficeFile: false,
    listedById: "u-a",
    listedBy: { id: "u-a", name: "مدیر ساج", phone: "09170000001" },
    ownerId: "c-owner",
    owner: { id: "c-owner", name: "مالک تست", phone: "09170000002" },
    appraisedBy: { id: "u-c", name: "فرنام پورآزاد" },
    accessList: [{ userId: "u-b" }],
  };
}

describe("maskPropertyForTeam — نمای تیمی فایل", () => {
  it("محدوده و قیمت می‌مانند (قیمت باز، فقط محله)", () => {
    const masked = maskPropertyForTeam(teamFile());
    expect(masked.region).toBe("تنگک");
    expect(masked.salePriceToman).toBe("4000000000");
    expect(masked.title).toBe("ویلای تست متری تنگک");
    expect(masked.type).toBe("VILLA");
    expect(masked.sizeSqm).toBe(200);
    expect(masked.landSizeSqm).toBe(200);
  });

  it("آدرس دقیق، مالک و توضیحات حذف می‌شوند", () => {
    const masked = maskPropertyForTeam(teamFile());
    expect("address" in masked).toBe(false);
    expect("owner" in masked).toBe(false);
    expect("ownerId" in masked).toBe(false);
    expect("description" in masked).toBe(false);
    expect("accessList" in masked).toBe(false);
  });

  it("نام ثبت‌کننده می‌ماند ولی شماره‌اش حذف می‌شود", () => {
    const masked = maskPropertyForTeam(teamFile());
    expect((masked.listedBy as { name: string }).name).toBe("مدیر ساج");
    expect("phone" in (masked.listedBy as Record<string, unknown>)).toBe(false);
    expect((masked.appraisedBy as { name: string }).name).toBe("فرنام پورآزاد");
  });

  it("شیء ورودی تغییر نمی‌کند — ماسک روی کپی اعمال می‌شود", () => {
    const file = teamFile();
    maskPropertyForTeam(file);
    expect(file.address).toBe("خیابان سردار ۱۴، پلاک ۳");
    expect(file.owner).toBeDefined();
    expect(file.description).toBeDefined();
  });

  it("وقتی آدرس خالی است هم ماسک سالم کار می‌کند", () => {
    const file = { ...teamFile(), address: null, description: null };
    const masked = maskPropertyForTeam(file);
    expect(masked.region).toBe("تنگک");
    expect("address" in masked).toBe(false);
  });
});
