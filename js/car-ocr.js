// 辨識都在這台裝置上。圖片不會送到我們的伺服器。
// 之後若要改用視覺模型，實作同一個 recognize(blob) → { text } 即可。

let tesseractPromise;

function loadTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.onload = () => (window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error("辨識程式沒有載入")));
      script.onerror = () => reject(new Error("辨識程式沒有載入"));
      document.head.appendChild(script);
    });
  }
  return tesseractPromise;
}

export async function preprocessForOcr(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, bitmap.width * 2);
  canvas.height = Math.max(1, bitmap.height * 2);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = gray > 168 ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
  bitmap.close?.();
  const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return out || blob;
}

export function createTesseractProvider() {
  let workerPromise = null;
  let progress = () => {};
  return {
    id: "tesseract",
    async recognize(blob, hooks = {}) {
      progress = hooks.onProgress || (() => {});
      const worker = await this.ensure();
      const prepared = await preprocessForOcr(blob);
      const result = await worker.recognize(prepared);
      return { text: result?.data?.text || "" };
    },
    ensure() {
      if (!workerPromise) {
        workerPromise = loadTesseract().then((Tesseract) => Tesseract.createWorker("chi_tra+eng", 1, {
          logger: (message) => {
            const ratio = Number(message?.progress || 0);
            const label = message?.status === "recognizing text" ? "辨識文字" : "準備辨識";
            progress({ ratio, label });
          },
        }));
      }
      return workerPromise;
    },
    async terminate() {
      if (!workerPromise) return;
      const worker = await workerPromise;
      workerPromise = null;
      await worker.terminate();
    },
  };
}
