# Agent & Skill Ideas for Field Service Business

> Reference document for future automation features for ClearAir Portal

---

## Lead Management Agents

| Agent | What It Does | When It Runs |
|-------|--------------|--------------|
| **Speed-to-Lead** | Instantly texts new leads "Thanks for your inquiry, we'll call in 5 min" | On new lead |
| **Lead Follow-up** | Sends 2nd/3rd follow-up if no response in 2hr/24hr | Every 2 hours |
| **Dead Lead Revival** | Texts old leads "Still interested? We have a special this week" | Weekly |
| **Lead Scoring** | Ranks leads by likelihood to close (based on source, response time) | On new lead |

### Speed-to-Lead Details
- **Why it matters**: Responding in <5 minutes increases close rate by 400%
- **Message example**: "Hi {name}! Thanks for contacting ClearAir. We'll call you within 5 minutes!"
- **Skills needed**: `detect-new-lead`, `send-sms`, `log-contact`

### Lead Follow-up Sequence
```
New Lead
    │
    ├── Immediate: "Thanks for reaching out!"
    │
    ├── +2 hours (if no response): "Did you have questions about our services?"
    │
    ├── +24 hours: "Just checking in - still need duct cleaning?"
    │
    └── +72 hours: "Last chance - 10% off if you book today"
```

---

## Appointment Agents

| Agent | What It Does | When It Runs |
|-------|--------------|--------------|
| **Confirmation Agent** | "Your appointment is tomorrow at 10am. Reply YES to confirm" | Day before |
| **Same-Day Reminder** | "Tech arriving in 2 hours" | 2hr before |
| **No-Show Follow-up** | "We missed you today. Want to reschedule?" | After no-show |
| **Reschedule Agent** | Offers next available slots when customer cancels | On cancel |
| **On-My-Way Alert** | "Your tech John is 15 min away" | When tech leaves previous job |

### Confirmation Agent Flow
```
Day Before @ 10am
        │
        ▼
Send: "Hi {name}, reminder: ClearAir appointment tomorrow
       {date} at {time}. Reply YES to confirm or RESCHEDULE
       to change."
        │
        ├── Reply: YES → Mark confirmed, send "Great! See you tomorrow"
        │
        ├── Reply: RESCHEDULE → Trigger reschedule agent
        │
        └── No reply by 6pm → Send follow-up, flag for manual call
```

---

## Post-Service Agents

| Agent | What It Does | When It Runs |
|-------|--------------|--------------|
| **Review Request** | "How was your service? Leave us a Google review" | 2hr after job |
| **Payment Reminder** | "Your invoice of $350 is due. Pay here: [link]" | Daily for unpaid |
| **Receipt Agent** | Emails PDF receipt with signature | After payment |
| **Referral Request** | "Know someone who needs duct cleaning? Get $50 off" | 1 week after |
| **Service Follow-up** | "How's your air quality? Any issues since our visit?" | 3 days after |

### Review Request Strategy
```
2 hours after job completion
        │
        ▼
"Hi {name}! Thanks for choosing ClearAir today.
 If you were happy with {tech}'s work, would you
 mind leaving us a quick Google review? It helps
 us a lot! {google_review_link}"
        │
        ├── If 5-star review detected → Send thank you
        │
        └── If negative review → Alert owner immediately
```

### Payment Reminder Sequence
```
Invoice Created
    │
    ├── Day 0: Receipt sent
    │
    ├── Day 3: "Friendly reminder: Invoice #{id} for ${amount}"
    │
    ├── Day 7: "Your invoice is past due. Pay now: {link}"
    │
    └── Day 14: "Final notice before we contact you by phone"
```

---

## Sales Agents

| Agent | What It Does | When It Runs |
|-------|--------------|--------------|
| **Quote Follow-up** | "You received a quote for $299. Ready to schedule?" | 24hr after quote |
| **Upsell Agent** | "It's been 6 months since your duct cleaning. Time for dryer vent?" | Based on history |
| **Seasonal Campaign** | "Summer AC prep special - 20% off duct cleaning" | Seasonal |
| **Win-Back Agent** | "We haven't seen you in a year. Here's $50 off" | Annual |
| **Bundle Agent** | "Add dryer vent cleaning for just $99 (normally $129)" | During booking |

### Quote Follow-up Sequence
```
Quote Created (not converted)
    │
    ├── +4 hours: "Hi {name}, just sent your quote for ${amount}.
    │              Any questions I can answer?"
    │
    ├── +24 hours: "Following up on your duct cleaning quote.
    │               Ready to schedule?"
    │
    ├── +72 hours: "Your quote expires soon. Book now and
    │               get a free dryer vent inspection."
    │
    └── +7 days: Move to "cold quote" list for monthly follow-up
```

### Upsell Opportunities
| Last Service | Upsell After | Offer |
|--------------|--------------|-------|
| Duct Cleaning | 6 months | Dryer Vent Cleaning |
| Dryer Vent | 12 months | Duct Cleaning |
| Both | 3 months | UV Light / Sanitization |
| Any | 18 months | Full service package |

---

## Operations Agents

| Agent | What It Does | When It Runs |
|-------|--------------|--------------|
| **Daily Summary** | Summary of completed jobs, revenue, tomorrow's schedule | 6pm daily |
| **Morning Briefing** | Texts each tech their schedule for the day | 7am daily |
| **Capacity Alert** | "Tomorrow is overbooked - 5 jobs, only 1 tech" | Evening before |
| **Revenue Goal Tracker** | "Weekly goal: $8K. Current: $6.2K. Need $1.8K more" | Daily |
| **Weather Alert** | "Rain tomorrow - confirm outdoor jobs" | Evening before |
| **Inventory Alert** | "Low on filters - reorder needed" | Weekly |

### Morning Tech Briefing
```
7:00 AM Daily
    │
    ▼
To each tech:
"Good morning {tech}! Today's schedule:

1. 9am - John Smith
   123 Main St, Houston
   Air Duct Cleaning
   Gate: 1234 | Pets: Dog

2. 12pm - Jane Doe
   456 Oak Ave, Katy
   Dryer Vent

3. 3pm - Bob Wilson
   789 Pine St, Sugar Land
   Duct + Dryer Combo

Total: 3 jobs
Drive safe!"
```

---

## Priority Matrix

### Tier 1 - Build Now (Highest ROI)
| Agent | Impact | Effort |
|-------|--------|--------|
| **Speed-to-Lead** | Very High | Low |
| **Review Request** | High | Low |
| **Quote Follow-up** | High | Medium |

### Tier 2 - Build Next (High Value)
| Agent | Impact | Effort |
|-------|--------|--------|
| **Payment Reminder** | High | Low |
| **Morning Tech Briefing** | Medium | Low |
| **Confirmation Agent** | Medium | Medium |

### Tier 3 - Future (Growth)
| Agent | Impact | Effort |
|-------|--------|--------|
| **Upsell Agent** | Medium | Medium |
| **Referral Request** | Medium | Low |
| **Seasonal Campaign** | Medium | Medium |
| **Win-Back Agent** | Low | Low |

---

## Skills Library

These are reusable skills that agents can use:

### Communication Skills
| Skill | Description |
|-------|-------------|
| `send-sms` | Send text message via Twilio |
| `send-email` | Send email via Resend/SendGrid |
| `make-call` | Initiate phone call |
| `send-notification` | Push notification to app |

### Data Skills
| Skill | Description |
|-------|-------------|
| `read-leads` | Fetch leads from Google Sheet |
| `update-lead` | Update lead fields |
| `create-lead` | Create new lead |
| `read-settings` | Get agent configuration |
| `log-activity` | Record agent action |

### Business Logic Skills
| Skill | Description |
|-------|-------------|
| `calculate-metrics` | Sum revenue, count jobs, etc. |
| `filter-by-date` | Get leads for specific date |
| `filter-by-status` | Get leads by status |
| `check-response` | See if customer replied |
| `detect-sentiment` | Analyze customer reply tone |

### Integration Skills
| Skill | Description |
|-------|-------------|
| `sync-quickbooks` | Push invoice to QuickBooks |
| `get-weather` | Check weather forecast |
| `get-driving-time` | Calculate route duration |
| `generate-pdf` | Create invoice/receipt PDF |

---

## Message Templates

### New Lead Response
```
Hi {name}! Thanks for contacting ClearAir Solutions.
We specialize in air duct and dryer vent cleaning in the Houston area.
A team member will call you within 5 minutes to answer your questions!
```

### Appointment Confirmation
```
Hi {name}! This is ClearAir confirming your appointment:

📅 {date} at {time}
📍 {address}
🔧 {service}

Reply YES to confirm or call 281-XXX-XXXX to reschedule.
```

### Review Request
```
Hi {name}! Thank you for choosing ClearAir today.

If {tech} did a great job, would you mind leaving us a quick Google review?
It really helps our small business!

⭐ {google_review_link}

Thanks again!
```

### Payment Reminder
```
Hi {name}, friendly reminder that your ClearAir invoice
for ${amount} is due.

Pay securely here: {payment_link}

Questions? Reply to this text or call 281-XXX-XXXX.
```

### Referral Request
```
Hi {name}! Thanks for being a ClearAir customer.

Know someone who needs their air ducts cleaned?
Refer them and you BOTH get $50 off your next service!

Just have them mention your name when booking.
```

### Win-Back Message
```
Hi {name}! It's been a while since we cleaned your ducts
(last service: {last_date}).

The EPA recommends cleaning every 3-5 years. Ready for a refresh?

Book this week and get 15% off: {booking_link}
```

---

## Implementation Checklist

When building a new agent:

- [ ] Define trigger (time-based, event-based, or manual)
- [ ] List required skills
- [ ] Write message templates
- [ ] Define success criteria
- [ ] Add on/off toggle in admin
- [ ] Add test button
- [ ] Set up logging/tracking
- [ ] Document in this file

---

## Notes

- All times should use Houston timezone (America/Chicago)
- SMS should be under 160 characters when possible (avoid splitting)
- Always include opt-out option for marketing messages
- Track response rates to optimize timing
- A/B test message variations

---

*Last updated: January 2026*
*Document created for ClearAir Solutions*
