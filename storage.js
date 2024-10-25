export function loadPixels() {
  if (window.localStorage.pixels) {
    return JSON.parse(window.localStorage.pixels);
  }
}

export function loadPixelTimestamps() {
  if (window.localStorage.pixelTimestamps) {
    return JSON.parse(window.localStorage.pixelTimestamps);
  }
}

export function loadMaxLamportTimestamp() {
  return parseInt(window.localStorage.maxLamportTimestamp || "0");
}

export function loadMaxSerial() {
  return parseInt(window.localStorage.maxSerial || "0");
}

export function saveState(pixels, pixelsTs, maxTs, maxSerial) {
  window.localStorage.pixels = JSON.stringify(pixels);
  window.localStorage.pixelTimestamps = JSON.stringify(pixelsTs);
  window.localStorage.maxLamportTimestamp = maxTs;
  window.localStorage.maxSerial = maxSerial;
}
