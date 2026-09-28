import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScreenWakeLock } from "@/lib/wake-lock";

class FakeSentinel extends EventTarget {
  released = false;
  type = "screen" as const;
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

function mockWakeLock(request: () => Promise<FakeSentinel>) {
  const requestMock = vi.fn(request);
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request: requestMock },
  });
  return requestMock;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useScreenWakeLock", () => {
  it("is inert when the Wake Lock API is unsupported", async () => {
    expect("wakeLock" in navigator).toBe(false);
    const { result } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(result.current.active).toBe(false);
    expect(() => act(() => result.current.retry())).not.toThrow();
    expect(result.current.active).toBe(false);
  });

  it("requests a screen lock when active and reports it held", async () => {
    const request = mockWakeLock(async () => new FakeSentinel());
    const { result } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(result.current.active).toBe(true);
  });

  it("releases when deactivated and on unmount", async () => {
    const sentinels: FakeSentinel[] = [];
    mockWakeLock(async () => {
      const s = new FakeSentinel();
      sentinels.push(s);
      return s;
    });
    const { result, rerender, unmount } = renderHook(
      ({ on }) => useScreenWakeLock(on),
      { initialProps: { on: true } }
    );
    await flush();
    expect(result.current.active).toBe(true);

    rerender({ on: false });
    await flush();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);

    rerender({ on: true });
    await flush();
    expect(result.current.active).toBe(true);
    unmount();
    expect(sentinels[1].release).toHaveBeenCalledTimes(1);
  });

  it("re-acquires on visible after the OS releases the lock", async () => {
    const sentinels: FakeSentinel[] = [];
    const request = mockWakeLock(async () => {
      const s = new FakeSentinel();
      sentinels.push(s);
      return s;
    });
    const { result } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(result.current.active).toBe(true);

    await act(async () => {
      await sentinels[0].release();
    });
    expect(result.current.active).toBe(false);

    act(() => setVisibility("hidden"));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBe(true);

    act(() => setVisibility("visible"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("swallows rejection and retries once until success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const request = mockWakeLock(async () => {
      if (fail) throw new DOMException("denied", "NotAllowedError");
      return new FakeSentinel();
    });
    const { result } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(result.current.active).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    fail = false;
    const retry = result.current.retry;
    act(() => result.current.retry());
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBe(true);
    expect(result.current.retry).toBe(retry);

    act(() => result.current.retry());
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("allows only one retry per failure", async () => {
    const request = mockWakeLock(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { result } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await flush();
    act(() => result.current.retry());
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBe(false);
  });

  it("releases a lock that resolves after deactivation", async () => {
    const pending = deferred<FakeSentinel>();
    mockWakeLock(() => pending.promise);
    const { result, rerender } = renderHook(
      ({ on }) => useScreenWakeLock(on),
      { initialProps: { on: true } }
    );
    rerender({ on: false });
    const late = new FakeSentinel();
    await act(async () => {
      pending.resolve(late);
      await pending.promise;
    });
    await flush();
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });
});
