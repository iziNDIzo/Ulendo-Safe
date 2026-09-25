# Ulendo Safe 🇲🇼 - AI Guardian + QR Trust for Kabaza & Taxi

> Built on **AMD Developer Cloud (MI300X + ROCm)** + **Llama 4**

### Problem
In Malawi, Kabaza & taxi passengers have no way to verify if a driver is legit. When breakdown happens at night, they are stranded with no mechanic, no police.

### Solution - WhatsApp + QR Trust
**Ulendo Safe has 2 guardians:**

**1. QR Verification (Trust Layer)**
- Every driver gets a unique Ulendo Safe QR
- Passenger scans QR before boarding -> instant WhatsApp verification: photo, name, plate, verified status, trip count
- Customer also has QR - driver scans to verify passenger
- Fake plates / unregistered bikes blocked instantly
- Llama 4 checks behavior + reports

**2. Breakdown Rescue (Safety Layer)**
- Driver sends "BREAKDOWN" + live location
- Llama 4 on AMD finds nearest verified mechanic + police + rescue taxi via OpenStreetMap
- Sends help in Chichewa / Chitumbuka / English
- Guardian Angel Mode: live location to family until safe
- SOS & Fake Trip Detection

### Tech Stack
- AMD Developer Cloud (MI300X), AMD ROCm, Llama 4
- QR verification system, NLLB-200 (Chichewa), WhatsApp Cloud API, Python FastAPI, Qdrant

### Impact
Builds trust + safety for 50k+ riders in Lilongwe. Works on low data, WhatsApp only.

### Demo
GitHub: this repo | Video: coming | WhatsApp: coming
