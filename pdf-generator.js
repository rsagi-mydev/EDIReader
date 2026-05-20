/* ============================================================
   PDF Generator — renders a parsed EDI tree (or JSON/XML) as a
   business-friendly document: real-looking PO / Invoice /
   Shipping Notice / Functional Acknowledgment.

   No EDI jargon by default. Pass { audit: true } to append a
   technical EDI segment audit at the end.
   ============================================================ */
(function (global) {
  'use strict';

  const D = global.EDIDictionary;
  const P = global.EDIParser;
  const BM = global.BusinessMapper;

  // ----- Theme ----------------------------------------------------
  const TH = {
    primary: [55, 70, 140],     // deep indigo for business feel
    accent:  [34, 211, 238],
    text:    [25, 30, 50],
    textDim: [110, 120, 140],
    rule:    [222, 226, 235],
    bgSoft:  [247, 249, 253],
    bgAlt:   [240, 243, 250],
    success: [22, 163, 74],
    warn:    [202, 138, 4],
    danger:  [194, 65, 65],
    white:   [255, 255, 255],
  };

  const M = { left: 50, right: 50, top: 50, bottom: 50 };

  // ===== Public entry points =====================================
  function pdfFromEdi(tree, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const docs = BM.toBusinessDocuments(tree);
    if (!docs.length) throw new Error('Could not build business document');

    docs.forEach((biz, idx) => {
      if (idx > 0) doc.addPage();
      renderBusinessDocument(doc, biz);
    });

    if (opts.audit) {
      renderAuditAppendix(doc, tree);
    }
    drawAllFooters(doc, docs[0]);
    return doc;
  }

  function pdfFromJson(jsonStr) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    let obj;
    try { obj = JSON.parse(jsonStr); }
    catch (e) { throw new Error('Invalid JSON: ' + e.message); }

    // Try smart rendering if it looks like an order/invoice
    if (looksLikeBusinessJson(obj)) {
      const biz = jsonToBusinessDoc(obj);
      renderBusinessDocument(doc, biz);
    } else {
      simpleJsonReport(doc, obj);
    }
    drawAllFooters(doc, { title: 'JSON Document', number: '' });
    return doc;
  }

  function pdfFromXml(xmlStr) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    let parsed;
    try { parsed = window.FormatUtils.parseXml(xmlStr); }
    catch (e) { throw new Error(e.message); }
    drawSimpleCover(doc, 'XML Document', parsed._tag || '');
    let y = M.top + 70;
    y = renderXmlNode(doc, parsed, y, 0);
    drawAllFooters(doc, { title: 'XML Document', number: parsed._tag || '' });
    return doc;
  }

  // ===== Business document renderer ==============================
  function renderBusinessDocument(doc, biz) {
    drawDocumentBanner(doc, biz);
    let y = M.top + 110;
    y = drawPartyBlocks(doc, biz, y);
    y = drawMetaBlock(doc, biz, y);
    if (biz.kind === 'SHIP_NOTICE') y = drawCarrierBlock(doc, biz, y);
    if (biz.kind === 'FUNCTIONAL_ACK') y = drawAckBody(doc, biz, y);
    else y = drawItemsTable(doc, biz, y);
    y = drawTotalsBlock(doc, biz, y);
    if (biz.terms) y = drawTermsBlock(doc, biz, y);
    if (biz.notes && biz.notes.length) y = drawNotesBlock(doc, biz, y);
    if (biz.references && biz.references.length) y = drawReferencesBlock(doc, biz, y);
    if (biz.contact) y = drawContactBlock(doc, biz, y);
  }

  // ----- Banner ---------------------------------------------------
  function drawDocumentBanner(doc, biz) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...TH.primary);
    doc.rect(0, 0, W, 90, 'F');
    doc.setFillColor(...TH.accent);
    doc.rect(0, 90, W, 3, 'F');
    doc.setDrawColor(...TH.accent);
    doc.setLineWidth(0);

    doc.setTextColor(...TH.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const eyebrow = `${biz.standard || ''} · ${biz.transactionCode || ''}`;
    doc.text(eyebrow, M.left, 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text(biz.title.toUpperCase(), M.left, 62);

    // Right meta in banner: number + date
    if (biz.number || biz.date) {
      const rightX = W - M.right;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 210, 240);
      doc.text('NUMBER', rightX, 32, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...TH.white);
      doc.text(biz.number || '—', rightX, 47, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 210, 240);
      doc.text('DATE', rightX, 65, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...TH.white);
      doc.text(biz.date || '—', rightX, 78, { align: 'right' });
    }

    // Test indicator
    if (biz.interchange && biz.interchange.isTest) {
      const tag = 'TEST';
      const w = doc.getTextWidth(tag) + 16;
      doc.setFillColor(...TH.warn);
      doc.roundedRect(M.left + 220, 50, w, 16, 3, 3, 'F');
      doc.setTextColor(...TH.white);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(tag, M.left + 220 + w/2, 61, { align: 'center' });
    }

    // Multi-document indicator
    if (biz.totalDocumentsInInterchange > 1) {
      const tag = `${biz.indexInInterchange} of ${biz.totalDocumentsInInterchange}`;
      const w = doc.getTextWidth(tag) + 18;
      doc.setFillColor(34, 211, 238);
      doc.roundedRect(M.left + 280, 50, w, 16, 3, 3, 'F');
      doc.setTextColor(20, 30, 60);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(tag, M.left + 280 + w/2, 61, { align: 'center' });
    }
  }

  function drawSimpleCover(doc, title, subtitle) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...TH.primary);
    doc.rect(0, 0, W, 90, 'F');
    doc.setFillColor(...TH.accent);
    doc.rect(0, 90, W, 3, 'F');
    doc.setTextColor(...TH.white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), M.left, 32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(subtitle, M.left, 62);
  }

  // ----- Party blocks --------------------------------------------
  function drawPartyBlocks(doc, biz, y) {
    const ordered = orderedPartyCodes(biz);
    if (!ordered.length) return y;

    const W = doc.internal.pageSize.getWidth();
    const colWidth = (W - M.left - M.right - 14) / 2;
    let col = 0;
    let rowTop = y;

    ordered.slice(0, 4).forEach((code) => {
      const party = biz.parties[code];
      if (!party) return;
      const x = M.left + col * (colWidth + 14);
      const blockY = col === 0 ? rowTop : rowTop;
      const consumedY = drawPartyCard(doc, party, x, blockY, colWidth);
      if (col === 1) { rowTop = Math.max(rowTop, consumedY) + 14; col = 0; }
      else col = 1;
    });
    return col === 1 ? rowTop + 100 : rowTop + 14;
  }

  function drawPartyCard(doc, party, x, y, w) {
    const lineHeight = 12;
    const lines = [];
    if (party.name) lines.push({ text: party.name, font: 'bold', size: 11 });
    party.address.forEach(line => lines.push({ text: line, font: 'normal', size: 10 }));
    const cityLine = [party.city, party.state].filter(Boolean).join(', ') + (party.zip ? ' ' + party.zip : '');
    if (cityLine.trim()) lines.push({ text: cityLine.trim(), font: 'normal', size: 10 });
    if (party.country) lines.push({ text: party.country, font: 'normal', size: 10 });
    if (party.id) lines.push({ text: 'ID: ' + party.id, font: 'normal', size: 8.5, dim: true });

    const cardHeight = 28 + (lines.length * lineHeight) + 10;

    // Header bar
    doc.setFillColor(...TH.bgAlt);
    doc.rect(x, y, w, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TH.primary);
    doc.text((party.role || 'PARTY').toUpperCase(), x + 10, y + 14);

    // Border
    doc.setDrawColor(...TH.rule);
    doc.setLineWidth(0.5);
    doc.rect(x, y, w, cardHeight, 'S');

    // Lines
    let ty = y + 22 + 14;
    lines.forEach(line => {
      doc.setFont('helvetica', line.font);
      doc.setFontSize(line.size);
      doc.setTextColor(...(line.dim ? TH.textDim : TH.text));
      const wrapped = doc.splitTextToSize(line.text, w - 20);
      doc.text(wrapped, x + 10, ty);
      ty += wrapped.length * lineHeight;
    });
    return y + cardHeight;
  }

  // ----- Meta block ----------------------------------------------
  function drawMetaBlock(doc, biz, y) {
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

    // Add scheduled dates if present
    (biz.dates || []).forEach(d => {
      if (!d.value && !d.time) return;
      if (d.type === 'Document Date' && d.value === biz.date) return;
      const v = d.value + (d.time ? ' ' + d.time : '');
      items.push([d.type, v]);
    });

    if (items.length === 0) return y + 4;

    y = ensure(doc, y, 70);
    drawSectionHeading(doc, 'Details', y);
    y += 18;

    const W = doc.internal.pageSize.getWidth();
    const colCount = 3;
    const colWidth = (W - M.left - M.right) / colCount;
    const rowH = 30;
    let i = 0;
    items.forEach((it, idx) => {
      const col = idx % colCount;
      const row = Math.floor(idx / colCount);
      const x = M.left + col * colWidth;
      const yy = y + row * rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TH.textDim);
      doc.text(String(it[0]).toUpperCase(), x, yy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...TH.text);
      const wrapped = doc.splitTextToSize(String(it[1]), colWidth - 10);
      doc.text(wrapped, x, yy + 13);
    });
    const rows = Math.ceil(items.length / colCount);
    return y + rows * rowH + 12;
  }

  // ----- Items table ---------------------------------------------
  function drawItemsTable(doc, biz, y) {
    if (!biz.items || biz.items.length === 0) return y;
    y = ensure(doc, y, 80);
    drawSectionHeading(doc, biz.kind === 'SHIP_NOTICE' ? 'Items Shipped' : 'Line Items', y);
    y += 18;

    const currency = biz.totals?.currency || 'USD';
    const showPrice = biz.items.some(i => i.unitPrice != null);
    const showTotal = biz.items.some(i => i.lineTotal != null);

    const head = ['#', 'Item Codes', 'Description', 'Qty', 'UOM'];
    if (showPrice) head.push('Unit Price');
    if (showTotal) head.push('Line Total');

    const body = [];
    const rowMeta = [];
    biz.items.forEach(it => {
      // Short qualifier codes only (e.g. "SK: ABC-123")
      const codesLines = (it.productIds || [])
        .filter(p => p.value)
        .map(p => `${p.qualifier || ''}: ${p.value}`);
      const codesCell = codesLines.length ? codesLines.join('\n') : (it.sku || '');

      // Build description cell — base description + simple discount/charge note
      let descCell = it.description || '';
      let hasNotes = false;
      if (it.charges && it.charges.length) {
        for (const c of it.charges) {
          const label = c.type === 'Allowance' ? 'Discount' : 'Charge';
          const value = c.percent != null ? `${c.percent}%` : BM.fmtMoney(c.amount, currency);
          const codeSuffix = c.code ? ` (${c.code})` : '';
          descCell += `\n${label} = ${value}${codeSuffix}`;
          hasNotes = true;
        }
      }

      const row = [
        String(it.line || ''),
        codesCell,
        descCell,
        it.quantity != null ? BM.fmtNumber(it.quantity, it.quantity % 1 === 0 ? 0 : 2) : '',
        it.uom || '',
      ];
      if (showPrice) row.push(it.unitPrice != null ? BM.fmtMoney(it.unitPrice, currency) : '');
      if (showTotal) row.push(it.lineTotal != null ? BM.fmtMoney(it.lineTotal, currency) : '');
      body.push(row);
      rowMeta.push({ hasNotes });
    });

    // Available width = 512pt (612 - 100 margins). Fixed cols sum to 344pt
    // (26 + 95 + 38 + 30 + 70 + 85) leaving ~168pt for the description.
    const colStyles = {
      0: { cellWidth: 26, halign: 'right', valign: 'top' },
      1: { cellWidth: 95, fontSize: 8.5, valign: 'top', overflow: 'linebreak' },
      2: { cellWidth: 'auto', valign: 'top', overflow: 'linebreak' },
      3: { cellWidth: 38, halign: 'right', valign: 'top' },
      4: { cellWidth: 30, halign: 'center', valign: 'top' },
    };
    if (showPrice) colStyles[5] = { cellWidth: 70, halign: 'right', valign: 'top' };
    if (showTotal) colStyles[showPrice ? 6 : 5] = { cellWidth: 85, halign: 'right', valign: 'top', fontStyle: 'bold' };

    doc.autoTable({
      startY: y,
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5, textColor: TH.text, lineColor: TH.rule, lineWidth: 0.4, overflow: 'linebreak' },
      headStyles: { fillColor: TH.primary, textColor: TH.white, fontStyle: 'bold', fontSize: 8.5, halign: 'left' },
      alternateRowStyles: { fillColor: TH.bgSoft },
      columnStyles: colStyles,
      margin: { left: M.left, right: M.right },
    });
    return doc.lastAutoTable.finalY + 16;
  }

  // ----- Totals block --------------------------------------------
  function drawTotalsBlock(doc, biz, y) {
    const t = biz.totals || {};
    const currency = t.currency || 'USD';
    const lines = [];
    if (t.subtotal != null) lines.push({ label: 'Subtotal', value: BM.fmtMoney(t.subtotal, currency) });
    if (t.itemLevelDiscounts) lines.push({
      label: 'Item-level Discount Total',
      value: '-' + BM.fmtMoney(t.itemLevelDiscounts, currency),
      isAllowance: true,
    });
    if (t.itemLevelCharges) lines.push({
      label: 'Item-level Charge Total',
      value: '+' + BM.fmtMoney(t.itemLevelCharges, currency),
    });
    (biz.charges || []).forEach(c => {
      const sign = c.type === 'Allowance' ? '-' : '';
      const lbl = (c.description || c.type) + (c.code ? ` (${c.code})` : '');
      const val = sign + BM.fmtMoney(c.amount, currency);
      lines.push({ label: lbl, value: val, isAllowance: c.type === 'Allowance' });
    });
    if (t.discount != null && !biz.charges?.some(c => c.type === 'Allowance')) {
      lines.push({ label: 'Discount', value: '-' + BM.fmtMoney(t.discount, currency), isAllowance: true });
    }
    (biz.taxes || []).forEach(tx => {
      const parts = [];
      if (tx.type) parts.push(tx.type);
      if (tx.rate != null) parts.push(`${tx.rate}%`);
      if (tx.jurisdiction) parts.push(tx.jurisdiction);
      const suffix = parts.length ? ' (' + parts.join(' · ') + ')' : '';
      lines.push({ label: 'Tax' + suffix, value: tx.amount != null ? BM.fmtMoney(tx.amount, currency) : '—' });
    });
    if (t.tax != null && !(biz.taxes || []).some(tx => tx.amount != null)) {
      const rate = biz.taxes?.[0]?.rate;
      lines.push({ label: 'Tax' + (rate ? ` (${rate}%)` : ''), value: BM.fmtMoney(t.tax, currency) });
    }
    // Stated vs computed reconciliation banner
    if (t.reconciliationMismatch && t.statedTotal != null) {
      lines.push({
        label: 'Stated Total (per TDS)',
        value: BM.fmtMoney(t.statedTotal, currency),
        muted: true,
      });
    }
    if (lines.length === 0 && t.total == null && t.lineCount == null) return y;

    const W = doc.internal.pageSize.getWidth();
    const boxW = 340; // wider so long labels never collide with values
    const boxX = W - M.right - boxW;
    const lineH = 19;
    const padTop = 12;
    const padBottom = 12;
    const headH = lines.length ? lineH * lines.length : 0;
    const totalH = t.total != null ? 42 : 0;
    const boxH = padTop + headH + (totalH ? 4 : 0) + totalH + (totalH ? 0 : padBottom);
    y = ensure(doc, y, boxH + 20);

    // Box bg
    doc.setFillColor(...TH.bgSoft);
    doc.rect(boxX, y, boxW, boxH, 'F');
    doc.setDrawColor(...TH.rule);
    doc.setLineWidth(0.5);
    doc.rect(boxX, y, boxW, boxH, 'S');

    let ty = y + padTop + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    lines.forEach(line => {
      doc.setTextColor(...(line.muted ? [150, 155, 175] : TH.textDim));
      const maxLabelW = boxW - 28 - doc.getTextWidth(line.value);
      let label = line.label;
      if (doc.getTextWidth(label) > maxLabelW) {
        while (label.length > 4 && doc.getTextWidth(label + '…') > maxLabelW) label = label.slice(0, -1);
        label = label + '…';
      }
      doc.text(label, boxX + 14, ty);
      doc.setTextColor(...(line.isAllowance ? [180, 60, 60] : (line.muted ? [150, 155, 175] : TH.text)));
      doc.text(line.value, boxX + boxW - 14, ty, { align: 'right' });
      ty += lineH;
    });

    if (t.total != null) {
      ty += 2;
      doc.setFillColor(...TH.primary);
      doc.rect(boxX, ty, boxW, totalH, 'F');
      doc.setTextColor(...TH.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const totalLabel = biz.kind === 'INVOICE' ? 'TOTAL DUE' : 'TOTAL';
      doc.text(totalLabel, boxX + 14, ty + 26);
      doc.setFontSize(16);
      doc.text(BM.fmtMoney(t.total, currency), boxX + boxW - 14, ty + 26, { align: 'right' });
    }
    let yOut = y + boxH + 18;

    // Mismatch warning under the box
    if (t.reconciliationMismatch) {
      yOut = ensure(doc, yOut, 28);
      const W = doc.internal.pageSize.getWidth();
      doc.setFillColor(255, 247, 230);
      doc.setDrawColor(220, 170, 60);
      doc.rect(M.left, yOut, W - M.left - M.right, 24, 'FD');
      doc.setTextColor(140, 90, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Note', M.left + 10, yOut + 10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 60, 20);
      doc.text(
        `Stated total (TDS) and computed breakdown differ — showing the computed value as TOTAL.`,
        M.left + 40, yOut + 16
      );
      yOut += 32;
    }
    return yOut;
  }

  // ----- Terms / Notes / References blocks -----------------------
  function drawTermsBlock(doc, biz, y) {
    y = ensure(doc, y, 50);
    drawSectionHeading(doc, 'Payment Terms', y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TH.text);
    const W = doc.internal.pageSize.getWidth();
    const wrapped = doc.splitTextToSize(biz.terms, W - M.left - M.right);
    doc.text(wrapped, M.left, y + 4);
    return y + wrapped.length * 13 + 12;
  }

  function drawNotesBlock(doc, biz, y) {
    y = ensure(doc, y, 50);
    drawSectionHeading(doc, 'Notes', y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TH.text);
    const W = doc.internal.pageSize.getWidth();
    for (const note of biz.notes) {
      const wrapped = doc.splitTextToSize('• ' + note, W - M.left - M.right);
      y = ensure(doc, y, wrapped.length * 13 + 6);
      doc.text(wrapped, M.left, y);
      y += wrapped.length * 13 + 4;
    }
    return y + 8;
  }

  function drawReferencesBlock(doc, biz, y) {
    const refs = biz.references.filter(r => r.value || r.description);
    if (!refs.length) return y;
    y = ensure(doc, y, 60);
    drawSectionHeading(doc, 'References', y);
    y += 16;

    doc.autoTable({
      startY: y,
      head: [['Type', 'Value', 'Description']],
      body: refs.map(r => [r.type || r.typeCode || '', r.value || '', r.description || '']),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 4, textColor: TH.text },
      headStyles: { fillColor: TH.bgAlt, textColor: TH.textDim, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 150, textColor: TH.textDim },
        1: { cellWidth: 180, font: 'courier' },
        2: { cellWidth: 'auto' },
      },
      margin: { left: M.left, right: M.right },
    });
    return doc.lastAutoTable.finalY + 12;
  }

  function drawContactBlock(doc, biz, y) {
    const c = biz.contact;
    if (!c || (!c.name && !c.methods?.length)) return y;
    y = ensure(doc, y, 60);
    drawSectionHeading(doc, 'Contact', y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TH.text);
    if (c.name) {
      doc.setFont('helvetica', 'bold');
      doc.text(c.name, M.left, y);
      doc.setFont('helvetica', 'normal');
      if (c.function) {
        doc.setTextColor(...TH.textDim);
        doc.setFontSize(9);
        doc.text(' — ' + c.function, M.left + doc.getTextWidth(c.name) + 2, y);
      }
      y += 14;
    }
    doc.setFontSize(10);
    doc.setTextColor(...TH.text);
    for (const m of c.methods || []) {
      doc.text(`${m.kind}: ${m.value}`, M.left, y);
      y += 13;
    }
    return y + 8;
  }

  // ----- Carrier (ship notice) block -----------------------------
  function drawCarrierBlock(doc, biz, y) {
    const c = biz.carrier;
    if (!c) return y;
    y = ensure(doc, y, 60);
    drawSectionHeading(doc, 'Shipment & Carrier', y);
    y += 16;
    const rows = [];
    if (c.carrierCode) rows.push(['Carrier', c.carrierCode]);
    if (c.service) rows.push(['Service', c.service]);
    if (c.transportMode) rows.push(['Mode', c.transportMode]);
    if (c.tracking) rows.push(['Tracking', c.tracking]);
    if (c.bol) rows.push(['Bill of Lading', c.bol]);
    if (c.packages != null) rows.push(['Packages', String(c.packages)]);
    if (c.weight != null) rows.push(['Weight', `${c.weight} ${c.weightUnit || ''}`.trim()]);
    if (c.equipmentType) rows.push(['Equipment', c.equipmentType]);

    if (!rows.length) return y;
    doc.autoTable({
      startY: y,
      body: rows,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 5, textColor: TH.text },
      columnStyles: {
        0: { cellWidth: 130, textColor: TH.textDim, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
      },
      margin: { left: M.left, right: M.right },
    });
    return doc.lastAutoTable.finalY + 12;
  }

  // ----- Acknowledgment body --------------------------------------
  function drawAckBody(doc, biz, y) {
    y = ensure(doc, y, 100);
    // Big status badge
    const status = biz.ackSummary?.status || biz.ackTransactions?.[0]?.status || 'Unknown';
    const statusCode = biz.ackSummary?.statusCode || biz.ackTransactions?.[0]?.statusCode || '';
    const color = statusCode === 'A' ? TH.success : (statusCode === 'R' || statusCode === 'X') ? TH.danger : TH.warn;

    doc.setFillColor(...color);
    doc.roundedRect(M.left, y, 220, 36, 4, 4, 'F');
    doc.setTextColor(...TH.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(status, M.left + 14, y + 22);
    y += 50;

    drawSectionHeading(doc, 'Acknowledged Transactions', y);
    y += 16;

    const rows = (biz.ackTransactions || []).map(t => [
      t.code,
      t.name,
      t.control,
      t.status || t.statusCode || '',
      t.errors.length ? t.errors.map(e => `${e.segment} (${e.code})`).join(', ') : '—',
    ]);
    if (rows.length) {
      doc.autoTable({
        startY: y,
        head: [['Code', 'Name', 'Control #', 'Status', 'Errors']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 6, textColor: TH.text, lineColor: TH.rule },
        headStyles: { fillColor: TH.primary, textColor: TH.white, fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: TH.bgSoft },
        margin: { left: M.left, right: M.right },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    if (biz.ackSummary) {
      const s = biz.ackSummary;
      drawSectionHeading(doc, 'Summary', y); y += 16;
      const rows2 = [
        ['Group Status', s.status],
        ['Transactions Included', String(s.included)],
        ['Transactions Received', String(s.received)],
        ['Transactions Accepted', String(s.accepted)],
      ];
      doc.autoTable({
        startY: y, body: rows2, theme: 'plain',
        styles: { fontSize: 10, cellPadding: 5, textColor: TH.text },
        columnStyles: { 0: { cellWidth: 200, textColor: TH.textDim, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
        margin: { left: M.left, right: M.right },
      });
      y = doc.lastAutoTable.finalY + 14;
    }
    return y;
  }

  // ===== Audit appendix ==========================================
  function renderAuditAppendix(doc, tree) {
    doc.addPage();
    drawAuditCover(doc, tree);
    let y = M.top + 70;
    for (const group of tree.groups) {
      for (const txn of group.transactions) {
        y = ensure(doc, y, 60);
        drawSectionHeading(doc, `${txn.transactionCode} — Control ${txn.controlNumber}`, y);
        y += 18;
        for (const seg of txn.segments) {
          y = drawSegmentAuditCard(doc, tree.standard, seg, y);
        }
      }
    }
  }
  function drawAuditCover(doc, tree) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...TH.bgAlt);
    doc.rect(0, 0, W, 60, 'F');
    doc.setTextColor(...TH.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TECHNICAL APPENDIX', M.left, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(18);
    doc.setTextColor(...TH.text);
    doc.text('EDI Segment Audit', M.left, 56);
  }
  function drawSegmentAuditCard(doc, standard, seg, y) {
    const W = doc.internal.pageSize.getWidth();
    const info = D.lookupSegment(standard, seg.code);
    const segName = info && info.name ? info.name : 'Segment';
    const rows = [];
    for (let i = 1; i < seg.elements.length; i++) {
      const el = seg.elements[i];
      if (el === '' || el == null) continue;
      const label = D.lookupElement(standard, seg.code, i) || `Element ${pad2(i)}`;
      const val = Array.isArray(el) ? el.join(' : ') : String(el);
      rows.push([`${seg.code}${pad2(i)}`, label, val]);
    }
    if (!rows.length) return y;
    y = ensure(doc, y, 24 + rows.length * 14 + 14);
    doc.setFillColor(...TH.bgSoft);
    doc.rect(M.left, y, W - M.left - M.right, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TH.primary);
    doc.text(seg.code, M.left + 10, y + 14);
    doc.setTextColor(...TH.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(segName, M.left + 50, y + 14);
    y += 22;
    doc.autoTable({
      startY: y, head: [['Code', 'Element', 'Value']], body: rows, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 5, textColor: TH.text, lineColor: TH.rule },
      headStyles: { fillColor: TH.bgAlt, textColor: TH.textDim, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 60, font: 'courier', textColor: TH.primary },
        1: { cellWidth: 200, textColor: TH.textDim },
        2: { cellWidth: 'auto' },
      },
      margin: { left: M.left, right: M.right },
    });
    return doc.lastAutoTable.finalY + 12;
  }

  // ===== JSON / XML rendering (when not EDI) =====================
  function looksLikeBusinessJson(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    return keys.includes('items') && (keys.includes('buyer') || keys.includes('seller') || keys.includes('totals') || keys.includes('orderid') || keys.includes('invoice'));
  }
  function jsonToBusinessDoc(obj) {
    const kind = obj.invoiceNumber || obj.invoice ? 'INVOICE'
               : obj.shipmentId ? 'SHIP_NOTICE'
               : 'PURCHASE_ORDER';
    const title = kind === 'INVOICE' ? 'Invoice'
                : kind === 'SHIP_NOTICE' ? 'Shipping Notice'
                : 'Purchase Order';
    const biz = {
      kind, title,
      standard: 'JSON',
      transactionCode: '',
      transactionName: title,
      number: obj.orderId || obj.invoiceNumber || obj.shipmentId || obj.id || '',
      date: obj.orderDate || obj.invoiceDate || obj.date || obj.shipDate || '',
      parties: {},
      partyOrder: [],
      contact: null,
      references: [],
      dates: [],
      items: (obj.items || []).map((it, i) => ({
        line: it.line || it.lineNumber || (i + 1),
        sku: it.sku || it.itemNumber || it.code || '',
        description: it.description || it.name || '',
        quantity: num(it.quantity),
        uom: it.unit || it.uom || '',
        unitPrice: num(it.unitPrice || it.price),
        lineTotal: num(it.lineTotal || it.total),
      })),
      totals: {
        subtotal: num(obj.totals?.subtotal),
        tax: num(obj.totals?.tax),
        discount: num(obj.totals?.discount),
        total: num(obj.totals?.grandTotal || obj.totals?.total),
        currency: obj.totals?.currency || obj.currency || 'USD',
      },
      taxes: [], charges: [],
      terms: obj.terms || null,
      notes: obj.notes ? (Array.isArray(obj.notes) ? obj.notes : [obj.notes]) : [],
      meta: {},
      interchange: null,
    };
    if (obj.buyer) biz.parties['BY'] = jsonParty('Buyer', obj.buyer);
    if (obj.seller) biz.parties['VN'] = jsonParty('Seller', obj.seller);
    if (obj.shipTo) biz.parties['ST'] = jsonParty('Ship To', obj.shipTo);
    if (obj.billTo) biz.parties['BT'] = jsonParty('Bill To', obj.billTo);
    biz.partyOrder = Object.keys(biz.parties);
    if (obj.buyer?.contact) {
      biz.contact = {
        function: 'Buyer Contact',
        name: obj.buyer.contact.name || '',
        methods: [
          obj.buyer.contact.email && { kind: 'Email', value: obj.buyer.contact.email },
          obj.buyer.contact.phone && { kind: 'Phone', value: obj.buyer.contact.phone },
        ].filter(Boolean),
      };
    }
    return biz;
  }
  function jsonParty(role, p) {
    return {
      role,
      name: p.name || '',
      id: p.id || '',
      address: [p.address?.street, p.address?.line2].filter(Boolean),
      city: p.address?.city || '',
      state: p.address?.state || '',
      zip: p.address?.zip || '',
      country: p.address?.country || '',
    };
  }
  function num(x) {
    if (x == null || x === '') return null;
    const n = parseFloat(x);
    return isFinite(n) ? n : null;
  }

  function simpleJsonReport(doc, obj) {
    drawSimpleCover(doc, 'JSON Document', 'Structured data');
    let y = M.top + 70;
    drawSectionHeading(doc, 'Contents', y);
    y += 16;
    const rows = flattenForTable(obj, '');
    doc.autoTable({
      startY: y,
      head: [['Path', 'Value']],
      body: rows,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 5, textColor: TH.text, lineColor: TH.rule },
      headStyles: { fillColor: TH.primary, textColor: TH.white, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 230, font: 'courier', textColor: TH.primary },
        1: { cellWidth: 'auto' },
      },
      alternateRowStyles: { fillColor: TH.bgSoft },
      margin: { left: M.left, right: M.right },
    });
  }
  function flattenForTable(obj, prefix, out) {
    out = out || [];
    if (obj == null) { out.push([prefix || '(root)', 'null']); return out; }
    if (typeof obj !== 'object') { out.push([prefix || '(root)', String(obj)]); return out; }
    if (Array.isArray(obj)) {
      if (obj.length === 0) out.push([prefix + ' []', '(empty array)']);
      else obj.forEach((v, i) => flattenForTable(v, `${prefix}[${i}]`, out));
      return out;
    }
    const keys = Object.keys(obj);
    if (keys.length === 0) { out.push([prefix || '(root)', '{}']); return out; }
    for (const k of keys) {
      const path = prefix ? `${prefix}.${k}` : k;
      flattenForTable(obj[k], path, out);
    }
    return out;
  }

  function renderXmlNode(doc, node, y, depth) {
    const W = doc.internal.pageSize.getWidth();
    const x = M.left + depth * 14;
    y = ensure(doc, y, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TH.primary);
    doc.text(`<${node._tag}>`, x, y);
    y += 13;
    if (node._attrs && Object.keys(node._attrs).length) {
      doc.autoTable({
        startY: y,
        body: Object.entries(node._attrs),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3, textColor: TH.text },
        columnStyles: {
          0: { cellWidth: 140, font: 'courier', textColor: TH.textDim },
          1: { cellWidth: W - x - M.right - 140 },
        },
        margin: { left: x + 14, right: M.right },
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    if (node._text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...TH.text);
      const lines = doc.splitTextToSize(node._text, W - x - M.right - 14);
      doc.text(lines, x + 14, y);
      y += lines.length * 12 + 4;
    }
    if (node._children) {
      for (const c of node._children) y = renderXmlNode(doc, c, y, depth + 1);
    }
    return y;
  }

  // ===== Helpers =================================================
  function drawSectionHeading(doc, title, y) {
    const W = doc.internal.pageSize.getWidth();
    doc.setDrawColor(...TH.accent);
    doc.setLineWidth(2);
    doc.line(M.left, y + 3, M.left + 20, y + 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TH.primary);
    doc.text(title.toUpperCase(), M.left + 30, y + 7);
    doc.setDrawColor(...TH.rule);
    doc.setLineWidth(0.4);
    doc.line(M.left, y + 14, W - M.right, y + 14);
  }
  function ensure(doc, y, needed) {
    const H = doc.internal.pageSize.getHeight();
    if (y + needed > H - 60) { doc.addPage(); return M.top; }
    return y;
  }
  function drawAllFooters(doc, biz) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...TH.rule);
      doc.setLineWidth(0.4);
      doc.line(M.left, H - 36, W - M.right, H - 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TH.textDim);
      doc.text('Generated by EDI Reader', M.left, H - 22);
      const ref = biz && biz.number ? `${biz.title} #${biz.number}` : (biz ? biz.title : '');
      doc.text(ref, W / 2, H - 22, { align: 'center' });
      doc.text(`Page ${i} of ${total}`, W - M.right, H - 22, { align: 'right' });
    }
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function orderedPartyCodes(biz) {
    if (!biz.parties) return [];
    const pref = ['BT','BY','OB','VN','SU','SE','RI','ST','SF','CN','CZ','PR','PE'];
    return Object.keys(biz.parties).sort((a, b) => {
      const ai = pref.indexOf(a), bi = pref.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  global.PDFGenerator = { pdfFromEdi, pdfFromJson, pdfFromXml };
})(window);
