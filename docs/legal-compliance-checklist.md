# Legal Compliance Checklist: AI Olympics Prediction Markets

> **Disclaimer**: This document is for informational purposes only and does not constitute legal advice. Consult qualified legal counsel before launching any prediction market platform. Last updated: February 2026.

---

## Platform Modes

AI Olympics operates two prediction market modes:

| Mode | Currency | Regulatory Risk | Status |
|------|----------|----------------|--------|
| **Sandbox** | Virtual tokens (no monetary value) | Low | Live |
| **Real-Money** | USD via Stripe | High | Requires CFTC registration |

---

## 1. Virtual Currency (Sandbox) Mode Checklist

### Terms of Service

- [x] "Virtual currency has no monetary value" disclaimer (implemented in bet panels)
- [x] "Not gambling or financial trading" disclaimer
- [ ] Age restriction clause (18+ minimum)
- [ ] Prohibited activities (fraud, collusion, bots, multi-accounting)
- [ ] Dispute resolution / arbitration clause
- [ ] Limitation of liability
- [ ] Modification rights (Terms can change with notice)

### Privacy & Data

- [x] Privacy Policy page (static page exists at `/privacy`)
- [ ] GDPR compliance for EU users (data subject rights, lawful basis, DPO if required)
- [ ] CCPA/CPRA compliance for California users (right to know, delete, opt-out)
- [ ] Cookie consent mechanism
- [ ] Data retention policy disclosure
- [ ] Data export capability for users

### User Protection

- [ ] Age verification (checkbox at minimum, ideally DOB check)
- [ ] Self-exclusion option (voluntary betting pause)
- [ ] Deposit/bet limits (daily/weekly caps)
- [ ] Responsible forecasting resources
- [x] Virtual-currency disclaimer on bet panels ("entertainment purposes only")

### Market Integrity

- [ ] Define resolution sources for each market type (official competition results)
- [ ] Transparent resolution timeline
- [ ] Dispute resolution process for contested outcomes
- [ ] Anti-manipulation controls (position limits, velocity limits)
- [ ] Prohibit competition organizers/judges from betting on their own events

### Geo-Blocking

- [ ] Block Australia (IGA Act - prediction markets classified as gambling)
- [ ] Block Singapore (GRA restrictions)
- [ ] Block France (regulatory restrictions)
- [ ] IP detection + VPN/proxy detection
- [ ] Terms clause: users responsible for local law compliance

---

## 2. Real-Money Mode Checklist

> **CRITICAL**: Do NOT launch real-money prediction markets without CFTC registration or no-action relief. Polymarket was fined $1.4M in 2022 for operating without registration.

### CFTC Registration (Choose One Path)

#### Option A: Designated Contract Market (DCM) - Recommended
- [ ] Engage CFTC-experienced law firm (Katten, Sidley Austin, Dentons)
- [ ] Prepare DCM application (Form DCM with exhibits)
- [ ] Demonstrate compliance with 23 Core Principles
- [ ] Develop comprehensive market rulebook
- [ ] Build surveillance and compliance systems
- [ ] Show adequate financial resources
- [ ] **Timeline**: 12-18 months from start to approval

#### Option B: No-Action Relief - Faster but uncertain
- [ ] Demonstrate public interest (AI forecasting educational value)
- [ ] Show limited systemic risk
- [ ] Demonstrate adequate participant protections
- [ ] Submit no-action letter request to CFTC
- [ ] **Timeline**: 3-12 months (CFTC discretion)

### AML/KYC Compliance

- [ ] **Identity Verification Provider** (Onfido, Jumio, Persona, or Sumsub)
  - Government-issued photo ID
  - Facial recognition matching
  - Address verification
  - SSN/Tax ID for US persons
- [ ] **AML Program**
  - Designate AML Compliance Officer
  - Risk-based policies and procedures
  - Customer Identification Program (CIP)
  - Transaction monitoring system
  - SAR filing procedures
  - CTR filing for $10k+ cash transactions
- [ ] **OFAC Screening**
  - Screen against sanctions lists at onboarding
  - Periodic re-screening
  - Geo-block sanctioned countries
- [ ] **Customer Due Diligence (CDD)**
  - Occupation, source of funds, trading experience
  - Risk profile assessment per customer
- [ ] **Staff Training** - AML/BSA training for relevant personnel
- [ ] **Annual Independent Audit** of AML program

### Market Surveillance

- [ ] Real-time monitoring for:
  - Wash trading (self-trading for false volume)
  - Front-running (trading ahead of known large orders)
  - Layering/spoofing (fake orders to move prices)
  - Insider trading (organizers/judges trading on outcomes they control)
  - Market manipulation (coordinated activity)
- [ ] Position limits (prevent any user from dominating a market)
- [ ] Order size limits
- [ ] Automated circuit breakers for unusual price movements
- [ ] Complete audit trail (orders, trades, cancellations) - 5-year retention

### Financial Safeguards

- [ ] Segregated customer funds (not commingled with operational funds)
- [ ] Regular fund reconciliation
- [ ] PCI DSS compliance for card payments
- [ ] Risk-based deposit/withdrawal limits
- [ ] Payment processor that understands prediction market model

### Risk Disclosures (Real-Money Terms)

- [ ] "Trading involves substantial risk of loss"
- [ ] "You may lose your entire investment"
- [ ] "Only trade with funds you can afford to lose"
- [ ] "Past performance does not indicate future results"
- [ ] "This is not investment advice"
- [ ] CFTC registration status disclosure
- [ ] Fee structure disclosure (platform fee, withdrawal fees)
- [ ] Fund segregation disclosure
- [ ] Tax reporting responsibility notice

### State Law Considerations

> As of early 2026, ~12 states have issued C&D orders or enforcement actions against prediction markets. Federal courts (NV, NJ) have ruled CEA preempts state gambling laws, but Massachusetts state court ruled against preemption. Likely headed to Supreme Court.

- [ ] Legal analysis of state-by-state risk
- [ ] Consider geo-blocking high-risk states initially:
  - Massachusetts (preliminary injunction issued)
  - States with active C&D orders (NV, NJ, MD, OH, IL, MT, AZ, CT)
- [ ] Monitor ongoing litigation (Kalshi vs. state regulators)
- [ ] Prepare response strategy for potential C&D orders

---

## 3. International Compliance

### EU (MiCA Regulation)
- [ ] CASP authorization required by July 1, 2026 (if serving EU users)
- [ ] GDPR full compliance (DPO, data subject rights, DPIA)
- [ ] Consider blocking EU until CASP obtained

### UK (FCA)
- [ ] Financial promotions compliance ("fair, clear, not misleading")
- [ ] Consider Gambling Commission licensing requirement
- [ ] Monitor FCA crypto consultations

### Australia - BLOCKED
- [x] Must geo-block (IGA Act - prediction markets = illegal gambling)

### Singapore - BLOCKED
- [x] Must geo-block (GRA restrictions)

### Recommended Approach
- Phase 1: US-only (simplify compliance)
- Phase 2: Expand to friendly jurisdictions after US operations stable

---

## 4. Tax Compliance

- [ ] 1099 reporting for US users with gains exceeding IRS thresholds
- [ ] Terms requiring users to self-report gains/losses
- [ ] Consult tax attorney on platform's reporting obligations
- [ ] Consider tax withholding requirements for large payouts

---

## 5. Implementation Priority

### Phase 1: Immediate (Sandbox Mode Hardening)
1. Add age verification (18+ checkbox + DOB)
2. Add self-exclusion and bet limit options
3. Define market resolution sources and dispute process
4. Implement geo-blocking for Australia/Singapore
5. Update Terms of Service with missing clauses
6. Add GDPR/CCPA compliance mechanisms

### Phase 2: Pre-Real-Money (3-9 months)
1. Engage CFTC-experienced legal counsel
2. Choose registration path (DCM vs no-action relief)
3. Begin registration/application process
4. Select and integrate KYC/AML vendor
5. Build surveillance infrastructure

### Phase 3: Real-Money Launch (12-18 months)
1. Obtain CFTC approval
2. Launch with limited state availability
3. Monitor state enforcement landscape
4. Annual compliance audits

---

## 6. Recommended Legal Counsel

| Firm | Specialty |
|------|-----------|
| Katten Muchin Rosenman | DCM registration, CFTC regulatory |
| Sidley Austin | CFTC regulatory expertise |
| Dentons | Prediction market advisory |
| Heitner Legal | Sports/gaming/prediction market law |
| DLA Piper | Crypto/blockchain + CFTC |

## 7. Compliance Vendors

| Category | Vendors |
|----------|---------|
| Identity Verification | Onfido, Jumio, Persona, Sumsub |
| AML Transaction Monitoring | Chainalysis, ComplyAdvantage, NICE Actimize |
| Market Surveillance | Eventus, Nasdaq Surveillance, TT Score |

---

## Key Regulatory References

- **CFTC Jan 2026**: Withdrew proposed ban on event contracts, announced new rulemaking
- **Kalshi**: First CFTC-registered DCM for event contracts (Nov 2020)
- **Polymarket 2022**: $1.4M CFTC penalty for operating unregistered; re-entered US market Dec 2025
- **Federal preemption**: District courts (NV, NJ) ruled CEA preempts state gambling laws
- **State opposition**: MA state court ruled prediction markets subject to state gaming laws
