/* ALEXANDRIA -- the interface.
 *
 * There is deliberately no button that opens anything.
 *
 * The program exists so that a code can be read without being acted on. An
 * "open this" button would hand back exactly the risk the reader came here
 * to avoid, and it would be pressed, because a button next to a result
 * reads as the thing to do next. Copying is offered instead: it moves the
 * text somewhere the reader chooses, deliberately, in a second step.
 *
 * The decoded content is never rendered as a link, and never as HTML.
 */
(function (root) {
  "use strict";

  var MESSAGES = {
    "NO_DECODER": "The decoder did not load. Check that "
                + "assets/vendor/jsQR.js is present next to index.html.",
    "NO_CODE_FOUND": "No QR code found in that picture. Try a closer crop, "
                   + "or better light.",
    "UNREADABLE_IMAGE": "That file could not be opened as a picture.",
    "NOT_AN_IMAGE": "That is not a picture.",
    "EMPTY_FILE": "That file is empty.",
    "NO_CAMERA_API": "This browser will not give a page access to the "
                   + "camera. Opening the folder over a local web server, "
                   + "or using a picture instead, both work.",
    "NO_CAMERA_PRESENT": "No camera was found.",
    "CAMERA_REFUSED": "Camera access was declined. A picture of the code "
                    + "works just as well.",
    "CAMERA_BUSY": "The camera is in use by something else."
  };

  var LEVEL_LABEL = {
    critical: "Serious",
    warning: "Worth pausing over",
    note: "Worth knowing"
  };

  var state = { camera: null };

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function el(id) { return document.getElementById(id); }

  function say(message, kind) {
    var box = el("status");
    box.textContent = message || "";
    box.className = "status" + (kind ? " is-" + kind : "");
  }

  function explain(err) {
    if (err && err.code && MESSAGES[err.code]) return MESSAGES[err.code];
    if (err && err.message) return err.message;
    return "Something went wrong.";
  }

  /* ---- rendering the report -------------------------------------------- */

  /* The raw content, shown as text and only as text.
   *
   * Rendering it as an anchor would make it clickable, which is the one
   * thing this program must not do. Rendering it as HTML would let a
   * payload write into this page. It goes in through textContent and
   * nowhere else. */
  function rawBlock(text) {
    var pre = h("pre", { class: "raw" });
    pre.textContent = text;

    var copy = h("button", { type: "button", class: "copy",
                             text: "Copy the text" });
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy the text"; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          fallbackCopy(pre, done);
        });
      } else {
        fallbackCopy(pre, done);
      }
    });

    return h("div", { class: "raw-block" }, [
      h("div", { class: "raw-head" }, [
        h("p", { class: "label", text: "Exactly what the code says" }),
        copy
      ]),
      pre
    ]);
  }

  function fallbackCopy(node, done) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = root.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand("copy"); done(); } catch (e) { /* nothing */ }
    sel.removeAllRanges();
  }

  function renderFindings(findings) {
    if (!findings.length) {
      return h("div", { class: "verdict is-quiet" }, [
        h("p", { class: "verdict-head", text: "Nothing matched the checks" }),
        h("p", {
          class: "verdict-body",
          text: "That is not the same as safe. This program compares a code "
              + "against a fixed list of known tricks; a code doing "
              + "something it has never seen produces exactly this result. "
              + "Read the content above and decide for yourself."
        })
      ]);
    }

    var order = { critical: 0, warning: 1, note: 2 };
    var sorted = findings.slice().sort(function (a, b) {
      return order[a.level] - order[b.level];
    });

    var list = h("ul", { class: "findings" });
    sorted.forEach(function (f) {
      list.appendChild(h("li", { class: "finding is-" + f.level }, [
        h("p", { class: "finding-level", text: LEVEL_LABEL[f.level] }),
        h("p", { class: "finding-title", text: f.title }),
        h("p", { class: "finding-detail", text: f.detail })
      ]));
    });
    return list;
  }

  function renderReport(report) {
    var host = el("report");
    host.innerHTML = "";

    var worst = report.worst();
    var head = h("div", { class: "report-head is-" + worst }, [
      h("p", { class: "label", text: report.label }),
      h("p", {
        class: "report-verdict",
        text: worst === "none" ? "Nothing flagged"
            : worst === "note" ? "One thing to know"
            : worst === "warning" ? "Pause before acting"
            : "Do not act on this"
      })
    ]);
    host.appendChild(head);

    host.appendChild(rawBlock(report.raw));

    if (report.fields.length) {
      var body = h("tbody");
      report.fields.forEach(function (f) {
        var cell = h("td");
        cell.textContent = f.value;
        body.appendChild(h("tr", null, [
          h("th", { scope: "row", text: f.name }),
          cell
        ]));
        if (f.note) {
          body.appendChild(h("tr", { class: "field-note" }, [
            h("td", { colspan: "2", text: f.note })
          ]));
        }
      });
      host.appendChild(h("div", { class: "fields" }, [
        h("p", { class: "label", text: "Broken down" }),
        h("table", { class: "rows" }, [body])
      ]));
    }

    host.appendChild(renderFindings(report.findings));
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handle(text) {
    say("");
    try {
      renderReport(root.ALEXANDRIA.inspect(text));
    } catch (err) {
      say("The content could not be inspected: " + explain(err), "bad");
    }
  }

  /* ---- intake ---------------------------------------------------------- */

  function readBlob(blob) {
    say("Reading\u2026");
    root.ALEXANDRIA.scan.fromBlob(blob).then(handle, function (err) {
      say(explain(err), "bad");
    });
  }

  function stopCamera() {
    if (state.camera) { state.camera.stop(); state.camera = null; }
    el("stage").hidden = true;
    el("camera").setAttribute("aria-pressed", "false");
  }

  function startCamera() {
    var stage = el("stage");
    stage.hidden = false;
    el("camera").setAttribute("aria-pressed", "true");
    say("Point the camera at a code. Nothing is recorded.");

    state.camera = new root.ALEXANDRIA.scan.Camera(el("video"));
    state.camera.start(function (text) {
      stopCamera();
      handle(text);
    }, function (err) {
      stopCamera();
      say(explain(err), "bad");
    });
  }

  function start() {
    if (!root.ALEXANDRIA.scan.available()) {
      say(MESSAGES.NO_DECODER, "bad");
    }

    el("pick").addEventListener("click", function () { el("file").click(); });
    el("file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) readBlob(e.target.files[0]);
      e.target.value = "";
    });

    var drop = el("drop");
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (e) {
        e.preventDefault();
        drop.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (e) {
        e.preventDefault();
        drop.classList.remove("is-over");
      });
    });
    drop.addEventListener("drop", function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) readBlob(files[0]);
    });

    document.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          readBlob(items[i].getAsFile());
          return;
        }
      }
    });

    el("camera").addEventListener("click", function () {
      if (state.camera) stopCamera(); else startCamera();
    });
    el("stopCamera").addEventListener("click", stopCamera);

    function inspectTyped() {
      var value = el("text").value.trim();
      if (value) handle(value);
    }
    el("inspect").addEventListener("click", inspectTyped);
    el("text").addEventListener("keydown", function (e) {
      if (e.key === "Enter") inspectTyped();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : this);
