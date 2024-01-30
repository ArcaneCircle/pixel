var gridWidth = 30;
var gridHeight = 30;

let size = gridWidth * gridHeight;

// lookups are very fast with Typed Arrays, making them a suitable structure
// in case you want to implement a larger grid
// Uint8 are the smallest available option
// they are also conveniently initialized with zeros
var pixels = new Uint8Array(size);

// 'recency' tracks the largest known sequence number for each pixel
// at an offset corresponding to the 'pixels' array
// Uint16 gives us up to 65535 updates, which is probably enough
// this can always be converted to a Uint32Array during runtime
// or even an array of BigInts if we really want to prove 'correctness'
let recency = new Uint16Array(size);

let largestKnownSequence = 0;

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

  function setPixel (offset, value, sequence) {
    // update recency:
    recency[offset] = sequence;
    // and update the value
    pixels[offset] = value;
  };

  window.webxdc.setUpdateListener(function (update) {
    console.log(update);
    let {
      x,
      y,
      sequence,
      enabled,
    } = update.payload;

    largestKnownSequence = Math.max(sequence, largestKnownSequence);

    let offset = y * gridHeight + x;
    let currentSequence = recency[offset];
    if (currentSequence < sequence) {
      // the update is newer than the currently set pixel value
      // apply it and update its sequence number
      setPixel(offset, enabled, sequence);
    } else if (currentSequence === sequence) {
      // if the incoming value has the same sequence number
      // as the currently set value, then we consider them concurrent
      // ensure convergence with an arbitrary but deterministic tie-breaker
      // taking the larger of the two values is sufficient for integers
      setPixel(offset, Math.max(pixels[offset], enabled), sequence);
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

    // when sending an update we include a sequence number
    // that is one greater than the largest sequence we have seen.
    // this provides peers with enough information about our
    // local state to interpret updates in a globally consistent way
    let newSequence = largestKnownSequence = largestKnownSequence + 1;
    window.webxdc.sendUpdate(
      {
        payload: {
          x: gridXPos,
          y: gridYPos,
          // serializing updates as a number is marginally more efficient than a boolean
          // coercing the number from a boolean ensures it is either 0 or 1
          enabled: Number(!pixels[gridYPos * gridHeight + gridXPos]),
          sequence: newSequence,
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
