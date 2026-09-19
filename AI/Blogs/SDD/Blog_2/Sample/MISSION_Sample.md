## M — Mission

### Product objective
Build a donor management portal that allows a nonprofit to collect, record,
reconcile, and report donations securely.

The portal must improve donor trust and reduce administration effort while
maintaining accurate financial records, protecting personal data, and enabling
appropriate human review of financial-risk concerns.

### Primary users
- Donor: makes a one-time or recurring donation and receives a receipt.
- Fundraising staff: manages campaigns and views approved donor information.
- Finance staff: reconciles donations, refunds, and payment-provider settlements.
- Compliance reviewer: investigates flagged transactions and records decisions.
- Administrator: manages user roles, permissions, and system configuration.

### In scope
- Donor profiles, consent preferences, and donation history.
- Fundraising campaigns and progress reporting.
- One-time and recurring donation flows through an approved payment provider.
- Donation receipts and finance reconciliation exports.
- Payment-provider webhook processing.
- Role-based staff access, MFA for privileged roles, and audit logging.
- Configurable AML/CFT risk flags and a restricted human-review workflow.

### Out of scope
- Storage, processing, or logging of raw payment-card data.
- Automated approval or rejection of AML/CFT cases.
- Automated suspicious-transaction reporting.
- Direct access to live payment credentials or production donor data by AI agents.
- Refunds without an authorised staff approval workflow.

### Non-negotiable safeguards
- Process each payment event exactly once using provider event IDs and
  idempotency keys.
- Preserve an auditable record for donation creation, payment status changes,
  refunds, receipt generation, risk flags, and staff actions.
- Apply least-privilege access: fundraising users cannot access compliance cases;
  no user can both request and approve the same refund.
- Store donor personal data only where necessary; support documented consent and
  communication-preference changes.
- When a risk rule triggers, create a `review_required` case for an authorised
  human reviewer. Do not automatically block, accuse, refund, report, or notify
  the donor.

### Definition of done
The feature is complete only when:
1. A successful payment creates one donation record, one immutable ledger entry,
   one receipt, and one audit event.
2. A duplicate webhook produces no duplicate financial or receipt records.
3. An invalid webhook signature is rejected and logged.
4. A flagged donation produces a restricted review case with linked evidence.
5. Automated tests and reconciliation checks pass in a non-production environment.
6. All changes, test results, assumptions, and unresolved risks are recorded in
   `implementation-status.md`.

### Human escalation
Stop implementation and request a human decision when:
- Payment status is ambiguous or provider data conflicts with internal records.
- A proposed data field has no defined business purpose, retention period, or owner.
- An AML/CFT rule requires a judgement about a donor, source of funds, or
  regulatory reporting.
- A requirement would weaken access controls, auditability, or financial
  reconciliation.
