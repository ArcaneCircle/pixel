import {
  createEncoder,
  toUint8Array,
  writeVarString,
  writeVarUint,
} from "lib0/encoding";
import { createDecoder, readVarString, readVarUint } from "lib0/decoding";
import getRGB from "consistent-color-generation";
import {
  loadPixels,
  loadPixelTimestamps,
  loadMaxLamportTimestamp,
  loadMaxSerial,
  saveState,
} from "./storage.js";

const gridWidth = 30;
const gridHeight = 30;

const size = gridWidth * gridHeight;

// lookups are very fast with Typed Arrays, also suitable for larger grids.
// Uint8 are the smallest available option, conveniently initialized with zeros
const pixels = loadPixels() || new Array(size);

// 'pixelTimestamps' tracks the Lamport Timestamp for each pixel
// to determine whether they happened before another, or if they are concurrent.
// (https://en.wikipedia.org/wiki/Lamport_timestamp)
// Uint32Array lets us track more than 4 Billion updates.
const pixelTimestamps = loadPixelTimestamps() || new Uint32Array(size);

// highest Lamport timestamp which we have observed
let maxLamportTimestamp = loadMaxLamportTimestamp();

let initialized = false;

const emptyPixel = "EMPTY";
const selfColor = getRGB(window.webxdc.selfAddr).toString();
let mouseColor = selfColor;

// Set of pixels buffered for sending.
// Element is zero if mouse has not crossed the pixel
// since mouse was pressed, one otherwise.
// Buffered pixels are sent out on mouse up,
// but drawn immediately.
const bufferedPixels = new Array(size);

function init() {
  function draw() {
    var canvas = document.getElementById("mycanvas");
    var ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();

    var pixelWidth = canvas.width / gridWidth;
    var pixelHeight = canvas.height / gridHeight;
    for (var i = 1; i < gridWidth; i++) {
      var x = pixelWidth * i;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }

    for (var j = 1; j < gridHeight; j++) {
      var y = pixelHeight * j;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }

    ctx.stroke();

    const now = Date.now();
    for (var i = 0; i < gridWidth; i++) {
      for (var j = 0; j < gridHeight; j++) {
        const offset = j * gridHeight + i;
        const pixelColor =
          bufferedPixels[offset] || pixels[offset] || emptyPixel;
        const x = (canvas.width / gridWidth) * i;
        const y = (canvas.height / gridHeight) * j;

        if (pixelColor !== emptyPixel) {
          ctx.fillStyle = pixelColor;
          ctx.fillRect(x, y, pixelWidth, pixelHeight);
        }
      }
    }

    requestAnimationFrame(draw);
  }

  function applyPixelUpdate(offset, value, lamportTimestamp) {
    let pixelTimestamp = pixelTimestamps[offset];
    if (pixelTimestamp < lamportTimestamp) {
      // update is newer than the currently set pixel value
      pixels[offset] = value;
      pixelTimestamps[offset] = lamportTimestamp;
    } else if (pixelTimestamp === lamportTimestamp) {
      // the update was sent concurrently to our current pixel value.
      // ensure convergence with an arbitrary but deterministic tie-breaker:
      // taking the larger of the two values is sufficient for integers
      pixels[offset] = emptyPixel;
    } else {
      // if the incoming update has a lower lamport Timestamp
      // than the current one for this pixel, ignore it
    }
  }

  let realtimeChannel;
  if (window.webxdc.joinRealtimeChannel !== undefined) {
    realtimeChannel = window.webxdc.joinRealtimeChannel();
    realtimeChannel.setListener((data) => {
      const decoder = createDecoder(data);
      const offset = readVarUint(decoder);
      const lamportTimestamp = readVarUint(decoder);
      const value = readVarString(decoder);
      applyPixelUpdate(offset, value, lamportTimestamp);
    });
  }

  let audioContext = null;
  function beep(freq) {
    if (audioContext === null) {
      audioContext = new AudioContext();
    }
    const oscillator = audioContext.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = freq;
    oscillator.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  window.webxdc
    .setUpdateListener(function (update) {
      let { offsets, value, lamportTimestamp } = update.payload;

      maxLamportTimestamp = Math.max(lamportTimestamp, maxLamportTimestamp);

      for (const offset of offsets) {
        applyPixelUpdate(offset, value, lamportTimestamp);
      }

      if (update.serial === update.max_serial) {
        if (initialized) {
          beep(300);
        }
        saveState(
          pixels,
          pixelTimestamps,
          maxLamportTimestamp,
          update.max_serial,
        );
      }
    }, loadMaxSerial())
    .then(() => (initialized = true));

  var canvas = document.getElementById("mycanvas");

  function mouseDownHandler(event) {
    var rect = canvas.getBoundingClientRect();
    var gridXPos = Math.floor(
      ((event.clientX - rect.left) / rect.width) * gridWidth,
    );
    var gridYPos = Math.floor(
      ((event.clientY - rect.top) / rect.height) * gridHeight,
    );
    var offset = gridYPos * gridHeight + gridXPos;

    // coercing the number from a boolean ensures it is either 0 or 1
    mouseColor = pixels[offset] === selfColor ? emptyPixel : selfColor;

    // Capture the pointer so we receive `pointerup` event
    // even outside the canvas.
    canvas.setPointerCapture(event.pointerId);

    mouseMoveHandler(event);
  }

  function mouseMoveHandler(event) {
    if (event.pressure === 0) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom
    ) {
      return; // mouse out of the canvas boundaries
    }
    const gridXPos = Math.floor(
      ((event.clientX - rect.left) / rect.width) * gridWidth,
    );
    const gridYPos = Math.floor(
      ((event.clientY - rect.top) / rect.height) * gridHeight,
    );
    const offset = gridYPos * gridHeight + gridXPos;
    if (realtimeChannel !== undefined) {
      const encoder = createEncoder();
      writeVarUint(encoder, offset);
      writeVarUint(encoder, ++maxLamportTimestamp);
      writeVarString(encoder, mouseColor);
      realtimeChannel.send(toUint8Array(encoder));
    }

    bufferedPixels[offset] = mouseColor;
  }

  function mouseUpHandler(event) {
    // Send all the buffered changes outside.

    // when sending an update we use a Lamport timestamp
    // that is one greater than the largest we have seen
    // to allow `setUpdateListener` to consistently resolve concurrent updates
    maxLamportTimestamp++;

    let offsets = [];
    for (let offset = 0; offset < size; offset++) {
      if (bufferedPixels[offset]) {
        offsets.push(offset);
        pixels[offset] = bufferedPixels[offset];
      }
      bufferedPixels[offset] = null;
    }

    window.webxdc.sendUpdate(
      {
        payload: {
          offsets: offsets,
          value: mouseColor,
          lamportTimestamp: maxLamportTimestamp,
        },
      },
      "pixel update",
    );
    // sent updates are also received in a peer's own setUpdateListener
    // which will actually set the pixel value
  }

  canvas.addEventListener("pointerdown", mouseDownHandler);
  canvas.addEventListener("pointermove", mouseMoveHandler);
  canvas.addEventListener("pointerup", mouseUpHandler);

  // Make touch work on mobile phones.
  function touchMoveHandler(event) {
    if (event.touches.length === 1) {
      mouseMoveHandler(event.touches[0]);
      event.preventDefault();
    }
  }
  canvas.addEventListener("touchmove", touchMoveHandler);

  draw();
}

(function () {
  init();
})();
