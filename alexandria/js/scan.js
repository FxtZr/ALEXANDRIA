/* ALEXANDRIA -- getting a code in.
 *
 * Four ways, in order of how reliably they work:
 *
 *   an image file        works everywhere, needs no permission
 *   paste                works wherever the clipboard carries an image
 *   drag and drop        the same
 *   the camera           needs permission, and a secure context
 *
 * The camera is deliberately last. Reading a photograph needs nothing from
 * the operating system, while a live camera needs a permission prompt and
 * a page served over https or from a local file the browser happens to
 * trust. Making the camera the primary path would mean the program fails
 * for some readers before it has done anything, so it is an enhancement
 * and its absence is stated plainly rather than hidden.
 *
 * Nothing here transmits an image anywhere. Decoding happens on a canvas
 * in this page and the pixels are discarded afterwards.
 */
(function (root) {
  "use strict";

  var MAX_EDGE = 1600;   // large photographs are downscaled before decoding

  function ScanError(code, detail) {
    this.name = "ScanError";
    this.code = code;
    this.detail = detail;
  }
  ScanError.prototype = Object.create(Error.prototype);

  function available() {
    return typeof root.jsQR === "function";
  }

  /* Decode whatever is currently on a canvas context. */
  function decodeImageData(imageData) {
    if (!available()) throw new ScanError("NO_DECODER");
    var result = root.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });
    return result ? result.data : null;
  }

  /* Draw an image onto a canvas, scaled down if it is large.
   *
   * Downscaling is not only for speed. jsQR looks for a square grid, and a
   * twelve-megapixel photograph of a small code carries so much sensor
   * noise between the modules that the grid is harder to find than in the
   * same picture at a quarter of the size. */
  function toImageData(source, width, height) {
    var scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    var w = Math.max(1, Math.round(width * scale));
    var h = Math.max(1, Math.round(height * scale));

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  /* A code photographed at an angle, or printed small, often decodes at
   * one size and not another. Rather than fail once, try a few. */
  function decodeElement(source, width, height) {
    var attempts = [1, 0.6, 1.6];
    for (var i = 0; i < attempts.length; i++) {
      var w = Math.round(width * attempts[i]);
      var h = Math.round(height * attempts[i]);
      if (w < 40 || h < 40) continue;
      var data = toImageData(source, w, h);
      var text = decodeImageData(data);
      if (text) return text;
    }
    return null;
  }

  function fromBlob(blob) {
    return new Promise(function (resolve, reject) {
      if (!blob || blob.size === 0) {
        reject(new ScanError("EMPTY_FILE"));
        return;
      }
      if (blob.type && blob.type.indexOf("image/") !== 0) {
        reject(new ScanError("NOT_AN_IMAGE", blob.type));
        return;
      }

      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var text;
        try {
          text = decodeElement(img, img.naturalWidth, img.naturalHeight);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
          return;
        }
        URL.revokeObjectURL(url);
        if (text) resolve(text);
        else reject(new ScanError("NO_CODE_FOUND"));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new ScanError("UNREADABLE_IMAGE"));
      };
      img.src = url;
    });
  }

  /* ---- camera ---------------------------------------------------------- */

  function Camera(video) {
    this.video = video;
    this.stream = null;
    this.timer = null;
  }

  Camera.prototype.supported = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  Camera.prototype.start = function (onFound, onError) {
    var self = this;
    if (!this.supported()) {
      onError(new ScanError("NO_CAMERA_API"));
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    }).then(function (stream) {
      self.stream = stream;
      self.video.srcObject = stream;
      self.video.setAttribute("playsinline", "");
      return self.video.play();
    }).then(function () {
      self.timer = setInterval(function () { self.tick(onFound); }, 220);
    })["catch"](function (err) {
      var code = "CAMERA_REFUSED";
      if (err && err.name === "NotFoundError") code = "NO_CAMERA_PRESENT";
      if (err && err.name === "NotAllowedError") code = "CAMERA_REFUSED";
      if (err && err.name === "NotReadableError") code = "CAMERA_BUSY";
      onError(new ScanError(code, err && err.name));
    });
  };

  Camera.prototype.tick = function (onFound) {
    if (!this.video.videoWidth) return;
    var text = null;
    try {
      var data = toImageData(this.video, this.video.videoWidth,
                             this.video.videoHeight);
      text = decodeImageData(data);
    } catch (err) {
      return;
    }
    if (text) {
      this.stop();
      onFound(text);
    }
  };

  Camera.prototype.stop = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  };

  root.ALEXANDRIA = root.ALEXANDRIA || {};
  root.ALEXANDRIA.scan = {
    available: available,
    fromBlob: fromBlob,
    Camera: Camera,
    ScanError: ScanError
  };
})(typeof window !== "undefined" ? window : this);
