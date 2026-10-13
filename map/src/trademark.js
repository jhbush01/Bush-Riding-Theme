/* Bush Riding™, Bush Map™ and DustGrid™ always carry ™ — on every map page,
   in the page's own words and in text the map builds later (route cards,
   popups, lists, review text). A name followed by ® is left alone, and names
   inside longer words (Bush Mapping), form fields, scripts and alt text are
   untouched. Same rules as the store (assets/alpine.js in the theme).
   Lower-case "bush riding" is the activity, not the brand, so it's left as
   written.

   The mark is set small and raised (<span class="tm">, styled in app.css),
   not as a bare ™ character: at full size the glyph is nearly cap height,
   which on the 40px "Bush Map" heading read as a second word. A ™ that was
   already typed after a name is pulled into the same small span, so every
   mark on the page matches.

   Each match becomes <span class="tm-name">Bush Map<span class="tm">™</span>
   </span>. Text inside .tm-name is never revisited, which is what stops the
   observer below re-marking its own output. */
(function () {
  var NAMES = "Bush Riding|BUSH RIDING|Bush Map|BUSH MAP|DustGrid|DUSTGRID";
  var RE = new RegExp("\\b(" + NAMES + ")(™?)(?![™®A-Za-z])", "g");
  var TEST = new RegExp("\\b(" + NAMES + ")(™?)(?![™®A-Za-z])");
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1, TITLE: 1, CODE: 1, PRE: 1 };

  function wrap(node) {
    var text = node.nodeValue;
    var frag = document.createDocumentFragment();
    var last = 0;
    RE.lastIndex = 0;
    var m;
    while ((m = RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var name = document.createElement("span");
      name.className = "tm-name";
      name.appendChild(document.createTextNode(m[1]));
      var tm = document.createElement("span");
      tm.className = "tm";
      tm.textContent = "™";
      name.appendChild(tm);
      frag.appendChild(name);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function mark(root) {
    if (!root || !document.createTreeWalker) return;
    if (root.nodeType === 1 && root.closest && root.closest(".tm-name")) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || SKIP[p.nodeName] || (p.closest && p.closest("[contenteditable], [data-no-tm], .tm-name"))) return NodeFilter.FILTER_REJECT;
        return TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    hits.forEach(wrap);
  }

  function start() {
    mark(document.body);
    // Cards, popups and lists the map fills in later. Our own spans land
    // inside .tm-name, which mark() refuses to enter, so this can't loop.
    if (window.MutationObserver) {
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1) mark(n);
            else if (n.nodeType === 3 && n.parentNode) mark(n.parentNode);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
