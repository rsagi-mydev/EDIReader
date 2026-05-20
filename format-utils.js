/* ============================================================
   Format utilities — EDI tree → JSON / XML, XML parsing, etc.
   ============================================================ */
(function (global) {
  'use strict';

  const D = global.EDIDictionary;
  const P = global.EDIParser;

  // ----- EDI tree → enriched JSON --------------------------------
  function ediToObject(tree, opts = {}) {
    const includeLabels = opts.labels !== false;
    const out = {
      standard: tree.standard.toUpperCase(),
      delimiters: tree.delimiters,
      interchange: tree.header ? segmentToObject(tree.standard, tree.header, includeLabels) : null,
      groups: tree.groups.map(g => ({
        groupHeader: g.header ? segmentToObject(tree.standard, g.header, includeLabels) : null,
        transactions: g.transactions.map(t => ({
          transactionCode: t.transactionCode,
          transactionName: D.transactionName(tree.standard, t.transactionCode) || 'Unknown',
          controlNumber: t.controlNumber,
          header: t.header ? segmentToObject(tree.standard, t.header, includeLabels) : null,
          segments: t.segments.map(s => segmentToObject(tree.standard, s, includeLabels)),
          trailer: t.trailer ? segmentToObject(tree.standard, t.trailer, includeLabels) : null,
        })),
        groupTrailer: g.trailer ? segmentToObject(tree.standard, g.trailer, includeLabels) : null,
      })),
      interchangeTrailer: tree.trailer ? segmentToObject(tree.standard, tree.trailer, includeLabels) : null,
    };
    return out;
  }

  function segmentToObject(standard, seg, includeLabels) {
    const info = D.lookupSegment(standard, seg.code);
    const out = {
      segment: seg.code,
    };
    if (includeLabels && info && info.name) out.name = info.name;

    const elements = {};
    for (let i = 1; i < seg.elements.length; i++) {
      const el = seg.elements[i];
      const key = pad2(i);
      const labelName = D.lookupElement(standard, seg.code, i);
      const value = Array.isArray(el) ? el : el;
      if (includeLabels && labelName) {
        elements[`${seg.code}${key}`] = {
          label: labelName,
          value,
        };
      } else {
        elements[`${seg.code}${key}`] = value;
      }
    }
    out.elements = elements;
    return out;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ----- EDI tree → XML ------------------------------------------
  function ediToXml(tree, opts = {}) {
    const pretty = opts.pretty !== false;
    const includeLabels = opts.labels !== false;
    const xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<Interchange standard="${tree.standard.toUpperCase()}">`);
    if (tree.header) xml.push(segmentToXml(tree.standard, tree.header, 1, includeLabels));
    for (const g of tree.groups) {
      xml.push(indent(1) + '<Group>');
      if (g.header) xml.push(segmentToXml(tree.standard, g.header, 2, includeLabels));
      for (const t of g.transactions) {
        const txnName = D.transactionName(tree.standard, t.transactionCode) || 'Transaction';
        xml.push(indent(2) + `<Transaction code="${esc(t.transactionCode)}" name="${esc(txnName)}" control="${esc(t.controlNumber)}">`);
        if (t.header) xml.push(segmentToXml(tree.standard, t.header, 3, includeLabels));
        for (const s of t.segments) xml.push(segmentToXml(tree.standard, s, 3, includeLabels));
        if (t.trailer) xml.push(segmentToXml(tree.standard, t.trailer, 3, includeLabels));
        xml.push(indent(2) + '</Transaction>');
      }
      if (g.trailer) xml.push(segmentToXml(tree.standard, g.trailer, 2, includeLabels));
      xml.push(indent(1) + '</Group>');
    }
    if (tree.trailer) xml.push(segmentToXml(tree.standard, tree.trailer, 1, includeLabels));
    xml.push('</Interchange>');
    return pretty ? xml.join('\n') : xml.join('');
  }

  function segmentToXml(standard, seg, depth, includeLabels) {
    const info = D.lookupSegment(standard, seg.code);
    const nameAttr = includeLabels && info && info.name ? ` name="${esc(info.name)}"` : '';
    const lines = [];
    lines.push(indent(depth) + `<${seg.code}${nameAttr}>`);
    for (let i = 1; i < seg.elements.length; i++) {
      const el = seg.elements[i];
      const tag = `${seg.code}${pad2(i)}`;
      const labelName = D.lookupElement(standard, seg.code, i);
      const lblAttr = includeLabels && labelName ? ` label="${esc(labelName)}"` : '';
      if (Array.isArray(el)) {
        const compLines = [indent(depth + 1) + `<${tag}${lblAttr}>`];
        el.forEach((c, idx) => {
          compLines.push(indent(depth + 2) + `<Component index="${idx + 1}">${esc(c)}</Component>`);
        });
        compLines.push(indent(depth + 1) + `</${tag}>`);
        lines.push(...compLines);
      } else {
        const value = el == null ? '' : String(el);
        if (value === '') {
          lines.push(indent(depth + 1) + `<${tag}${lblAttr}/>`);
        } else {
          lines.push(indent(depth + 1) + `<${tag}${lblAttr}>${esc(value)}</${tag}>`);
        }
      }
    }
    lines.push(indent(depth) + `</${seg.code}>`);
    return lines.join('\n');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  function indent(n) { return '  '.repeat(n); }

  // ----- JSON pretty / minify -------------------------------------
  function toJson(obj, pretty = true) {
    return JSON.stringify(obj, null, pretty ? 2 : 0);
  }

  // ----- XML parse via DOMParser ----------------------------------
  function parseXml(xmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const errNode = doc.querySelector('parsererror');
    if (errNode) throw new Error('Invalid XML: ' + errNode.textContent);
    return xmlNodeToObject(doc.documentElement);
  }
  function xmlNodeToObject(node) {
    const obj = { _tag: node.nodeName };
    if (node.attributes && node.attributes.length) {
      obj._attrs = {};
      for (const a of Array.from(node.attributes)) obj._attrs[a.name] = a.value;
    }
    const children = Array.from(node.children);
    if (children.length === 0) {
      const text = node.textContent.trim();
      if (text) obj._text = text;
      return obj;
    }
    obj._children = children.map(xmlNodeToObject);
    return obj;
  }

  // ----- JSON / XML detection from raw text -----------------------
  function looksLikeJson(s) {
    const t = s.trim();
    return t.startsWith('{') || t.startsWith('[');
  }
  function looksLikeXml(s) {
    const t = s.trim();
    return t.startsWith('<?xml') || (t.startsWith('<') && t.endsWith('>'));
  }

  // ----- Syntax highlighter ---------------------------------------
  function highlightJson(jsonStr) {
    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escHtml(jsonStr)
      .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="tok-key">$1</span>$2')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, (m, p1) => `: <span class="tok-str">${p1}</span>`)
      .replace(/\b(true|false)\b/g, '<span class="tok-bool">$1</span>')
      .replace(/\bnull\b/g, '<span class="tok-null">null</span>')
      .replace(/(?<![\w-])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w-])/g, '<span class="tok-num">$1</span>');
  }
  function highlightXml(xmlStr) {
    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escHtml(xmlStr)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-com">$1</span>')
      .replace(/(&lt;\?[\s\S]*?\?&gt;)/g, '<span class="tok-com">$1</span>')
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="tok-tag">$2</span>')
      .replace(/([\w:-]+)=(&quot;[^&]*&quot;)/g, '<span class="tok-attr">$1</span>=<span class="tok-str">$2</span>');
  }

  global.FormatUtils = {
    ediToObject,
    ediToXml,
    toJson,
    parseXml,
    looksLikeJson,
    looksLikeXml,
    highlightJson,
    highlightXml,
  };
})(window);
