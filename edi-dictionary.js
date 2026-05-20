/* ============================================================
   EDI Dictionary — segment, element, and transaction labels
   Covers most common X12 and EDIFACT documents.
   ============================================================ */
(function (global) {
  'use strict';

  // ----- X12 Transaction Sets -------------------------------------
  const X12_TRANSACTIONS = {
    '810': 'Invoice',
    '850': 'Purchase Order',
    '855': 'Purchase Order Acknowledgment',
    '856': 'Ship Notice / Manifest',
    '860': 'Purchase Order Change Request',
    '865': 'PO Change Acknowledgment',
    '940': 'Warehouse Shipping Order',
    '943': 'Warehouse Stock Transfer Shipment Advice',
    '944': 'Warehouse Stock Transfer Receipt Advice',
    '945': 'Warehouse Shipping Advice',
    '947': 'Warehouse Inventory Adjustment Advice',
    '997': 'Functional Acknowledgment',
    '999': 'Implementation Acknowledgment',
    '210': 'Motor Carrier Freight Details and Invoice',
    '214': 'Transportation Carrier Shipment Status Message',
    '204': 'Motor Carrier Load Tender',
    '270': 'Eligibility, Coverage or Benefit Inquiry',
    '271': 'Eligibility, Coverage or Benefit Information',
    '276': 'Health Care Claim Status Request',
    '277': 'Health Care Claim Status Notification',
    '820': 'Payment Order / Remittance Advice',
    '824': 'Application Advice',
    '830': 'Planning Schedule with Release Capability',
    '832': 'Price/Sales Catalog',
    '846': 'Inventory Inquiry/Advice',
    '852': 'Product Activity Data',
    '861': 'Receiving Advice',
  };

  // ----- EDIFACT Message Types ------------------------------------
  const EDIFACT_MESSAGES = {
    INVOIC: 'Invoice',
    ORDERS: 'Purchase Order',
    ORDRSP: 'Order Response',
    DESADV: 'Despatch Advice',
    RECADV: 'Receiving Advice',
    REMADV: 'Remittance Advice',
    PRICAT: 'Price/Sales Catalogue',
    PAYORD: 'Payment Order',
    CONTRL: 'Syntax & Service Report',
    APERAK: 'Application Error & Ack',
    IFTMIN: 'Instruction Message',
    IFTSTA: 'Status Message',
  };

  // ----- X12 Segments with their elements -------------------------
  // Each element list = position-keyed labels. Index 1 = position 01.
  const X12_SEGMENTS = {
    ISA: {
      name: 'Interchange Control Header',
      elements: [
        null,
        'Authorization Info Qualifier',
        'Authorization Information',
        'Security Info Qualifier',
        'Security Information',
        'Sender ID Qualifier',
        'Interchange Sender ID',
        'Receiver ID Qualifier',
        'Interchange Receiver ID',
        'Interchange Date (YYMMDD)',
        'Interchange Time (HHMM)',
        'Repetition Separator',
        'Control Version Number',
        'Control Number',
        'Acknowledgment Requested',
        'Usage Indicator',
        'Component Element Separator',
      ],
    },
    IEA: { name: 'Interchange Control Trailer', elements: [null, 'Number of Functional Groups', 'Interchange Control Number'] },
    GS: {
      name: 'Functional Group Header',
      elements: [null, 'Functional Identifier Code', 'Application Sender Code', 'Application Receiver Code',
        'Date (CCYYMMDD)', 'Time (HHMM)', 'Group Control Number', 'Responsible Agency', 'Version/Release'],
    },
    GE: { name: 'Functional Group Trailer', elements: [null, 'Number of Transaction Sets', 'Group Control Number'] },
    ST: { name: 'Transaction Set Header', elements: [null, 'Transaction Set ID', 'Control Number', 'Implementation Convention Ref'] },
    SE: { name: 'Transaction Set Trailer', elements: [null, 'Number of Segments', 'Control Number'] },

    // Purchase order / invoice headers
    BEG: { name: 'Beginning Segment (PO)', elements: [null, 'Transaction Set Purpose', 'PO Type', 'PO Number', 'Release #', 'Date', 'Contract #'] },
    BIG: { name: 'Beginning Segment (Invoice)', elements: [null, 'Invoice Date', 'Invoice Number', 'PO Date', 'PO Number', 'Release #', 'Change Order Seq'] },
    BSN: { name: 'Beginning Segment (Ship Notice)', elements: [null, 'Purpose Code', 'Shipment ID', 'Date', 'Time', 'Hierarchy Structure'] },
    BAK: { name: 'Beginning Segment (PO Ack)', elements: [null, 'Purpose Code', 'Acknowledgment Type', 'PO Number', 'PO Date', 'Release #'] },

    REF: { name: 'Reference Identification', elements: [null, 'Reference ID Qualifier', 'Reference ID', 'Description'] },
    DTM: { name: 'Date/Time Reference', elements: [null, 'Date/Time Qualifier', 'Date', 'Time'] },
    PER: { name: 'Administrative Contact', elements: [null, 'Contact Function', 'Name', 'Comm Number Qualifier', 'Communication Number'] },

    // Parties
    N1:  { name: 'Name', elements: [null, 'Entity ID Code', 'Name', 'ID Code Qualifier', 'ID Code'] },
    N2:  { name: 'Additional Name', elements: [null, 'Name', 'Name (cont)'] },
    N3:  { name: 'Address', elements: [null, 'Address Line 1', 'Address Line 2'] },
    N4:  { name: 'Geographic Location', elements: [null, 'City', 'State/Province', 'Postal Code', 'Country', 'Location Qualifier', 'Location ID'] },
    N9:  { name: 'Reference ID', elements: [null, 'Reference Qualifier', 'Reference ID', 'Free-form Description'] },

    // Items / lines
    PO1: { name: 'Baseline Item Data (PO)', elements: [null, 'Line #', 'Quantity', 'Unit of Measure', 'Unit Price', 'Basis of Unit Price', 'Product ID Qualifier', 'Product ID', 'Product ID Qualifier 2', 'Product ID 2'] },
    IT1: { name: 'Baseline Item Data (Invoice)', elements: [null, 'Line #', 'Quantity Invoiced', 'Unit of Measure', 'Unit Price', 'Basis of Unit Price', 'Product ID Qualifier', 'Product ID', 'Product ID Qualifier 2', 'Product ID 2'] },
    PID: { name: 'Product/Item Description', elements: [null, 'Description Type', 'Product Characteristic', 'Agency Qualifier', 'Product Description Code', 'Description'] },
    PO4: { name: 'Item Physical Details', elements: [null, 'Pack', 'Size', 'Size UOM', 'Gross Volume', 'Volume UOM', 'Height', 'Height UOM'] },
    LIN: { name: 'Item Identification', elements: [null, 'Line #', 'Product ID Qualifier', 'Product ID'] },
    SN1: { name: 'Item Detail (Ship Notice)', elements: [null, 'Line #', 'Quantity Shipped', 'Unit of Measure'] },
    CTP: { name: 'Pricing Information', elements: [null, 'Class of Trade', 'Price ID Code', 'Unit Price', 'Quantity', 'UOM'] },

    // Totals & taxes
    CTT: { name: 'Transaction Totals', elements: [null, 'Number of Line Items', 'Hash Total'] },
    TDS: { name: 'Total Monetary Value Summary', elements: [null, 'Amount Charged', 'Amount Subject to Terms Discount', 'Amount Subject to Discount', 'Terms Discount Amount'] },
    SAC: { name: 'Service / Promotion / Allowance / Charge', elements: [null, 'Indicator', 'Code', 'Agency Qualifier', 'Agency Service Code', 'Amount'] },
    TXI: { name: 'Tax Information', elements: [null, 'Tax Type Code', 'Monetary Amount', 'Percent'] },
    ITD: { name: 'Terms of Sale / Deferred Terms', elements: [null, 'Terms Type', 'Basis Date Code', 'Discount %', 'Discount Due Date'] },

    // Quantities & misc
    QTY: { name: 'Quantity', elements: [null, 'Quantity Qualifier', 'Quantity', 'Unit of Measure'] },
    AMT: { name: 'Monetary Amount', elements: [null, 'Amount Qualifier', 'Monetary Amount', 'Credit/Debit Flag'] },
    MSG: { name: 'Message Text', elements: [null, 'Free-form Message'] },
    NTE: { name: 'Note / Special Instruction', elements: [null, 'Note Reference', 'Description'] },

    // Hierarchical / shipment
    HL:  { name: 'Hierarchical Level', elements: [null, 'Hierarchical ID', 'Parent ID', 'Level Code', 'Child Code'] },
    TD1: { name: 'Carrier Details (Quantity)', elements: [null, 'Packaging Code', 'Lading Quantity', 'Weight Qualifier', 'Weight Unit', 'Weight'] },
    TD3: { name: 'Carrier Details (Equipment)', elements: [null, 'Equipment Description Code', 'Equipment Initial', 'Equipment Number'] },
    TD5: { name: 'Carrier Details (Routing)', elements: [null, 'Routing Seq Code', 'Carrier ID Qualifier', 'Carrier ID', 'Transportation Method'] },
    MEA: { name: 'Measurements', elements: [null, 'Measurement Reference', 'Measurement Qualifier', 'Measurement Value', 'Unit of Measure'] },
    MAN: { name: 'Marks and Numbers', elements: [null, 'Qualifier', 'Marks/Number'] },

    // Acknowledgment
    AK1: { name: 'Functional Group Response Header', elements: [null, 'Functional ID Code', 'Group Control #'] },
    AK2: { name: 'Transaction Set Response Header', elements: [null, 'Transaction Set ID', 'Control #'] },
    AK3: { name: 'Data Segment Note', elements: [null, 'Segment ID', 'Segment Position', 'Loop ID', 'Syntax Error Code'] },
    AK4: { name: 'Data Element Note', elements: [null, 'Element Position', 'Data Element Reference #', 'Syntax Error Code'] },
    AK5: { name: 'Transaction Set Response Trailer', elements: [null, 'Acknowledgment Code', 'Syntax Error Code'] },
    AK9: { name: 'Functional Group Response Trailer', elements: [null, 'Functional Group Ack Code', 'Number of Transaction Sets'] },

    // Warehouse / shipping
    W05: { name: 'Shipping Order Identification', elements: [null, 'Purpose Code', 'Depositor Order #', 'PO #'] },
    W06: { name: 'Warehouse Shipment Identification', elements: [null, 'Purpose Code', 'Depositor Order #', 'Date', 'Shipment ID'] },
    LX:  { name: 'Loop Identifier', elements: [null, 'Assigned Number'] },
    W04: { name: 'Item Detail (Warehouse)', elements: [null, 'Quantity', 'Unit of Measure', 'Item Number', 'Item Number Qualifier'] },
    W11: { name: 'Carrier Information', elements: [null, 'Carrier Code', 'Vehicle ID', 'Vehicle Type'] },
    W27: { name: 'Carrier Detail', elements: [null, 'Method', 'Carrier ID', 'Carrier Routing'] },
  };

  // ----- EDIFACT Segments ------------------------------------------
  const EDIFACT_SEGMENTS = {
    UNA: { name: 'Service String Advice' },
    UNB: { name: 'Interchange Header', elements: [null, 'Syntax Identifier', 'Sender', 'Recipient', 'Date/Time', 'Control Reference'] },
    UNZ: { name: 'Interchange Trailer', elements: [null, 'Interchange Control Count', 'Control Reference'] },
    UNG: { name: 'Functional Group Header' },
    UNE: { name: 'Functional Group Trailer' },
    UNH: { name: 'Message Header', elements: [null, 'Message Reference Number', 'Message Identifier'] },
    UNT: { name: 'Message Trailer', elements: [null, 'Number of Segments', 'Message Reference Number'] },
    BGM: { name: 'Beginning of Message', elements: [null, 'Document Name Code', 'Document Number', 'Message Function'] },
    DTM: { name: 'Date/Time/Period', elements: [null, 'Date/Time/Period'] },
    NAD: { name: 'Name and Address', elements: [null, 'Party Function', 'Party Identification', 'Name and Address', 'Party Name', 'Street', 'City', 'Country Sub-entity', 'Postal Code', 'Country'] },
    RFF: { name: 'Reference', elements: [null, 'Reference'] },
    CUX: { name: 'Currencies', elements: [null, 'Currency Details'] },
    PAT: { name: 'Payment Terms Basis' },
    PYT: { name: 'Payment Terms' },
    LIN: { name: 'Line Item', elements: [null, 'Line Item Number', 'Action Request', 'Item Number Identification'] },
    PIA: { name: 'Additional Product ID', elements: [null, 'Product ID Function Qualifier', 'Item Number Identification'] },
    IMD: { name: 'Item Description', elements: [null, 'Description Type', 'Item Characteristic', 'Item Description'] },
    QTY: { name: 'Quantity', elements: [null, 'Quantity Details'] },
    PRI: { name: 'Price Details', elements: [null, 'Price Information'] },
    MOA: { name: 'Monetary Amount', elements: [null, 'Monetary Amount'] },
    TAX: { name: 'Duty/Tax/Fee Details', elements: [null, 'Tax Function Qualifier', 'Tax Type', 'Party Tax Identifier'] },
    ALC: { name: 'Allowance or Charge', elements: [null, 'Allowance/Charge Qualifier'] },
    UNS: { name: 'Section Control', elements: [null, 'Section Identification'] },
    CNT: { name: 'Control Total', elements: [null, 'Control'] },
    LOC: { name: 'Place/Location Identification' },
    PCI: { name: 'Package Identification' },
    GIN: { name: 'Goods Identity Number' },
    CPS: { name: 'Consignment Packing Sequence' },
    PAC: { name: 'Package' },
    EQD: { name: 'Equipment Details' },
    TDT: { name: 'Transport Information' },
  };

  // ----- Qualifier code translations (common ones) -----------------
  const QUALIFIERS = {
    // ISA Authorization/Security qualifiers
    '00': 'No Authorization Info',
    '01': 'UCS Communication ID',
    '02': 'EDX Communication ID',
    '03': 'Additional Data ID',
    '04': 'Rail Communications ID',
    // ISA Sender/Receiver ID qualifiers (subset)
    '08': 'UCC EDI Comm ID',
    '12': 'Phone',
    '14': 'Duns Plus Suffix',
    '20': 'Health Industry Number',
    '27': 'Carrier ID Number',
    '28': 'Fiscal Intermediary ID',
    '29': 'Medicare Provider',
    '30': 'US Federal Tax ID',
    '33': 'Naic Code',
    'ZZ': 'Mutually Defined',
    // Entity codes (N1)
    'BT': 'Bill-To',
    'ST': 'Ship-To',
    'SF': 'Ship-From',
    'SU': 'Supplier',
    'VN': 'Vendor',
    'BY': 'Buying Party',
    'RI': 'Remit-To',
    'SE': 'Selling Party',
    'CN': 'Consignee',
    'OB': 'Ordered By',
    'PR': 'Payer',
    'EN': 'End User',
    'CA': 'Carrier',
    // DTM qualifiers (subset)
    '002': 'Delivery Requested',
    '004': 'Purchase Order',
    '007': 'Effective',
    '009': 'Process',
    '010': 'Requested Ship',
    '011': 'Shipped',
    '017': 'Estimated Delivery',
    '035': 'Delivered',
    '036': 'Expiration',
    '050': 'Received',
    '067': 'Current Schedule Delivery',
    '085': 'Acknowledgment',
    '097': 'Transaction Creation',
    '150': 'Service Period Start',
    '151': 'Service Period End',
    '186': 'Invoice Period Start',
    '187': 'Invoice Period End',
    // REF qualifiers (subset)
    'PO': 'Purchase Order Number',
    'CO': 'Customer Order Number',
    'IV': 'Invoice Number',
    'CT': 'Contract Number',
    'BM': 'Bill of Lading',
    'IA': 'Internal Vendor Number',
    'VR': 'Vendor ID',
    'DP': 'Department Number',
    'AN': 'Associated Purchase Orders',
    // Acknowledgment codes
    'A': 'Accepted',
    'E': 'Accepted but Errors',
    'R': 'Rejected',
    'M': 'Rejected, Message Auth Failed',
    'W': 'Rejected, Assurance Failed',
    'X': 'Rejected, Content Auth Failed',
    // Usage indicator
    'P': 'Production',
    'T': 'Test',
    'I': 'Information',
  };

  // ----- Product / Item ID qualifiers (PO1, IT1, LIN element pairs) ----
  const PRODUCT_ID_QUALIFIERS = {
    'BP': "Buyer's Part Number",
    'VP': "Vendor's Part Number",
    'VA': 'Vendor Article Number',
    'VN': 'Vendor Number',
    'UP': 'UPC Consumer Package Code',
    'UA': 'UPC/EAN Shipping Container Code',
    'UK': 'UPC/EAN Case Code',
    'UI': 'UPC Case Code',
    'EN': 'EAN-13 Number',
    'EU': 'UCC-EAN',
    'SK': 'Stock Keeping Unit',
    'IT': "Buyer's Style Number",
    'IB': 'ISBN',
    'IS': 'Issue Number',
    'CB': "Manufacturer's Part Number",
    'MG': "Manufacturer's Asset Tag",
    'MF': 'Manufacturer',
    'PI': 'Purchaser Item',
    'ON': 'Order Number',
    'CH': "Customer's Catalog Number",
    'GT': 'GTIN',
    'N4': 'NDC (5-4-2)',
    'ND': 'NDC',
    'PD': "Part Drawing Number",
    'PL': 'Price List Number',
    'PV': "Vendor's Price List",
    'RU': 'Run Number',
    'SN': 'Serial Number',
    'CT': 'Contract Number',
  };
  function productIdName(code) {
    if (!code) return '';
    return PRODUCT_ID_QUALIFIERS[code] || code;
  }

  // ----- Functional group codes (GS01) -----------------------------
  const FUNCTIONAL_GROUP_CODES = {
    'IN': 'Invoice (810)',
    'PO': 'Purchase Order (850)',
    'PR': 'PO Acknowledgment (855)',
    'SH': 'Ship Notice (856)',
    'FA': 'Functional Acknowledgment (997)',
    'OW': 'Warehouse Shipping Order (940)',
    'AR': 'Warehouse Shipping Advice (945)',
    'RC': 'Receiving Advice (861)',
    'RA': 'Remittance Advice (820)',
    'HC': 'Health Care Claim (837)',
    'IM': 'Motor Carrier Invoice (210)',
  };

  // ----- Helpers ---------------------------------------------------
  function lookupSegment(standard, code) {
    if (!code) return null;
    if (standard === 'edifact') return EDIFACT_SEGMENTS[code] || null;
    return X12_SEGMENTS[code] || null;
  }

  function lookupElement(standard, code, position) {
    const seg = lookupSegment(standard, code);
    if (!seg || !seg.elements) return null;
    return seg.elements[position] || null;
  }

  function transactionName(standard, code) {
    if (!code) return null;
    if (standard === 'edifact') return EDIFACT_MESSAGES[code] || null;
    return X12_TRANSACTIONS[code] || null;
  }

  function qualifierName(code) {
    if (!code) return null;
    return QUALIFIERS[code] || null;
  }

  global.EDIDictionary = {
    X12_TRANSACTIONS,
    EDIFACT_MESSAGES,
    X12_SEGMENTS,
    EDIFACT_SEGMENTS,
    QUALIFIERS,
    PRODUCT_ID_QUALIFIERS,
    FUNCTIONAL_GROUP_CODES,
    lookupSegment,
    lookupElement,
    transactionName,
    qualifierName,
    productIdName,
  };
})(window);
