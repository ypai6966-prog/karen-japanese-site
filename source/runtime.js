/* 迷你元件執行環境：讓設計稿裡的元件在一般瀏覽器中運作 */
(function () {
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var BOOL = { checked: 1, disabled: 1, required: 1, selected: 1, hidden: 1, multiple: 1, readonly: 1, autofocus: 1 };
  var EVT = { onclick: 'click', onsubmit: 'submit', onchange: 'change', oninput: 'input', onpointermove: 'pointermove', onpointerdown: 'pointerdown', onpointerup: 'pointerup', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onkeydown: 'keydown' };
  var VOID = { input: 1, br: 1, img: 1, meta: 1, link: 1, hr: 1, source: 1, col: 1, area: 1, wbr: 1 };
  var registry = {}, hosts = {}, uidc = 0, queue = [], queued = false;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escA(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') { return true; }
    if (path === 'false') { return false; }
    if (path === 'null') { return null; }
    if (/^-?\d+(\.\d+)?$/.test(path)) { return parseFloat(path); }
    var q = path.match(/^'(.*)'$|^"(.*)"$/);
    if (q) { return q[1] !== undefined ? q[1] : q[2]; }
    var parts = path.split('.'), v;
    for (var i = scope.length - 1; i >= 0; i--) {
      if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; break; }
    }
    for (var j = 1; j < parts.length && v != null; j++) { v = v[parts[j]]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  function renderNodes(nodes, ctx) {
    var out = '';
    for (var i = 0; i < nodes.length; i++) { out += renderNode(nodes[i], ctx); }
    return out;
  }
  function renderNode(n, ctx) {
    if (n.nodeType === 3) { return esc(interp(n.nodeValue, ctx.scope)); }
    if (n.nodeType !== 1) { return ''; }
    var tag = n.localName;
    if (tag === 'sc-for') {
      var list = lookup((n.getAttribute('list') || '').replace(WHOLE, '$1'), ctx.scope) || [];
      var as = n.getAttribute('as') || 'item', out = '';
      for (var i = 0; i < list.length; i++) {
        var s = {}; s[as] = list[i]; s.$index = i;
        ctx.scope.push(s); out += renderNodes(n.childNodes, ctx); ctx.scope.pop();
      }
      return out;
    }
    if (tag === 'sc-if') {
      var v = lookup((n.getAttribute('value') || '').replace(WHOLE, '$1'), ctx.scope);
      return v ? renderNodes(n.childNodes, ctx) : '';
    }
    if (tag === 'dc-import') {
      var props = {};
      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a];
        if (at.name === 'name' || at.name.indexOf('hint-') === 0) { continue; }
        var m = at.value.match(WHOLE);
        props[camel(at.name)] = m ? lookup(m[1], ctx.scope) : interp(at.value, ctx.scope);
      }
      var key = n.getAttribute('name') + '-' + (ctx.childCount++);
      ctx.children.push({ key: key, name: n.getAttribute('name'), props: props });
      return '<div data-dc-child="' + key + '" style="display: contents"></div>';
    }
    var html = '<' + tag;
    for (var b = 0; b < n.attributes.length; b++) {
      var att = n.attributes[b], name = att.name, low = name.toLowerCase();
      if (low.indexOf('hint-') === 0) { continue; }
      var whole = att.value.match(WHOLE);
      if (EVT[low]) {
        var fn = whole ? lookup(whole[1], ctx.scope) : null;
        if (typeof fn === 'function') {
          var id = ctx.host.uid + '_' + (ctx.hid++);
          ctx.host.handlers[id] = fn;
          html += ' data-ev-' + EVT[low] + '="' + id + '"';
        }
        continue;
      }
      var val = whole ? lookup(whole[1], ctx.scope) : interp(att.value, ctx.scope);
      if (BOOL[low]) {
        if (val === false || val == null || val === 'false') { continue; }
        html += ' ' + name + '=""';
        continue;
      }
      if (val == null) { val = ''; }
      html += ' ' + name + '="' + escA(val) + '"';
    }
    html += '>';
    if (VOID[tag]) { return html; }
    return html + renderNodes(n.childNodes, ctx) + '</' + tag + '>';
  }

  function morphAttrs(f, t) {
    var i, a;
    for (i = 0; i < t.attributes.length; i++) {
      a = t.attributes[i];
      if (f.getAttribute(a.name) !== a.value) { f.setAttribute(a.name, a.value); }
    }
    for (i = f.attributes.length - 1; i >= 0; i--) {
      a = f.attributes[i];
      if (t.hasAttribute(a.name)) { continue; }
      if (a.name === 'open' && f.nodeName === 'DETAILS') { continue; }
      f.removeAttribute(a.name);
    }
  }
  function morphChildren(from, to) {
    var f = from.firstChild, t = to.firstChild;
    while (t) {
      var tn = t.nextSibling;
      if (!f) { from.appendChild(t); t = tn; continue; }
      var fn = f.nextSibling;
      if (f.nodeType !== t.nodeType || (f.nodeType === 1 && f.nodeName !== t.nodeName)) {
        from.replaceChild(t, f);
      } else if (f.nodeType === 3 || f.nodeType === 8) {
        if (f.nodeValue !== t.nodeValue) { f.nodeValue = t.nodeValue; }
      } else if (f.nodeType === 1) {
        morphAttrs(f, t);
        if (!f.hasAttribute('data-dc-child')) { morphChildren(f, t); }
      }
      f = fn; t = tn;
    }
    while (f) { var nx = f.nextSibling; from.removeChild(f); f = nx; }
  }
  function fixProps(root) {
    root.querySelectorAll('select[value]').forEach(function (s) { var v = s.getAttribute('value'); if (s.value !== v) { s.value = v; } });
    root.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(function (i) { var c = i.hasAttribute('checked'); if (i.checked !== c) { i.checked = c; } });
  }

  function Host(name, props, container) {
    this.name = name; this.uid = 'c' + (++uidc); hosts[this.uid] = this;
    this.container = container; this.handlers = {}; this.children = {}; this.cbs = [];
    this.inst = new registry[name](props || {});
    this.inst.__host = this;
  }
  Host.prototype.render = function () {
    var vals = this.inst.renderVals() || {};
    var ctx = { host: this, scope: [vals], hid: 0, children: [], childCount: 0 };
    this.handlers = {};
    var tpl = document.getElementById('tpl-' + this.name).content;
    var holder = document.createElement('template');
    holder.innerHTML = renderNodes(tpl.childNodes, ctx);
    morphChildren(this.container, holder.content);
    fixProps(this.container);
    var self = this, seen = {};
    ctx.children.forEach(function (c) {
      seen[c.key] = 1;
      var el = self.container.querySelector('[data-dc-child="' + c.key + '"]');
      var h = self.children[c.key];
      if (!h) {
        h = new Host(c.name, c.props, el);
        self.children[c.key] = h;
        h.render();
        if (h.inst.componentDidMount) { h.inst.componentDidMount(); }
      } else {
        h.container = el; h.inst.props = c.props; h.render();
      }
    });
    Object.keys(this.children).forEach(function (k) { if (!seen[k]) { unmount(self.children[k]); delete self.children[k]; } });
    var cbs = this.cbs; this.cbs = [];
    cbs.forEach(function (cb) { cb.call(self.inst); });
  };
  function unmount(h) {
    Object.keys(h.children).forEach(function (k) { unmount(h.children[k]); });
    if (h.inst.componentWillUnmount) { h.inst.componentWillUnmount(); }
    h.dead = true; delete hosts[h.uid];
  }
  function schedule(h, cb) {
    if (cb) { h.cbs.push(cb); }
    if (queue.indexOf(h) < 0) { queue.push(h); }
    if (!queued) {
      queued = true;
      Promise.resolve().then(function () {
        queued = false;
        var q = queue; queue = [];
        q.forEach(function (x) { if (!x.dead) { x.render(); } });
      });
    }
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (u, cb) {
    var p = typeof u === 'function' ? u(this.state, this.props) : u;
    this.state = Object.assign({}, this.state, p);
    if (this.__host) { schedule(this.__host, cb); }
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__host) { schedule(this.__host); } };
  window.DCLogic = DCLogic;

  function wrap(e, el) {
    return new Proxy(e, { get: function (t, k) { if (k === 'currentTarget') { return el; } var v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  }
  function call(el, type, e) {
    var id = el.getAttribute('data-ev-' + type);
    var h = hosts[id.split('_')[0]];
    var fn = h && h.handlers[id];
    if (typeof fn === 'function') { fn(wrap(e, el)); }
  }
  ['click', 'submit', 'change', 'input', 'pointermove', 'pointerdown', 'pointerup', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.nodeType === 1 && el.hasAttribute('data-ev-' + type)) { call(el, type, e); }
        el = el.parentNode;
      }
    });
  });
  ['mouseenter', 'mouseleave'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var el = e.target;
      if (el && el.nodeType === 1 && el.hasAttribute('data-ev-' + type)) { call(el, type, e); }
    }, true);
  });

  window.DC = {
    define: function (name, Cls) { registry[name] = Cls; },
    mount: function (name, el, props) {
      var h = new Host(name, props, el);
      h.render();
      if (h.inst.componentDidMount) { h.inst.componentDidMount(); }
      return h;
    }
  };
})();
