/* ============================================================
   EDI Parser — X12 + EDIFACT
   - Detects delimiters from ISA (X12) and UNA (EDIFACT)
   - Returns a tree: interchange → groups → transactions → segments
   ============================================================ */
(function (global) {
  'use strict';

  function detectStandard(raw) {
    const text = stripComments(raw).trim();
    if (text.startsWith('ISA')) return 'x12';
    if (text.startsWith('UNA') || text.startsWith('UNB')) return 'edifact';
    return null;
  }

  // Strip "// line comments" but preserve URLs (://). Used so sample files
  // and annotated EDI snippets parse cleanly.
  function stripComments(raw) {
    return raw.replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');
  }

  // ---------- X12 ----------
  function parseX12(raw) {
    const text = stripComments(raw).replace(/\r/g, '');
    if (!text.startsWith('ISA')) {
      throw new Error('Not an X12 document — must start with ISA');
    }

    const elementSep = text[3];

    // Find segment terminator robustly. ISA is nominally 106 chars, but
    // real-world EDI files sometimes have non-standard padding or empty
    // elements. We scan for the first plausible terminator after position
    // 95 (past all ISA fixed content in any reasonable case).
    const termCandidates = new Set(['~', "'", '\n', '|', '`']);
    let segTermIdx = -1;
    for (let i = 95; i < Math.min(text.length, 180); i++) {
      const ch = text[i];
      if (termCandidates.has(ch) && ch !== elementSep) {
        segTermIdx = i;
        break;
      }
    }
    if (segTermIdx === -1) {
      // Fallback: strict 16-separator walk (standard ISA)
      let pos = 0;
      let elementsRead = 0;
      while (elementsRead < 16) {
        const next = text.indexOf(elementSep, pos);
        if (next === -1) throw new Error('Malformed ISA header (could not find 16 elements)');
        pos = next + 1;
        elementsRead++;
      }
      segTermIdx = pos + 1;
    }
    const segTerm = text[segTermIdx];
    const subSep = text[segTermIdx - 1];

    const segments = splitSegments(text, segTerm);
    return buildX12Tree(segments, { elementSep, subSep, segTerm, repSep: null });
  }

  function splitSegments(text, segTerm) {
    return text
      .split(segTerm)
      .map(s => s.replace(/[\r\n]/g, '').trim())
      .filter(Boolean);
  }

  function buildX12Tree(rawSegments, delims) {
    const interchange = {
      standard: 'x12',
      delimiters: delims,
      header: null,
      trailer: null,
      groups: [],
      rawSegments: [],
    };
    let currentGroup = null;
    let currentTxn = null;

    for (const raw of rawSegments) {
      const seg = parseX12Segment(raw, delims);
      interchange.rawSegments.push(seg);

      switch (seg.code) {
        case 'ISA':
          interchange.header = seg;
          break;
        case 'IEA':
          interchange.trailer = seg;
          break;
        case 'GS':
          currentGroup = { header: seg, trailer: null, transactions: [] };
          interchange.groups.push(currentGroup);
          break;
        case 'GE':
          if (currentGroup) currentGroup.trailer = seg;
          currentGroup = null;
          break;
        case 'ST':
          currentTxn = {
            header: seg,
            trailer: null,
            segments: [],
            transactionCode: seg.elements[1] || '',
            controlNumber: seg.elements[2] || '',
          };
          if (currentGroup) currentGroup.transactions.push(currentTxn);
          else {
            // Orphan transaction — attach to a synthetic group
            currentGroup = { header: null, trailer: null, transactions: [currentTxn] };
            interchange.groups.push(currentGroup);
          }
          break;
        case 'SE':
          if (currentTxn) currentTxn.trailer = seg;
          currentTxn = null;
          break;
        default:
          if (currentTxn) currentTxn.segments.push(seg);
          break;
      }
    }
    return interchange;
  }

  function parseX12Segment(raw, delims) {
    const parts = raw.split(delims.elementSep);
    const code = parts[0];
    const elements = parts.map((p, idx) => {
      if (idx === 0) return p; // segment id
      if (p.includes(delims.subSep)) return p.split(delims.subSep);
      return p;
    });
    return { code, elements, raw };
  }

  // ---------- EDIFACT ----------
  function parseEdifact(raw) {
    const text = stripComments(raw).replace(/\r/g, '').trim();
    let delims = {
      compSep: ':',
      elementSep: '+',
      decimalNotation: '.',
      releaseChar: '?',
      repSep: '*',
      segTerm: "'",
    };
    let body = text;

    if (text.startsWith('UNA')) {
      // UNA is exactly 9 chars: "UNA" + 6 delim chars
      const a = text.substring(3, 9);
      delims = {
        compSep: a[0],
        elementSep: a[1],
        decimalNotation: a[2],
        releaseChar: a[3],
        repSep: a[4],
        segTerm: a[5],
      };
      body = text.substring(9).replace(/^[\r\n]+/, '');
    }

    const rawSegments = splitEdifactSegments(body, delims);
    return buildEdifactTree(rawSegments, delims);
  }

  function splitEdifactSegments(body, delims) {
    const segments = [];
    let buf = '';
    let escaped = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (escaped) {
        buf += ch; escaped = false; continue;
      }
      if (ch === delims.releaseChar) { buf += ch; escaped = true; continue; }
      if (ch === delims.segTerm) {
        const trimmed = buf.replace(/[\r\n]/g, '').trim();
        if (trimmed) segments.push(trimmed);
        buf = '';
      } else {
        buf += ch;
      }
    }
    const tail = buf.replace(/[\r\n]/g, '').trim();
    if (tail) segments.push(tail);
    return segments;
  }

  function parseEdifactSegment(raw, delims) {
    const elements = splitRespectingEscape(raw, delims.elementSep, delims.releaseChar);
    const code = elements[0];
    const parsedElements = elements.map((el, idx) => {
      if (idx === 0) return el;
      const comps = splitRespectingEscape(el, delims.compSep, delims.releaseChar);
      return comps.length > 1 ? comps : el;
    });
    return { code, elements: parsedElements, raw };
  }

  function splitRespectingEscape(str, sep, esc) {
    const out = [];
    let buf = '';
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escaped) { buf += ch; escaped = false; continue; }
      if (ch === esc) { escaped = true; continue; }
      if (ch === sep) { out.push(buf); buf = ''; }
      else buf += ch;
    }
    out.push(buf);
    return out;
  }

  function buildEdifactTree(rawSegments, delims) {
    const interchange = {
      standard: 'edifact',
      delimiters: delims,
      header: null,
      trailer: null,
      groups: [],
      rawSegments: [],
    };
    let currentGroup = null;
    let currentMsg = null;

    for (const raw of rawSegments) {
      const seg = parseEdifactSegment(raw, delims);
      interchange.rawSegments.push(seg);
      switch (seg.code) {
        case 'UNB': interchange.header = seg; break;
        case 'UNZ': interchange.trailer = seg; break;
        case 'UNG': currentGroup = { header: seg, trailer: null, transactions: [] }; interchange.groups.push(currentGroup); break;
        case 'UNE': if (currentGroup) currentGroup.trailer = seg; currentGroup = null; break;
        case 'UNH': {
          const msgIdent = Array.isArray(seg.elements[2]) ? seg.elements[2][0] : seg.elements[2];
          currentMsg = {
            header: seg,
            trailer: null,
            segments: [],
            transactionCode: msgIdent || '',
            controlNumber: seg.elements[1] || '',
          };
          if (!currentGroup) {
            currentGroup = { header: null, trailer: null, transactions: [] };
            interchange.groups.push(currentGroup);
          }
          currentGroup.transactions.push(currentMsg);
          break;
        }
        case 'UNT': if (currentMsg) currentMsg.trailer = seg; currentMsg = null; break;
        default:
          if (currentMsg) currentMsg.segments.push(seg);
          break;
      }
    }
    return interchange;
  }

  // ---------- Public entry ----------
  function parse(raw, hint) {
    const standard = hint && hint !== 'auto' ? hint : detectStandard(raw);
    if (!standard) throw new Error('Could not detect EDI standard. Must start with ISA (X12) or UNA/UNB (EDIFACT).');
    if (standard === 'x12') return parseX12(raw);
    if (standard === 'edifact') return parseEdifact(raw);
    throw new Error(`Unsupported EDI standard: ${standard}`);
  }

  // ---------- Convenience accessors ----------
  function summarize(tree) {
    const out = {
      standard: tree.standard.toUpperCase(),
      sender: null,
      receiver: null,
      controlNumber: null,
      date: null,
      transactions: [],
    };
    if (tree.standard === 'x12' && tree.header) {
      out.sender = textOf(tree.header.elements[6]);
      out.receiver = textOf(tree.header.elements[8]);
      out.controlNumber = textOf(tree.header.elements[13]);
      const d = textOf(tree.header.elements[9]);
      const t = textOf(tree.header.elements[10]);
      if (d) out.date = formatYYMMDD(d) + (t ? ' ' + formatHHMM(t) : '');
    } else if (tree.standard === 'edifact' && tree.header) {
      out.sender = textOf(tree.header.elements[2]);
      out.receiver = textOf(tree.header.elements[3]);
      out.controlNumber = textOf(tree.header.elements[5]);
      const dt = tree.header.elements[4];
      if (dt) {
        const d = Array.isArray(dt) ? dt[0] : '';
        const t = Array.isArray(dt) ? dt[1] : '';
        if (d) out.date = formatYYMMDD(d) + (t ? ' ' + formatHHMM(t) : '');
      }
    }
    for (const g of tree.groups) {
      for (const t of g.transactions) {
        out.transactions.push({
          code: t.transactionCode,
          name: EDIDictionary.transactionName(tree.standard, t.transactionCode) || 'Unknown',
          controlNumber: t.controlNumber,
          segmentCount: t.segments.length,
        });
      }
    }
    return out;
  }

  function textOf(el) {
    if (!el) return '';
    if (Array.isArray(el)) return el.join(':').trim();
    return String(el).trim();
  }
  function formatYYMMDD(s) {
    if (!s) return '';
    if (s.length === 6) return `20${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  }
  function formatHHMM(s) {
    if (!s) return '';
    if (s.length >= 4) return `${s.slice(0,2)}:${s.slice(2,4)}`;
    return s;
  }

  global.EDIParser = { parse, detectStandard, summarize, textOf, formatYYMMDD, formatHHMM };
})(window);
