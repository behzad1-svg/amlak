"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";

// هوک مرکزی فهرست ها: loading و error و retry و debounce و نادیده گرفتن پاسخ قدیمی.
// الگو از customers/page.tsx و properties/page.tsx گرفته شده است:
// هر دو صفحه load(pageNum, append) دارند، خطای بار اول را با PageError و دکمه
// «تلاش دوباره» نشان می دهند، خطای «بارگذاری بیشتر» را جدا نگه می دارند و
// درخواست را با تاخیر می فرستند. تفاوت اصلی این بود که فقط صفحه فایل ها پاسخ
// قدیمی را با requestId کنار می گذاشت؛ این هوک همان نگهبان را برای همه فهرست ها می آورد.
// برای مسابقه درخواست ها از requestId استفاده شده است، نه AbortController:
// apiJson مسیر signal ندارد و لغو درخواست در apiFetch به خطای شبکه تبدیل می شود.

/** نتیجه یک صفحه از API فهرست. */
export type ApiListResult<TItem, TExtra = unknown> = {
  /** ردیف های همین صفحه */
  items: TItem[];
  /** تعداد کل ردیف ها؛ اگر سرور نداده باشد، طول همین صفحه حساب می شود */
  total?: number | null;
  /** داده اضافه همان پاسخ (مثل stageCounts و sourceStats در مشتریان) */
  extra?: TExtra;
};

export type UseApiListOptions<TItem, TExtra = unknown> = {
  /** واکشی یک صفحه؛ صفحه ها از 1 شروع می شوند. خطا را با throw برگرداند. */
  fetcher: (page: number) => Promise<ApiListResult<TItem, TExtra>>;
  /** تاخیر خودکار بارگذاری پس از تغییر deps (میلی ثانیه). پیش فرض 250؛
   *  صفحه مشتریان 250 و صفحه فایل ها 280 می خواهد (فقط وقتی فیلتر متنی هست). */
  debounceMs?: number;
  /** هر وقت یکی از این مقدارها عوض شود، صفحه 1 دوباره و با تاخیر خوانده می شود.
   *  همان آرایه وابستگی های useEffect صفحه هاست، مثلا [showLost, search, filters, staleOnly]. */
  deps?: readonly unknown[];
  /** اگر false باشد، بارگذاری خودکار انجام نمی شود و فقط load دستی کار می کند. */
  enabled?: boolean;
};

export type UseApiListResult<TItem, TExtra = unknown> = {
  items: TItem[];
  extra: TExtra | null;
  total: number | null;
  page: number;
  /** بارگذاری صفحه اول (یا بارگذاری دوباره) در جریان است */
  loading: boolean;
  /** «بارگذاری بیشتر» در جریان است */
  loadingMore: boolean;
  /** خطای بارگذاری صفحه اول؛ خالی بودن یعنی خطایی نیست */
  error: string | null;
  /** خطای «بارگذاری بیشتر»؛ فهرست فعلی سر جایش می ماند */
  appendError: string | null;
  hasMore: boolean;
  /** بارگذاری دستی؛ page پیش فرض 1 و append پیش فرض false است */
  load: (page?: number, append?: boolean) => Promise<void>;
  /** صفحه بعد را به فهرست اضافه می کند؛ اگر صفحه بیشتری نباشد کاری نمی کند */
  loadMore: () => Promise<void>;
  /** همان load(1, false)؛ برای دکمه «تلاش دوباره» در PageError */
  retry: () => Promise<void>;
};

/** نگهبان requestId: فقط پاسخ آخرین درخواست اعمال می شود.
 *  منطق خالص است تا بدون React تست شود. */
export function createRequestGuard(): {
  next: () => number;
  isLatest: (id: number) => boolean;
} {
  let latest = 0;
  return {
    next() {
      latest += 1;
      return latest;
    },
    isLatest(id: number) {
      return id === latest;
    },
  };
}

/** ترکیب صفحه تازه با فهرست فعلی: جایگزینی در بار اول، افزودن در «بیشتر». */
export function mergePageItems<TItem>(prev: TItem[], items: TItem[], append: boolean): TItem[] {
  return append ? [...prev, ...items] : items;
}

/** آیا ردیف بیشتری هست؟ وقتی total معلوم نیست، false است. */
export function computeHasMore(itemCount: number, total: number | null): boolean {
  return total !== null && itemCount < total;
}

export function useApiList<TItem, TExtra = unknown>(
  options: UseApiListOptions<TItem, TExtra>
): UseApiListResult<TItem, TExtra> {
  const { fetcher, debounceMs = 250, deps = [], enabled = true } = options;
  const [items, setItems] = useState<TItem[]>([]);
  const [extra, setExtra] = useState<TExtra | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appendError, setAppendError] = useState<string | null>(null);

  // fetcher در هر رندر تازه ساخته می شود (به فیلترها وابسته است)؛ پس تازه ترین آن را
  // در ref نگه می داریم تا load هویت ثابت داشته باشد و افکت بی دلیل تکرار نشود.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const guardRef = useRef(createRequestGuard());

  const load = useCallback(async (pageNum = 1, append = false) => {
    const guard = guardRef.current;
    const myId = guard.next();
    if (append) {
      setLoadingMore(true);
      setAppendError(null);
    } else {
      setLoading(true);
      setError(null);
      setAppendError(null);
    }
    try {
      const result = await fetcherRef.current(pageNum);
      if (!guard.isLatest(myId)) return;
      setItems((prev) => mergePageItems(prev, result.items, append));
      setTotal((prev) => result.total ?? (append ? prev : result.items.length));
      if (result.extra !== undefined) setExtra(result.extra);
      setPage(pageNum);
    } catch (e) {
      if (!guard.isLatest(myId)) return;
      if (append) setAppendError(errorMessage(e));
      else setError(errorMessage(e));
    } finally {
      if (guard.isLatest(myId)) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    if (total !== null && items.length >= total) return;
    await load(page + 1, true);
  }, [loading, loadingMore, total, items.length, page, load]);

  const retry = useCallback(() => load(1, false), [load]);

  // بارگذاری خودکار با تاخیر؛ مثل هر دو صفحه: تایمر با هر تغییر deps از اول
  // ساخته می شود و cleanup آن را پاک می کند.
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      void load(1, false);
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    items,
    extra,
    total,
    page,
    loading,
    loadingMore,
    error,
    appendError,
    hasMore: computeHasMore(items.length, total),
    load,
    loadMore,
    retry,
  };
}
