(function () {
  function closestHandle(node, selector, root) {
    while (node && node !== root) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function create(list, options) {
    options = options || {};
    var handle = options.handle || null;
    var dragging = null;
    var pointerDragging = false;
    var pointerStartY = 0;

    Array.from(list.children).forEach(function (item) {
      item.draggable = true;
      if (window.PointerEvent) item.style.touchAction = "pan-y";
    });

    list.addEventListener("mousedown", function (event) {
      if (handle && !closestHandle(event.target, handle, list)) {
        var item = event.target.closest && event.target.closest("[draggable]");
        if (item) item.draggable = false;
      }
    });

    list.addEventListener("mouseup", function () {
      Array.from(list.children).forEach(function (item) {
        item.draggable = true;
      });
    });

    list.addEventListener("dragstart", function (event) {
      var item = event.target.closest && event.target.closest("[draggable]");
      if (!item || item.parentNode !== list) return;
      dragging = item;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "");
      setTimeout(function () {
        item.style.opacity = "0.45";
      }, 0);
    });

    list.addEventListener("dragover", function (event) {
      if (!dragging) return;
      event.preventDefault();
      var after = Array.from(list.children).find(function (child) {
        if (child === dragging) return false;
        var box = child.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
      if (after) list.insertBefore(dragging, after);
      else list.appendChild(dragging);
    });

    list.addEventListener("dragend", function () {
      if (dragging) dragging.style.opacity = "";
      dragging = null;
      Array.from(list.children).forEach(function (item) {
        item.draggable = true;
      });
      if (typeof options.onEnd === "function") options.onEnd();
    });

    if (window.PointerEvent) {
      list.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "mouse") return;
        var handleNode = handle ? closestHandle(event.target, handle, list) : event.target;
        if (!handleNode) return;
        var item = event.target.closest && event.target.closest("li");
        if (!item || item.parentNode !== list) return;
        dragging = item;
        pointerDragging = false;
        pointerStartY = event.clientY;
        item.setPointerCapture && item.setPointerCapture(event.pointerId);
      });

      list.addEventListener("pointermove", function (event) {
        if (!dragging || event.pointerType === "mouse") return;
        if (Math.abs(event.clientY - pointerStartY) < 8 && !pointerDragging) return;
        pointerDragging = true;
        event.preventDefault();
        dragging.style.opacity = "0.45";
        var after = Array.from(list.children).find(function (child) {
          if (child === dragging) return false;
          var box = child.getBoundingClientRect();
          return event.clientY < box.top + box.height / 2;
        });
        if (after) list.insertBefore(dragging, after);
        else list.appendChild(dragging);
      });

      function endPointerDrag() {
        if (!dragging) return;
        dragging.style.opacity = "";
        dragging = null;
        if (pointerDragging && typeof options.onEnd === "function") options.onEnd();
        pointerDragging = false;
      }

      list.addEventListener("pointerup", endPointerDrag);
      list.addEventListener("pointercancel", endPointerDrag);
    }

    return { option: function () {} };
  }

  window.Sortable = window.Sortable || { create: create };
})();
