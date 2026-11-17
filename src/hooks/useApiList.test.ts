import { describe, expect, it } from "vitest";
import { computeHasMore, createRequestGuard, mergePageItems } from "./useApiList";

describe("createRequestGuard", () => {
  it("شماره های تازه را پشت سر هم می دهد", () => {
    const guard = createRequestGuard();
    expect(guard.next()).toBe(1);
    expect(guard.next()).toBe(2);
  });

  it("فقط آخرین شماره را تازه می داند", () => {
    const guard = createRequestGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });

  it("دو نگهبان جدا از هم کار می کنند", () => {
    const a = createRequestGuard();
    const b = createRequestGuard();
    a.next();
    a.next();
    expect(b.isLatest(b.next())).toBe(true);
    expect(a.isLatest(1)).toBe(false);
  });
});

describe("mergePageItems", () => {
  it("در بار اول فهرست را جایگزین می کند", () => {
    expect(mergePageItems([1, 2], [3], false)).toEqual([3]);
  });

  it("در بار بیشتر به ادامه فهرست اضافه می کند", () => {
    expect(mergePageItems([1, 2], [3, 4], true)).toEqual([1, 2, 3, 4]);
  });

  it("آرایه قبلی را تغییر نمی دهد", () => {
    const prev = [1, 2];
    mergePageItems(prev, [3], true);
    expect(prev).toEqual([1, 2]);
  });
});

describe("computeHasMore", () => {
  it("وقتی total معلوم نیست false است", () => {
    expect(computeHasMore(0, null)).toBe(false);
    expect(computeHasMore(5, null)).toBe(false);
  });

  it("وقتی شمار ردیف ها کمتر از total است true است", () => {
    expect(computeHasMore(99, 100)).toBe(true);
  });

  it("وقتی شمار ردیف ها برابر total است false است", () => {
    expect(computeHasMore(100, 100)).toBe(false);
  });

  it("وقتی شمار ردیف ها بیشتر از total است false است", () => {
    expect(computeHasMore(101, 100)).toBe(false);
  });
});
