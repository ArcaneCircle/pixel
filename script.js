var gridWidth = 30;
var gridHeight = 30;

let size = gridWidth * gridHeight;

// lookups are very fast with Typed Arrays, also suitable for larger grids.
// Uint8 are the smallest available option, conveniently initialized with zeros
var pixels = new Uint8Array(size);

// 'pixelTimestamps' tracks the Lamport Timestamp for each pixel
// to determine whether they happened before another, or if they are concurrent.
// (https://en.wikipedia.org/wiki/Lamport_timestamp)
// Uint32Array lets us track more than 4 Billion updates.
let pixelTimestamps = new Uint32Array(size);

// highest Lamport timestamp which we have observed
let maxLamportTimestamp = 0;

let mouseIsDown = false;
let mouseColor;

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

    for (var i = 0; i < gridWidth; i++) {
      for (var j = 0; j < gridHeight; j++) {
        if (pixels[j * gridHeight + i]) {
          var x = (canvas.width / gridWidth) * i;
          var y = (canvas.height / gridHeight) * j;
          ctx.fillRect(x, y, pixelWidth, pixelHeight);
        }
      }
    }
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
      offset,
      value,
      lamportTimestamp,
    } = update.payload;

    maxLamportTimestamp = Math.max(lamportTimestamp, maxLamportTimestamp);

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

    if (update.serial === update.max_serial) {
      draw();
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
    var newValue = Number(!pixels[offset]);

    // when sending an update we use a Lamport timestamp
    mouseIsDown = true;
    mouseColor = newValue;

    canvas.setPointerCapture(event.pointerId);

    mouseMoveHandler(event);
  }

  function mouseUpHandler(event) {
    mouseIsDown = false;
  }

  function mouseMoveHandler(event) {
    if (!mouseIsDown) {
      return;
    }
    var rect = canvas.getBoundingClientRect();
    var gridXPos = Math.floor(
      ((event.clientX - rect.left) / rect.width) * gridWidth,
    );
    var gridYPos = Math.floor(
      ((event.clientY - rect.top) / rect.height) * gridHeight,
    );
    var offset = gridYPos * gridHeight + gridXPos;

    // that is one greater than the largest we have seen
    // to allow `setUpdateListener` to consistently resolve concurrent updates
    maxLamportTimestamp = maxLamportTimestamp + 1;

    window.webxdc.sendUpdate(
      {
        payload: {
          offset: offset,
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
