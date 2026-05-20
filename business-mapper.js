/* ============================================================
   Business-Document Mapper
   Converts a parsed EDI tree into a normalized business document
   (Purchase Order, Invoice, Shipping Notice, Acknowledgment, etc.)
   so the PDF/HTML renderers can present it the way a business user
   actually thinks about it — no EDI jargon.
   ============================================================ */
(function (global) {
  'use strict';

  const D = global.EDIDictionary;
  const P = global.EDIParser;

  // ----- Public entry --------------------------------------------
  // Returns the FIRST business document (backwards compatible).
  function toBusinessDocument(tree) {
    const docs = toBusinessDocuments(tree);
    return docs.length ? docs[0] : null;
  }

  // Returns an ARRAY of business documents — one per transaction across all groups.
  function toBusinessDocuments(tree) {
    if (!tree || !tree.groups) return [];
    const standard = tree.standard;
    const ic = makeInterchange(tree);
    const docs = [];
    for (const group of tree.groups) {
      for (const txn of group.transactions) {
        const doc = mapOneTransaction(tree, txn);
        if (!doc) continue;
        doc.standard = standard.toUpperCase();
        doc.transactionCode = txn.transactionCode;
        doc.transactionName = D.transactionName(standard, txn.transactionCode) || 'Document';
        doc.interchange = ic;
        doc.indexInInterchange = docs.length + 1;
        docs.push(doc);
      }
    }
    for (const d of docs) d.totalDocumentsInInterchange = docs.length;
    return docs;
  }

  function mapOneTransaction(tree, txn) {
    const standard = tree.standard;
    const code = txn.transactionCode;
    if (standard === 'x12') {
      if (code === '850') return mapX12_850(tree, txn);
      if (code === '810') return mapX12_810(tree, txn);
      if (code === '856') return mapX12_856(tree, txn);
      if (code === '855') return mapX12_855(tree, txn);
      if (code === '820') return mapX12_820(tree, txn);
      if (code === '945') return mapX12_945(tree, txn);
      if (code === '214') return mapX12_214(tree, txn);
      if (code === '997' || code === '999') return mapX12_997(tree, txn);
      return mapX12_Generic(tree, txn);
    }
    if (standard === 'edifact') {
      if (code === 'INVOIC') return mapEdifact_INVOIC(tree, txn);
      if (code === 'ORDERS') return mapEdifact_ORDERS(tree, txn);
      if (code === 'DESADV') return mapEdifact_DESADV(tree, txn);
      return mapEdifact_Generic(tree, txn);
    }
    return mapX12_Generic(tree, txn);
  }

  function makeInterchange(tree) {
    const s = P.summarize(tree);
    return {
      sender: s.sender,
      receiver: s.receiver,
      controlNumber: s.controlNumber,
      date: s.date,
      isTest: tree.header && tree.standard === 'x12'
        ? P.textOf(tree.header.elements[15]) === 'T' : false,
    };
  }

  // ----- Generic helpers -----------------------------------------
  const t = (x) => P.textOf(x);
  const firstOf = (x) => Array.isArray(x) ? x[0] : t(x);
  const num = (x) => {
    if (x == null || x === '') return null;
    const s = t(x).replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  // Smart money parser: if the raw string contains a decimal point, treat as
  // a literal value. Otherwise treat as implied 2 decimals (X12 N2 convention).
  // This handles both "TDS*154.00" (literal) and "TDS*15400" (cents).
  const money = (x) => {
    if (x == null || x === '') return null;
    const s = t(x).replace(/,/g, '').trim();
    if (s === '' || s === '-') return null;
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return s.includes('.') ? n : n / 100;
  };
  function fmtDate(s) {
    if (!s) return '';
    const v = t(s);
    if (!v) return '';
    if (/^\d{8}$/.test(v)) return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
    if (/^\d{6}$/.test(v)) return `20${v.slice(0,2)}-${v.slice(2,4)}-${v.slice(4,6)}`;
    return v;
  }
  function fmtTime(s) {
    if (!s) return '';
    const v = t(s);
    if (/^\d{4}$/.test(v)) return `${v.slice(0,2)}:${v.slice(2,4)}`;
    if (/^\d{6}$/.test(v)) return `${v.slice(0,2)}:${v.slice(2,4)}:${v.slice(4,6)}`;
    return v;
  }

  function newBaseDoc(kind, title) {
    return {
      kind,
      title,
      number: '',
      date: '',
      time: '',
      parties: {},
      partyOrder: [],
      contact: null,
      references: [],
      dates: [],
      items: [],
      totals: {},
      charges: [],
      taxes: [],
      terms: null,
      carrier: null,
      notes: [],
      meta: {},
    };
  }

  // ===== X12 850 PURCHASE ORDER ==================================
  function mapX12_850(tree, txn) {
    const doc = newBaseDoc('PURCHASE_ORDER', 'Purchase Order');
    return mapX12Common(tree, txn, doc, {
      onBegin: (seg) => {
        doc.meta.purpose = qualifierLabel(t(seg.elements[1]), 'Purpose');
        doc.meta.type = qualifierLabel(t(seg.elements[2]), 'PO Type');
        doc.number = t(seg.elements[3]);
        doc.date = fmtDate(seg.elements[5]);
        if (seg.elements[6]) doc.meta.contract = t(seg.elements[6]);
      },
      onTotals: invoiceOnTotals(doc),
    });
  }

  // Shared SAC / TXI / TDS handler. The closure receives `getCurrentItem`
  // from mapX12Common so charges/taxes that appear before TDS are routed
  // to the current line item they apply to.
  function invoiceOnTotals(doc) {
    return (seg, getCurrentItem) => {
      if (seg.code === 'TDS') {
        const v = money(seg.elements[1]);
        if (v != null) doc.totals.statedTotal = v;
        // After TDS we're in the summary section — line items are closed.
        if (getCurrentItem) getCurrentItem(true);
      } else if (seg.code === 'SAC') {
        const indicator = t(seg.elements[1]);
        const code = t(seg.elements[2]);
        let amount = money(seg.elements[5]);
        const pctQualifier = t(seg.elements[6]);
        const percent = num(seg.elements[7]);
        const baseDescription = t(seg.elements[15]) || sacCodeName(code) || code;
        const targetItem = getCurrentItem ? getCurrentItem() : null;
        const scope = (targetItem && !doc.totals.statedTotal) ? 'line' : 'doc';

        // Percent-based SAC: compute amount from rate × applicable base.
        // SAC06 qualifier hints: E/Z = item-level, I = invoice-level. Default
        // to item-level when we're inside a line; otherwise invoice-level.
        if (amount == null && percent != null) {
          if (scope === 'line' && targetItem && targetItem.lineTotal != null) {
            amount = round2(targetItem.lineTotal * percent / 100);
          } else if (doc.totals.subtotal != null) {
            amount = round2(doc.totals.subtotal * percent / 100);
          } else if (doc.items.length) {
            // Fall back to summing current items
            const itemsSub = doc.items.reduce((s, i) => s + (i.lineTotal || 0), 0);
            if (itemsSub > 0) amount = round2(itemsSub * percent / 100);
          }
        }
        if (amount != null) {
          const charge = {
            type: indicator === 'A' ? 'Allowance' : 'Charge',
            code,
            description: baseDescription + (percent != null ? ` (${percent}%)` : ''),
            amount,
            percent: percent != null ? percent : undefined,
            descriptionFromSeg: !!t(seg.elements[15]),
          };
          if (scope === 'line') {
            targetItem.charges = targetItem.charges || [];
            targetItem.charges.push(charge);
            charge._scope = 'line';
          } else {
            doc.charges.push(charge);
            if (indicator === 'A') doc.totals.discount = (doc.totals.discount || 0) + amount;
            else doc.totals.otherCharges = (doc.totals.otherCharges || 0) + amount;
            charge._scope = 'doc';
          }
          doc._lastCharge = charge;
        }
      } else if (seg.code === 'TXI') {
        const taxType = t(seg.elements[1]);
        const taxAmt = money(seg.elements[2]);
        const taxPct = num(seg.elements[3]);
        const taxJurisdiction = t(seg.elements[5]);
        doc.taxes.push({
          type: taxType,
          amount: taxAmt,
          rate: taxPct,
          jurisdiction: taxJurisdiction,
        });
        if (taxAmt != null) doc.totals.tax = (doc.totals.tax || 0) + taxAmt;
        doc._lastCharge = null;
      } else if (doc._lastCharge && seg.code && !KNOWN_SEGMENTS.has(seg.code) && seg.elements.length <= 2) {
        // Orphan text segment immediately following a SAC — treat as description.
        // Overrides the dictionary lookup, since the user explicitly typed it.
        // Skips pure-numeric orphans (those come from `~~~500~` style data).
        const text = seg.code + (seg.elements[1] ? ' ' + t(seg.elements[1]) : '');
        if (text && !/^\d+$/.test(text.trim()) && !doc._lastCharge.descriptionFromSeg) {
          doc._lastCharge.description = text.trim();
        }
      } else {
        doc._lastCharge = null;
      }
    };
  }

  // Segments that are real EDI segments — used to detect "orphan text" lines
  const KNOWN_SEGMENTS = new Set([
    'ISA','IEA','GS','GE','ST','SE',
    'BEG','BIG','BSN','BAK','BGM','BPR','TRN','B10','W05','W06',
    'REF','DTM','PER','FOB','ITD','NTE','MSG','N1','N2','N3','N4','N9',
    'PO1','IT1','LIN','SN1','PID','PO4','CTP','PIA','IMD','W04','W12','G69',
    'CTT','TDS','SAC','TXI','AMT','QTY','MOA','TAX','ALC','PRI','UNS','CNT',
    'HL','TD1','TD3','TD5','MEA','MAN','PRF','EQD','TDT',
    'AK1','AK2','AK3','AK4','AK5','AK9','ACK','CUX','PAT','PYT',
    'LX','W11','W27','W03','G62','RMR','ADX','ENT','L11','AT7','AT8','MS1','MS2',
    'UNB','UNZ','UNG','UNE','UNH','UNT','UNA',
    'PCI','GIN','CPS','PAC','LOC',
  ]);

  // ===== X12 810 INVOICE =========================================
  function mapX12_810(tree, txn) {
    const doc = newBaseDoc('INVOICE', 'Invoice');
    return mapX12Common(tree, txn, doc, {
      onBegin: (seg) => {
        // BIG*invoiceDate*invoiceNumber*poDate*poNumber
        doc.date = fmtDate(seg.elements[1]);
        doc.number = t(seg.elements[2]);
        if (seg.elements[3]) doc.meta.poDate = fmtDate(seg.elements[3]);
        if (seg.elements[4]) doc.meta.poNumber = t(seg.elements[4]);
      },
      onTotals: invoiceOnTotals(doc),
    });
  }

  // ===== X12 855 PO ACKNOWLEDGMENT ==============================
  function mapX12_855(tree, txn) {
    const doc = newBaseDoc('PO_ACK', 'Purchase Order Acknowledgment');
    return mapX12Common(tree, txn, doc, {
      onBegin: (seg) => {
        // BAK*purpose*ackType*poNumber*poDate*release
        doc.meta.purpose = qualifierLabel(t(seg.elements[1]), 'Purpose');
        const ackType = t(seg.elements[2]);
        doc.meta.ackType = ackTypeName(ackType) || ackType;
        doc.meta.ackTypeCode = ackType;
        doc.number = t(seg.elements[3]);
        doc.date = fmtDate(seg.elements[4]);
      },
    });
  }

  // ===== X12 856 SHIP NOTICE ====================================
  function mapX12_856(tree, txn) {
    const doc = newBaseDoc('SHIP_NOTICE', 'Shipping Notice');
    let currentItem = null;
    let hlLevel = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'BSN':
          doc.meta.purpose = qualifierLabel(t(seg.elements[1]), 'Purpose');
          doc.number = t(seg.elements[2]);
          doc.date = fmtDate(seg.elements[3]);
          doc.time = fmtTime(seg.elements[4]);
          break;
        case 'HL': {
          const lv = t(seg.elements[3]);
          hlLevel = lv;
          if (lv === 'I') {
            currentItem = { line: doc.items.length + 1, productIds: [], quantity: null, uom: '', description: '' };
            doc.items.push(currentItem);
          }
          break;
        }
        case 'TD1':
          doc.carrier = doc.carrier || {};
          doc.carrier.packaging = t(seg.elements[1]);
          doc.carrier.packages = num(seg.elements[2]);
          if (seg.elements[6]) doc.carrier.weight = num(seg.elements[7]);
          if (seg.elements[8]) doc.carrier.weightUnit = t(seg.elements[8]);
          break;
        case 'TD3':
          doc.carrier = doc.carrier || {};
          doc.carrier.equipmentType = t(seg.elements[1]);
          if (seg.elements[3]) doc.carrier.tracking = t(seg.elements[3]);
          break;
        case 'TD5':
          doc.carrier = doc.carrier || {};
          doc.carrier.carrierCode = t(seg.elements[3]);
          doc.carrier.transportMode = qualifierLabel(t(seg.elements[4]), 'Mode');
          if (seg.elements[5]) doc.carrier.service = t(seg.elements[5]);
          break;
        case 'PRF':
          doc.meta.poNumber = t(seg.elements[1]);
          break;
        case 'LIN':
          if (currentItem) {
            for (let i = 2; i + 1 < seg.elements.length; i += 2) {
              const q = t(seg.elements[i]);
              const v = t(seg.elements[i + 1]);
              if (q || v) currentItem.productIds.push({ qualifier: q, value: v });
            }
            currentItem.sku = pickSku(currentItem.productIds);
          }
          break;
        case 'SN1':
          if (currentItem) {
            currentItem.quantity = num(seg.elements[2]);
            currentItem.uom = t(seg.elements[3]);
          }
          break;
        case 'PID':
          if (currentItem) {
            const desc = t(seg.elements[5]);
            if (desc) currentItem.description = currentItem.description ? currentItem.description + ' ' + desc : desc;
          }
          break;
        case 'REF':
          if (t(seg.elements[1]) === 'BM') {
            doc.carrier = doc.carrier || {};
            doc.carrier.bol = t(seg.elements[2]);
          }
          mapReference(doc, seg);
          break;
        case 'N1': case 'N2': case 'N3': case 'N4':
          mapPartyX12(doc, seg);
          break;
        case 'DTM':
          mapDate(doc, seg);
          break;
        case 'CTT':
          doc.totals.lineCount = num(seg.elements[1]) || doc.items.length;
          break;
      }
    }
    return doc;
  }

  // ===== X12 997 FUNCTIONAL ACK =================================
  function mapX12_997(tree, txn) {
    const doc = newBaseDoc('FUNCTIONAL_ACK', 'Functional Acknowledgment');
    doc.ackTransactions = [];
    let currentAck = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'AK1': {
          const fc = t(seg.elements[1]);
          doc.meta.functionalCode = fc;
          doc.meta.functional = D.FUNCTIONAL_GROUP_CODES[fc] || fc;
          doc.meta.groupControl = t(seg.elements[2]);
          doc.number = t(seg.elements[2]);
          break;
        }
        case 'AK2':
          currentAck = {
            code: t(seg.elements[1]),
            name: D.X12_TRANSACTIONS[t(seg.elements[1])] || t(seg.elements[1]),
            control: t(seg.elements[2]),
            status: null,
            statusCode: null,
            errors: [],
          };
          doc.ackTransactions.push(currentAck);
          break;
        case 'AK3':
          if (currentAck) {
            currentAck.errors.push({
              segment: t(seg.elements[1]),
              position: t(seg.elements[2]),
              loop: t(seg.elements[3]),
              code: t(seg.elements[4]),
            });
          }
          break;
        case 'AK5':
          if (currentAck) {
            const code = t(seg.elements[1]);
            currentAck.statusCode = code;
            currentAck.status = ackStatusName(code);
          }
          break;
        case 'AK9': {
          const code = t(seg.elements[1]);
          doc.ackSummary = {
            statusCode: code,
            status: ackStatusName(code),
            included: num(seg.elements[2]) || 0,
            received: num(seg.elements[3]) || 0,
            accepted: num(seg.elements[4]) || 0,
          };
          break;
        }
      }
    }
    return doc;
  }

  // ===== X12 820 PAYMENT / REMITTANCE ADVICE ====================
  function mapX12_820(tree, txn) {
    const doc = newBaseDoc('PAYMENT_ADVICE', 'Payment / Remittance Advice');
    doc.remittances = [];
    let currentRmr = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'BPR': {
          // BPR*01=TransHandling*02=Amount*03=CreditDebit*04=PaymentMethod*05=PaymentFormat*...*16=DateEffective
          doc.totals.total = num(seg.elements[2]);
          doc.meta.paymentMethod = paymentMethodName(t(seg.elements[4])) || t(seg.elements[4]);
          doc.meta.creditDebit = t(seg.elements[3]) === 'C' ? 'Credit' : t(seg.elements[3]) === 'D' ? 'Debit' : '';
          const dateStr = t(seg.elements[16]);
          if (dateStr) doc.date = fmtDate(dateStr);
          doc.number = ''; // set by TRN
          break;
        }
        case 'TRN':
          doc.number = t(seg.elements[2]);
          doc.meta.originatingCompanyId = t(seg.elements[3]);
          break;
        case 'REF':
          mapReference(doc, seg);
          break;
        case 'DTM':
          mapDate(doc, seg);
          break;
        case 'N1': case 'N2': case 'N3': case 'N4':
          mapPartyX12(doc, seg);
          break;
        case 'RMR': {
          // RMR*01=RefIdQual*02=Reference*04=PaidAmount*05=Discount*06=OriginalAmount
          currentRmr = {
            referenceType: qualifierLabel(t(seg.elements[1]), 'Reference'),
            reference: t(seg.elements[2]),
            paid: num(seg.elements[4]),
            discount: num(seg.elements[5]),
            originalAmount: num(seg.elements[6]),
            adjustments: [],
            po: '',
            date: '',
          };
          doc.remittances.push(currentRmr);
          break;
        }
        case 'ADX':
          if (currentRmr) {
            currentRmr.adjustments.push({
              amount: num(seg.elements[1]),
              reason: t(seg.elements[2]),
            });
          }
          break;
      }
      // Look for nested REF/DTM after RMR to attach to currentRmr
      if (currentRmr && seg.code === 'REF') {
        const qual = t(seg.elements[1]);
        if (qual === 'PO') currentRmr.po = t(seg.elements[2]);
      }
      if (currentRmr && seg.code === 'DTM') {
        currentRmr.date = fmtDate(seg.elements[2]);
      }
    }

    // Build a synthetic "items" array so the standard items table renders
    if (doc.remittances.length) {
      doc.items = doc.remittances.map((r, i) => ({
        line: i + 1,
        sku: r.reference,
        description: r.po ? `Payment for PO ${r.po}` : r.referenceType,
        quantity: null, uom: '',
        unitPrice: null,
        lineTotal: r.paid,
      }));
    }
    return doc;
  }

  function paymentMethodName(code) {
    const m = {
      'ACH': 'ACH', 'BOP': 'Financial Institution Option',
      'CHK': 'Check', 'FWT': 'Wire Transfer', 'NON': 'Non-Payment',
    };
    return m[code];
  }

  // ===== X12 945 WAREHOUSE SHIPPING ADVICE ======================
  function mapX12_945(tree, txn) {
    const doc = newBaseDoc('WAREHOUSE_ADVICE', 'Warehouse Shipping Advice');
    let currentItem = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'W06':
          doc.meta.purpose = qualifierLabel(t(seg.elements[1]), 'Purpose');
          doc.meta.depositorOrder = t(seg.elements[2]);
          doc.date = fmtDate(seg.elements[3]);
          doc.number = t(seg.elements[4]) || t(seg.elements[2]);
          break;
        case 'N1': case 'N2': case 'N3': case 'N4':
          mapPartyX12(doc, seg);
          break;
        case 'N9':
          mapReference(doc, seg);
          break;
        case 'G62': {
          const qual = t(seg.elements[1]);
          const dt = fmtDate(seg.elements[2]);
          const tm = fmtTime(seg.elements[4]);
          if (dt) doc.dates.push({ typeCode: qual, type: D.qualifierName(qual) || qual, value: dt, time: tm });
          break;
        }
        case 'NTE':
          if (t(seg.elements[2])) doc.notes.push(t(seg.elements[2]));
          break;
        case 'W27':
          doc.carrier = doc.carrier || {};
          doc.carrier.transportMode = qualifierLabel(t(seg.elements[1]), 'Mode');
          doc.carrier.service = t(seg.elements[2]);
          doc.carrier.carrierCode = t(seg.elements[3]);
          doc.carrier.tracking = t(seg.elements[4]);
          break;
        case 'LX':
          currentItem = { line: t(seg.elements[1]), productIds: [], description: '', quantity: null, uom: '', shipped: null, ordered: null, backordered: null };
          doc.items.push(currentItem);
          break;
        case 'W12':
          if (currentItem) {
            currentItem.condition = t(seg.elements[1]);
            currentItem.ordered = num(seg.elements[2]);
            currentItem.shipped = num(seg.elements[3]);
            currentItem.backordered = num(seg.elements[4]);
            currentItem.uom = t(seg.elements[5]);
            currentItem.quantity = currentItem.shipped;
            for (let i = 6; i + 1 < seg.elements.length; i += 2) {
              const q = t(seg.elements[i]);
              const v = t(seg.elements[i + 1]);
              if (q || v) currentItem.productIds.push({ qualifier: q, value: v });
            }
            currentItem.sku = pickSku(currentItem.productIds);
          }
          break;
        case 'G69':
          if (currentItem) {
            const desc = t(seg.elements[1]);
            if (desc) currentItem.description = currentItem.description ? currentItem.description + ' ' + desc : desc;
          }
          break;
        case 'W03':
          doc.carrier = doc.carrier || {};
          doc.carrier.packages = num(seg.elements[1]);
          doc.carrier.weight = num(seg.elements[2]);
          doc.carrier.weightUnit = t(seg.elements[3]);
          break;
      }
    }
    return doc;
  }

  // ===== X12 214 SHIPMENT STATUS ================================
  function mapX12_214(tree, txn) {
    const doc = newBaseDoc('SHIPMENT_STATUS', 'Shipment Status');
    doc.events = [];
    let currentEvent = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'B10':
          doc.meta.tracking = t(seg.elements[1]);
          doc.meta.shipmentRef = t(seg.elements[2]);
          doc.meta.carrier = t(seg.elements[3]);
          doc.number = doc.meta.tracking;
          break;
        case 'L11': {
          const qual = t(seg.elements[2]);
          const val = t(seg.elements[1]);
          mapReference(doc, { code: 'REF', elements: [seg.code, qual, val] });
          break;
        }
        case 'LX':
          currentEvent = { line: t(seg.elements[1]), status: '', date: '', time: '', tz: '', location: '', weight: null };
          doc.events.push(currentEvent);
          break;
        case 'AT7':
          if (currentEvent) {
            const statusCode = t(seg.elements[1]);
            currentEvent.statusCode = statusCode;
            currentEvent.status = statusReasonName(statusCode);
            currentEvent.date = fmtDate(seg.elements[5]);
            currentEvent.time = fmtTime(seg.elements[6]);
            currentEvent.tz = t(seg.elements[7]);
          }
          break;
        case 'MS1':
          if (currentEvent) {
            const city = t(seg.elements[1]);
            const state = t(seg.elements[2]);
            const country = t(seg.elements[3]);
            currentEvent.location = [city, state, country].filter(Boolean).join(', ');
          }
          break;
        case 'AT8':
          if (currentEvent) {
            currentEvent.weight = num(seg.elements[3]);
            currentEvent.weightUnit = t(seg.elements[2]);
            currentEvent.pieces = num(seg.elements[4]);
          }
          break;
      }
    }
    // Convert events into items so the table renders them
    doc.items = doc.events.map((e, i) => ({
      line: e.line || (i + 1),
      sku: e.date + (e.time ? ' ' + e.time : ''),
      description: `${e.status || ''}${e.location ? ' — ' + e.location : ''}`,
      quantity: null, uom: '',
      unitPrice: null, lineTotal: null,
    }));
    return doc;
  }

  function statusReasonName(code) {
    const m = {
      'X1': 'Arrived at Pick-up Location', 'X2': 'Estimated Delivery',
      'X3': 'Arrived at Delivery Location', 'X4': 'Arrived at Pick-up — Empty',
      'X6': 'En Route to Delivery', 'AF': 'Carrier Departed Pick-up',
      'AG': 'Estimated Delivery — Updated', 'AH': 'Attempted Delivery',
      'AI': 'Arrived at Drop Off', 'AJ': 'Tendered for Delivery',
      'AL': 'Loading', 'AM': 'Loaded',
      'AN': 'Diverted', 'AO': 'Arrived at Delivery — Empty',
      'AP': 'Delivered', 'AR': 'Rail Arrival at Destination',
      'CD': 'Held at Customer Request', 'D1': 'Completed Loading at Pick-up Location',
      'I1': 'In-gate', 'OA': 'Out for Delivery',
      'AA': 'Pickup',
    };
    return m[code] || code;
  }

  // ===== X12 generic fallback ===================================
  function mapX12_Generic(tree, txn) {
    const doc = newBaseDoc('DOCUMENT', D.X12_TRANSACTIONS[txn.transactionCode] || 'Document');
    doc.number = txn.controlNumber;
    return mapX12Common(tree, txn, doc, {});
  }

  // ===== Shared X12 mapping pipeline ============================
  function mapX12Common(tree, txn, doc, hooks) {
    let currentItem = null;
    let pastTds = false;
    // Closure that the totals hook can call to find/clear the active line item.
    // Calling getCurrentItem(true) marks that we've passed TDS (summary section).
    const getCurrentItem = (markSummary) => {
      if (markSummary === true) { pastTds = true; return null; }
      return pastTds ? null : currentItem;
    };

    // Bind getCurrentItem into the hook if it's the shared invoiceOnTotals
    const totalsHook = hooks.onTotals && hooks.onTotals.length >= 2
      ? (seg) => hooks.onTotals(seg, getCurrentItem)
      : (hooks._needsItem ? hooks.onTotals : hooks.onTotals);

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'BEG': case 'BIG': case 'BAK': case 'BSN':
          if (hooks.onBegin) hooks.onBegin(seg);
          break;
        case 'REF':
          mapReference(doc, seg);
          break;
        case 'PER':
          mapContact(doc, seg);
          break;
        case 'DTM':
          mapDate(doc, seg);
          break;
        case 'N1': case 'N2': case 'N3': case 'N4':
          mapPartyX12(doc, seg);
          break;
        case 'ITD':
          mapTerms(doc, seg);
          break;
        case 'NTE':
        case 'MSG':
          if (t(seg.elements[2])) doc.notes.push(t(seg.elements[2]));
          else if (t(seg.elements[1])) doc.notes.push(t(seg.elements[1]));
          break;
        case 'PO1': case 'IT1': {
          currentItem = {
            line: t(seg.elements[1]) || (doc.items.length + 1),
            quantity: num(seg.elements[2]),
            uom: t(seg.elements[3]),
            // IT104/PO104 is X12 type R (real number, no implied decimals).
            // Per spec we treat this as a literal value.
            unitPrice: num(seg.elements[4]),
            priceBasis: t(seg.elements[5]),
            productIds: [],
            description: '',
            charges: [],
          };
          for (let i = 6; i + 1 < seg.elements.length; i += 2) {
            const q = t(seg.elements[i]);
            const v = t(seg.elements[i + 1]);
            if (q || v) currentItem.productIds.push({ qualifier: q, value: v });
          }
          currentItem.sku = pickSku(currentItem.productIds);
          if (currentItem.quantity != null && currentItem.unitPrice != null) {
            currentItem.lineTotal = round2(currentItem.quantity * currentItem.unitPrice);
          }
          doc.items.push(currentItem);
          break;
        }
        case 'PID':
          if (currentItem) {
            const desc = t(seg.elements[5]);
            if (desc) currentItem.description = currentItem.description ? currentItem.description + ' ' + desc : desc;
          }
          break;
        case 'CTT':
          doc.totals.lineCount = num(seg.elements[1]) || doc.items.length;
          doc.totals.hashTotal = num(seg.elements[2]);
          break;
        case 'AMT': {
          const qual = t(seg.elements[1]);
          const amt = num(seg.elements[2]);
          if (amt != null) {
            if (qual === 'TT' || qual === '1') doc.totals.statedTotal = amt;
            else doc.totals[`amount_${qual}`] = amt;
          }
          break;
        }
        default:
          if (hooks.onTotals) hooks.onTotals(seg, getCurrentItem);
          break;
      }
    }

    // Subtotal = sum of GROSS line totals (no item-level adjustments yet).
    // Item-level discounts/charges are aggregated separately and shown as
    // their own summary line so the user can see the breakdown clearly.
    const computeSubtotal = () => {
      let sub = 0;
      for (const it of doc.items) sub += (it.lineTotal || 0);
      return round2(sub);
    };
    const computeItemAdjustments = () => {
      let discounts = 0;
      let charges = 0;
      for (const it of doc.items) {
        if (it.charges) {
          for (const c of it.charges) {
            if (c.type === 'Allowance') discounts += c.amount;
            else charges += c.amount;
          }
        }
      }
      return { discounts: round2(discounts), charges: round2(charges) };
    };
    if (doc.items.length) {
      const sub = computeSubtotal();
      if (sub !== 0) doc.totals.subtotal = sub;
      const adj = computeItemAdjustments();
      if (adj.discounts > 0) doc.totals.itemLevelDiscounts = adj.discounts;
      if (adj.charges > 0)   doc.totals.itemLevelCharges = adj.charges;
    }

    // Auto-detect cents-implied unit prices. Some EDI implementations encode
    // IT104/PO104 with 2 implied decimals (e.g. "89700" meaning $897.00) even
    // though the X12 spec says it's a literal real number. If the computed
    // subtotal is ~100x the TDS-stated total, the file is using that variant.
    if (doc.totals.statedTotal != null && doc.totals.subtotal != null && doc.totals.subtotal !== 0) {
      const ratio = doc.totals.subtotal / doc.totals.statedTotal;
      if (ratio > 50 && ratio < 200) {
        for (const it of doc.items) {
          if (it.unitPrice != null) it.unitPrice = round2(it.unitPrice / 100);
          if (it.lineTotal != null) it.lineTotal = round2(it.lineTotal / 100);
        }
        // Also rescale line-level charges that were already pushed in cents
        for (const it of doc.items) {
          if (it.charges) {
            for (const c of it.charges) {
              if (c.amount != null) c.amount = round2(c.amount / 100);
            }
          }
        }
        doc.totals.subtotal = computeSubtotal();
        const adj2 = computeItemAdjustments();
        doc.totals.itemLevelDiscounts = adj2.discounts > 0 ? adj2.discounts : undefined;
        doc.totals.itemLevelCharges   = adj2.charges   > 0 ? adj2.charges   : undefined;
        doc._impliedDecimals = true;
      }
    }

    // Compute the breakdown total: subtotal - item discounts + item charges
    //                            + doc-level charges - doc discounts + taxes
    if (doc.totals.subtotal != null || doc.charges.length || (doc.totals.tax != null)) {
      let breakdown = doc.totals.subtotal || 0;
      if (doc.totals.itemLevelDiscounts) breakdown -= doc.totals.itemLevelDiscounts;
      if (doc.totals.itemLevelCharges)   breakdown += doc.totals.itemLevelCharges;
      if (doc.totals.otherCharges) breakdown += doc.totals.otherCharges;
      if (doc.totals.discount) breakdown -= doc.totals.discount;
      if (doc.totals.tax) breakdown += doc.totals.tax;
      doc.totals.computedTotal = round2(breakdown);
    }

    // Pick a single "total" to display, and surface mismatches honestly.
    const stated = doc.totals.statedTotal;
    const computed = doc.totals.computedTotal;
    if (stated != null && computed != null && Math.abs(stated - computed) > 0.01) {
      // Both exist and disagree → flag the mismatch.
      doc.totals.total = computed;
      doc.totals.reconciliationMismatch = true;
    } else if (stated != null) {
      doc.totals.total = stated;
    } else if (computed != null) {
      doc.totals.total = computed;
    }
    return doc;
  }

  // ----- Shared X12 segment mappers ------------------------------
  function mapReference(doc, seg) {
    const qualCode = t(seg.elements[1]);
    const value = t(seg.elements[2]);
    const desc = t(seg.elements[3]);
    if (!value && !desc) return;
    doc.references.push({
      typeCode: qualCode,
      type: qualifierLabel(qualCode, 'Reference'),
      value,
      description: desc,
    });
  }

  function mapContact(doc, seg) {
    const c = {
      function: qualifierLabel(t(seg.elements[1]), 'Function'),
      name: t(seg.elements[2]),
      methods: [],
    };
    for (let i = 3; i + 1 < seg.elements.length; i += 2) {
      const q = t(seg.elements[i]);
      const v = t(seg.elements[i + 1]);
      if (q || v) c.methods.push({ kind: commMethodName(q), value: v });
    }
    doc.contact = c;
  }

  function mapDate(doc, seg) {
    const qualCode = t(seg.elements[1]);
    const date = fmtDate(seg.elements[2]);
    const time = fmtTime(seg.elements[3]);
    if (!date && !time) return;
    doc.dates.push({
      typeCode: qualCode,
      type: D.qualifierName(qualCode) || qualCode || 'Date',
      value: date,
      time,
    });
  }

  function mapPartyX12(doc, seg) {
    if (seg.code === 'N1') {
      const code = t(seg.elements[1]);
      const role = D.qualifierName(code) || code || 'Party';
      const party = {
        roleCode: code,
        role,
        name: t(seg.elements[2]),
        idQualifier: t(seg.elements[3]),
        id: t(seg.elements[4]),
        address: [],
        city: '',
        state: '',
        zip: '',
        country: '',
      };
      doc.parties[code] = party;
      doc.partyOrder.push(code);
      doc._currentParty = code;
    } else {
      const code = doc._currentParty;
      if (!code) return;
      const p = doc.parties[code];
      if (seg.code === 'N2') {
        p.name = [p.name, t(seg.elements[1]), t(seg.elements[2])].filter(Boolean).join(' ');
      } else if (seg.code === 'N3') {
        if (t(seg.elements[1])) p.address.push(t(seg.elements[1]));
        if (t(seg.elements[2])) p.address.push(t(seg.elements[2]));
      } else if (seg.code === 'N4') {
        p.city = t(seg.elements[1]);
        p.state = t(seg.elements[2]);
        p.zip = t(seg.elements[3]);
        p.country = t(seg.elements[4]);
      }
    }
  }

  function mapTerms(doc, seg) {
    // ITD*type*basisDate*disc%*discDays*discDate*netDays*netDate*disc$*deferred$*description
    const parts = [];
    const type = t(seg.elements[1]);
    const discPct = t(seg.elements[3]);
    const discDays = t(seg.elements[5]);
    const netDays = t(seg.elements[7]);
    const desc = t(seg.elements[12]);
    if (desc) parts.push(desc);
    else {
      if (discPct && discDays) parts.push(`${discPct}% if paid within ${discDays} days`);
      if (netDays) parts.push(`Net ${netDays} days`);
    }
    if (parts.length) doc.terms = parts.join(', ');
  }

  // ----- Helpers --------------------------------------------------
  function round2(x) { return Math.round(x * 100) / 100; }
  function pickSku(ids) {
    // Prefer buyer's part number > vendor > UPC
    const pref = ['BP', 'VP', 'UA', 'UP', 'EN', 'IT'];
    for (const q of pref) {
      const hit = ids.find(i => i.qualifier === q);
      if (hit && hit.value) return hit.value;
    }
    return ids[0]?.value || '';
  }
  function qualifierLabel(code, fallback) {
    if (!code) return '';
    return D.qualifierName(code) || code;
  }
  function commMethodName(code) {
    const m = { TE: 'Phone', FX: 'Fax', EM: 'Email', EX: 'Extension', CP: 'Cell', UR: 'URL', WP: 'Work Phone', HP: 'Home Phone' };
    return m[code] || code || 'Contact';
  }
  function ackStatusName(code) {
    const m = { 'A': 'Accepted', 'E': 'Accepted with Errors', 'R': 'Rejected', 'M': 'Rejected — Auth Failed', 'W': 'Rejected — Assurance Failed', 'X': 'Rejected — Content Failed', 'P': 'Partially Accepted' };
    return m[code] || code;
  }
  function ackTypeName(code) {
    const m = { 'AC': 'Acknowledge — With Detail and Change', 'AD': 'Acknowledge — With Detail, No Change', 'AE': 'Acknowledge — With Exception Detail Only', 'AH': 'Acknowledge — Hold', 'AP': 'Accept', 'AT': 'Accept and Confirm', 'NA': 'No Acknowledgment Needed', 'RD': 'Reject — With Detail', 'RF': 'Reject', 'RJ': 'Reject' };
    return m[code] || code;
  }
  function sacCodeName(code) {
    const m = {
      'A010': 'Advertising Allowance',
      'A170': 'Cumulative Trade Discount',
      'A270': 'Trade Discount',
      'A350': 'Cash Discount',
      'B870': 'Stop-Off Charge',
      'C310': 'Cleaning',
      'D170': 'Trade Discount',
      'D180': 'Quantity Discount',
      'D240': 'Cash Discount',
      'D250': 'Cumulative Discount',
      'D870': 'Promotional Allowance',
      'F050': 'Freight',
      'F060': 'Freight Charge',
      'F170': 'Fuel Surcharge',
      'F870': 'Inland Freight',
      'G830': 'Handling',
      'H090': 'Special Charge',
      'H850': 'Insurance',
      'I530': 'Special Handling',
    };
    return m[code] || '';
  }

  // ===== EDIFACT INVOIC =========================================
  function mapEdifact_INVOIC(tree, txn) {
    const doc = newBaseDoc('INVOICE', 'Invoice');
    return mapEdifactCommon(tree, txn, doc, {
      onBgm: (seg) => {
        const docTypeCode = firstOf(seg.elements[1]);
        doc.meta.documentTypeCode = docTypeCode;
        doc.meta.documentType = edifactBgmCodeName(docTypeCode);
        doc.number = t(seg.elements[2]);
      },
    });
  }
  function mapEdifact_ORDERS(tree, txn) {
    const doc = newBaseDoc('PURCHASE_ORDER', 'Purchase Order');
    return mapEdifactCommon(tree, txn, doc, {
      onBgm: (seg) => {
        doc.meta.documentTypeCode = firstOf(seg.elements[1]);
        doc.meta.documentType = edifactBgmCodeName(doc.meta.documentTypeCode);
        doc.number = t(seg.elements[2]);
      },
    });
  }
  function mapEdifact_DESADV(tree, txn) {
    const doc = newBaseDoc('SHIP_NOTICE', 'Shipping Notice');
    return mapEdifactCommon(tree, txn, doc, {
      onBgm: (seg) => {
        doc.meta.documentTypeCode = firstOf(seg.elements[1]);
        doc.meta.documentType = edifactBgmCodeName(doc.meta.documentTypeCode);
        doc.number = t(seg.elements[2]);
      },
    });
  }
  function mapEdifact_Generic(tree, txn) {
    const name = D.EDIFACT_MESSAGES[txn.transactionCode] || 'Document';
    const doc = newBaseDoc('DOCUMENT', name);
    return mapEdifactCommon(tree, txn, doc, {});
  }

  function mapEdifactCommon(tree, txn, doc, hooks) {
    let currentItem = null;

    for (const seg of txn.segments) {
      switch (seg.code) {
        case 'BGM':
          if (hooks.onBgm) hooks.onBgm(seg);
          break;
        case 'DTM': {
          const dtm = seg.elements[1];
          const qual = Array.isArray(dtm) ? dtm[0] : '';
          const value = Array.isArray(dtm) ? dtm[1] : '';
          const format = Array.isArray(dtm) ? dtm[2] : '';
          const formatted = formatEdifactDate(value, format);
          if (qual === '137' || qual === '3') {
            // Document/message date
            doc.date = formatted;
          } else if (qual === '35') {
            doc.meta.deliveryDate = formatted;
          }
          doc.dates.push({ typeCode: qual, type: edifactDateQual(qual), value: formatted });
          break;
        }
        case 'RFF': {
          const rff = seg.elements[1];
          const qual = Array.isArray(rff) ? rff[0] : '';
          const value = Array.isArray(rff) ? rff[1] : '';
          if (qual === 'ON') doc.meta.poNumber = value;
          if (qual === 'IV') doc.meta.invoiceNumber = value;
          if (value || qual) {
            doc.references.push({
              typeCode: qual,
              type: edifactRffQual(qual),
              value,
            });
          }
          break;
        }
        case 'NAD': {
          const role = t(seg.elements[1]);
          const partyIdComp = seg.elements[2];
          const nameComp = seg.elements[4];
          const streetComp = seg.elements[5];
          const party = {
            roleCode: role,
            role: edifactNadRole(role) || role,
            name: Array.isArray(nameComp) ? nameComp.filter(Boolean).join(' ') : t(nameComp),
            id: Array.isArray(partyIdComp) ? partyIdComp[0] : t(partyIdComp),
            address: [],
            city: t(seg.elements[6]),
            state: t(seg.elements[7]),
            zip: t(seg.elements[8]),
            country: t(seg.elements[9]),
          };
          if (Array.isArray(streetComp)) party.address = streetComp.filter(Boolean);
          else if (t(streetComp)) party.address = [t(streetComp)];
          doc.parties[role] = party;
          doc.partyOrder.push(role);
          break;
        }
        case 'CUX': {
          const cux = seg.elements[1];
          if (Array.isArray(cux)) {
            doc.totals.currency = cux[1];
          }
          break;
        }
        case 'LIN': {
          currentItem = {
            line: t(seg.elements[1]) || (doc.items.length + 1),
            quantity: null,
            uom: '',
            unitPrice: null,
            description: '',
            productIds: [],
          };
          const itemRef = seg.elements[3];
          if (Array.isArray(itemRef)) {
            currentItem.sku = itemRef[0];
            currentItem.productIds.push({ qualifier: itemRef[1] || '', value: itemRef[0] });
          }
          doc.items.push(currentItem);
          break;
        }
        case 'PIA':
          if (currentItem) {
            for (let i = 2; i < seg.elements.length; i++) {
              const el = seg.elements[i];
              if (Array.isArray(el)) {
                currentItem.productIds.push({ qualifier: el[1] || '', value: el[0] || '' });
                if (!currentItem.sku) currentItem.sku = el[0];
              }
            }
          }
          break;
        case 'IMD':
          if (currentItem) {
            const imd = seg.elements[3];
            if (Array.isArray(imd)) {
              const desc = imd[3] || imd[2] || imd[0];
              if (desc) currentItem.description = currentItem.description ? currentItem.description + ' ' + desc : desc;
            } else if (t(imd)) {
              currentItem.description = (currentItem.description || '') + ' ' + t(imd);
            }
          }
          break;
        case 'QTY': {
          const qty = seg.elements[1];
          if (Array.isArray(qty) && currentItem) {
            currentItem.quantity = num(qty[1]);
            currentItem.uom = qty[2] || '';
          }
          break;
        }
        case 'PRI': {
          const pri = seg.elements[1];
          if (Array.isArray(pri) && currentItem) {
            currentItem.unitPrice = num(pri[1]);
            if (currentItem.quantity != null && currentItem.unitPrice != null) {
              currentItem.lineTotal = round2(currentItem.quantity * currentItem.unitPrice);
            }
          }
          break;
        }
        case 'MOA': {
          const moa = seg.elements[1];
          const qual = Array.isArray(moa) ? moa[0] : '';
          const amount = Array.isArray(moa) ? num(moa[1]) : null;
          if (amount == null) break;
          if (currentItem && qual === '203') {
            currentItem.lineTotal = amount;
          } else if (qual === '79') doc.totals.subtotal = amount;
            else if (qual === '125') doc.totals.taxableAmount = amount;
            else if (qual === '124') doc.totals.tax = (doc.totals.tax || 0) + amount;
            else if (qual === '86') doc.totals.total = amount;
            else if (qual === '39') doc.totals.total = amount;
            else doc.totals[`moa_${qual}`] = amount;
          break;
        }
        case 'TAX': {
          const taxType = t(seg.elements[2]);
          const taxComp = seg.elements[5];
          const rate = Array.isArray(taxComp) ? num(taxComp[3]) : null;
          doc.taxes.push({ type: taxType, rate });
          break;
        }
        case 'ALC': {
          const indicator = t(seg.elements[1]);
          doc.charges.push({
            type: indicator === 'A' ? 'Allowance' : 'Charge',
            description: '',
          });
          break;
        }
        case 'PAT':
        case 'PYT':
          doc.terms = 'Payment terms specified';
          break;
        case 'TDT':
          doc.carrier = doc.carrier || {};
          doc.carrier.transportMode = t(seg.elements[1]);
          if (Array.isArray(seg.elements[5])) doc.carrier.service = seg.elements[5][0];
          break;
      }
    }
    if (!doc.totals.subtotal && doc.items.length) {
      const s = doc.items.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
      if (s > 0) doc.totals.subtotal = round2(s);
    }
    if (doc.totals.total == null && doc.totals.subtotal != null) {
      let v = doc.totals.subtotal + (doc.totals.tax || 0) - (doc.totals.discount || 0);
      doc.totals.total = round2(v);
    }
    return doc;
  }

  // ----- EDIFACT helpers -----------------------------------------
  function formatEdifactDate(value, format) {
    if (!value) return '';
    if (format === '102' && /^\d{8}$/.test(value)) return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
    if (format === '101' && /^\d{6}$/.test(value)) return `20${value.slice(0,2)}-${value.slice(2,4)}-${value.slice(4,6)}`;
    if (format === '203' && /^\d{12}$/.test(value)) return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)} ${value.slice(8,10)}:${value.slice(10,12)}`;
    return value;
  }
  function edifactNadRole(code) {
    const m = {
      'BY': 'Buyer', 'SU': 'Supplier', 'SE': 'Seller', 'IV': 'Invoicee',
      'DP': 'Delivery Party', 'ST': 'Ship To', 'SF': 'Ship From',
      'CN': 'Consignee', 'CZ': 'Consignor', 'PE': 'Payee', 'PR': 'Payer',
      'OB': 'Ordered By', 'MS': 'Document Sender', 'MR': 'Message Recipient',
    };
    return m[code];
  }
  function edifactRffQual(code) {
    const m = {
      'ON': 'Order Number', 'IV': 'Invoice Number', 'CR': 'Customer Reference',
      'VN': 'Vendor Number', 'BM': 'Bill of Lading', 'AAU': 'Despatch Note',
      'CT': 'Contract Number', 'DQ': 'Delivery Note', 'AGI': 'Agreement Identification',
    };
    return m[code] || code;
  }
  function edifactDateQual(code) {
    const m = {
      '137': 'Document Date', '35': 'Delivery Date', '11': 'Despatch Date',
      '2': 'Delivery Date Requested', '7': 'Effective Date', '108': 'Expiry Date',
    };
    return m[code] || code;
  }
  function edifactBgmCodeName(code) {
    const m = {
      '380': 'Commercial Invoice', '381': 'Credit Note', '383': 'Debit Note',
      '220': 'Order', '230': 'Order Change Request',
      '351': 'Despatch Advice', '352': 'Receiving Advice',
    };
    return m[code] || code;
  }

  // ----- Convenience: order parties in business-friendly sequence -
  function orderedParties(doc) {
    const preferred = ['BT', 'BY', 'OB', 'BUYER', 'BY',
                       'VN', 'SU', 'SUPPLIER', 'SE', 'RI',
                       'ST', 'SF', 'CN', 'CZ',
                       'PR', 'PE'];
    const codes = Object.keys(doc.parties);
    return codes.sort((a, b) => {
      const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  // ----- Currency formatter --------------------------------------
  function fmtMoney(amount, currency) {
    if (amount == null || amount === '') return '';
    const cur = currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(amount);
    } catch {
      return `${cur} ${Number(amount).toFixed(2)}`;
    }
  }
  function fmtNumber(n, dp = 2) {
    if (n == null || n === '') return '';
    return Number(n).toFixed(dp);
  }

  // ===== JSON / XML to business document =========================
  function looksLikeBusinessJson(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    const hasItems = keys.includes('items') || keys.includes('lineitems') || keys.includes('lines');
    const hasParties = keys.includes('buyer') || keys.includes('seller') || keys.includes('vendor') ||
                       keys.includes('billto') || keys.includes('shipto') || keys.includes('from') || keys.includes('to');
    const hasTotals = keys.includes('totals') || keys.includes('total') || keys.includes('grandtotal');
    const hasDocId = keys.some(k => k.match(/(order|invoice|shipment|po)(id|number|num)?$/));
    return hasItems && (hasParties || hasTotals || hasDocId);
  }

  function jsonToBusinessDocument(obj) {
    if (!obj) return null;
    // Detect document type
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    let kind = 'DOCUMENT', title = 'Document';
    if (keys.includes('invoicenumber') || keys.includes('invoice') || keys.some(k => k.includes('invoice'))) {
      kind = 'INVOICE'; title = 'Invoice';
    } else if (keys.includes('shipmentid') || keys.includes('shipment') || keys.includes('carrier') || keys.some(k => k.includes('packages'))) {
      kind = 'SHIP_NOTICE'; title = 'Shipping Notice';
    } else if (keys.includes('orderid') || keys.includes('order') || keys.some(k => k.match(/^po/))) {
      kind = 'PURCHASE_ORDER'; title = 'Purchase Order';
    }

    const biz = newBaseDoc(kind, title);
    biz.standard = 'JSON';
    biz.transactionCode = '';
    biz.transactionName = title;

    // Number
    const numberKey = ['orderId','invoiceNumber','shipmentId','poNumber','id','number','documentNumber']
      .find(k => obj[k]);
    if (numberKey) biz.number = String(obj[numberKey]);

    // Date
    const dateKey = ['orderDate','invoiceDate','shipDate','date','issuedDate','createdAt']
      .find(k => obj[k]);
    if (dateKey) biz.date = String(obj[dateKey]);

    // Currency
    if (obj.currency) biz.totals.currency = obj.currency;
    if (obj.totals && obj.totals.currency) biz.totals.currency = obj.totals.currency;

    // Parties
    const partyMap = [
      ['buyer', 'BY', 'Buyer'], ['seller', 'VN', 'Seller'], ['vendor', 'VN', 'Vendor'],
      ['supplier', 'SU', 'Supplier'], ['shipTo', 'ST', 'Ship To'], ['billTo', 'BT', 'Bill To'],
      ['shipFrom', 'SF', 'Ship From'], ['remitTo', 'RI', 'Remit To'],
      ['from', 'SF', 'From'], ['to', 'ST', 'To'],
    ];
    partyMap.forEach(([key, code, role]) => {
      if (obj[key]) {
        const p = obj[key];
        const party = {
          roleCode: code, role,
          name: p.name || p.companyName || '',
          id: p.id || p.partyId || '',
          address: [],
          city: '', state: '', zip: '', country: '',
        };
        const addr = p.address || p;
        if (addr) {
          if (addr.street) party.address.push(addr.street);
          if (addr.line2) party.address.push(addr.line2);
          if (addr.street2) party.address.push(addr.street2);
          party.city = addr.city || '';
          party.state = addr.state || addr.province || '';
          party.zip = addr.zip || addr.postalCode || addr.zipCode || '';
          party.country = addr.country || '';
        }
        biz.parties[code] = party;
        biz.partyOrder.push(code);
        if (p.contact) {
          biz.contact = biz.contact || {
            name: p.contact.name || '', function: role + ' Contact', methods: [],
          };
          if (p.contact.email) biz.contact.methods.push({ kind: 'Email', value: p.contact.email });
          if (p.contact.phone) biz.contact.methods.push({ kind: 'Phone', value: p.contact.phone });
        }
      }
    });

    // Items
    const items = obj.items || obj.lineItems || obj.lines || [];
    if (Array.isArray(items)) {
      biz.items = items.map((it, i) => ({
        line: it.line || it.lineNumber || (i + 1),
        sku: it.sku || it.itemNumber || it.code || it.id || '',
        productIds: extractJsonProductIds(it),
        description: it.description || it.name || it.title || '',
        quantity: parseNumish(it.quantity || it.qty),
        uom: it.unit || it.uom || it.unitOfMeasure || '',
        unitPrice: parseNumish(it.unitPrice || it.price || it.unit_price),
        lineTotal: parseNumish(it.lineTotal || it.total || it.amount),
        charges: [],
      }));
      // Compute lineTotal if missing
      biz.items.forEach(it => {
        if (it.lineTotal == null && it.quantity != null && it.unitPrice != null) {
          it.lineTotal = round2(it.quantity * it.unitPrice);
        }
      });
    }

    // Totals
    if (obj.totals) {
      biz.totals.subtotal = parseNumish(obj.totals.subtotal);
      biz.totals.tax = parseNumish(obj.totals.tax);
      biz.totals.discount = parseNumish(obj.totals.discount);
      biz.totals.otherCharges = parseNumish(obj.totals.handling) || 0;
      if (obj.totals.freight) biz.totals.otherCharges = (biz.totals.otherCharges || 0) + parseNumish(obj.totals.freight);
      biz.totals.statedTotal = parseNumish(obj.totals.grandTotal || obj.totals.total || obj.totals.totalDue);
    }
    // Compute breakdown
    if (biz.items.length && biz.totals.subtotal == null) {
      biz.totals.subtotal = round2(biz.items.reduce((s, i) => s + (i.lineTotal || 0), 0));
    }
    if (biz.totals.subtotal != null) {
      let breakdown = biz.totals.subtotal;
      if (biz.totals.otherCharges) breakdown += biz.totals.otherCharges;
      if (biz.totals.discount) breakdown -= biz.totals.discount;
      if (biz.totals.tax) breakdown += biz.totals.tax;
      biz.totals.computedTotal = round2(breakdown);
    }
    if (biz.totals.statedTotal != null && biz.totals.computedTotal != null
        && Math.abs(biz.totals.statedTotal - biz.totals.computedTotal) > 0.01) {
      biz.totals.total = biz.totals.computedTotal;
      biz.totals.reconciliationMismatch = true;
    } else {
      biz.totals.total = biz.totals.statedTotal != null ? biz.totals.statedTotal : biz.totals.computedTotal;
    }

    // Terms / Notes
    if (obj.terms) biz.terms = obj.terms;
    if (obj.notes) {
      biz.notes = Array.isArray(obj.notes) ? obj.notes : [obj.notes];
    }
    // References
    if (obj.references && Array.isArray(obj.references)) {
      biz.references = obj.references.map(r => ({
        type: r.type || r.kind || '',
        value: r.value || r.id || '',
        description: r.description || '',
      }));
    }
    // Carrier (for shipments)
    if (obj.carrier) {
      biz.carrier = {
        carrierCode: obj.carrier.code || obj.carrier.name || '',
        service: obj.carrier.service || '',
        tracking: obj.carrier.tracking || obj.carrier.trackingNumber || '',
      };
    }
    return biz;
  }
  function extractJsonProductIds(it) {
    const ids = [];
    const map = { sku: 'SK', vendorSku: 'VP', upc: 'UP', ean: 'EN', isbn: 'IB',
                  partNumber: 'BP', vendorPart: 'VP', gtin: 'GT', code: 'SK' };
    Object.entries(map).forEach(([k, q]) => {
      if (it[k]) ids.push({ qualifier: q, value: String(it[k]) });
    });
    return ids;
  }
  function parseNumish(x) {
    if (x == null || x === '') return null;
    const n = parseFloat(String(x).replace(/[, ]/g, ''));
    return isFinite(n) ? n : null;
  }

  function looksLikeBusinessXml(node) {
    if (!node) return false;
    const tag = (node._tag || '').toLowerCase();
    return /^(invoice|order|purchaseorder|shipment|shipnotice|despatchadvice)$/i.test(tag);
  }
  function xmlToBusinessDocument(node) {
    if (!node) return null;
    const obj = xmlNodeToPlainObject(node);
    const biz = jsonToBusinessDocument(obj);
    if (!biz) return null;
    // Override document kind from the root XML tag name when it's specific.
    const tag = (node._tag || '').toLowerCase();
    if (/invoice/.test(tag)) { biz.kind = 'INVOICE'; biz.title = 'Invoice'; biz.transactionName = 'Invoice'; }
    else if (/(desadv|shipment|shipnotice|asn)/.test(tag)) { biz.kind = 'SHIP_NOTICE'; biz.title = 'Shipping Notice'; biz.transactionName = 'Shipping Notice'; }
    else if (/(order|po\b|purchaseorder)/.test(tag)) { biz.kind = 'PURCHASE_ORDER'; biz.title = 'Purchase Order'; biz.transactionName = 'Purchase Order'; }
    biz.standard = 'XML';
    return biz;
  }
  function xmlNodeToPlainObject(node) {
    if (!node) return null;
    const out = {};
    if (node._attrs) Object.assign(out, node._attrs);
    if (node._text != null) {
      // If only text and no children, return the text directly
      if (!node._children || node._children.length === 0) return node._text;
    }
    if (node._children) {
      const grouped = {};
      for (const c of node._children) {
        const key = c._tag;
        const val = xmlNodeToPlainObject(c);
        if (grouped[key] === undefined) grouped[key] = val;
        else if (Array.isArray(grouped[key])) grouped[key].push(val);
        else grouped[key] = [grouped[key], val];
      }
      // Apply common XML→business field mappings
      // Map common XML container names to JSON-business shape
      const mapped = remapXmlForBusiness(grouped);
      Object.assign(out, mapped);
    }
    return out;
  }
  function remapXmlForBusiness(g) {
    const out = { ...g };
    // <LineItems><Item>...</Item><Item>...</Item></LineItems> → items: [...]
    if (g.LineItems && g.LineItems.Item) {
      out.items = Array.isArray(g.LineItems.Item) ? g.LineItems.Item : [g.LineItems.Item];
    }
    if (g.Items && g.Items.Item) {
      out.items = Array.isArray(g.Items.Item) ? g.Items.Item : [g.Items.Item];
    }
    // Buyer/Seller/etc — map XML address shape to JSON shape
    ['Buyer', 'Seller', 'ShipTo', 'BillTo', 'From', 'To', 'Vendor', 'Supplier'].forEach(k => {
      if (g[k]) {
        const key = k.charAt(0).toLowerCase() + k.slice(1);
        const p = g[k];
        out[key] = {
          name: p.Name || p.name || '',
          id: p.Id || p.TaxId || '',
          address: p.Address || p,
        };
      }
    });
    // Totals
    if (g.Totals) {
      const t = g.Totals;
      out.totals = {
        subtotal: numFrom(t.Subtotal),
        tax: numFrom(t.Tax),
        discount: numFrom(t.Discount),
        handling: numFrom(t.Handling),
        freight: numFrom(t.Freight),
        grandTotal: numFrom(t.GrandTotal || t.Total),
      };
    }
    if (g.PurchaseOrder) out.poNumber = typeof g.PurchaseOrder === 'object' ? (g.PurchaseOrder._text || '') : g.PurchaseOrder;
    return out;
  }
  function numFrom(v) {
    if (v == null) return null;
    if (typeof v === 'object') return parseFloat(v._text || v.toString());
    return parseFloat(v);
  }

  global.BusinessMapper = {
    toBusinessDocument,
    toBusinessDocuments,
    jsonToBusinessDocument,
    xmlToBusinessDocument,
    looksLikeBusinessJson,
    looksLikeBusinessXml,
    orderedParties,
    fmtMoney,
    fmtNumber,
  };
})(window);
