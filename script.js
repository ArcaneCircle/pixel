var gridWidth = 30;
var gridHeight = 30;
var pixels = [];
for (let i = 0; i < gridWidth * gridHeight; i++) {
  pixels.push(false);
}

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

  window.webxdc.setUpdateListener(function (update) {
    console.log(update);
    let x = update.payload.x;
    let y = update.payload.y;
    pixels[y * gridHeight + x] = update.payload.enabled;
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

    window.webxdc.sendUpdate(
      {
        payload: {
          x: gridXPos,
          y: gridYPos,
          enabled: !pixels[gridYPos * gridHeight + gridXPos],
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
