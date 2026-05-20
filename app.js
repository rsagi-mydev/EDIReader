/* ============================================================
   EDI Reader — main app: events, conversion pipeline, rendering
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ----- DOM ------------------------------------------------------
  const els = {
    inputArea: $('#inputArea'),
    inputFormat: $('#inputFormat'),
    outputFormat: $('#outputFormat'),
    optPretty: $('#optPretty'),
    optLabels: $('#optLabels'),
    optAudit: $('#optAudit'),
    rowPretty: $('#rowPretty'),
    rowLabels: $('#rowLabels'),
    rowAudit: $('#rowAudit'),
    convertBtn: $('#convertBtn'),
    downloadPdfBtn: $('#downloadPdfBtn'),
    downloadTextBtn: $('#downloadTextBtn'),
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    detectedFormat: $('#detectedFormat'),
    charCount: $('#charCount'),
    lineCount: $('#lineCount'),
    segCount: $('#segCount'),
    outputBadge: $('#outputBadge'),
    richView: $('#richView'),
    codeView: $('#codeView'),
    codeBlock: $('#codeBlock'),
    status: $('#status'),
    toasts: $('#toasts'),
    loadSample: $('#loadSample'),
    clearAll: $('#clearAll'),
    aboutBtn: $('#aboutBtn'),
    aboutModal: $('#aboutModal'),
    themeToggle: $('#themeToggle'),
    copyBtn: $('#copyBtn'),
    emptyLoadSample: $('#emptyLoadSample'),
    infoStandard: $('#infoStandard'),
    infoTransaction: $('#infoTransaction'),
    infoSender: $('#infoSender'),
    infoReceiver: $('#infoReceiver'),
    infoControl: $('#infoControl'),
    infoDate: $('#infoDate'),
    viewRich: $('#viewRich'),
    viewCode: $('#viewCode'),
  };

  // ----- State ----------------------------------------------------
  const state = {
    detectedFormat: null,
    parsedTree: null,       // EDI tree (if applicable)
    outputText: null,       // latest text output for download
    outputType: null,       // 'json'|'xml'|'readable'
    currentView: 'rich',
  };

  // ----- Helpers --------------------------------------------------
  function toast(msg, type = 'info') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `<span class="dot"></span><span>${escapeHtml(msg)}</span>`;
    els.toasts.appendChild(node);
    setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateY(8px)'; }, 2800);
    setTimeout(() => node.remove(), 3200);
  }
  function setStatus(text) { els.status.textContent = text; }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function detectFormat(raw) {
    if (!raw || !raw.trim()) return null;
    const ediStd = window.EDIParser.detectStandard(raw);
    if (ediStd) return ediStd;
    if (window.FormatUtils.looksLikeJson(raw)) return 'json';
    if (window.FormatUtils.looksLikeXml(raw)) return 'xml';
    return null;
  }

  function updateDetection() {
    const raw = els.inputArea.value;
    const fmt = detectFormat(raw);
    state.detectedFormat = fmt;
    let label, isSupported;
    if (fmt === 'x12')     { label = 'EDI · X12'; isSupported = true; }
    else if (fmt === 'edifact') { label = 'EDI · EDIFACT'; isSupported = true; }
    else if (fmt === 'json' || fmt === 'xml') { label = `${fmt.toUpperCase()} — not supported`; isSupported = false; }
    else { label = raw.trim() ? 'Unknown' : 'Auto-detect'; isSupported = false; }
    els.detectedFormat.textContent = label;
    els.detectedFormat.className = 'badge' + (isSupported ? ' success' : (raw.trim() ? ' warn' : ''));

    els.charCount.textContent = raw.length.toLocaleString();
    els.lineCount.textContent = raw.split('\n').length.toLocaleString();
    if (fmt === 'x12' || fmt === 'edifact') {
      try {
        const tree = window.EDIParser.parse(raw, fmt);
        els.segCount.textContent = tree.rawSegments.length.toLocaleString();
      } catch { els.segCount.textContent = '?'; }
    } else { els.segCount.textContent = '0'; }
  }

  function effectiveInputFormat() {
    const sel = els.inputFormat.value;
    if (sel !== 'auto') return sel;
    return state.detectedFormat;
  }

  // ----- Convert pipeline ----------------------------------------
  function convert() {
    const raw = els.inputArea.value.trim();
    if (!raw) {
      toast('Paste or upload a document first', 'info');
      return;
    }
    const inputFmt = effectiveInputFormat();
    if (!inputFmt) {
      toast('Could not detect input format. Select one manually.', 'error');
      return;
    }
    const outputFmt = els.outputFormat.value;
    const pretty = els.optPretty.checked;
    const labels = els.optLabels.checked;

    try {
      let outputText = '';
      let outputType = outputFmt;

      if (inputFmt === 'x12' || inputFmt === 'edifact') {
        const tree = window.EDIParser.parse(raw, inputFmt);
        state.parsedTree = tree;
        updateDocInfo(tree);

        if (outputFmt === 'json') {
          const obj = window.FormatUtils.ediToObject(tree, { labels });
          outputText = window.FormatUtils.toJson(obj, pretty);
        } else if (outputFmt === 'xml') {
          outputText = window.FormatUtils.ediToXml(tree, { pretty, labels });
        } else {
          renderRichEdi(tree);
          outputText = buildReadableTextFromEdi(tree);
        }
      } else if (inputFmt === 'json' || inputFmt === 'xml') {
        throw new Error('This tool converts EDI documents (X12 or EDIFACT) to JSON, XML, or PDF. Plain JSON/XML input is not supported — paste an EDI document instead.');
      } else {
        throw new Error('Could not detect EDI standard. Document must start with ISA (X12) or UNA/UNB (EDIFACT).');
      }

      state.outputText = outputText;
      state.outputType = outputType;

      if (outputFmt === 'readable') {
        switchView('rich');
        els.outputBadge.textContent = 'Human readable';
        els.outputBadge.className = 'badge success';
      } else {
        switchView('code');
        renderCode(outputText, outputFmt);
        els.outputBadge.textContent = outputFmt.toUpperCase();
        els.outputBadge.className = 'badge success';
      }
      setStatus(`Converted ${inputFmt.toUpperCase()} → ${outputFmt.toUpperCase()}`);
      toast('Conversion successful', 'success');
    } catch (e) {
      console.error(e);
      setStatus('Error: ' + e.message);
      toast(e.message, 'error');
      els.outputBadge.textContent = 'Error';
      els.outputBadge.className = 'badge danger';
    }
  }

  function renderCode(text, fmt) {
    let html;
    if (fmt === 'json') html = window.FormatUtils.highlightJson(text);
    else if (fmt === 'xml') html = window.FormatUtils.highlightXml(text);
    else html = escapeHtml(text);
    els.codeBlock.innerHTML = html;
  }

  // ----- Rich rendering: EDI (business document view) -----------
  function renderRichEdi(tree) {
    const docs = window.BusinessMapper.toBusinessDocuments(tree);
    if (!docs.length) { renderEdiAudit(tree); return; }

    els.richView.innerHTML = '';
    docs.forEach((biz, idx) => {
      if (idx > 0) {
        const sep = document.createElement('div');
        sep.className = 'doc-separator';
        sep.innerHTML = `<span>Document ${idx + 1} of ${docs.length}</span>`;
        els.richView.appendChild(sep);
      }
      renderOneBusinessDoc(biz);
    });
    appendAuditAppendix(tree);
    if (docs[0]) updateDocInfoFromBiz(docs[0]);
  }

  function updateDocInfoFromBiz(biz) {
    els.infoStandard.textContent = biz.standard || '—';
    els.infoTransaction.textContent = biz.totalDocumentsInInterchange > 1
      ? `${biz.transactionCode} · ${biz.transactionName} (×${biz.totalDocumentsInInterchange})`
      : `${biz.transactionCode} · ${biz.transactionName}`;
    const sender = biz.interchange?.sender;
    const receiver = biz.interchange?.receiver;
    els.infoSender.textContent = sender || '—';
    els.infoReceiver.textContent = receiver || '—';
    els.infoControl.textContent = biz.interchange?.controlNumber || biz.number || '—';
    els.infoDate.textContent = biz.interchange?.date || biz.date || '—';
  }

  function renderOneBusinessDoc(biz) {
    const root = document.createElement('div');
    root.className = 'biz-doc';
    root.innerHTML = '';

    root.appendChild(renderBizBanner(biz));

    const partySection = renderBizParties(biz);
    if (partySection) root.appendChild(partySection);

    const metaSection = renderBizMeta(biz);
    if (metaSection) root.appendChild(metaSection);

    if (biz.kind === 'SHIP_NOTICE' && biz.carrier) {
      root.appendChild(renderBizCarrier(biz));
    }
    if (biz.kind === 'FUNCTIONAL_ACK') {
      root.appendChild(renderBizAck(biz));
    } else if (biz.items && biz.items.length) {
      root.appendChild(renderBizItems(biz));
    }

    const totalsSection = renderBizTotals(biz);
    if (totalsSection) root.appendChild(totalsSection);

    if (biz.terms) root.appendChild(simpleTextSection('Payment Terms', biz.terms));
    if (biz.notes && biz.notes.length) {
      root.appendChild(simpleTextSection('Notes', biz.notes.map(n => '• ' + n).join('\n')));
    }
    if (biz.references && biz.references.length) {
      root.appendChild(renderBizReferences(biz));
    }
    if (biz.contact) root.appendChild(renderBizContact(biz));

    els.richView.appendChild(root);
  }

  function appendAuditAppendix(tree) {
    if (!els.optAudit || !els.optAudit.checked) return;
    const audit = document.createElement('div');
    audit.className = 'biz-doc audit-section';
    audit.appendChild(renderAuditHeader());
    tree.groups.forEach(g => g.transactions.forEach(txn => {
      const tHead = document.createElement('div');
      tHead.className = 'doc-section';
      tHead.innerHTML = `<h3><span class="seg-code">${txn.transactionCode}</span> Control ${escapeHtml(txn.controlNumber)}</h3>`;
      audit.appendChild(tHead);
      txn.segments.forEach(seg => {
        const card = document.createElement('div');
        card.className = 'doc-section';
        const info = window.EDIDictionary.lookupSegment(tree.standard, seg.code);
        card.innerHTML = `<h3><span class="seg-code">${seg.code}</span> ${escapeHtml(info?.name || 'Segment')}</h3>` +
                         renderItemTable(tree.standard, [seg]);
        audit.appendChild(card);
      });
    }));
    els.richView.appendChild(audit);
  }

  function renderAuditHeader() {
    const h = document.createElement('div');
    h.className = 'audit-header';
    h.innerHTML = `<div class="eyebrow">Technical Appendix</div><h2>EDI Segment Audit</h2>`;
    return h;
  }

  function renderEdiAudit(tree) {
    // Fallback when no business mapping
    const root = document.createElement('div');
    root.className = 'biz-doc';
    const summary = window.EDIParser.summarize(tree);
    root.innerHTML = `<div class="biz-banner">
      <div class="eyebrow">${summary.standard} Interchange</div>
      <h1>${escapeHtml(summary.transactions[0]?.name || 'EDI Document')}</h1>
    </div>`;
    tree.groups.forEach(g => g.transactions.forEach(txn => {
      txn.segments.forEach(seg => {
        const card = document.createElement('div');
        card.className = 'doc-section';
        card.innerHTML = `<h3><span class="seg-code">${seg.code}</span></h3>` +
                         renderItemTable(tree.standard, [seg]);
        root.appendChild(card);
      });
    }));
    els.richView.innerHTML = '';
    els.richView.appendChild(root);
  }

  // ----- Business document HTML helpers --------------------------
  function renderBizBanner(biz) {
    const banner = document.createElement('div');
    banner.className = 'biz-banner';
    const eyebrow = `${biz.standard || ''} · ${biz.transactionCode || ''}`;
    banner.innerHTML = `
      <div class="banner-left">
        <div class="eyebrow">${escapeHtml(eyebrow)}</div>
        <h1>${escapeHtml(biz.title.toUpperCase())}</h1>
        ${biz.interchange?.isTest ? '<span class="badge danger">TEST</span>' : ''}
      </div>
      <div class="banner-right">
        ${biz.number ? `<div><div class="label">Number</div><div class="value">${escapeHtml(biz.number)}</div></div>` : ''}
        ${biz.date ? `<div><div class="label">Date</div><div class="value">${escapeHtml(biz.date)}</div></div>` : ''}
      </div>
    `;
    return banner;
  }

  function renderBizParties(biz) {
    const order = orderPartyCodes(biz);
    if (!order.length) return null;
    const section = document.createElement('div');
    section.className = 'biz-parties';
    order.forEach(code => {
      const p = biz.parties[code];
      const card = document.createElement('div');
      card.className = 'biz-party-card';
      const cityLine = [p.city, p.state].filter(Boolean).join(', ') + (p.zip ? ' ' + p.zip : '');
      card.innerHTML = `
        <div class="biz-party-role">${escapeHtml((p.role || 'Party').toUpperCase())}</div>
        ${p.name ? `<div class="biz-party-name">${escapeHtml(p.name)}</div>` : ''}
        ${p.address.map(line => `<div class="biz-party-line">${escapeHtml(line)}</div>`).join('')}
        ${cityLine.trim() ? `<div class="biz-party-line">${escapeHtml(cityLine.trim())}</div>` : ''}
        ${p.country ? `<div class="biz-party-line">${escapeHtml(p.country)}</div>` : ''}
        ${p.id ? `<div class="biz-party-id">ID: ${escapeHtml(p.id)}</div>` : ''}
      `;
      section.appendChild(card);
    });
    return section;
  }

  function orderPartyCodes(biz) {
    const pref = ['BT','BY','OB','VN','SU','SE','RI','ST','SF','CN','CZ','PR','PE'];
    return Object.keys(biz.parties).sort((a, b) => {
      const ai = pref.indexOf(a), bi = pref.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  function renderBizMeta(biz) {
    const items = [];
    if (biz.meta?.poNumber) items.push(['PO Number', biz.meta.poNumber]);
    if (biz.meta?.poDate) items.push(['PO Date', biz.meta.poDate]);
    if (biz.meta?.invoiceNumber) items.push(['Invoice Number', biz.meta.invoiceNumber]);
    if (biz.meta?.contract) items.push(['Contract', biz.meta.contract]);
    if (biz.meta?.type) items.push(['Type', biz.meta.type]);
    if (biz.meta?.purpose) items.push(['Purpose', biz.meta.purpose]);
    if (biz.meta?.ackType) items.push(['Acknowledgment Type', biz.meta.ackType]);
    if (biz.meta?.documentType) items.push(['Document Type', biz.meta.documentType]);
    if (biz.meta?.deliveryDate) items.push(['Delivery Date', biz.meta.deliveryDate]);
    (biz.dates || []).forEach(d => {
      if (!d.value && !d.time) return;
      if (d.type === 'Document Date' && d.value === biz.date) return;
      items.push([d.type, d.value + (d.time ? ' ' + d.time : '')]);
    });
    if (!items.length) return null;

    const sec = document.createElement('div');
    sec.className = 'biz-section';
    sec.innerHTML = `
      <div class="biz-section-title">Details</div>
      <div class="biz-meta-grid">
        ${items.map(it => `
          <div class="biz-meta-item">
            <div class="label">${escapeHtml(String(it[0]).toUpperCase())}</div>
            <div class="value">${escapeHtml(String(it[1]))}</div>
          </div>`).join('')}
      </div>`;
    return sec;
  }

  function renderBizItems(biz) {
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    const currency = biz.totals?.currency || 'USD';
    const showPrice = biz.items.some(i => i.unitPrice != null);
    const showTotal = biz.items.some(i => i.lineTotal != null || i.netLineTotal != null);
    const fmt = window.BusinessMapper.fmtMoney;

    let html = `<div class="biz-section-title">${biz.kind === 'SHIP_NOTICE' ? 'Items Shipped' : 'Line Items'}</div>`;
    html += '<table class="biz-items"><thead><tr>';
    html += '<th class="right">#</th><th>Codes</th><th>Description</th><th class="right">Qty</th><th>UOM</th>';
    if (showPrice) html += '<th class="right">Unit Price</th>';
    if (showTotal) html += '<th class="right">Line Total</th>';
    html += '</tr></thead><tbody>';

    biz.items.forEach(it => {
      // Short qualifier codes only (e.g. "SK" not "Stock Keeping Unit")
      const codesHtml = (it.productIds || [])
        .filter(p => p.value)
        .map(p => `<div class="code-row"><span class="code-qual">${escapeHtml(p.qualifier || '')}</span><span class="code-val">${escapeHtml(p.value)}</span></div>`)
        .join('') || `<span class="code-val">${escapeHtml(it.sku || '')}</span>`;

      // Inline discount/charge note under the description — just shows the
      // percent (or amount) per the user's preferred format: "Discount = 2%"
      let chargeNotes = '';
      if (it.charges && it.charges.length) {
        chargeNotes = '<div class="item-note">';
        for (const c of it.charges) {
          const label = c.type === 'Allowance' ? 'Discount' : 'Charge';
          const value = c.percent != null
            ? `${c.percent}%`
            : fmt(c.amount, currency);
          const codeSuffix = c.code ? ` <span class="dim">(${escapeHtml(c.code)})</span>` : '';
          chargeNotes += `<div class="line-discount"><span class="discount-label">${escapeHtml(label)}</span> = <span class="discount-value">${escapeHtml(value)}</span>${codeSuffix}</div>`;
        }
        chargeNotes += '</div>';
      }

      html += '<tr>';
      html += `<td class="right">${escapeHtml(String(it.line || ''))}</td>`;
      html += `<td class="codes-cell">${codesHtml}</td>`;
      html += `<td class="desc-cell">${escapeHtml(it.description || '')}${chargeNotes}</td>`;
      html += `<td class="right">${it.quantity != null ? escapeHtml(window.BusinessMapper.fmtNumber(it.quantity, it.quantity % 1 === 0 ? 0 : 2)) : ''}</td>`;
      html += `<td>${escapeHtml(it.uom || '')}</td>`;
      if (showPrice) html += `<td class="right">${it.unitPrice != null ? escapeHtml(fmt(it.unitPrice, currency)) : ''}</td>`;
      if (showTotal) html += `<td class="right bold">${it.lineTotal != null ? escapeHtml(fmt(it.lineTotal, currency)) : ''}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    sec.innerHTML = html;
    return sec;
  }

  function renderBizTotals(biz) {
    const t = biz.totals || {};
    const currency = t.currency || 'USD';
    const lines = [];
    if (t.subtotal != null) lines.push({ label: 'Subtotal', value: window.BusinessMapper.fmtMoney(t.subtotal, currency) });
    if (t.itemLevelDiscounts) lines.push({
      label: 'Item-level Discount Total',
      value: '−' + window.BusinessMapper.fmtMoney(t.itemLevelDiscounts, currency),
      isAllowance: true,
    });
    if (t.itemLevelCharges) lines.push({
      label: 'Item-level Charge Total',
      value: '+' + window.BusinessMapper.fmtMoney(t.itemLevelCharges, currency),
    });
    (biz.charges || []).forEach(c => {
      const sign = c.type === 'Allowance' ? '−' : '';
      const lbl = (c.description || c.type) + (c.code ? ` (${c.code})` : '');
      const val = sign + window.BusinessMapper.fmtMoney(c.amount, currency);
      lines.push({ label: lbl, value: val, isAllowance: c.type === 'Allowance' });
    });
    if (t.discount != null && !biz.charges?.some(c => c.type === 'Allowance')) {
      lines.push({ label: 'Discount', value: '−' + window.BusinessMapper.fmtMoney(t.discount, currency), isAllowance: true });
    }
    (biz.taxes || []).forEach(tx => {
      const parts = [];
      if (tx.type) parts.push(tx.type);
      if (tx.rate != null) parts.push(`${tx.rate}%`);
      if (tx.jurisdiction) parts.push(tx.jurisdiction);
      const suffix = parts.length ? ' (' + parts.join(' · ') + ')' : '';
      lines.push({
        label: 'Tax' + suffix,
        value: tx.amount != null ? window.BusinessMapper.fmtMoney(tx.amount, currency) : '—',
      });
    });
    if (t.tax != null && !(biz.taxes || []).some(tx => tx.amount != null)) {
      const rate = biz.taxes?.[0]?.rate;
      lines.push({ label: 'Tax' + (rate ? ` (${rate}%)` : ''), value: window.BusinessMapper.fmtMoney(t.tax, currency) });
    }
    if (t.reconciliationMismatch && t.statedTotal != null) {
      lines.push({
        label: 'Stated Total (per TDS)',
        value: window.BusinessMapper.fmtMoney(t.statedTotal, currency),
        muted: true,
      });
    }
    if (!lines.length && t.total == null) return null;

    const sec = document.createElement('div');
    sec.className = 'biz-totals-wrap';
    const totalLabel = biz.kind === 'INVOICE' ? 'TOTAL DUE' : 'TOTAL';
    sec.innerHTML = `
      <div class="biz-totals">
        ${lines.map(l => `<div class="totals-row${l.isAllowance ? ' is-allowance' : ''}${l.muted ? ' is-muted' : ''}"><span>${escapeHtml(l.label)}</span><span>${escapeHtml(l.value)}</span></div>`).join('')}
        ${t.total != null ? `<div class="totals-grand"><span>${totalLabel}</span><span>${escapeHtml(window.BusinessMapper.fmtMoney(t.total, currency))}</span></div>` : ''}
      </div>
      ${t.reconciliationMismatch ? `<div class="totals-note">Stated total (TDS) and computed breakdown differ — showing the computed value as TOTAL.</div>` : ''}`;
    return sec;
  }

  function renderBizCarrier(biz) {
    const c = biz.carrier;
    const rows = [];
    if (c.carrierCode) rows.push(['Carrier', c.carrierCode]);
    if (c.service) rows.push(['Service', c.service]);
    if (c.transportMode) rows.push(['Mode', c.transportMode]);
    if (c.tracking) rows.push(['Tracking', c.tracking]);
    if (c.bol) rows.push(['Bill of Lading', c.bol]);
    if (c.packages != null) rows.push(['Packages', String(c.packages)]);
    if (c.weight != null) rows.push(['Weight', `${c.weight} ${c.weightUnit || ''}`.trim()]);
    if (c.equipmentType) rows.push(['Equipment', c.equipmentType]);
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    sec.innerHTML = `
      <div class="biz-section-title">Shipment & Carrier</div>
      <div class="biz-meta-grid">
        ${rows.map(r => `<div class="biz-meta-item"><div class="label">${escapeHtml(r[0].toUpperCase())}</div><div class="value">${escapeHtml(r[1])}</div></div>`).join('')}
      </div>`;
    return sec;
  }

  function renderBizAck(biz) {
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    const status = biz.ackSummary?.status || biz.ackTransactions?.[0]?.status || 'Unknown';
    const sCode = biz.ackSummary?.statusCode || biz.ackTransactions?.[0]?.statusCode || '';
    const statusClass = sCode === 'A' ? 'ack-ok' : (sCode === 'R' || sCode === 'X') ? 'ack-fail' : 'ack-warn';
    let html = `<div class="biz-section-title">Status</div>`;
    html += `<div class="ack-status ${statusClass}">${escapeHtml(status)}</div>`;
    if (biz.ackTransactions?.length) {
      html += `<div class="biz-section-title" style="margin-top:18px">Acknowledged Transactions</div>`;
      html += `<table class="biz-items"><thead><tr><th>Code</th><th>Name</th><th>Control #</th><th>Status</th><th>Errors</th></tr></thead><tbody>`;
      biz.ackTransactions.forEach(t => {
        html += `<tr><td class="mono bold">${escapeHtml(t.code)}</td><td>${escapeHtml(t.name)}</td><td class="mono">${escapeHtml(t.control)}</td><td>${escapeHtml(t.status || t.statusCode || '')}</td><td>${t.errors.length ? escapeHtml(t.errors.map(e => `${e.segment} (${e.code})`).join(', ')) : '—'}</td></tr>`;
      });
      html += '</tbody></table>';
    }
    if (biz.ackSummary) {
      const s = biz.ackSummary;
      html += `<div class="biz-section-title" style="margin-top:18px">Summary</div>`;
      html += `<div class="biz-meta-grid">
        <div class="biz-meta-item"><div class="label">INCLUDED</div><div class="value">${s.included}</div></div>
        <div class="biz-meta-item"><div class="label">RECEIVED</div><div class="value">${s.received}</div></div>
        <div class="biz-meta-item"><div class="label">ACCEPTED</div><div class="value">${s.accepted}</div></div>
      </div>`;
    }
    sec.innerHTML = html;
    return sec;
  }

  function renderBizReferences(biz) {
    const refs = biz.references.filter(r => r.value || r.description);
    if (!refs.length) return null;
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    sec.innerHTML = `
      <div class="biz-section-title">References</div>
      <table class="biz-items">
        <thead><tr><th>Type</th><th>Value</th><th>Description</th></tr></thead>
        <tbody>
          ${refs.map(r => `<tr><td>${escapeHtml(r.type || r.typeCode || '')}</td><td class="mono">${escapeHtml(r.value || '')}</td><td>${escapeHtml(r.description || '')}</td></tr>`).join('')}
        </tbody>
      </table>`;
    return sec;
  }

  function renderBizContact(biz) {
    const c = biz.contact;
    if (!c || (!c.name && !c.methods?.length)) return null;
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    let html = '<div class="biz-section-title">Contact</div>';
    html += '<div class="biz-meta-grid">';
    if (c.name) html += `<div class="biz-meta-item"><div class="label">NAME</div><div class="value">${escapeHtml(c.name)}${c.function ? ` <span class="dim">— ${escapeHtml(c.function)}</span>` : ''}</div></div>`;
    (c.methods || []).forEach(m => html += `<div class="biz-meta-item"><div class="label">${escapeHtml(m.kind.toUpperCase())}</div><div class="value">${escapeHtml(m.value)}</div></div>`);
    html += '</div>';
    sec.innerHTML = html;
    return sec;
  }

  function simpleTextSection(title, text) {
    const sec = document.createElement('div');
    sec.className = 'biz-section';
    sec.innerHTML = `<div class="biz-section-title">${escapeHtml(title)}</div><div class="biz-text">${escapeHtml(text)}</div>`;
    return sec;
  }

  function metaItem(label, val) {
    return `<div><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(val || '—')}</div></div>`;
  }

  function groupSegmentsForRich(standard, txn) {
    const sections = [];
    let current = null;
    const start = (title, isItem = false) => {
      if (current && current.segments.length) sections.push(current);
      current = { title, segments: [], isItem };
    };

    for (const seg of txn.segments) {
      const code = seg.code;
      if (['BEG', 'BIG', 'BSN', 'BAK', 'BGM', 'W05', 'W06'].includes(code)) {
        if (!current || current.title !== 'Document Header') start('Document Header');
      } else if (code === 'N1' || code === 'NAD') {
        start('Party — ' + describePartyText(standard, seg));
      } else if (code === 'HL') {
        const levelCode = window.EDIParser.textOf(seg.elements[3]);
        const levelMap = { 'S': 'Shipment', 'O': 'Order', 'I': 'Item', 'P': 'Pack' };
        start(`Hierarchy: ${levelMap[levelCode] || levelCode || 'Level'} ${window.EDIParser.textOf(seg.elements[1]) || ''}`);
      } else if (code === 'PO1' || code === 'IT1' || code === 'LIN' || code === 'W04') {
        const lineNo = window.EDIParser.textOf(seg.elements[1]);
        start(`Line Item ${lineNo || (sections.filter(s => s.isItem).length + 1)}`, true);
      } else if (['CTT', 'TDS', 'SAC', 'TXI', 'ITD', 'UNS', 'CNT', 'MOA', 'TAX', 'AMT'].includes(code)) {
        if (!current || current.title !== 'Totals & Charges') start('Totals & Charges');
      } else if (['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK9'].includes(code)) {
        if (!current || current.title !== 'Acknowledgment') start('Acknowledgment');
      } else if (['TD1', 'TD3', 'TD5', 'W11', 'W27', 'EQD', 'TDT'].includes(code)) {
        if (!current || current.title !== 'Carrier & Transport') start('Carrier & Transport');
      }
      if (!current) start('Segments');
      current.segments.push(seg);
    }
    if (current && current.segments.length) sections.push(current);
    return sections;
  }

  function describePartyText(standard, seg) {
    if (standard === 'x12') {
      const qual = window.EDIParser.textOf(seg.elements[1]);
      const name = window.EDIParser.textOf(seg.elements[2]);
      const role = window.EDIDictionary.qualifierName(qual) || qual || 'Party';
      return `${role}${name ? ' · ' + name : ''}`;
    }
    const qual = window.EDIParser.textOf(seg.elements[1]);
    const ident = Array.isArray(seg.elements[2]) ? seg.elements[2][0] : window.EDIParser.textOf(seg.elements[2]);
    return `${qual || 'Party'}${ident ? ' · ' + ident : ''}`;
  }

  function renderFieldGrid(standard, segments) {
    let html = '<div class="field-grid">';
    let any = false;
    segments.forEach(seg => {
      for (let i = 1; i < seg.elements.length; i++) {
        const el = seg.elements[i];
        if (el === '' || el == null) continue;
        any = true;
        const label = window.EDIDictionary.lookupElement(standard, seg.code, i) || `${seg.code}${pad2(i)}`;
        const value = formatRichValue(el, standard, seg.code, i);
        html += `<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
      }
    });
    if (!any) html += `<div class="field empty"><div class="value">No data</div></div>`;
    html += '</div>';
    return html;
  }

  function renderItemTable(standard, segments) {
    // Show a friendly table of element rows
    let html = '<table class="doc-table"><thead><tr><th>Code</th><th>Field</th><th>Value</th></tr></thead><tbody>';
    segments.forEach(seg => {
      for (let i = 1; i < seg.elements.length; i++) {
        const el = seg.elements[i];
        if (el === '' || el == null) continue;
        const label = window.EDIDictionary.lookupElement(standard, seg.code, i) || `Element ${pad2(i)}`;
        const value = formatRichValue(el, standard, seg.code, i);
        html += `<tr><td class="code">${seg.code}${pad2(i)}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
      }
    });
    html += '</tbody></table>';
    return html;
  }

  function formatRichValue(el, standard, code, position) {
    if (Array.isArray(el)) return el.filter(Boolean).join(' : ');
    let v = String(el == null ? '' : el);
    const field = (window.EDIDictionary.lookupElement(standard, code, position) || '').toLowerCase();
    if (field.includes('qualifier') || field.includes('code')) {
      const friendly = window.EDIDictionary.qualifierName(v);
      if (friendly) v = `${v} — ${friendly}`;
    }
    if (code === 'ST' && position === 1) {
      const t = window.EDIDictionary.transactionName(standard, v);
      if (t) v = `${v} — ${t}`;
    }
    if (code === 'DTM' && position === 2 && /^\d{6,8}$/.test(v)) {
      v = `${v} (${window.EDIParser.formatYYMMDD(v)})`;
    }
    return v;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function updateDocInfo(tree) {
    const s = window.EDIParser.summarize(tree);
    const firstTxn = s.transactions[0];
    els.infoStandard.textContent = s.standard;
    els.infoTransaction.textContent = firstTxn ? `${firstTxn.code} · ${firstTxn.name}` : '—';
    els.infoSender.textContent = s.sender || '—';
    els.infoReceiver.textContent = s.receiver || '—';
    els.infoControl.textContent = s.controlNumber || '—';
    els.infoDate.textContent = s.date || '—';
  }
  function clearDocInfo() {
    ['infoStandard', 'infoTransaction', 'infoSender', 'infoReceiver', 'infoControl', 'infoDate']
      .forEach(k => els[k].textContent = '—');
  }

  function buildReadableTextFromEdi(tree) {
    const biz = window.BusinessMapper.toBusinessDocument(tree);
    if (!biz) return '(No business document)';
    const lines = [];
    const sep = '='.repeat(60);
    const sub = '-'.repeat(60);

    lines.push(sep);
    lines.push(`  ${biz.title.toUpperCase()}`);
    if (biz.number) lines.push(`  Number: ${biz.number}`);
    if (biz.date) lines.push(`  Date:   ${biz.date}`);
    lines.push(sep);
    lines.push('');

    // Parties
    const order = Object.keys(biz.parties).sort();
    order.forEach(code => {
      const p = biz.parties[code];
      lines.push(`[${(p.role || code).toUpperCase()}]`);
      if (p.name) lines.push(`  ${p.name}`);
      p.address.forEach(a => lines.push(`  ${a}`));
      const cityLine = [p.city, p.state].filter(Boolean).join(', ') + (p.zip ? ' ' + p.zip : '');
      if (cityLine.trim()) lines.push(`  ${cityLine.trim()}`);
      if (p.country) lines.push(`  ${p.country}`);
      if (p.id) lines.push(`  ID: ${p.id}`);
      lines.push('');
    });

    // Meta
    if (biz.meta && Object.keys(biz.meta).length) {
      lines.push(sub);
      lines.push('DETAILS');
      lines.push(sub);
      Object.entries(biz.meta).forEach(([k, v]) => {
        lines.push(`  ${humanize(k).padEnd(22)} ${v}`);
      });
      lines.push('');
    }

    // Carrier
    if (biz.carrier) {
      lines.push(sub);
      lines.push('SHIPMENT & CARRIER');
      lines.push(sub);
      Object.entries(biz.carrier).forEach(([k, v]) => {
        if (v == null || v === '') return;
        lines.push(`  ${humanize(k).padEnd(22)} ${v}`);
      });
      lines.push('');
    }

    // Items
    if (biz.items && biz.items.length) {
      const currency = biz.totals?.currency || 'USD';
      lines.push(sub);
      lines.push(biz.kind === 'SHIP_NOTICE' ? 'ITEMS SHIPPED' : 'LINE ITEMS');
      lines.push(sub);
      lines.push('  #   SKU            Description                              Qty   UOM   Unit Price   Line Total');
      biz.items.forEach(it => {
        const ln = String(it.line || '').padStart(3);
        const sku = (it.sku || '').padEnd(14).slice(0, 14);
        const desc = (it.description || '').padEnd(40).slice(0, 40);
        const qty = (it.quantity != null ? window.BusinessMapper.fmtNumber(it.quantity, 0) : '').padStart(5);
        const uom = (it.uom || '').padEnd(5);
        const price = (it.unitPrice != null ? window.BusinessMapper.fmtMoney(it.unitPrice, currency) : '').padStart(12);
        const total = (it.lineTotal != null ? window.BusinessMapper.fmtMoney(it.lineTotal, currency) : '').padStart(13);
        lines.push(`  ${ln} ${sku} ${desc} ${qty} ${uom} ${price} ${total}`);
      });
      lines.push('');
    }

    // Totals
    if (biz.totals && Object.keys(biz.totals).length) {
      const c = biz.totals.currency || 'USD';
      lines.push(sub);
      lines.push('TOTALS');
      lines.push(sub);
      if (biz.totals.subtotal != null) lines.push(`  Subtotal:           ${window.BusinessMapper.fmtMoney(biz.totals.subtotal, c)}`);
      (biz.charges || []).forEach(ch => {
        const sign = ch.type === 'Allowance' ? '−' : '+';
        lines.push(`  ${(ch.description || ch.type).padEnd(20)}${sign}${window.BusinessMapper.fmtMoney(ch.amount, c)}`);
      });
      if (biz.totals.tax != null) lines.push(`  Tax:                ${window.BusinessMapper.fmtMoney(biz.totals.tax, c)}`);
      if (biz.totals.total != null) {
        lines.push(`  ${'─'.repeat(40)}`);
        const label = biz.kind === 'INVOICE' ? 'TOTAL DUE' : 'TOTAL';
        lines.push(`  ${label}:           ${window.BusinessMapper.fmtMoney(biz.totals.total, c)}`);
      }
      lines.push('');
    }

    if (biz.terms) { lines.push('PAYMENT TERMS'); lines.push(`  ${biz.terms}`); lines.push(''); }
    if (biz.notes && biz.notes.length) {
      lines.push('NOTES');
      biz.notes.forEach(n => lines.push(`  • ${n}`));
      lines.push('');
    }
    if (biz.references && biz.references.length) {
      lines.push('REFERENCES');
      biz.references.forEach(r => lines.push(`  ${(r.type || r.typeCode).padEnd(24)} ${r.value || ''}${r.description ? ' — ' + r.description : ''}`));
      lines.push('');
    }
    if (biz.contact) {
      lines.push('CONTACT');
      if (biz.contact.name) lines.push(`  ${biz.contact.name}${biz.contact.function ? ' — ' + biz.contact.function : ''}`);
      (biz.contact.methods || []).forEach(m => lines.push(`  ${m.kind}: ${m.value}`));
      lines.push('');
    }

    // Ack-specific
    if (biz.kind === 'FUNCTIONAL_ACK') {
      lines.push(sub);
      lines.push('ACKNOWLEDGMENT');
      lines.push(sub);
      lines.push(`  Status: ${biz.ackSummary?.status || biz.ackTransactions?.[0]?.status || 'Unknown'}`);
      (biz.ackTransactions || []).forEach(t => {
        lines.push(`  ${t.code} ${t.name.padEnd(30)} Ctrl ${t.control}   ${t.status || ''}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  function humanize(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  // ----- JSON / XML rich rendering -------------------------------
  function renderRichJson(obj) {
    // If it looks like an order/invoice/shipment, render via business doc layout
    if (window.BusinessMapper.looksLikeBusinessJson(obj)) {
      const biz = window.BusinessMapper.jsonToBusinessDocument(obj);
      if (biz) {
        els.richView.innerHTML = '';
        renderOneBusinessDoc(biz);
        updateDocInfoFromBiz(biz);
        return;
      }
    }
    const wrap = document.createElement('div');
    wrap.className = 'doc';

    const header = document.createElement('div');
    header.className = 'doc-header';
    header.innerHTML = `
      <div class="eyebrow">JSON Document</div>
      <h1>${escapeHtml(detectJsonTitle(obj))}</h1>
      <div class="subtitle">Structured data</div>
    `;
    wrap.appendChild(header);

    wrap.appendChild(renderJsonNode(obj, ''));
    els.richView.innerHTML = '';
    els.richView.appendChild(wrap);
  }
  function detectJsonTitle(obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj.title || obj.name || obj.documentType || obj.type || 'Object';
    }
    if (Array.isArray(obj)) return `Array (${obj.length} items)`;
    return 'Value';
  }
  function renderJsonNode(obj, pathPrefix) {
    const section = document.createElement('div');
    section.className = 'doc-section';
    if (obj === null || typeof obj !== 'object') {
      section.innerHTML = `<h3>${escapeHtml(pathPrefix || 'value')}</h3>
        <div class="field-grid"><div class="field"><div class="value">${escapeHtml(String(obj))}</div></div></div>`;
      return section;
    }
    if (Array.isArray(obj)) {
      if (obj.length && typeof obj[0] === 'object') {
        // table layout
        const keys = collectKeys(obj);
        let html = `<h3>${escapeHtml(pathPrefix || 'items')} <span class="seg-code">${obj.length}</span></h3>`;
        html += '<table class="doc-table"><thead><tr>' + keys.map(k => `<th>${escapeHtml(k)}</th>`).join('') + '</tr></thead><tbody>';
        obj.forEach(row => {
          html += '<tr>' + keys.map(k => {
            const v = row && typeof row === 'object' ? row[k] : '';
            return `<td>${escapeHtml(formatScalar(v))}</td>`;
          }).join('') + '</tr>';
        });
        html += '</tbody></table>';
        section.innerHTML = html;
      } else {
        section.innerHTML = `<h3>${escapeHtml(pathPrefix || 'items')}</h3>
          <div class="field-grid">${obj.map((v, i) => `<div class="field"><div class="label">[${i}]</div><div class="value">${escapeHtml(formatScalar(v))}</div></div>`).join('')}</div>`;
      }
      return section;
    }
    // Object
    section.innerHTML = `<h3>${escapeHtml(pathPrefix || 'document')}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'field-grid';
    const nested = [];
    Object.entries(obj).forEach(([k, v]) => {
      if (v && typeof v === 'object') {
        nested.push([k, v]);
      } else {
        const f = document.createElement('div');
        f.className = 'field' + ((v === null || v === '') ? ' empty' : '');
        f.innerHTML = `<div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(formatScalar(v))}</div>`;
        grid.appendChild(f);
      }
    });
    section.appendChild(grid);
    nested.forEach(([k, v]) => {
      section.appendChild(renderJsonNode(v, pathPrefix ? `${pathPrefix}.${k}` : k));
    });
    return section;
  }
  function collectKeys(arr) {
    const seen = new Set();
    arr.forEach(item => { if (item && typeof item === 'object') Object.keys(item).forEach(k => seen.add(k)); });
    return Array.from(seen);
  }
  function formatScalar(v) {
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function renderRichXml(node) {
    if (window.BusinessMapper.looksLikeBusinessXml(node)) {
      const biz = window.BusinessMapper.xmlToBusinessDocument(node);
      if (biz) {
        els.richView.innerHTML = '';
        renderOneBusinessDoc(biz);
        updateDocInfoFromBiz(biz);
        return;
      }
    }
    const wrap = document.createElement('div');
    wrap.className = 'doc';
    wrap.innerHTML = `
      <div class="doc-header">
        <div class="eyebrow">XML Document</div>
        <h1>&lt;${escapeHtml(node._tag)}&gt;</h1>
        <div class="subtitle">Structured XML data</div>
      </div>
    `;
    wrap.appendChild(renderXmlSection(node));
    els.richView.innerHTML = '';
    els.richView.appendChild(wrap);
  }
  function renderXmlSection(node) {
    const section = document.createElement('div');
    section.className = 'doc-section';
    let html = `<h3><span class="seg-code">&lt;${escapeHtml(node._tag)}&gt;</span></h3>`;
    const grid = [];
    if (node._attrs) {
      Object.entries(node._attrs).forEach(([k, v]) => {
        grid.push(`<div class="field"><div class="label">@${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div></div>`);
      });
    }
    if (node._text) {
      grid.push(`<div class="field"><div class="label">text</div><div class="value">${escapeHtml(node._text)}</div></div>`);
    }
    if (grid.length) html += `<div class="field-grid">${grid.join('')}</div>`;
    section.innerHTML = html;
    if (node._children) node._children.forEach(c => section.appendChild(renderXmlSection(c)));
    return section;
  }
  function xmlNodeToFlat(node) {
    const o = {};
    if (node._attrs) Object.assign(o, Object.fromEntries(Object.entries(node._attrs).map(([k, v]) => ['@' + k, v])));
    if (node._text) o._text = node._text;
    if (node._children) {
      node._children.forEach(c => {
        const v = xmlNodeToFlat(c);
        if (o[c._tag] === undefined) o[c._tag] = v;
        else if (Array.isArray(o[c._tag])) o[c._tag].push(v);
        else o[c._tag] = [o[c._tag], v];
      });
    }
    return o;
  }

  function jsonToXml(obj, pretty) {
    const ind = pretty ? '  ' : '';
    const nl  = pretty ? '\n' : '';
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function nodeize(name, val, depth) {
      const pad = ind.repeat(depth);
      const tag = sanitizeTag(name);
      if (val === null || val === undefined) return `${pad}<${tag}/>`;
      if (Array.isArray(val)) return val.map(v => nodeize(name, v, depth)).join(nl);
      if (typeof val === 'object') {
        const children = Object.entries(val).map(([k, v]) => nodeize(k, v, depth + 1)).join(nl);
        return `${pad}<${tag}>${nl}${children}${nl}${pad}</${tag}>`;
      }
      return `${pad}<${tag}>${esc(val)}</${tag}>`;
    }
    function sanitizeTag(s) {
      const t = String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
      return /^[a-zA-Z_]/.test(t) ? t : '_' + t;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>${nl}${nodeize('document', obj, 0)}`;
  }

  // ----- Downloads ------------------------------------------------
  function downloadPdf() {
    const raw = els.inputArea.value.trim();
    if (!raw) { toast('Nothing to convert', 'info'); return; }
    const fmt = effectiveInputFormat();
    if (!fmt) { toast('Could not detect input format', 'error'); return; }
    try {
      let doc;
      if (fmt === 'x12' || fmt === 'edifact') {
        const tree = window.EDIParser.parse(raw, fmt);
        doc = window.PDFGenerator.pdfFromEdi(tree, { audit: els.optAudit?.checked });
      } else if (fmt === 'json') {
        doc = window.PDFGenerator.pdfFromJson(raw);
      } else if (fmt === 'xml') {
        doc = window.PDFGenerator.pdfFromXml(raw);
      } else {
        throw new Error('Unsupported format: ' + fmt);
      }
      const filename = makeFilename(fmt, 'pdf');
      doc.save(filename);
      toast('PDF saved as ' + filename, 'success');
      setStatus('PDF downloaded');
    } catch (e) {
      console.error(e);
      toast('PDF error: ' + e.message, 'error');
    }
  }

  function downloadOutput() {
    if (!state.outputText) { toast('Convert first', 'info'); return; }
    const ext = state.outputType === 'readable' ? 'txt'
              : state.outputType === 'json' ? 'json'
              : state.outputType === 'xml'  ? 'xml' : 'txt';
    const filename = makeFilename(effectiveInputFormat() || 'doc', ext);
    const mime = ext === 'json' ? 'application/json'
               : ext === 'xml' ? 'application/xml'
               : 'text/plain';
    const blob = new Blob([state.outputText], { type: mime });
    triggerDownload(blob, filename);
    toast('Saved ' + filename, 'success');
  }

  function makeFilename(inputFmt, ext) {
    const s = state.parsedTree ? window.EDIParser.summarize(state.parsedTree) : null;
    const txn = s && s.transactions[0] ? s.transactions[0].code : inputFmt.toUpperCase();
    const ctl = s && s.controlNumber ? '-' + s.controlNumber : '';
    const ts = new Date().toISOString().slice(0, 10);
    return `EDIReader-${txn}${ctl}-${ts}.${ext}`;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ----- View toggle ---------------------------------------------
  function switchView(view) {
    state.currentView = view;
    if (view === 'rich') {
      els.richView.classList.remove('hidden');
      els.codeView.classList.add('hidden');
      els.viewRich.classList.add('active');
      els.viewCode.classList.remove('active');
    } else {
      els.richView.classList.add('hidden');
      els.codeView.classList.remove('hidden');
      els.viewCode.classList.add('active');
      els.viewRich.classList.remove('active');
    }
  }

  // ----- File handling -------------------------------------------
  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      els.inputArea.value = e.target.result;
      updateDetection();
      toast(`Loaded ${file.name}`, 'success');
      setStatus(`Loaded ${file.name} (${file.size.toLocaleString()} bytes)`);
    };
    reader.onerror = () => toast('Failed to read file', 'error');
    reader.readAsText(file);
  }

  // ----- Samples --------------------------------------------------
  let sampleIdx = 0;
  function loadNextSample() {
    const s = window.Samples[sampleIdx % window.Samples.length];
    sampleIdx++;
    els.inputArea.value = s.content;
    els.inputFormat.value = s.format;
    updateDetection();
    toast(`Sample loaded: ${s.name}`, 'info');
    setStatus(`Sample: ${s.name}`);
  }

  // ----- Event binding -------------------------------------------
  function init() {
    els.inputArea.addEventListener('input', updateDetection);
    els.inputFormat.addEventListener('change', updateDetection);
    els.outputFormat.addEventListener('change', updateOptionVisibility);
    els.convertBtn.addEventListener('click', convert);
    els.downloadPdfBtn.addEventListener('click', downloadPdf);
    els.downloadTextBtn.addEventListener('click', downloadOutput);

    els.fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

    // Drag & drop
    ['dragenter', 'dragover'].forEach(ev =>
      els.dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); els.dropZone.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach(ev =>
      els.dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); els.dropZone.classList.remove('dragging'); }));
    els.dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    els.loadSample.addEventListener('click', loadNextSample);
    els.emptyLoadSample.addEventListener('click', loadNextSample);
    els.clearAll.addEventListener('click', () => {
      els.inputArea.value = '';
      els.codeBlock.textContent = '';
      els.richView.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <h3>Cleared</h3>
          <p>Paste, drop, or upload a file — then click <strong>Convert</strong>.</p>
        </div>`;
      switchView('rich');
      els.outputBadge.textContent = 'No output yet';
      els.outputBadge.className = 'badge';
      clearDocInfo();
      state.parsedTree = null; state.outputText = null;
      updateDetection();
      setStatus('Cleared');
      toast('Cleared', 'info');
    });

    els.viewRich.addEventListener('click', () => switchView('rich'));
    els.viewCode.addEventListener('click', () => switchView('code'));

    els.copyBtn.addEventListener('click', async () => {
      const text = state.currentView === 'code' ? state.outputText : els.richView.innerText;
      if (!text) { toast('Nothing to copy', 'info'); return; }
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard', 'success');
      } catch {
        toast('Copy failed — select & copy manually', 'error');
      }
    });

    els.aboutBtn.addEventListener('click', () => els.aboutModal.classList.remove('hidden'));
    els.aboutModal.querySelectorAll('[data-close]').forEach(el =>
      el.addEventListener('click', () => els.aboutModal.classList.add('hidden')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') els.aboutModal.classList.add('hidden');
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); convert(); }
    });

    initTheme();
    updateDetection();
    updateOptionVisibility();
    setStatus('Ready');
  }

  // Cycle through three appearances: dark → light·lavender → light·sage → dark
  const THEME_CYCLE = ['dark', 'lavender', 'sage'];
  const THEME_LABELS = {
    dark:     { tooltip: 'Switch to Lavender (light)' },
    lavender: { tooltip: 'Switch to Sage (light)' },
    sage:     { tooltip: 'Switch to Dark' },
  };
  function initTheme() {
    let saved = localStorage.getItem('edireader-theme');
    if (!saved || !THEME_CYCLE.includes(saved)) {
      saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'lavender' : 'dark';
    }
    setTheme(saved);
    els.themeToggle?.addEventListener('click', () => {
      const current = getCurrentThemeName();
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
      setTheme(next);
      localStorage.setItem('edireader-theme', next);
    });
  }
  function getCurrentThemeName() {
    if (document.documentElement.dataset.theme === 'light') {
      return document.documentElement.dataset.palette || 'lavender';
    }
    return 'dark';
  }
  function setTheme(name) {
    const root = document.documentElement;
    if (name === 'dark') {
      root.dataset.theme = 'dark';
      delete root.dataset.palette;
    } else {
      root.dataset.theme = 'light';
      root.dataset.palette = name;
    }
    if (els.themeToggle) {
      els.themeToggle.title = THEME_LABELS[name]?.tooltip || 'Toggle theme';
    }
  }

  function updateOptionVisibility() {
    const fmt = els.outputFormat.value;
    const isStructured = fmt === 'json' || fmt === 'xml';
    if (els.rowPretty) els.rowPretty.classList.toggle('opt-disabled', !isStructured);
    if (els.rowLabels) els.rowLabels.classList.toggle('opt-disabled', !isStructured);
    // Audit always applies (affects PDF and rich view), no disable
  }

  document.addEventListener('DOMContentLoaded', init);
})();
