/* ============================================================
   Sample EDI / JSON / XML documents for demo purposes.
   Numbers are internally consistent so you can verify totals.
   ============================================================ */
(function (global) {
  'use strict';

  const samples = [
    // ----------------------------------------------------------
    // X12 850 — Purchase Order WITH charges and taxes
    // ----------------------------------------------------------
    {
      name: 'X12 850 — Purchase Order',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*ACMECORP       *ZZ*GLOBEXSUPPLY   *250318*0915*U*00401*000000123*0*P*>",
        "GS*PO*ACMECORP*GLOBEXSUPPLY*20250318*0915*1*X*004010",
        "ST*850*0001",
        "BEG*00*SA*4500021354**20250318",
        "REF*DP*ELEC-DIV",
        "REF*IA*VENDOR-9981",
        "REF*CT*MSA-2024-Q1",
        "PER*BD*JANE COOPER*TE*5125550104*EM*jane.cooper@acmecorp.com*FX*5125550199",
        "FOB*PP*OR*ORIGIN",
        "ITD*05*3*2**10*30***Net 30, 2% if paid within 10 days",
        "DTM*002*20250401",
        "DTM*010*20250325",
        "N1*BT*ACME CORPORATION*92*ACME-BT",
        "N3*123 INDUSTRY WAY*SUITE 400",
        "N4*AUSTIN*TX*78701*US",
        "N1*ST*ACME WAREHOUSE 7*92*ACME-WH7",
        "N3*987 LOGISTICS BLVD*DOCK 12",
        "N4*DALLAS*TX*75201*US",
        "N1*VN*GLOBEX SUPPLY CO*92*GLOBEX-001",
        "N3*555 SUPPLY CHAIN PKWY",
        "N4*CHICAGO*IL*60601*US",
        "PO1*1*100*EA*12.95**BP*WIDGET-A100*VP*GBX-A100*UP*012345678901",
        "PID*F****Premium Stainless Widget, 100mm, Grade-A finish",
        "PO1*2*50*EA*24.50**BP*BRACKET-B250*VP*GBX-B250",
        "PID*F****Heavy-Duty Bracket Assembly, Galvanized",
        "PO1*3*200*EA*3.75**BP*FASTENER-X*VP*GBX-FX",
        "PID*F****M8 x 40mm Hex Bolt, 316 Stainless",
        "PO1*4*10*BX*89.00**BP*PACK-Z*VP*GBX-PZ",
        "PID*F****Industrial Mounting Kit, 24/box",
        "SAC*C*G830***12500***********Handling Fee",
        "SAC*C*F050***18000***********Freight",
        "SAC*A*D240***8200***********2% Cash Discount",
        "TXI*ST*36160*8.250",
        "CTT*4*360",
        "AMT*TT*4744.60",
        "SE*30*0001",
        "GE*1*1",
        "IEA*1*000000123",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 810 — Invoice (math reconciles)
    // 4 items: 1295 + 1225 + 750 + 890 = 4160
    // + handling 125 + freight 180 - 2% disc 82 = +223
    // Taxable 4383 * 8.25% = 361.60
    // Total: 4160 + 125 + 180 - 82 + 361.60 = 4744.60
    // ----------------------------------------------------------
    {
      name: 'X12 810 — Invoice',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*GLOBEXSUPPLY   *ZZ*ACMECORP       *250320*1430*U*00401*000000456*0*P*>",
        "GS*IN*GLOBEXSUPPLY*ACMECORP*20250320*1430*456*X*004010",
        "ST*810*0002",
        "BIG*20250320*INV-78213*20250318*4500021354",
        "REF*IA*VENDOR-9981",
        "REF*BM*BOL-554821",
        "REF*VR*GBX-INV-78213",
        "N1*RI*GLOBEX SUPPLY CO*92*GLOBEX-RI",
        "N3*555 SUPPLY CHAIN PKWY",
        "N4*CHICAGO*IL*60601*US",
        "PER*CN*ACCOUNTS RECEIVABLE*TE*3125550178*EM*ar@globexsupply.com",
        "N1*BT*ACME CORPORATION*92*ACME-BT",
        "N3*123 INDUSTRY WAY*SUITE 400",
        "N4*AUSTIN*TX*78701*US",
        "N1*ST*ACME WAREHOUSE 7*92*ACME-WH7",
        "N3*987 LOGISTICS BLVD",
        "N4*DALLAS*TX*75201*US",
        "ITD*05*3*2**10*30***Net 30 days, 2% if paid within 10",
        "DTM*011*20250319",
        "DTM*186*20250320",
        "IT1*1*100*EA*12.95**BP*WIDGET-A100",
        "PID*F****Premium Stainless Widget, 100mm, Grade-A finish",
        "IT1*2*50*EA*24.50**BP*BRACKET-B250",
        "PID*F****Heavy-Duty Bracket Assembly, Galvanized",
        "IT1*3*200*EA*3.75**BP*FASTENER-X",
        "PID*F****M8 x 40mm Hex Bolt, 316 Stainless",
        "IT1*4*10*BX*89.00**BP*PACK-Z",
        "PID*F****Industrial Mounting Kit, 24/box",
        "TDS*474460",
        "SAC*C*G830***12500***********Handling Fee",
        "SAC*C*F050***18000***********Freight",
        "SAC*A*D240***8200***********2% Cash Discount",
        "TXI*ST*36160*8.250",
        "CTT*4",
        "SE*30*0002",
        "GE*1*456",
        "IEA*1*000000456",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 855 — Purchase Order Acknowledgment
    // ----------------------------------------------------------
    {
      name: 'X12 855 — Purchase Order Acknowledgment',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*GLOBEXSUPPLY   *ZZ*ACMECORP       *250318*1045*U*00401*000000124*0*P*>",
        "GS*PR*GLOBEXSUPPLY*ACMECORP*20250318*1045*124*X*004010",
        "ST*855*0003",
        "BAK*00*AC*4500021354*20250318",
        "REF*VR*GBX-ACK-7821",
        "REF*IA*VENDOR-9981",
        "DTM*010*20250325",
        "DTM*002*20250401",
        "N1*VN*GLOBEX SUPPLY CO*92*GLOBEX-001",
        "N3*555 SUPPLY CHAIN PKWY",
        "N4*CHICAGO*IL*60601*US",
        "N1*BT*ACME CORPORATION*92*ACME-BT",
        "N3*123 INDUSTRY WAY",
        "N4*AUSTIN*TX*78701*US",
        "PO1*1*100*EA*12.95*PE*BP*WIDGET-A100",
        "ACK*IA*100*EA*068",
        "PID*F****Premium Stainless Widget, 100mm",
        "PO1*2*50*EA*24.50*PE*BP*BRACKET-B250",
        "ACK*IA*50*EA*068",
        "PID*F****Heavy-Duty Bracket Assembly",
        "PO1*3*200*EA*3.75*PE*BP*FASTENER-X",
        "ACK*IB*150*EA*068**BP*FASTENER-X",
        "PID*F****M8 x 40mm Hex Bolt — partial fulfillment",
        "PO1*4*10*BX*89.00*PE*BP*PACK-Z",
        "ACK*IA*10*BX*068",
        "PID*F****Industrial Mounting Kit",
        "CTT*4",
        "SE*23*0003",
        "GE*1*124",
        "IEA*1*000000124",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 856 — Advance Ship Notice
    // ----------------------------------------------------------
    {
      name: 'X12 856 — Advance Ship Notice',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*GLOBEXSUPPLY   *ZZ*ACMECORP       *250319*1100*U*00401*000000789*0*P*>",
        "GS*SH*GLOBEXSUPPLY*ACMECORP*20250319*1100*789*X*004010",
        "ST*856*0004",
        "BSN*00*SH-91827*20250319*1100*0001",
        "HL*1**S",
        "TD1*CTN25*8****G*245.5*LB",
        "TD5**2*UPSN*M*UPS GROUND",
        "TD3*TL*UPSN*1Z999AA10123456784",
        "REF*BM*UPS-1Z999AA10123456784",
        "REF*CN*GBX-CARTON-MANIFEST-91827",
        "DTM*011*20250319",
        "DTM*017*20250322",
        "N1*ST*ACME WAREHOUSE 7*92*ACME-WH7",
        "N3*987 LOGISTICS BLVD*DOCK 12",
        "N4*DALLAS*TX*75201*US",
        "N1*SF*GLOBEX SUPPLY CO*92*GLOBEX-001",
        "N3*555 SUPPLY CHAIN PKWY",
        "N4*CHICAGO*IL*60601*US",
        "HL*2*1*O",
        "PRF*4500021354**20250318",
        "HL*3*2*I",
        "LIN**BP*WIDGET-A100*VP*GBX-A100*UP*012345678901",
        "SN1**100*EA",
        "PID*F****Premium Stainless Widget, 100mm",
        "HL*4*2*I",
        "LIN**BP*BRACKET-B250*VP*GBX-B250",
        "SN1**50*EA",
        "PID*F****Heavy-Duty Bracket Assembly",
        "HL*5*2*I",
        "LIN**BP*FASTENER-X*VP*GBX-FX",
        "SN1**200*EA",
        "PID*F****M8 x 40mm Hex Bolt",
        "HL*6*2*I",
        "LIN**BP*PACK-Z*VP*GBX-PZ",
        "SN1**10*BX",
        "PID*F****Industrial Mounting Kit",
        "CTT*6",
        "SE*32*0004",
        "GE*1*789",
        "IEA*1*000000789",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 820 — Remittance Advice / Payment Order
    // ----------------------------------------------------------
    {
      name: 'X12 820 — Payment / Remittance Advice',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*ACMECORP       *ZZ*GLOBEXSUPPLY   *250420*0900*U*00401*000000901*0*P*>",
        "GS*RA*ACMECORP*GLOBEXSUPPLY*20250420*0900*901*X*004010",
        "ST*820*0005",
        "BPR*C*4744.60*C*ACH*CTX*01*021000089*DA*123456789*1234567890**01*123000220*DA*987654321*20250420",
        "TRN*1*EFT-20250420-901*1234567890",
        "REF*EV*ACME-AR-PAYMENT-901",
        "DTM*097*20250420",
        "N1*PR*ACME CORPORATION*92*ACME-PR",
        "N3*123 INDUSTRY WAY",
        "N4*AUSTIN*TX*78701*US",
        "N1*PE*GLOBEX SUPPLY CO*92*GLOBEX-001",
        "N3*555 SUPPLY CHAIN PKWY",
        "N4*CHICAGO*IL*60601*US",
        "ENT*1",
        "RMR*IV*INV-78213**4744.60*4744.60",
        "REF*PO*4500021354",
        "DTM*003*20250320",
        "SE*15*0005",
        "GE*1*901",
        "IEA*1*000000901",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 945 — Warehouse Shipping Advice
    // ----------------------------------------------------------
    {
      name: 'X12 945 — Warehouse Shipping Advice',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*WAREHOUSE3PL   *ZZ*GLOBEXSUPPLY   *250319*1300*U*00401*000000334*0*P*>",
        "GS*AR*WAREHOUSE3PL*GLOBEXSUPPLY*20250319*1300*334*X*004010",
        "ST*945*0006",
        "W06*F*GLOBEX-OUT-7811*20250319*SH-91827*001*ACMECORP",
        "N1*SF*GLOBEX 3PL FULFILLMENT*92*WH-3PL",
        "N3*44 WAREHOUSE DRIVE",
        "N4*INDIANAPOLIS*IN*46201*US",
        "N1*ST*ACME WAREHOUSE 7*92*ACME-WH7",
        "N3*987 LOGISTICS BLVD",
        "N4*DALLAS*TX*75201*US",
        "N9*PO*4500021354",
        "G62*10*20250319*9*1500",
        "NTE*OPR*Packed per customer cube-out preference",
        "W27*M*UPS Ground*UPSN*1Z999AA10123456784",
        "LX*1",
        "W12*CC*100*100*0*EA*BP*WIDGET-A100*VP*GBX-A100",
        "G69*Premium Stainless Widget 100mm",
        "LX*2",
        "W12*CC*50*50*0*EA*BP*BRACKET-B250*VP*GBX-B250",
        "G69*Heavy-Duty Bracket Assembly",
        "LX*3",
        "W12*CP*200*150*50*EA*BP*FASTENER-X*VP*GBX-FX",
        "G69*M8 Hex Bolt — 50 backordered",
        "LX*4",
        "W12*CC*10*10*0*BX*BP*PACK-Z*VP*GBX-PZ",
        "G69*Industrial Mounting Kit",
        "W03*4*310*LB*0.45*FT",
        "SE*24*0006",
        "GE*1*334",
        "IEA*1*000000334",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 997 — Functional Acknowledgment
    // ----------------------------------------------------------
    {
      name: 'X12 997 — Functional Acknowledgment',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*ACMECORP       *ZZ*GLOBEXSUPPLY   *250318*0930*U*00401*000000124*0*P*>",
        "GS*FA*ACMECORP*GLOBEXSUPPLY*20250318*0930*124*X*004010",
        "ST*997*0001",
        "AK1*PO*1",
        "AK2*850*0001",
        "AK5*A",
        "AK9*A*1*1*1",
        "SE*6*0001",
        "GE*1*124",
        "IEA*1*000000124",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // X12 214 — Transportation Carrier Shipment Status
    // ----------------------------------------------------------
    {
      name: 'X12 214 — Shipment Status Message',
      format: 'x12',
      content: [
        "ISA*00*          *00*          *ZZ*UPSCARRIER     *ZZ*ACMECORP       *250321*1430*U*00401*000000777*0*P*>",
        "GS*QM*UPSCARRIER*ACMECORP*20250321*1430*777*X*004010",
        "ST*214*0007",
        "B10*1Z999AA10123456784*UPS-7821*UPSN",
        "L11*4500021354*PO",
        "L11*SH-91827*SI",
        "LX*1",
        "AT7*X1*NS***20250321*0840*CT",
        "MS1*MEMPHIS*TN*US",
        "MS2*UPSN*1Z999AA10123456784",
        "AT8*L*K*245.5*8",
        "AT7*AF*NS***20250322*1015*CT",
        "MS1*DALLAS*TX*US",
        "AT8*L*K*245.5*8",
        "SE*12*0007",
        "GE*1*777",
        "IEA*1*000000777",
      ].join('~') + '~',
    },

    // ----------------------------------------------------------
    // EDIFACT ORDERS — Purchase Order
    // ----------------------------------------------------------
    {
      name: 'EDIFACT ORDERS — Purchase Order',
      format: 'edifact',
      content: [
        "UNA:+.? '",
        "UNB+UNOA:1+1234567890123:14+9876543210987:14+250318:0915+ORD001'",
        "UNH+1+ORDERS:D:96A:UN'",
        "BGM+220+PO-99214+9'",
        "DTM+137:20250318:102'",
        "DTM+2:20250401:102'",
        "RFF+CT:MSA-2024-Q1'",
        "NAD+BY+5012345000018::9++ACME CORPORATION+123 INDUSTRY WAY:SUITE 400+AUSTIN++78701+US'",
        "NAD+SU+5023456000023::9++GLOBEX SUPPLY CO+555 SUPPLY CHAIN PKWY+CHICAGO++60601+US'",
        "NAD+DP+5034567000034::9++ACME WAREHOUSE 7+987 LOGISTICS BLVD+DALLAS++75201+US'",
        "CUX+2:EUR:4'",
        "PAT+1++5:3:D:30'",
        "LIN+1++WIDGET-A100:BP'",
        "PIA+5+GBX-A100:VP'",
        "IMD+F++:::Premium Stainless Widget 100mm Grade-A'",
        "QTY+21:100:EA'",
        "PRI+AAA:12.95'",
        "MOA+203:1295.00'",
        "LIN+2++BRACKET-B250:BP'",
        "PIA+5+GBX-B250:VP'",
        "IMD+F++:::Heavy-Duty Bracket Assembly'",
        "QTY+21:50:EA'",
        "PRI+AAA:24.50'",
        "MOA+203:1225.00'",
        "LIN+3++FASTENER-X:BP'",
        "IMD+F++:::M8 x 40mm Hex Bolt'",
        "QTY+21:200:EA'",
        "PRI+AAA:3.75'",
        "MOA+203:750.00'",
        "UNS+S'",
        "MOA+79:3270.00'",
        "MOA+125:3270.00'",
        "TAX+7+VAT+++:::19.00'",
        "MOA+124:621.30'",
        "MOA+39:3891.30'",
        "UNT+30+1'",
        "UNZ+1+ORD001'",
      ].join('\n'),
    },

    // ----------------------------------------------------------
    // EDIFACT INVOIC — Invoice with charges and taxes
    // ----------------------------------------------------------
    {
      name: 'EDIFACT INVOIC — Invoice',
      format: 'edifact',
      content: [
        "UNA:+.? '",
        "UNB+UNOA:1+9876543210987:14+1234567890123:14+250320:1430+INV001'",
        "UNH+1+INVOIC:D:96A:UN'",
        "BGM+380+INV-7788+9'",
        "DTM+137:20250320:102'",
        "DTM+35:20250322:102'",
        "RFF+ON:PO-99214'",
        "RFF+IV:INV-7788'",
        "NAD+SU+5023456000023::9++GLOBEX SUPPLY CO+555 SUPPLY CHAIN PKWY+CHICAGO++60601+US'",
        "NAD+BY+5012345000018::9++ACME CORPORATION+123 INDUSTRY WAY+AUSTIN++78701+US'",
        "NAD+IV+5012345000018::9++ACME CORPORATION ACCOUNTS PAYABLE+123 INDUSTRY WAY+AUSTIN++78701+US'",
        "CUX+2:EUR:4'",
        "PAT+1++5:3:D:30'",
        "LIN+1++WIDGET-A100:BP'",
        "PIA+5+GBX-A100:VP'",
        "IMD+F++:::Premium Stainless Widget 100mm'",
        "QTY+47:100:EA'",
        "PRI+AAA:12.95'",
        "MOA+203:1295.00'",
        "LIN+2++BRACKET-B250:BP'",
        "IMD+F++:::Heavy-Duty Bracket Assembly'",
        "QTY+47:50:EA'",
        "PRI+AAA:24.50'",
        "MOA+203:1225.00'",
        "LIN+3++FASTENER-X:BP'",
        "IMD+F++:::M8 x 40mm Hex Bolt'",
        "QTY+47:200:EA'",
        "PRI+AAA:3.75'",
        "MOA+203:750.00'",
        "UNS+S'",
        "MOA+79:3270.00'",
        "MOA+125:3270.00'",
        "TAX+7+VAT+++:::19.00'",
        "MOA+124:621.30'",
        "MOA+39:3891.30'",
        "UNT+28+1'",
        "UNZ+1+INV001'",
      ].join('\n'),
    },

    // ----------------------------------------------------------
    // EDIFACT DESADV — Despatch Advice
    // ----------------------------------------------------------
    {
      name: 'EDIFACT DESADV — Despatch Advice',
      format: 'edifact',
      content: [
        "UNA:+.? '",
        "UNB+UNOA:1+9876543210987:14+1234567890123:14+250319:1100+DES001'",
        "UNH+1+DESADV:D:96A:UN'",
        "BGM+351+DESP-7821+9'",
        "DTM+137:20250319:102'",
        "DTM+11:20250319:102'",
        "DTM+17:20250322:102'",
        "RFF+ON:PO-99214'",
        "NAD+SU+5023456000023::9++GLOBEX SUPPLY CO+555 SUPPLY CHAIN PKWY+CHICAGO++60601+US'",
        "NAD+CN+5034567000034::9++ACME WAREHOUSE 7+987 LOGISTICS BLVD+DALLAS++75201+US'",
        "NAD+ST+5034567000034::9++ACME WAREHOUSE 7+987 LOGISTICS BLVD+DALLAS++75201+US'",
        "TDT+20+++30::ITF+UPSCARRIER:166:ZZZ:UPS+++1Z999AA10123456784'",
        "CPS+1'",
        "LIN+1++WIDGET-A100:BP'",
        "PIA+5+GBX-A100:VP'",
        "IMD+F++:::Premium Stainless Widget 100mm'",
        "QTY+12:100:EA'",
        "LIN+2++BRACKET-B250:BP'",
        "IMD+F++:::Heavy-Duty Bracket Assembly'",
        "QTY+12:50:EA'",
        "LIN+3++FASTENER-X:BP'",
        "IMD+F++:::M8 x 40mm Hex Bolt'",
        "QTY+12:200:EA'",
        "UNT+20+1'",
        "UNZ+1+DES001'",
      ].join('\n'),
    },

    /* JSON / XML samples removed — EDI Reader now focuses on EDI input.
    {
      name: 'JSON — Sales Order',
      format: 'json',
      content: JSON.stringify({
        orderId: "PO-4500021354",
        orderDate: "2025-03-18",
        currency: "USD",
        buyer: {
          name: "ACME Corporation",
          id: "ACME-BT",
          address: { street: "123 Industry Way", line2: "Suite 400", city: "Austin", state: "TX", zip: "78701", country: "US" },
          contact: { name: "Jane Cooper", email: "jane.cooper@acmecorp.com", phone: "512-555-0104" },
        },
        seller: {
          name: "Globex Supply Co",
          id: "GLOBEX-001",
          address: { street: "555 Supply Chain Pkwy", city: "Chicago", state: "IL", zip: "60601", country: "US" },
        },
        shipTo: {
          name: "ACME Warehouse 7",
          id: "ACME-WH7",
          address: { street: "987 Logistics Blvd", city: "Dallas", state: "TX", zip: "75201", country: "US" },
        },
        items: [
          { line: 1, sku: "WIDGET-A100", description: "Premium Stainless Widget, 100mm", quantity: 100, unit: "EA", unitPrice: 12.95, lineTotal: 1295.00 },
          { line: 2, sku: "BRACKET-B250", description: "Heavy-Duty Bracket Assembly", quantity: 50, unit: "EA", unitPrice: 24.50, lineTotal: 1225.00 },
          { line: 3, sku: "FASTENER-X",   description: "M8 x 40mm Hex Bolt, 316 Stainless", quantity: 200, unit: "EA", unitPrice: 3.75, lineTotal: 750.00 },
          { line: 4, sku: "PACK-Z",       description: "Industrial Mounting Kit, 24/box", quantity: 10, unit: "BX", unitPrice: 89.00, lineTotal: 890.00 },
        ],
        totals: {
          subtotal: 4160.00,
          handling: 125.00,
          freight: 180.00,
          discount: 82.00,
          tax: 361.60,
          grandTotal: 4744.60,
          currency: "USD",
        },
        terms: "Net 30 days. 2% discount if paid within 10 days.",
        notes: ["Backorders OK", "Ship to dock 12 between 7am-3pm CT"],
      }, null, 2),
    },

    // ----------------------------------------------------------
    // JSON — Healthcare Claim (minimal example)
    // ----------------------------------------------------------
    {
      name: 'JSON — Customer Profile',
      format: 'json',
      content: JSON.stringify({
        accountId: "CUST-784512",
        name: "ACME Corporation",
        status: "Active",
        creditLimit: 250000,
        balance: 18420.50,
        contacts: [
          { role: "Accounts Payable", name: "Michael Chen", email: "ap@acmecorp.com", phone: "512-555-0142" },
          { role: "Receiving", name: "Sara Patel", email: "receiving@acmecorp.com", phone: "214-555-0188" },
        ],
        addresses: {
          billing: { street: "123 Industry Way", city: "Austin", state: "TX", zip: "78701" },
          shipping: [
            { name: "Warehouse 7", street: "987 Logistics Blvd", city: "Dallas", state: "TX", zip: "75201" },
            { name: "Warehouse 12", street: "44 Distribution Way", city: "Phoenix", state: "AZ", zip: "85001" },
          ],
        },
        paymentTerms: "Net 30",
        defaultCurrency: "USD",
      }, null, 2),
    },

    // ----------------------------------------------------------
    // XML — Shipment / Tracking
    // ----------------------------------------------------------
    {
      name: 'XML — Shipment Tracking',
      format: 'xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Shipment id="SH-91827" date="2025-03-19">
  <Carrier>
    <Name>UPS</Name>
    <Service>GROUND</Service>
    <Tracking>1Z999AA10123456784</Tracking>
    <EstimatedDelivery>2025-03-22</EstimatedDelivery>
  </Carrier>
  <Reference type="PO">4500021354</Reference>
  <Reference type="BOL">UPS-1Z999AA10123456784</Reference>
  <From>
    <Name>Globex Supply Co</Name>
    <Address>
      <Street>555 Supply Chain Pkwy</Street>
      <City>Chicago</City>
      <State>IL</State>
      <PostalCode>60601</PostalCode>
      <Country>US</Country>
    </Address>
  </From>
  <To>
    <Name>ACME Warehouse 7</Name>
    <Address>
      <Street>987 Logistics Blvd</Street>
      <City>Dallas</City>
      <State>TX</State>
      <PostalCode>75201</PostalCode>
      <Country>US</Country>
    </Address>
  </To>
  <Packages totalWeight="245.5" weightUnit="LB" count="8">
    <Package id="1" weight="32.5" weightUnit="LB">
      <Items>
        <Item sku="WIDGET-A100" quantity="100" unit="EA">Premium Stainless Widget, 100mm</Item>
      </Items>
    </Package>
    <Package id="2" weight="48.0" weightUnit="LB">
      <Items>
        <Item sku="BRACKET-B250" quantity="50" unit="EA">Heavy-Duty Bracket Assembly</Item>
      </Items>
    </Package>
  </Packages>
  <Events>
    <Event time="2025-03-19T11:00:00-05:00" location="Chicago, IL" status="Picked up">Package picked up by UPS</Event>
    <Event time="2025-03-21T08:40:00-06:00" location="Memphis, TN" status="In Transit">Departed UPS facility</Event>
    <Event time="2025-03-22T10:15:00-05:00" location="Dallas, TX" status="Out for Delivery">On vehicle for delivery</Event>
  </Events>
</Shipment>`,
    },

    // ----------------------------------------------------------
    // XML — Invoice
    // ----------------------------------------------------------
    {
      name: 'XML — Commercial Invoice',
      format: 'xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Invoice number="INV-78213" date="2025-03-20" currency="USD">
  <Seller>
    <Name>Globex Supply Co</Name>
    <TaxId>EIN-12-3456789</TaxId>
    <Address>
      <Street>555 Supply Chain Pkwy</Street>
      <City>Chicago</City>
      <State>IL</State>
      <PostalCode>60601</PostalCode>
      <Country>US</Country>
    </Address>
  </Seller>
  <Buyer>
    <Name>ACME Corporation</Name>
    <Address>
      <Street>123 Industry Way</Street>
      <City>Austin</City>
      <State>TX</State>
      <PostalCode>78701</PostalCode>
      <Country>US</Country>
    </Address>
  </Buyer>
  <PurchaseOrder>4500021354</PurchaseOrder>
  <LineItems>
    <Item line="1" sku="WIDGET-A100" qty="100" unit="EA" price="12.95" total="1295.00">
      Premium Stainless Widget, 100mm
    </Item>
    <Item line="2" sku="BRACKET-B250" qty="50" unit="EA" price="24.50" total="1225.00">
      Heavy-Duty Bracket Assembly
    </Item>
    <Item line="3" sku="FASTENER-X" qty="200" unit="EA" price="3.75" total="750.00">
      M8 x 40mm Hex Bolt
    </Item>
    <Item line="4" sku="PACK-Z" qty="10" unit="BX" price="89.00" total="890.00">
      Industrial Mounting Kit
    </Item>
  </LineItems>
  <Totals>
    <Subtotal>4160.00</Subtotal>
    <Handling>125.00</Handling>
    <Freight>180.00</Freight>
    <Discount>82.00</Discount>
    <Tax rate="8.25">361.60</Tax>
    <GrandTotal>4744.60</GrandTotal>
  </Totals>
  <Terms>Net 30 days, 2% if paid within 10 days</Terms>
</Invoice>`,
    },
    */
  ];

  global.Samples = samples;
})(window);
