const gridWidth = 30;
const gridHeight = 30;

const size = gridWidth * gridHeight;

// lookups are very fast with Typed Arrays, also suitable for larger grids.
// Uint8 are the smallest available option, conveniently initialized with zeros
const pixels = new Uint8Array(size);

// 'pixelTimestamps' tracks the Lamport Timestamp for each pixel
// to determine whether they happened before another, or if they are concurrent.
// (https://en.wikipedia.org/wiki/Lamport_timestamp)
// Uint32Array lets us track more than 4 Billion updates.
const pixelTimestamps = new Uint32Array(size);

// highest Lamport timestamp which we have observed
let maxLamportTimestamp = 0;

let mouseColor = 1;

// Set of pixels buffered for sending.
// Element is zero if mouse has not crossed the pixel
// since mouse was pressed, one otherwise.
// Buffered pixels are sent out on mouse up,
// but drawn immediately.
const bufferedPixels = new Uint8Array(size);

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
        const pixelColor = bufferedPixels[offset] ? mouseColor : pixels[offset];
        const x = (canvas.width / gridWidth) * i;
        const y = (canvas.height / gridHeight) * j;

        if (pixelColor) {
          ctx.fillStyle = "black";
          ctx.fillRect(x, y, pixelWidth, pixelHeight);
        }
      }
    }

    requestAnimationFrame(draw);
  }

  let realtimeChannel;
  if (window.webxdc.joinRealtimeChannel !== undefined) {
    realtimeChannel = window.webxdc.joinRealtimeChannel();
    realtimeChannel.setListener((data) => {
      const view = new DataView(data.buffer);
      const offset = view.getUint32(0);
      const lamportTimestamp = view.getUint32(4);
      const value = view.getUint8(8);
      const pixelTimestamp = pixelTimestamps[offset];
      if (pixelTimestamp < lamportTimestamp) {
        pixels[offset] = value;
        pixelTimestamps[offset] = lamportTimestamp;
      } else if (pixelTimestamp === lamportTimestamp) {
        pixels[offset] = Math.max(pixels[offset], value);
      }
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

  window.webxdc.setUpdateListener(function (update) {
    console.log(update);
    let {
      offsets,
      value,
      lamportTimestamp,
    } = update.payload;

    maxLamportTimestamp = Math.max(lamportTimestamp, maxLamportTimestamp);

    for (const offset of offsets) {
      let pixelTimestamp = pixelTimestamps[offset];
      if (pixelTimestamp < lamportTimestamp) {
        // update is newer than the currently set pixel value
        pixels[offset] = value;
        pixelTimestamps[offset] = lamportTimestamp;
      } else if (pixelTimestamp === lamportTimestamp) {
        // the update was sent concurrently to our current pixel value.
        // ensure convergence with an arbitrary but deterministic tie-breaker:
        // taking the larger of the two values is sufficient for integers
        pixels[offset] = Math.max(pixels[offset], value);
      } else {
        // if the incoming update has a lower lamport Timestamp
        // than the current one for this pixel, ignore it
      }
    }

    if (update.serial === update.max_serial) {
      beep(300);
    }
  });

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
    mouseColor = Number(!pixels[offset]);

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
    const gridXPos = Math.floor(
      ((event.clientX - rect.left) / rect.width) * gridWidth,
    );
    const gridYPos = Math.floor(
      ((event.clientY - rect.top) / rect.height) * gridHeight,
    );
    const offset = gridYPos * gridHeight + gridXPos;
    if (realtimeChannel !== undefined) {
      const data = new Uint8Array(9);
      const view = new DataView(data.buffer);
      view.setUint32(0, offset);

      maxLamportTimestamp = maxLamportTimestamp + 1;
      view.setUint32(4, maxLamportTimestamp);

      view.setUint8(8, mouseColor);
      realtimeChannel.send(data);
    }

    bufferedPixels[offset] = 1;
  }

  function mouseUpHandler(event) {
    // Send all the buffered changes outside.

    // when sending an update we use a Lamport timestamp
    // that is one greater than the largest we have seen
    // to allow `setUpdateListener` to consistently resolve concurrent updates
    maxLamportTimestamp = maxLamportTimestamp + 1;

    let offsets = [];
    for (let offset = 0; offset < size; offset++) {
      if (bufferedPixels[offset]) {
        offsets.push(offset);
        pixels[offset] = mouseColor;
      }
      bufferedPixels[offset] = 0;
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
    if (event.touches.length == 1) {
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
