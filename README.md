# 🧅 Cebula Energy Manager

> **Inteligentne zarządzanie domowym magazynem energii** — automatyczna sprzedaż z baterii w godzinach drogich, magazynowanie w tanich, prognoza PV i pełna kontrola z przeglądarki i Telegrama.

Aplikacja dla prosumentów z falownikiem **Deye** (hybrid, 8–12 kW), taryfą dynamiczną **Pstryk** i baterią LiFePO₄. Optymalizuje arbitraż energetyczny — kupuje, gdy prąd jest tani (lub ujemny), sprzedaje, gdy drogo. Bez klikania. 24/7.

---

## ✨ Co potrafi

| Funkcja | Opis |
|---|---|
| 🕒 **Harmonogram godzinowy** | Ustaw dla każdej godziny doby docelowy SOC baterii. System automatycznie przełącza tryb falownika (`SELLING_FIRST` / `ZERO_EXPORT_TO_LOAD`) i rozładowuje do celu. |
| 💰 **Integracja z Pstryk API** | Pobiera ceny spot co godzinę, widoczne jako wykres z oznaczoną aktualną godziną. |
| ☀️ **Prognoza produkcji PV** | Solcast (dokładne) lub forecast.solar (darmowe) — z pasmami P10/P90 dla oceny niepewności. |
| 📊 **Dashboard w czasie rzeczywistym** | SOC, przepływy mocy (PV/sieć/bateria/load), tryb pracy, ceny kupna/sprzedaży, historia decyzji, licznik zarobków. |
| 🤖 **Telegram bot** | `/status`, `/sprzedaj`, `/laduj`, `/normal` — zarządzanie bez wchodzenia na dashboard. |
| ⚡ **Ręczny override** | Przycisk "Sprzedaj teraz / Ładuj / Reset". Idzie natychmiast do falownika. |
| 🔐 **Fail-safe** | Jeśli scheduler się wywali, falownik zostaje w bezpiecznym trybie `ZERO_EXPORT_TO_LOAD` (samozasilanie, brak eksportu z baterii). |

---

## 🏗️ Jak to działa

```
┌──────────────┐     co godz.     ┌──────────────┐
│ Vercel Cron  ├─────────────────→│ /api/cron    │
└──────────────┘                  └──────┬───────┘
                                         ↓
                            ┌────────────────────────┐
                            │  Scheduler (runCycle)  │
                            └──────────┬─────────────┘
                                       ↓
            ┌──────────────────────────┴──────────────────────────┐
            │                                                     │
            ↓                                                     ↓
┌───────────────────────┐                         ┌────────────────────────┐
│ 1. Override aktywny?  │ tak → wykonaj           │  Brak overrideu        │
└───────────────────────┘                         └───────────┬────────────┘
                                                              ↓
                                         ┌─────────────────────────────────┐
                                         │ 2. Harmonogram na tę godzinę?   │
                                         └───┬────────────────────────┬────┘
                                         tak │                        │ nie
                                             ↓                        ↓
                           ┌───────────────────────────┐   ┌─────────────────────────┐
                           │ SOC > cel → SELLING_FIRST │   │ ZERO_EXPORT_TO_LOAD     │
                           │ SOC ≤ cel → trzymaj       │   │ (samozasilanie)         │
                           └───────────────────────────┘   └─────────────────────────┘
```

### Przykład dnia z harmonogramem peak-hour

```
18:00 → cel SOC = 90%    (drogi peak, sprzedaj nadwyżkę nad 90%)
19:00 → cel SOC = 40%    (szczyt cen, rozładuj do 40%)
20:00 → cel SOC = 35%    (nadal drogi)
21:00 → cel SOC = 35%    (trzymaj, jeśli już na 35%)
22:00 → brak wpisu       (cena spada, samozasilanie)
00–11 → brak wpisów      (ładuj z PV w dzień, nie dotykaj)
```

---

## 🛠️ Stack techniczny

- **Next.js 16** (App Router, React 19)
- **Vercel** — hosting + cron scheduler (`0 * * * *`)
- **Redis** — persistent state (harmonogram, override, logi decyzji)
- **Deye Cloud API** — sterowanie falownikiem
- **Pstryk API** — ceny dynamiczne
- **Solcast / forecast.solar** — prognoza produkcji PV
- **Telegram Bot API** — powiadomienia + sterowanie
- **Tailwind CSS 4** — UI
- **Vitest** — testy jednostkowe

---

## 🚀 Uruchomienie lokalne

```bash
# Klonuj
git clone https://github.com/mariooooo3546/energy-manager.git
cd energy-manager

# Zależności
npm install

# Skonfiguruj env
cp .env.example .env.local
# Uzupełnij: PSTRYK_API_KEY, DEYE_*, PV_LAT/PV_LON, TELEGRAM_*, REDIS_URL

# Dev
npm run dev
# → http://localhost:3000
```

### Wymagane zmienne środowiskowe

| Zmienna | Do czego | Gdzie wziąć |
|---|---|---|
| `PSTRYK_API_KEY` | Ceny dynamiczne | [pstryk.pl](https://pstryk.pl) → konto |
| `DEYE_APP_ID`, `DEYE_APP_SECRET` | API falownika | [developer.deyecloud.com](https://developer.deyecloud.com) |
| `DEYE_EMAIL`, `DEYE_PASSWORD`, `DEYE_DEVICE_SN` | Konto Solarman + SN falownika | aplikacja Solarman Smart |
| `PV_LAT`, `PV_LON` | Lokalizacja dla prognozy PV | współrzędne instalacji |
| `REDIS_URL` | Baza stanu | [Redis Cloud](https://redis.com) (free tier OK) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot (opcjonalnie) | [@BotFather](https://t.me/BotFather) |
| `SOLCAST_API_KEY`, `SOLCAST_SITE_ID` | Prognoza PV (opcjonalnie) | [solcast.com](https://solcast.com) free tier |

Pełna lista w [.env.example](.env.example).

---

## 📈 ROI (przykład — 10 kWp + 15 kWh bateria, taryfa Pstryk)

Wiosna 2026, typowy dzień:
- **Bez managera**: kupno całodobowe po uśrednionej cenie ~0.65 zł/kWh, brak sprzedaży z baterii
- **Z managerem**: sprzedaż ~12 kWh dziennie w oknie 18–21 po 0.80–1.10 zł/kWh → **+8–12 zł/dobę**
- Roczna oszczędność: **~2500–4000 zł** (w zależności od zużycia i wielkości instalacji)

*Zwrot z inwestycji w napisanie tego softu ≈ 1 weekend.*

---

## 🗺️ Roadmap

- [x] Scheduler z harmonogramem godzinowym
- [x] Integracja Deye / Pstryk / Solcast
- [x] Dashboard + Telegram
- [x] Wsparcie strefy czasowej (Europe/Warsaw na Vercel UTC)
- [ ] **Integracja go-e Charger** — inteligentne ładowanie EV (PV surplus + cheap hours)
- [ ] ML prognoza zużycia (N poprzednich dni, godzina tygodnia)
- [ ] Multi-dzień planowanie (optimize across 48h)
- [ ] Wsparcie innych falowników (Growatt, Solax)

---

## ⚠️ Disclaimer

Projekt hobbistyczny, **bez gwarancji**. Sterowanie falownikiem przez Deye Cloud API — jeśli chmura padnie, falownik idzie w tryb safe (ZERO_EXPORT_TO_LOAD). Testowany na: Deye **SUN-12K-SG04LP3-EU**, Pylontech Force H2, taryfa Pstryk. Używasz na własną odpowiedzialność.

Nie odpowiadam za utracony przychód z nieopłacalnych sprzedaży ani za Twoje gapienie się o 18:00 w wykres cen.

---

## 📄 Licencja

MIT — zobacz [LICENSE](LICENSE).

Autor: [Mariusz Labudda](https://github.com/mariooooo3546) · Kod współtworzony z [Claude](https://claude.ai).
