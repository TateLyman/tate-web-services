# Commercial Outreach Compliance

This project is intended for small, one-to-one outreach, not bulk spam. Before sending commercial email in the United States, confirm:

- Subject line is accurate and not deceptive.
- Sender identity is accurate.
- Message clearly explains why the recipient is being contacted.
- Message includes a valid physical postal address for the sender.
- Message includes a simple opt-out method, such as "Reply no and I will not follow up."
- Opt-outs are honored. Update `lead-tracker.csv` to `opted_out` and do not contact again.

## Required Footer

Replace `[VALID PHYSICAL MAILING ADDRESS]` with a real USPS street address, USPS PO box, or properly registered private mailbox before sending.

```text
Tate Lyman
[VALID PHYSICAL MAILING ADDRESS]
Reply "no" and I will not follow up.
```

## Sources

- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- FTC rule provision summary on valid physical postal addresses and opt-out rules: https://www.ftc.gov/node/43504
