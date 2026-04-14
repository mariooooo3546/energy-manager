# Energy Manager — Dokumentacja projektowa

**Data:** 2026-04-14
**Status:** Zatwierdzony

## 1. Cel projektu

Aplikacja automatycznie zarządzająca domowym magazynem energii (falownik hybrydowy Deye) w oparciu o dynamiczne ceny energii z Pstryk. Maksymalizuje zysk poprzez:
- Ładowanie baterii z sieci gdy energia jest tania
- Sprzedaż energii do sieci gdy cena jest wysoka
- Utrzymanie self-consumption w pozostałych godzinach

## 2. Architektura

```
┌──────────────────────────────────────────┐
│        Energy Manager (Node.js/TS)       │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Pstryk   │ │ Deye     │ │ Decision │ │
│  │ Client   │ │ Cloud    │ │ Engine   │ │
│  │ (HTTP)   │ │ Client   │ │          │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       └─────────────┴────────────┘       │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Scheduler│ │ Telegram │ │ Dashboard│ │
│  │ (cron)   │ │ Bot      │ │ (Next.js)│ │
│  └──────────┘ └──────────┘ └──────────┘ │
└──────────────────────────────────────────┘
        │                │
        ▼                ▼
   Pstryk API      Deye Cloud API
   (HTTPS)         (HTTPS EU)
```

### Stack technologiczny

- **Runtime:** Node.js + TypeScript
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Wykresy:** Recharts
- **Telegram:** node-telegram-bot-api
- **Scheduler:** node-cron
- **Deploy lokalny:** node / npm run dev
- **Deploy docelowy:** Vercel (serverless + Vercel Cron)

## 3. Integracje zewnętrzne

### 3.1 Pstryk API

- **Base URL:** `https://api.pstryk.pl/integrations/`
- **Docs:** https://api.pstryk.pl/integrations/swagger/
- **Auth:** Header `Authorization: <api_token>`
- **Endpoint:** `GET /meter-data/unified-metrics/?metrics=pricing&resolution=hour&window_start=...&window_end=...`
- **Dane:** cena kupna (`price_gross`), cena sprzedaży (`price_prosumer_gross`), flagi `is_cheap`/`is_expensive`
- **Częstotliwość:** ceny godzinowe, znane z góry na następny dzień

### 3.2 Deye Cloud API

- **Base URL:** `https://eu1-developer.deyecloud.com/v1.0`
- **Docs:** https://developer.deyecloud.com/api
- **Auth:** Token via `POST /account/token?appId={appId}` (SHA-256 hashed password), token ważny 60 dni
- **Wymagane credentials:** appId, appSecret, email, password

#### Endpointy odczytu

| Endpoint | Opis |
|---|---|
| `GET /device/latest` | SOC baterii, moc, produkcja PV |
| `GET /config/battery` | Konfiguracja baterii |
| `GET /config/system` | Konfiguracja systemu |
| `GET /config/tou` | Harmonogram TOU |

#### Endpointy sterowania

| Endpoint | Opis | Parametry |
|---|---|---|
| `POST /order/battery/modeControl` | Ładowanie z sieci ON/OFF | `batteryModeType: "GRID_CHARGE"`, `action: "on"/"off"` |
| `POST /order/sys/solarSell/control` | Sprzedaż do sieci ON/OFF | `action: "on"/"off"` |
| `POST /order/sys/workMode/update` | Tryb pracy | `workMode: "SELLING_FIRST" / "ZERO_EXPORT_TO_LOAD" / "ZERO_EXPORT_TO_CT"` |
| `POST /order/sys/energyPattern/update` | Priorytet energii | `energyPattern: "BATTERY_FIRST" / "LOAD_FIRST"` |
| `POST /order/sys/tou/update` | Harmonogram TOU + min SOC | Sloty czasowe z parametrami |
| `POST /order/sys/power/update` | Max moc sprzedaży | `maxSellPower` (W, 0-20000) |

## 4. Logika decyzyjna (Decision Engine)

### Cykl co godzinę

1. Pobierz ceny z Pstryk (bieżąca + następne godziny)
2. Pobierz stan falownika z Deye Cloud (SOC, moc)
3. Oblicz progi cenowe (kwartyle z cen na cały dzień)
4. Podejmij decyzję:

```
JEŚLI cena_kupna ∈ DOLNY_KWARTYL I SOC < 90%:
    → ŁADUJ Z SIECI
    → grid charge ON, target SOC 90-100%

JEŚLI cena_sprzedaży ∈ GÓRNY_KWARTYL I SOC > 20%:
    → SPRZEDAJ
    → work mode SELLING_FIRST, solar sell ON

W PRZECIWNYM RAZIE:
    → TRYB NORMALNY
    → grid charge OFF, self-consumption
```

5. Wyślij komendy do Deye Cloud
6. Zapisz decyzję do logu
7. Wyślij powiadomienie Telegram

### Parametry konfigurowalne (.env)

- `PRICE_LOW_PERCENTILE` — próg taniej energii (domyślnie: 25)
- `PRICE_HIGH_PERCENTILE` — próg drogiej energii (domyślnie: 75)
- `MIN_SOC_SELL` — minimalny SOC do sprzedaży (domyślnie: 20%)
- `MAX_SOC_CHARGE` — maksymalny SOC ładowania (domyślnie: 90%)
- `CRON_INTERVAL` — częstotliwość sprawdzania (domyślnie: co godzinę, minuta 55)

## 5. Dashboard (Next.js)

### Widoki

- **Status** — aktualny SOC (progress bar), tryb pracy, bieżące ceny kupna/sprzedaży
- **Wykres cen 24h** — słupki kupno/sprzedaż z zaznaczeniem bieżącej godziny (Recharts)
- **Log decyzji** — tabela z historią: czas, decyzja, SOC, cena, powód
- **Override** — przycisk do ręcznego wymuszenia trybu (opcjonalnie)

### API Routes

| Route | Opis |
|---|---|
| `GET /api/status` | Aktualny stan (SOC, tryb, ceny) |
| `GET /api/prices` | Ceny na dziś i jutro |
| `GET /api/history` | Historia decyzji |
| `POST /api/override` | Ręczne wymuszenie trybu |

## 6. Bot Telegram

### Komendy

| Komenda | Opis |
|---|---|
| `/status` | SOC, tryb, aktualna cena |
| `/ceny` | Ceny na dziś + jutro |
| `/laduj <SOC>` | Ładuj z sieci do podanego SOC% |
| `/sprzedaj` | Włącz sprzedaż |
| `/rozladuj <SOC>` | Rozładuj do podanego SOC% |
| `/auto` | Wróć do trybu automatycznego |
| `/log` | Ostatnie 5 decyzji |

### Powiadomienia push

- Zmiana trybu (ładowanie/sprzedaż/normalny)
- Cena poniżej/powyżej progów
- Błędy połączenia z API

### Zabezpieczenia

- Bot odpowiada tylko na skonfigurowany `TELEGRAM_CHAT_ID`
- Tryb polling (nie webhook) — prostsze lokalnie

## 7. Struktura projektu

```
energy-manager/
├── src/
│   ├── clients/
│   │   ├── pstryk.ts          # Klient Pstryk API
│   │   └── deye.ts            # Klient Deye Cloud API
│   ├── engine/
│   │   └── decision.ts        # Logika decyzyjna
│   ├── telegram/
│   │   └── bot.ts             # Bot Telegram
│   ├── scheduler/
│   │   └── cron.ts            # Scheduler godzinowy
│   └── lib/
│       ├── types.ts           # Typy TS
│       └── logger.ts          # Logger decyzji (JSON file)
├── app/                       # Next.js App Router
│   ├── page.tsx               # Dashboard
│   ├── api/
│   │   ├── status/route.ts
│   │   ├── prices/route.ts
│   │   ├── history/route.ts
│   │   └── override/route.ts
│   └── layout.tsx
├── .env.local                 # Klucze API (nie commitować)
├── .env.example               # Szablon zmiennych
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

## 8. Zmienne środowiskowe (.env.local)

```env
# Pstryk
PSTRYK_API_KEY=

# Deye Cloud
DEYE_APP_ID=
DEYE_APP_SECRET=
DEYE_EMAIL=
DEYE_PASSWORD=
DEYE_DEVICE_SN=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Decision Engine
PRICE_LOW_PERCENTILE=25
PRICE_HIGH_PERCENTILE=75
MIN_SOC_SELL=20
MAX_SOC_CHARGE=90
CRON_SCHEDULE=55 * * * *
```

## 9. Fazy wdrożenia

### Faza 1 — Lokalna (MVP)
- Klienty Pstryk + Deye Cloud
- Decision Engine z prostą logiką kwartylową
- Scheduler (node-cron)
- Bot Telegram (komendy + powiadomienia)
- Dashboard (Next.js lokalnie)

### Faza 2 — Vercel
- Migracja schedulera na Vercel Cron
- API routes jako serverless functions
- Dashboard na Vercel
- Telegram webhook zamiast polling

### Faza 3 — Rozszerzenia (opcjonalne)
- Prognoza produkcji PV (forecast.solar / solcast)
- Historia zużycia i uczenie się wzorców
- Profit Maximizer (uwzględnia wartość energii w baterii)
- Multi-day optimization (planowanie na kilka dni do przodu)
