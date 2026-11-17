const memoryLocal = new Map();
const memorySession = new Map();

function nativeStore(name) {
  try {
    const store = window[name];
    const probe = `__hub_${name}_probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function wrapStore(native, memory) {
  return {
    getItem(key) {
      try {
        if (native) return native.getItem(key);
      } catch { /* 改用記憶體 */ }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      const text = String(value);
      try {
        if (native) {
          native.setItem(key, text);
          return;
        }
      } catch { /* 改用記憶體 */ }
      memory.set(key, text);
    },
    removeItem(key) {
      try {
        if (native) native.removeItem(key);
      } catch { /* 改用記憶體 */ }
      memory.delete(key);
    },
  };
}

export const safeLocal = wrapStore(nativeStore("localStorage"), memoryLocal);
export const safeSession = wrapStore(nativeStore("sessionStorage"), memorySession);

export function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* 下面改用 Math.random */ }
  const hex = [];
  for (let i = 0; i < 32; i += 1) hex.push(Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
