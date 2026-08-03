import type { KycQualityChecks } from "@/src/types/kyc";

const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const MIN_BRIGHTNESS = 40;
const MAX_BRIGHTNESS = 230;
const MIN_CONTRAST = 18;
const MIN_SHARPNESS = 12;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

/**
 * Non-AI heuristic quality checks on a captured image (brightness, contrast, sharpness).
 */
export async function analyzeKycImageQuality(
  blob: Blob
): Promise<KycQualityChecks> {
  const failures: string[] = [];
  const fileSizeBytes = blob.size;

  if (fileSizeBytes < 20_000) {
    failures.push("file_too_small");
  }
  if (fileSizeBytes > MAX_FILE_BYTES) {
    failures.push("file_too_large");
  }

  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;

  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    failures.push("resolution_too_low");
  }

  const canvas = document.createElement("canvas");
  // Downsample for analysis speed
  const sampleW = Math.min(320, width);
  const sampleH = Math.max(1, Math.round((height / width) * sampleW));
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return {
      width,
      height,
      averageBrightness: 0,
      contrast: 0,
      sharpness: 0,
      fileSizeBytes,
      passed: false,
      failures: [...failures, "canvas_unavailable"],
    };
  }

  ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const gray = new Float32Array(sampleW * sampleH);

  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = g;
    sum += g;
  }

  const averageBrightness = sum / gray.length;

  let varianceSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i]! - averageBrightness;
    varianceSum += d * d;
  }
  const contrast = Math.sqrt(varianceSum / gray.length);

  // Laplacian variance as sharpness / readability proxy
  let lapSum = 0;
  let lapCount = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = y * sampleW + x;
      const lap =
        -4 * gray[idx]! +
        gray[idx - 1]! +
        gray[idx + 1]! +
        gray[idx - sampleW]! +
        gray[idx + sampleW]!;
      lapSum += lap * lap;
      lapCount++;
    }
  }
  const sharpness = lapCount > 0 ? lapSum / lapCount : 0;

  if (averageBrightness < MIN_BRIGHTNESS) {
    failures.push("too_dark");
  }
  if (averageBrightness > MAX_BRIGHTNESS) {
    failures.push("too_bright");
  }
  if (contrast < MIN_CONTRAST) {
    failures.push("low_contrast");
  }
  if (sharpness < MIN_SHARPNESS) {
    failures.push("blurry_or_unreadable");
  }

  return {
    width,
    height,
    averageBrightness: Math.round(averageBrightness * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    sharpness: Math.round(sharpness * 10) / 10,
    fileSizeBytes,
    passed: failures.length === 0,
    failures,
  };
}

export function qualityFailureMessage(failures: string[]): string {
  if (failures.includes("too_dark")) {
    return "تصویر خیلی تاریک است. در محیط روشن‌تر عکس بگیرید.";
  }
  if (failures.includes("too_bright")) {
    return "تصویر خیلی روشن است. از نور مستقیم یا فلش اجتناب کنید.";
  }
  if (failures.includes("blurry_or_unreadable")) {
    return "تصویر تار است. مدارک را ثابت نگه دارید و دوباره تلاش کنید.";
  }
  if (failures.includes("low_contrast")) {
    return "وضوح تصویر کافی نیست. مطمئن شوید همه مدارک خوانا هستند.";
  }
  if (failures.includes("resolution_too_low")) {
    return "کیفیت دوربین کافی نیست. دوربین عقب گوشی را امتحان کنید.";
  }
  if (failures.includes("file_too_large")) {
    return "حجم تصویر بیش از حد مجاز است.";
  }
  return "کیفیت تصویر قابل قبول نیست. لطفاً دوباره تلاش کنید.";
}
