# টেস্ট রিপোর্ট — Muqsit Health System

তারিখ: ২০২৬-১০-০২ · Branch: `test/full-suite` (push হয়নি, তাই deploy হয়নি)
নকশা: `docs/superpowers/specs/2026-10-02-test-strategy-design.md`

## ১. সারসংক্ষেপ

- আগে শুধু unit টেস্ট ছিল (server ২৫৬, client ৯৪৬)। এখন ছয় স্তরের টেস্ট আছে, মোট **১,৭৪০টি** স্বয়ংক্রিয় টেস্ট।
- সব টেস্ট সবুজ, এবং বারবার চালিয়ে কোনো অস্থির (flaky) টেস্ট পাওয়া যায়নি।
- টেস্টে **৬টি আসল ত্রুটি** ধরা পড়েছে। কোনোটিই ঠিক করা হয়নি; প্রতিটি টেস্টে "জানা ত্রুটি" হিসেবে চিহ্নিত এবং নিচে সিদ্ধান্তের জন্য তালিকাভুক্ত। সবচেয়ে গুরুতর: **taper ভুল ওষুধের নিচে রেকর্ড হওয়া (D3)**।
- Production ডাটাবেসে একটি টেস্টও চলেনি। সব ডাটাবেস-নির্ভর টেস্ট Docker-এর অস্থায়ী Postgres-এ চলে এবং অন্য কোনো ডাটাবেস পেলে চলতে অস্বীকার করে।

## ২. ফলাফল

| স্তর | টেস্ট | ফল | কোথায় |
|---|---|---|---|
| Server unit | ২৫৬ | সব পাস | `server/src/**/*.spec.ts` |
| Server integration + contract + regression | ২২২ | সব পাস | `server/test/*.int-spec.ts` |
| Client unit + property + snapshot + regression | ১,২৪৮ | সব পাস (৫টি জানা ত্রুটি চিহ্নিত) | `client/src/**/*.test.ts(x)` |
| E2E (browser) | ১৪ | ১২ পাস, ১ জানা ত্রুটি, ১ ঐচ্ছিক probe | `e2e/tests/` |
| Load (k6) | ৬ scenario | error ০% | `load/` |

টাইপচেক (server, client) পরিষ্কার। Server-এর আসল build চালিয়ে `dist/main.js` যাচাই করা হয়েছে।

## ৩. বারোটি বিষয় — কী করা হয়েছে

| # | বিষয় | কাজ |
|---|---|---|
| 1 | Unit | Client-এ ৬টি নতুন ফাইল, ১১১ টেস্ট (`api`, `investigationSummary`, `numericInvSeries` ইত্যাদি, আগে ০% ছিল) |
| 2 | Integration | আসল Nest app + আসল Postgres: auth (২৪), access matrix (৬৫), DTO (৫৪), prescription (২৪), IPD analogue (১৬) |
| 3 | E2E | Playwright: login, নতুন রোগী → ℞ → Save & print, reload-এ পুনরুদ্ধার, দুই practice-এর বিচ্ছিন্নতা, print layout |
| 4 | Test double | `FakeMailService` (OTP ধরে), rate-limit stub, client-এ `apiStub` (অপ্রত্যাশিত অনুরোধে ফেল করে) |
| 5 | Flaky | `scripts/test-repeat.mjs`; integration ×৩, server ×২, client ×২, E2E ×৩ — অস্থির ০টি |
| 6 | Coverage | নিচের টেবিল; আজকের মান ন্যূনতম সীমা হিসেবে বসানো, যাতে আর না কমে |
| 7 | Fixtures | Server: doctor / assistant / supervisor / patient factory; client: `src/test/fixtures.ts` |
| 8 | Property | fast-check, ১১টি ফাইল, ১১২ টেস্ট: তারিখ, বয়স, ℞ লাইন সরানো, drug history, HTML পরিষ্কার |
| 9 | Snapshot | ছাপা prescription-এর ৩টি পূর্ণ snapshot (ছোট, ৮-ওষুধ, privacy copy) |
| 10 | Contract | route ⇄ `docs/API.md`; client-এর ৩৭টি payload ⇄ server DTO; অরক্ষিত route-এর তালিকা pin করা |
| 11 | Load | k6: login, medicine search, রোগী খোঁজা, prescription save, মিশ্র, stress |
| 12 | Regression | সাম্প্রতিক review fix-গুলোর যেগুলোতে টেস্ট ছিল না: server ২২, client ৭৫ টেস্ট |

## ৪. Coverage

| | আগে | এখন |
|---|---|---|
| Server, শুধু unit | ২৫.৫% লাইন | ২৫.৫% (unit টেস্ট বাড়ানো হয়নি) |
| Server, integration টেস্ট দিয়ে | মাপা হতো না | **৭০.৯% লাইন**, ৪৯.১% branch |
| Client, সব মিলিয়ে | ৩৮.৬% লাইন | **৪৮.৩% লাইন**, ৭৯.৫% branch |
| Client `src/lib` (clinical logic) | ৭৮.৭% | **৯০.৯%** |
| Client `src/hooks` | ২০.০% | ২০.০% (হাত দেওয়া হয়নি) |

Coverage লক্ষ্য নয়, রক্ষাকবচ: শতাংশ বাড়ানোর জন্য টেস্ট লেখা হয়নি, ঝুঁকি ধরে লেখা হয়েছে।

## ৫. পাওয়া ত্রুটি — আপনার সিদ্ধান্ত দরকার

| # | গুরুত্ব | ত্রুটি | কোথায় |
|---|---|---|---|
| D3 | **উচ্চ** | একই ওষুধের একই লাইন pad-এ দুইবার থাকলে এবং দ্বিতীয়টির নিচে taper থাকলে, Drug history-তে taper-টা মাঝের অন্য ওষুধের নিচে বসে | `client/src/lib/rxDrugHistory.ts:71-73` |
| E1 | **উচ্চ** | ℞ pad-এ দ্রুত টাইপ করলে editor মাঝে মাঝে crash করে ("Maximum update depth exceeded"); প্রায় ২৫ বারে ৩ বার। কারণ অনিশ্চিত | `client/src/components/prescription/MedicinePad.tsx:353` |
| E2 | মাঝারি | রোগী না বেছেও Tab চেপে editor-এ লেখা যায়; gate শুধু mouse আটকায়। Save বন্ধ থাকে | `PatientGate.tsx` |
| D2 | নিম্ন | ১৯৭০-এর আগের তারিখের finding তারিখহীন entry-রও পরে বসে | `client/src/lib/investigationOrder.ts:34-50` |
| D4 | নিম্ন | টেবিল paste করলে `sanitizeHtml` দুইবারে দুই রকম ফল দেয় (শুধু layout) | `client/src/lib/safeHtml.ts:57-62` |
| D1 | সুপ্ত | দুই অঙ্কের বছর ২০৯৫-এর পর ভুল শতাব্দী দেবে | `client/src/lib/dateInput.ts:22-24` |

### স্থাপত্যগত পর্যবেক্ষণ (ত্রুটি নয়, ঝুঁকি)

1. **Mobile দিয়ে রোগী খোঁজায় index নেই।** প্রতি খোঁজে পুরো `Patient` টেবিল পড়া হয়। রোগী বাড়লে ধীর হবে। প্রস্তাব: `Patient(mobile)`-এ additive index।
2. **Medicine search সবসময় পুরো টেবিল পড়ে।** ৩০,০০০ কৃত্রিম সারিতে ৯৪ ms; trigram index-এ ০.৫ ms। ২ অক্ষরের খোঁজে trigram কাজ করে না, আলাদা নকশা লাগবে।
3. **`POST /api/patients`:** client-এর type-এ ১০টি field আছে যা create DTO-তে নেই। এখন কেউ পাঠায় না, তাই ডাটা হারাচ্ছে না; ভবিষ্যতে পাঠালে নীরবে বাদ পড়বে।
4. **`POST /api/mirror/publish`-এ কোনো DTO নেই**, তাই body যাচাই হয় না।
5. **Medicine search-এ `%` ও `_` wildcard হিসেবে কাজ করে।** Injection নেই; ফল অপ্রত্যাশিত।
6. **টেস্ট deploy আটকায় না।** `.github/workflows/test.yml` শুধু pull request-এ চলে। Production-grade হতে হলে deploy-কে এই টেস্টের ওপর নির্ভরশীল করা উচিত — এটা আপনার সিদ্ধান্ত।

### নথি বনাম কোড

- **Supervisor কি রোগীর রেকর্ড বদলাতে পারবে?** `server/CLAUDE.md`-এর টেবিল বলে পারবে; কোড 403 দেয় এবং মন্তব্যে বলে এটা ইচ্ছাকৃত। টেস্টে কোডের (কঠোর) আচরণ pin করা। **সিদ্ধান্ত দরকার।**
- ঠিক করা হয়েছে: refresh grace window ৩০ → ১০ সেকেন্ড + একই User-Agent শর্ত; gallery-র সীমা ২০০ → ২০,০০০।
- এখনো নথিতে নেই: অন্য ডাক্তারের prescription থাকলে patient DELETE 409 দেয়।

## ৬. Load-এর ফল (ল্যাপটপ + Docker)

| কাজ (২০ জন) | অনুরোধ/সে. | Error | p95 |
|---|---|---|---|
| Login | ১৩ | ০% | ৭০৭ ms |
| Medicine search | ৩০–৩৯ | ০% | ২১৮–৬০৬ ms |
| রোগী খোঁজা | ২৮–৩৭ | ০% | ২৭৭–৭৭৮ ms |
| Prescription save | ১৪ | ০% | ৪৭৪ ms |
| মিশ্র | ২৯ | ০% | ২০২–২১২ ms |

Stress: ৫০ জনে সর্বোচ্চ ১৩০–১৬৫ অনুরোধ/সে.; ১০০ জনে p95 ০.৮–১.৫ সেকেন্ড, error ০%।

এগুলো ভিত্তিরেখা, VPS-এর ক্ষমতা নয়। একই scenario দুইবারে p95 তিন গুণ পর্যন্ত ওঠানামা করেছে।

## ৭. যা যাচাই করা হয়নি

- **Schema drift:** production আর test DB-র schema মেলানোর script (`server/scripts/schema-drift.js`, শুধু পড়ে) লেখা আছে, কিন্তু SSH tunnel বন্ধ থাকায় চলেনি। এটা না চলা পর্যন্ত integration টেস্ট `schema.prisma` যাচাই করে, production-এর আসল টেবিল নয়।
- **Regression টেস্ট** fix উল্টে দিয়ে চালানো হয়নি; diff পড়ে লেখা।
- **দুটি race টেস্ট** সম্ভাবনাভিত্তিক: lock সরালে প্রতিবার ফেল নাও করতে পারে।
- **E2E-তে নেই:** gallery snapshot upload, browser-এর print dialog, mobile layout, assistant login।
- **OPD-র মধ্যরাতের দিন-বদল** এই মেশিনে (timezone Dhaka) যাচাই করা যায় না।
- **CI workflow** লেখা হয়েছে, GitHub-এ চালানো হয়নি।
- **Admin অ্যাপ:** কোনো টেস্ট নেই।

## ৮. Production-grade হতে আরও যা লাগবে (অগ্রাধিকার অনুযায়ী)

1. D3 ও E1 ঠিক করা।
2. Tunnel চালু করে schema drift চালানো।
3. Deploy-কে টেস্টের ওপর নির্ভরশীল করা।
4. VPS-এর মতো staging server — আসল load ক্ষমতা আর migration মহড়ার জন্য।
5. `Patient(mobile)` index; medicine search-এর index নকশা।
6. Backup থেকে restore-এর মহড়া (এখন পর্যন্ত কখনো যাচাই হয়নি বলে ধরে নিচ্ছি)।
7. Admin অ্যাপ ও `src/hooks`-এর টেস্ট; mutation testing দিয়ে regression টেস্টের শক্তি যাচাই।

## ৯. কীভাবে চালাবেন

```bash
docker compose -f docker-compose.test.yml up -d
cd server && npm run test:db && npm run test:int
cd server && npm test
cd client && npm run test:cov
cd e2e && npx playwright test
node scripts/test-repeat.mjs int 3
```

Load: `load/README.md` দেখুন।
