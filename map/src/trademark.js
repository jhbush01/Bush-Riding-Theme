/* Bush Riding™, Bush Map™ and DustGrid™ always carry ™ — on every map page,
   in the page's own words and in text the map builds later (route cards,
   popups, lists, review text). A name already followed by ™ or ® is left
   alone, so nothing doubles; names inside longer words (Bush Mapping) and
   form fields, scripts and alt text are untouched. Same rules as the store
   (assets/alpine.js in the theme). Lower-case "bush riding" is the activity,
   not the brand, so it's left as written. */
(function () {
  var NAMES = "Bush Riding|BUSH RIDING|Bush Map|BUSH MAP|DustGrid|DUSTGRID";
  var RE = new RegExp("\\b(" + NAMES + ")(?![™®A-Za-z])", "g");
  var TEST = new RegExp("\\b(" + NAMES + ")(?![™®A-Za-z])");
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1, TITLE: 1, CODE: 1, PRE: 1 };

  function mark(root) {
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || SKIP[p.nodeName] || (p.closest && p.closest("[contenteditable], [data-no-tm]"))) return NodeFilter.FILTER_REJECT;
        return TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    hits.forEach(function (n) { n.nodeValue = n.nodeValue.replace(RE, "$1™"); });
  }

  function start() {
    mark(document.body);
    // Cards, popups and lists the map fills in later. Rewriting a text node
    // is a characterData change, which isn't observed, so this can't loop.
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
