var gridWidth = 30;
var gridHeight = 30;

let size = gridWidth * gridHeight;

// lookups are very fast with Typed Arrays, making them a suitable structure
// in case you want to implement a larger grid
// Uint8 are the smallest available option
// they are also conveniently initialized with zeros
var pixels = new Uint8Array(size);

// an implementation of Lamport Timestamps
// (https://en.wikipedia.org/wiki/Lamport_timestamp)
// lets us determine if one update is known to have
// happened before another, or if they are concurrent

// 'recency' tracks the largest known sequence number for each pixel
// at an offset corresponding to that of the 'pixels' array
// a Uint32Array lets us track more than 4 Billion updates
let recency = new Uint32Array(size);

// this will be updated to the greatest Lamport timestamp
// which we have observed,
let mostRecentLogicalTime = 0;

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

  function beep(freq) {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = freq;
    oscillator.connect(context.destination);
    oscillator.start(); 
    oscillator.stop(context.currentTime + 0.1);
  }

  function setPixel (offset, value, seqnum) {
    // update recency:
    recency[offset] = seqnum;
    // and update the value
    pixels[offset] = value;
  }

  function getOffset (x, y) {
    return y * gridHeight + x;
  }

  function isPositiveInteger (n) {
    return Number.isInteger(n) && n > 0;
  }

  window.webxdc.setUpdateListener(function (update) {
    console.log(update);
    let {
      x,
      y,
      seqnum,
      enabled,
    } = update.payload;

    // incoming Lamport timestamps should always be positive integers.
    // ignoring non-comforming updates makes that a guarantee.
    if (!isPositiveInteger(seqnum)) { return; }

    // we can afford not to validate other update values
    // because TypedArrays restrict the possible values
    // and out-of-bounds updates make no practical difference

    // update the global timestamp if the incoming value is greater
    mostRecentLogicalTime = Math.max(seqnum, mostRecentLogicalTime);

    let offset = getOffset(x, y);
    let currentPixelTime = recency[offset];
    if (currentPixelTime < seqnum) {
      // the update is newer than the currently set pixel value
      // apply it and update its sequence number
      setPixel(offset, enabled, seqnum);
    } else if (currentPixelTime === seqnum) {
      // if the incoming value has the same sequence number
      // as the currently set value, then we consider them concurrent.
      // ensure convergence with an arbitrary but deterministic tie-breaker
      // taking the larger of the two values is sufficient for integers
      setPixel(offset, Math.max(pixels[offset], enabled), seqnum);
    } else {
      // if the incoming update has a lower sequence number
      // than the current state for this pixel, ignore it
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
      ((event.clientX - rect.left) / rect.width) * gridWidth
    );
    var gridYPos = Math.floor(
      ((event.clientY - rect.top) / rect.height) * gridHeight
    );
    var offset = getOffset(gridXPos, gridYPos);

    // serializing updates as numbers is marginally more efficient than booleans.
    // coercing the number from a boolean ensures it is either 0 or 1
    var value = Number(!pixels[offset]);

    // when sending an update we include a sequence number
    // that is one greater than the largest we have seen.
    // this provides peers with enough information about our
    // local state to interpret updates in a globally consistent way
    let newLamportTimestamp = mostRecentLogicalTime = mostRecentLogicalTime + 1;
    window.webxdc.sendUpdate(
      {
        payload: {
          x: gridXPos,
          y: gridYPos,
          enabled: value,
          seqnum: newLamportTimestamp,
        },
      },
      "pixel update"
    );
  }

  canvas.addEventListener("mousedown", mouseDownHandler);
  draw();
}

(function () {
  init();
})();
