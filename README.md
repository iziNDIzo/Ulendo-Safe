# Ulendo Safe - AI Guardian for Malawi Transport

**Live Demo:** https://ulendo-safe.onrender.com
*Note: Free Render tier sleeps after inactivity, please allow 50 seconds on first load, then click Verify Good.*

**GitHub:** https://github.com/iziNDIzo/Ulendo-Safe
**Lablab:** AMD AI Academy Challenge - Built in Lilongwe, Malawi

> Built for AMD Developer Cloud (MI300X + ROCm) - Llama 4 Maverick-ready via vLLM, demo runs with Groq fallback for 2G Malawi.

## Problem
Over 70% of people in Malawi rely on Kabaza motorbikes and informal car taxis with zero verification. Passengers are robbed by thugs posing as drivers, and drivers are robbed and killed by thugs posing as customers. Both sides ride blind. A breakdown at night leaves them stranded with no mechanic and no police.

## Solution - WhatsApp + QR Trust
Ulendo Safe is a WhatsApp-first AI safety agent. No app download, low-data, works in Chichewa and English.

1. **Two-way Verification:** Passenger types `verify KBA-4521` to check bike/taxi. Driver types `check C-8891 to Manja` to check customer. Returns Green / Yellow / Red risk.
2. **AI SOS Triage:** Send `SOS` or say `Ndithandizeni` - triggers GPS alert to trusted contacts and nearby riders.
3. **Breakdown Rescue:** Tap `breakdown near Area 25` - finds nearest verified mechanic, fuel station or police with price and one-tap call.
4. **Community Reports:** `report KBA-9999 robbery Ndirande` - 2+ reports = Red flag.

Test on Live Demo:
- `verify KBA-4521` = ✅ VERIFIED (good driver)
- `verify KBA-9999` = 🚨 DO NOT BOARD (reported thug)
- `check C-8891 to Manja 11pm` = Llama Risk MEDIUM
- `SOS ndithandizeni` = SOS received
- `breakdown car taxi near Area 25 tyre burst` = nearest help

## Tech Stack
- **Frontend:** WhatsApp-style demo UI in `public/index.html`
- **Backend:** Node.js + Express `server.js` - `/api/chat` for demo, `/webhook` ready for WhatsApp Cloud API
- **Database:** Supabase (operators, customers, trips, reports, sos_alerts, helpers)
- **AI:** Llama 4 Maverick-ready, Llama 3.3 70B via Groq for risk scoring + SOS triage, NLLB for Chichewa
- **Infra:** Render Free + Supabase Free, designed for AMD MI300X + ROCm with vLLM

## Run Locally
```bash
npm install
node server.js
# open http://localhost:3000
