# Muqsit Health System — Code map

Where each thing lives, so that nobody has to walk the tree to find it. Derived from the code on 2026-11-15 (`dev` @ 9be6e72); paths are relative to the repo root. How the pieces work together is in [ARCHITECTURE.md](ARCHITECTURE.md); what must and must not be done when changing them is in [`rules/`](rules/README.md); the map of all the documentation is [README.md](README.md).

Three apps, each with its own `package.json`: `server/` (NestJS 10 + Prisma 5, :4000, `/api`), `client/` (Next.js 14 doctor app, :3000), `admin/` (Next.js 14, :3001). The root only orchestrates them.

**Keep it current:** a new module, tab, Settings page, family of hooks or test layer gets its line here in the same commit. The counts in §5 are a snapshot, not a contract. **Before changing anything listed here,** read the rules file for it — the `CLAUDE.md` of the app names the file for each feature (§6 says where the code is; it does not say what the code must hold to).

## 1. Server (`server/src/`)

### Bootstrap

| File | What is configured there |
|---|---|
| `server/src/main.ts` | `NestFactory.create(AppModule)`, calls `configureApp`, listens on `PORT` (default 4000) |
| `server/src/app.setup.ts` | `configureApp()` — shared by `main.ts` and the integration tests: refuses a weak `JWT_SECRET` in production; `trust proxy` 1; global prefix `api`; `cookie-parser`; hand-written security headers (nosniff, `X-Frame-Options: DENY`, no-referrer, HSTS in prod); JSON + urlencoded body limit 8 MB; global `ValidationPipe({ whitelist: true, transform: true })`; CORS from `CORS_ORIGIN` (comma list, credentials) registered BEFORE static; static `uploads/` at `/uploads/` (365 d, immutable) |
| `server/src/app.module.ts` | `ConfigModule.forRoot({ isGlobal })`; `ThrottlerModule` 100 req/min/IP with `ThrottlerGuard` as `APP_GUARD`; imports all 31 domain modules |

Per-route throttles: `@Throttle` on `auth.controller.ts` (register / verify / resend / login / refresh).

### Cross-cutting pieces

| Piece | File | Notes |
|---|---|---|
| `JwtAuthGuard` | `server/src/auth/guards/jwt-auth.guard.ts` | `AuthGuard('jwt')` |
| JWT strategy | `server/src/auth/strategies/jwt.strategy.ts` | token read from the httpOnly access cookie (Bearer fallback) |
| `RolesGuard` + `@Roles()` | `server/src/auth/guards/roles.guard.ts`, `server/src/auth/decorators/roles.decorator.ts` | used as `@Roles('admin')` on `admin` and `admin/payment-requests` |
| `@CurrentUser()` | `server/src/auth/decorators/current-user.decorator.ts` | `AuthenticatedUser` from `req.user` |
| `WorkstationGuard` | `server/src/workstations/workstation.guard.ts` | reads `X-Workstation`; resolves via `WorkstationsService.resolve`; listed after `JwtAuthGuard` |
| `@WorkstationDoctorId()`, `@ActiveWorkstation()` | `server/src/workstations/workstation.decorator.ts` | practice doctorId / full workstation (role + permission keys) |
| `@ChamberHeader()` | `server/src/chambers/chamber.decorator.ts` | raw `X-Chamber` header |
| `MulterErrorFilter` | `server/src/uploads/multer-error.filter.ts` | multer errors → 4xx on `POST /uploads/image` |
| `PrismaService` / `PrismaModule` | `server/src/prisma/prisma.service.ts`, `prisma.module.ts` | single Prisma client |
| `ROW_LOCK_TX` | `server/src/prisma/row-lock.ts` | `{ maxWait: 10s, timeout: 30s }` for row-lock transactions (used in chambers, ipd, opd, patient-drug-safety, patients, prescriptions, sms) |

No interceptors are defined. Assistant permission checks are inline in controllers (`ws.permissions.includes(...)`: `prescriptions`, `drug-advice`, `patient-drug-safety`, `patient-files`, `patients`).

### Modules

Guards: J = `JwtAuthGuard`, W = `WorkstationGuard`, R = `RolesGuard`.

| Module | `@Controller` prefix(es) | Guards | Models / tables | Purpose |
|---|---|---|---|---|
| `activity` | `activity` | J W | ActivityLog | practice activity feed: list and log entries |
| `admin` | `admin` | J R(admin) | User (via UsersService/AuthService) | registrations: approve, reject, suspend, tier, delete, revoke sessions |
| `assistants` | `assistants` | J | Assistant, User | a doctor's assistants, their permissions and defaults |
| `auth` | `auth` | `me`: J; rest public + throttled | EmailOtp, RefreshToken (User via UsersService) | register, email OTP, login, refresh, logout, me |
| `chambers` | `chambers` | J W | Chamber, OpdChamber, OpdChamberLayout, PrescriptionLayout | OPD chambers and each chamber's print layout |
| `doctor-phrases` | `doctor-phrases` | J W | DoctorPhraseHabit, Prescription, ActivityLog | learned sidebar phrases; list and hide/pin |
| `drug-advice` | `drug-advice` | J W | DoctorDrugAdvice | doctor's special advice per medicine (℞ pad ••• box) |
| `ipd` | `ipd` | J W | IpdAdmission, IpdEvent, Patient, Ward | admissions, status, events, photographed analogue order sheets |
| `mail` | — (no controller) | — | — | `MailService` used by auth/admin |
| `medicines` | `medicines` | J | raw `medicines` table (`$queryRaw`) | medicine search and by-brand chart lookup |
| `mirror` | `mirror` | J | none (in-memory) | SSE device-mirror stream + publish |
| `opd` | `opd` | J W | OpdVisit, OpdDaySetting, Patient, SupervisedDraft | OPD queue by day: add, move, status, presence, schedule |
| `patient-chat` | `patients` (`:id/chat`, `:id/supervisors`); `supervised` | J W; `supervised`: J | PatientChatMessage, PatientSupervisor, SupervisedDraft, Patient, User | per-patient team chat, supervising doctors, supervised list |
| `patient-drug-safety` | `patients/:id/drug-safety` | J W | PatientDrugSafety, ActivityLog | drug hypersensitivity / high-alert entries, soft remove + restore |
| `patient-files` | `patients/:id/files` | J W | PatientFile, ActivityLog | permission documents and DICOM files, soft removal |
| `patient-notes` | `patient-notes` | J W | DoctorPatientNote | doctor's personal note per patient |
| `patients` | `patients` | J W | Patient, Prescription, SupervisedDraft, User | patient CRUD, lookup, link, drug-history append/edit, on-examination |
| `prescription-draft` | `prescription-draft` | J | PrescriptionDraft | the user's one-slot editor draft |
| `prescription-layout` | `prescription-layout` | J | PrescriptionLayout | doctor's print settings |
| `prescriptions` | `prescriptions` | J W | Prescription (+ items), Patient | save, list, get prescriptions; repeat-save detection (`repeat.ts`) |
| `prisma` | — (no controller) | — | — | PrismaService + `ROW_LOCK_TX` |
| `research` | `research` | J | Patient | research patient search (tab disabled in client) |
| `revision-notes` | `revision-notes` | J | DoctorRevisionNote | each user's own Revision Notes notebook |
| `rx-habits` | `rx-habits` | J W | DoctorRxHabit, Prescription, ActivityLog | learned "Your usual" lines; `all` feeds Add Bulk Medicine |
| `sms` | `opd/sms`, `sms`, `admin/payment-requests` | J W; admin: J R(admin) | SmsWallet, SmsLedger, SmsSendJob, PaymentRequest, User | OPD appointment SMS, wallet, ledger, payment requests |
| `statistics` | `statistics` | J W | raw SQL over `OpdVisit`, `Prescription` | visit counts per day/month/overall, disease statistics |
| `templates` | `prescription-templates` | J | PrescriptionTemplate | prescription templates CRUD |
| `uploads` | `uploads` | public (throttled globally) | disk `uploads/` | `POST /uploads/image`, magic-byte checked |
| `users` | `users` | J | User, Chamber, OtherCertificate, PatientChatMessage | own profile `GET/PATCH me` (incl. prefs, field recents) |
| `wards` | `wards` | J | Ward, IpdTeamMember, IpdAdmission, User | IPD wards and ward-team members |
| `workstations` | `workstations` | J | Assistant, User | workstations the user may act in; `resolve()` for the guard |

Helper files beside services: `opd/dhaka-day.ts`, `opd/pad-stage.ts`, `opd/queue-order.ts`, `opd/schedule.ts`; `patients/drug-history-edit.ts`, `patients/on-examination.ts`; `rx-habits/normalise.ts`, `rx-habits/rxLanguage.ts`; `doctor-phrases/normalise.ts`; `drug-advice/keys.ts`; `medicines/catalogue.ts`; `patient-drug-safety/lines.ts`; `sms/segments.ts`, `sms/appointment-message.ts`; `statistics/visit-stats.ts`. Unit specs `*.spec.ts` sit beside them.

### `server/prisma/`
- `schema.prisma` — 35 models:
  - Accounts: User, RefreshToken, EmailOtp, OtherCertificate, Assistant.
  - Practice settings: Chamber, PrescriptionLayout, PrescriptionTemplate, PrescriptionDraft, OpdChamber, OpdChamberLayout, OpdDaySetting.
  - Patient: Patient, PatientChatMessage, PatientSupervisor, SupervisedDraft, PatientDrugSafety, PatientFile, DoctorPatientNote.
  - Visits: OpdVisit, Prescription, PrescriptionItem, IpdAdmission, IpdEvent, Ward, IpdTeamMember.
  - Learned / notes: DoctorRxHabit, DoctorPhraseHabit, DoctorDrugAdvice, DoctorRevisionNote. Audit: ActivityLog.
  - SMS / billing: SmsWallet, SmsLedger, SmsSendJob, PaymentRequest.
  - `medicines` is NOT a model (raw table).
- `manual-*.sql` (39) — hand-applied, idempotent (`IF NOT EXISTS`, all 39) additive DDL, run with `prisma db execute`; no Prisma Migrate.
- `seed.ts` — upserts the first admin user from `ADMIN_SEED_*` env vars (`npm run seed`).

### `server/scripts/`
| Script | Purpose |
|---|---|
| `backfill-image-thumbs.js` | backfill `Patient.imageThumbs` (`--dry-run`) |
| `insert_missing_medicines.js` | one-off: insert missing rows into `medicines` |
| `parse_missing_medicines.py` | one-off: find trade names missing from `medicines` |
| `rebuild-doctor-phrases.js` | rebuild `DoctorPhraseHabit` from the record |
| `rebuild-rx-habits.js` | rebuild `DoctorRxHabit` from prescriptions (`--dry-run`) |
| `repair-localhost-image-urls.js` | repair image URLs stamped with `http://localhost:<port>` |
| `schema-drift.js` | read-only schema comparison production ⇄ test DB |
| `sms-test.ts` | SMS gateway spike / latency check |

### `server/test/` (integration, `jest-int.json`, `test/.*\.int-spec\.ts$`)
| Spec | Covers |
|---|---|
| `access.int-spec.ts` | patient access matrix (Rule 2) over HTTP |
| `auth.int-spec.ts` | login, refresh rotation, sessions |
| `contract-dto.int-spec.ts` | client payloads vs server DTO fields |
| `contract-routes.int-spec.ts` | served routes vs `docs/API.md`, public routes |
| `drug-history-append.int-spec.ts` | `POST /patients/:id/drug-history` appends |
| `drug-history-edit.int-spec.ts` | `PATCH /patients/:id/drug-history` |
| `dto-whitelist.int-spec.ts` | declared fields persist, undeclared dropped |
| `ipd-analogue.int-spec.ts` | IPD photographed order sheets |
| `medicines-by-brand.int-spec.ts` | `POST /medicines/by-brand` |
| `on-examination-append.int-spec.ts` | `POST /patients/:id/on-examination` |
| `opd-chambers.int-spec.ts` | per-chamber OPD lists, tokens, schedules |
| `opd-queue.int-spec.ts` | OPD queue booked per day |
| `patient-drug-safety.int-spec.ts` | `/patients/:id/drug-safety` |
| `prescriptions.int-spec.ts` | prescription save/read through real pipeline |
| `regression.int-spec.ts` | server fixes without end-to-end pin |
| `repeat-save.int-spec.ts` | resent save not filed twice |
| `revision-notes.int-spec.ts` | `GET/PUT /revision-notes` per user |
| `row-lock-wait.int-spec.ts` | writes wait behind row lock |
| `rx-habits-all.int-spec.ts` | `GET /rx-habits/all` (bulk list) |
| `rx-habits-bangla.int-spec.ts` | BAN and EN instruction are one habit |
| `smoke.int-spec.ts` | test harness refuses non-test DB |
| `sms-wallet.int-spec.ts` | day SMS and SMS wallet (fake gateway) |
| `statistics.int-spec.ts` | Settings → Statistics figures |
| `supervised-draft.int-spec.ts` | supervising doctor's parked visit |
| `uploads.int-spec.ts` | `POST /uploads/image` |

- `support/`: `app.ts` (real AppModule + `configureApp`, cookie jar per browser), `client-calls.ts` (reads `client/src/lib/api.ts` with the TS compiler; a path hole typed as a union of string literals is one call per value), `doubles.ts` (fake MailService), `env.ts` (jest `setupFiles`), `fixtures.ts` / `fixtures-clinical.ts`, `routes.ts` (route discovery, `findRoute`), `test-db.ts` (`assertTestDatabase`), `setup-db.js` (`npm run test:db`: creates DBs, `db push`, adds `medicines`), `medicines.sql`.
- `serve.ts` — real API on :4100 (or `TEST_PORT`) against a throwaway DB for e2e / k6 (`npm run test:serve`).
- `seed-e2e.ts` — seeds `muqsit_e2e_test`; `seed-load.ts` — seeds `muqsit_load_test`.

## 2. Client (`client/`)

### `client/app/` (App Router)
| Route file | Renders |
|---|---|
| `client/app/layout.tsx` | root layout: `Providers`, `paletteCss`, `THEME_BOOT_SCRIPT`, font preload, `globals.css` (server component) |
| `client/app/page.tsx` | redirects `/` → `/prescription` |
| `client/app/[tab]/page.tsx` | validates slug against `TAB_PATHS`, `<RequireAuth><Muqsit/>` |
| `client/app/settings/[section]/page.tsx` | validates against `SETTINGS_SECTION_SLUGS`, `<RequireAuth><Muqsit/>` |
| `client/app/login/page.tsx` | `RedirectIfAuthed` → `LoginPage` |
| `client/app/signup/page.tsx` | `RedirectIfAuthed` → `SignupPage` |
| `client/app/error.tsx` | "This screen stopped working" with Try again / Reload |
| `client/app/not-found.tsx` | 404 page linking to Prescription |

### The shell: URL → screen
1. `client/src/components/layout/tabs.ts` — `TABS`, `TRAILING_TABS`, `MOBILE_TABS`, `TAB_PATHS`, `tabFromPath()`, `SETTINGS_SECTION_SLUGS`, `HEADER_TABS`, `isPrescriptionGroup()`.
2. `client/src/components/Muqsit.tsx` — wraps in `MuqsitProvider`, runs `useMigrateLocalData`, mounts `ChamberSync`, `WorkstationSwitcher`, `DeviceMirror`; picks `DesktopShell` or `MobileShell`.
3. `client/src/components/layout/DesktopShell.tsx` / `MobileShell.tsx` — `activeTab === "prescription"` → `PrescriptionView`, else `TabRouter`.
4. `client/src/components/TabRouter.tsx` — switch on `activeTab`:

| TabId | URL | Component |
|---|---|---|
| `prescription` | `/prescription` | `components/prescription/PrescriptionView.tsx` (via shell) |
| `opd` | `/opd` | `components/tabs/OpdView.tsx` |
| `ipd` | `/ipd` | `components/tabs/IpdView.tsx` |
| `patients` | `/patients` | `components/tabs/PatientsView.tsx` |
| `message` ("Supervised") | `/message` | `components/tabs/MessageView.tsx` |
| `research` (disabled) | `/research` | inline `ComingSoon` |
| `settings` | `/settings`, `/settings/<slug>` | `components/tabs/SettingsView.tsx` |
| `revision` | `/revision-notes` | `components/tabs/RevisionNotesView.tsx` |
| `pt-settings` | `/patient-settings` | `components/tabs/PatientSettingsView.tsx` |
| `idsp` | `/health-monitoring` | `components/tabs/HealthMonitoringView.tsx` |
| `pt-records` | `/patient-records` | `components/prescription/PatientRecordsView.tsx` |

Settings sections (`SettingsView.tsx`): `profile` → `ProfileSettingsView`, `payment` → `PaymentSettingsView`, `statistics` → `StatisticsView`, `assistants` → `ManageAssistantsView`, `chambers` → `ChambersSettingsView`, `prescription-settings` → `PrescriptionSettingsView`, `prescription-templates` → `PrescriptionTemplatesView`, `favourite-settings` → `FavouriteSettingsView`.

### `client/src/components/<folder>/` (103 `.tsx` excluding tests)
| Folder | Purpose | Key components |
|---|---|---|
| (root) | shell entry | `Muqsit.tsx`, `TabRouter.tsx` |
| `auth/` | route guards | `guards.tsx` (`RequireAuth`, `RedirectIfAuthed`) |
| `common/` | shared UI | `Icon.tsx` (chrome icons, imported by 45 files), `ListState.tsx` (incl. `LoadError`), `AddCircleButton.tsx`, `DateField.tsx`, `EmptyState.tsx`, `DialogHost.tsx`, `RichTextEditor.tsx`, `ImageGallery.tsx`, `ImageLightbox.tsx`, `Lock.tsx`, `Pill.tsx`, `ExpandableField.tsx`, `HideToggle.tsx`, `CollapseToggle.tsx` |
| `examination/` | On-examination popup | `OePopup.tsx` |
| `investigation/` | Investigation popup + catalog | `InvestigationPopup.tsx`, `InvestigationFindingsField.tsx`, `InvestigationDirectory.tsx`, `InvestigationGroups.tsx`, `CalcRenderer.tsx` (calculators), `ReportViewerPane.tsx` |
| `ipd/` | IPD sheet | `IpdDetailView.tsx`, `AnalogueSheetPanel.tsx`, `CriticalAlert.tsx` |
| `layout/` | shells, header, auth pages | `DesktopShell.tsx`, `MobileShell.tsx`, `tabs.ts`, `PatientSearch.tsx`, `ChamberPicker.tsx`, `WorkstationSwitcher.tsx`, `DeviceMirror.tsx`, `MirrorToggle.tsx`, `BanglaTyping.tsx`, `ThemeToggle.tsx`, `AccountMenu.tsx`, `TabIcon.tsx`, `LoginPage.tsx`, `SignupPage.tsx` |
| `opd/` | OPD queue parts | `OpdDayPicker.tsx`, `OpdScheduleBar.tsx`, `OpdSmsDialog.tsx`, `PatientAvatar.tsx` |
| `prescription/` | the editor and patient records | `PrescriptionView.tsx` (entry), `LeftColumn.tsx`, `RightColumn.tsx`, `MedicinePad.tsx` (℞ pad), `PrintSheetModal.tsx`, `PatientGate.tsx`, `PatientHeader.tsx`, `PatientMobileLookup.tsx`, `DrugHistoryField.tsx`, `DrugHistoryTable.tsx`, `DrugSafetyField.tsx`, `BulkMedicineModal.tsx`, `RxAlerts.tsx` / `RxPadAlerts.tsx` / `RxAlertBanner.tsx`, `SaveNoticeLine.tsx`, `PersonalNote.tsx`, `PatientChat.tsx`, `PatientRecordsView.tsx`, `RecordsHistorySections.tsx`, `TotalSummary.tsx`, `DicomSection.tsx`, `PermissionsSection.tsx`, `MonthlyCost.tsx` |
| `providers/` | React Query + global providers | `Providers.tsx` |
| `statistics/` | Settings → Statistics | `PatientStatistics.tsx`, `DiseaseStatistics.tsx`, `VisitBarChart.tsx` |
| `tabs/` | one view per tab / Settings section | `OpdView.tsx`, `IpdView.tsx`, `PatientsView.tsx`, `MessageView.tsx`, `SettingsView.tsx`, `*SettingsView.tsx`, `HealthMonitoringView.tsx` + `HealthTrendsChart.tsx`, `IpdTeamSection.tsx`, `SupervisingDoctors.tsx`, `permissionUi.tsx` |

### `client/src/context/`
- `AuthContext.tsx` — signed-in user and auth actions (`useAuth`); test `AuthContext.test.tsx`.
- `MuqsitContext.tsx` — the editor store (`useMuqsit`, `MuqsitProvider`, `UNWRITABLE_PAD`): active tab, patient, prescription state.
- Tests: `MuqsitContext.test.tsx`, `.regression.test.tsx`, `.drugHistoryEdit.test.tsx`, `.photo.test.tsx`.

### `client/src/hooks/` (29 hook files; all call `client/src/lib/api.ts`)
| Domain | Hook → API object |
|---|---|
| Patients | `usePatients` → `patientsApi` (`/patients`); `usePatientFileAccess` → `patientsApi.get`; `usePatientDrugSafety` → `drugSafetyApi` (`/patients/:id/drug-safety`); `usePreviousDiagnoses` → `prescriptionsApi.listByPatient` |
| Prescribing | `useMedicineSearch` → `medicinesApi` (`/medicines/search`); `useDrugHistoryGenerics`, `useMonthlyCost` → `medicinesApi.byBrand` (`/medicines/by-brand`); `useRxHabits`, `useBulkMedicines` → `rxHabitsApi` (`/rx-habits`, `/rx-habits/all`); `useDoctorPhrases` → `doctorPhrasesApi`; `useDrugAdvice` → `drugAdviceApi`; `useTemplates` → `templatesApi` (`/prescription-templates`); `usePrescriptionLayout` → `prescriptionLayoutApi`; `useRxAlertInput` (no API: builds alert input from the store) |
| OPD / IPD | `useOpd` → `opdApi` (`/opd`, schedule, presence, move); `useChambers` → `chambersApi`; `useIpd` → `ipdApi`; `useWards` → `wardsApi` |
| Team | `useAssistants` → `assistantsApi`; `useWorkstations` → `workstationsApi`; `useChat` → `patientChatApi`; `useActivity` → `activityApi` |
| Account prefs | `useFieldRecents`, `useInvestigationPrefs` → `usersApi.me/update` (`/users/me`) |
| Other | `useSms` → `smsApi`; `useStatistics` → `statisticsApi`; `useResearch` → `researchApi`; `useImageUpload` → `uploadImage` (`/uploads/image`); `useMigrateLocalData` → `lib/migrateLocalData.ts` |

### `client/src/lib/` (275 tracked files: 174 source, 101 tests)
Central files:
| File | Role |
|---|---|
| `client/src/lib/api.ts` | `apiFetch` (cookies, refresh-on-401, `X-Workstation`, `X-Chamber`), `API_URL`, one `xxxApi` object per server module, `uploadImage`, response types |
| `client/src/lib/dateInput.ts` | dd/mm/yyyy entry and parsing (`ddmmyy` shorthand), `isoToDdmmyyyy` |
| `client/src/lib/stamp.ts` | display of system timestamps (`9 Oct 2026 · 17:04`) |
| `client/src/lib/prescriptionDoc.ts` | `buildPrescriptionHtml()` — the printed prescription; snapshot in `lib/__snapshots__/` |
| `client/src/lib/medicineKey.ts` | `sameMedicine` / `MedicineMap` — medicine identity across screens |
| `client/src/lib/rxAlerts.ts` | alert matcher (`checkRxAlerts`, `findRxAlerts`, `buildRxAlertInput`) over `data/rxAlerts.ts` |
| `client/src/lib/dialogs.ts` | `confirmAction()` / `tell()` (replace `window.confirm/alert`) |
| `client/src/lib/useDialog.ts` | popup keyboard/focus contract |
| `client/src/lib/a11y.ts` | `pressable()` for clickable non-buttons |
| `client/src/lib/inert.ts` | `useInert()` |
| `client/src/lib/permissions.ts` | `PERMISSION_GROUPS` — assistant permission keys (single client source) |
| `client/src/lib/safeHtml.ts` | allowlist HTML sanitiser |
| `client/src/lib/dropdownAnchor.ts` | `zoomScale()` and dropdown placement under page zoom |

Feature groups:
| Group | Key files |
|---|---|
| ℞ pad / prescription model | `rxRows.ts`, `rxShorthand.ts`, `rxRowMove.ts`, `rxPadHold.ts`, `usePadSync.ts`, `rxSuggest.ts`, `rxHabitKey.ts`, `rxHabitRows.ts`, `rxLanguage.ts`, `rxTemplates.ts`, `rxPrivacy.ts`, `rxDrugAdvice.ts`, `rxSnapshot.ts`, `bulkMedicines.ts`, `monthlyCost.ts` |
| Save / visit state | `saveNotice.ts`, `sendAgain.ts`, `visitSig.ts`, `beforeLogout.ts`, `signedInUser.ts` |
| Drug history | `rxDrugHistory.ts` (℞ → Drug history mirror), `drugHistoryAdd.ts`, `drugHistoryGeneric.ts`, `drugHistorySelect.ts`, `drugHistorySplit.ts`, `drugHistorySummary.ts`, `drugCourse.ts`, `drugSafety.ts` |
| Investigations | `investigationSummary.ts`, `investigationOrder.ts`, `investigationHidden.ts`, `investigationGroups.ts`, `investigationImages.ts`, `findingParts.ts`, `twoUnitValue.ts`, `resultBoxName.ts`, `numericInvSeries.ts`, `conversion/converter.ts`, `conversion/unit-registry.ts` |
| Calculators | `calculators/` — 75 calculator files + `calculator-registry.ts` (`CALCULATORS`, `getCalculator`), `calc-inputs.ts`, `format.ts` (`grouped()`) |
| Patient history / records | `patientHistory.ts`, `oeHistory.ts`, `onExaminationSummary.ts`, `previousComplaints.ts`, `symptomSummary.ts`, `patientRecords.ts`, `recordsDoc.ts`, `totalSummary.ts`, `inlineEditFields.ts`, `patientForm.ts`, `age.ts`, `sex.ts`, `sensitive.ts` |
| Health-trend charts (`idsp`) | `timelineGeometry.ts`, `timelineLabel.ts`, `hmDates.ts` |
| OPD | `opdDay.ts`, `opdPresence.ts`, `opdSchedule.ts`, `opdQueueDoc.ts`, `chamber.ts`, `chamberLayout.ts` |
| IPD | `ipdClinical.ts`, `ipdAnalogue.ts` |
| Images / files | `compressImage.ts`, `decodeImage.ts`, `imageFormats.ts`, `imageThumbs.ts`, `imagesPdf.ts`, `galleryPdf.ts`, `ocr.ts` |
| Input / language / UI | `banglaInput.ts`, `kbdLang.ts`, `captionFocus.ts`, `labelClickTrap.ts`, `highlight.ts`, `useMediaQuery.ts`, `theme.ts`, `themeBoot.ts` |
| Misc | `activityFormat.ts`, `lastUsed.ts`, `revisionNotes.ts`, `statistics.ts`, `migrateLocalData.ts` |

### Other client folders
- `client/src/data/` — `investigations.ts` (`INV_CATS` catalog; 75 `calc:` entries), `rxAlerts.ts` (`RX_ALERT_RULES`, verbatim physician rules), `suggestions.ts` (`suggestionDB` per field label).
- `client/src/theme/` — `palette.ts` (tokens, `paletteCss`), `index.ts` (`C`, `font`), `styles.ts` (button/page styles); tests `palette`, `contrast`, `rawColours`, `printStaysWhite`.
- `client/src/types/` — `index.ts` (`RxItem`, `TabId`, `View`, …), `calculator.ts`, `conversion.ts`, `utif.d.ts`.
- `client/src/vendor/avro-phonetic/` — Avro phonetic Bangla library (MPL-1.1).
- `client/src/test/` — `apiStub.ts`, `dialogKeyboard.tsx` (`itKeepsTheKeyboard`), `fc.ts`, `fixtures.ts`.
- `client/public/` — `exort-logo.png`, `fonts/dm-sans-5.3.0/` (self-hosted DM Sans).

### Config
- `client/next.config.mjs` — `reactStrictMode`, `distDir` from `NEXT_DIST_DIR`, `images.unoptimized`, `dwv` alias, 1-year cache for `/fonts`.
- `client/vitest.config.ts` — `@` → `src`, v8 coverage thresholds (48% global, 90% lines for `src/lib/*.ts`).
- Env files: `client/.env.production` (tracked), `client/.env.local` (untracked); `admin/.env.production` (tracked); `server/.env.example` (tracked), `server/.env` (untracked). Values not read.

## 3. Admin (`admin/`)
- `admin/app/page.tsx` — the whole console: `LoginForm`, `Dashboard`, `AccountsPage` (registrations by status + `RowActions`), `PaymentsPage`, own `Dialog`.
- `admin/app/accounts/[id]/page.tsx` — one registration's record (`AccountRecordPage`).
- `admin/app/layout.tsx`, `globals.css`, `icon.svg`.
- `admin/src/lib/api.ts` — own `apiFetch` (cookie + refresh) and `adminApi` → `/admin/registrations…`, `/admin/users/:id/revoke-sessions`, `/admin/payment-requests…`.
- `admin/next.config.mjs` — `reactStrictMode`, `images.unoptimized`, font caching. Scripts: `next dev/start -p 3001`.

## 4. Tests and tooling
- `e2e/ports.ts` — API :4200, web :3100 (env overridable, never 3000/3001/4000), DB `muqsit_e2e_test`.
- `e2e/playwright.config.ts` — one worker, no retries, Chromium 1440×900; web servers: `server` `npm run test:serve`, `client` `next dev` with `NEXT_DIST_DIR=.next-e2e`.
- `e2e/global-setup.ts` — runs `server/test/seed-e2e.ts`, warms `/login` and `/prescription`.
- `e2e/tests/helpers.ts` — `test` fixture with outside-origin request guard, `login`, `createPatient`, `addMedicine`, `saveAndOpenSheet`, API readers.

| E2E spec | Covers |
|---|---|
| `auth.spec.ts` | sign in and out |
| `bulk-medicine.spec.ts` | Add Bulk Medicine offers previous medicines |
| `chambers.spec.ts` | chambers in Settings, My Chamber lists |
| `defect-probes.spec.ts` | opt-in probes for intermittent defects |
| `drug-history-table.spec.ts` | Drug history table on records page |
| `drug-history.spec.ts` | Move to Rx without duplicate lines |
| `history-sidebar.spec.ts` | Disease/Surgical history, soft remove, Undo |
| `investigation-units.spec.ts` | two-unit result boxes, preferred unit |
| `ipd-save.spec.ts` | IPD Save messages on failure |
| `isolation.spec.ts` | doctor B cannot see doctor A's data |
| `keep-work.spec.ts` | nothing typed lost on reload |
| `monthly-cost.spec.ts` | monthly cost via `/medicines/by-brand` |
| `opd-presence.spec.ts` | reception marks on OPD queue |
| `opd-print-queue.spec.ts` | OPD Print Queue A4 preview |
| `opd-queue-day.spec.ts` | OPD queue booked by day |
| `opd-sms.spec.ts` | SMS to all, Settings → Payment |
| `patient-photo.spec.ts` | header photo follows patient |
| `personal-note.spec.ts` | personal note stays its patient's |
| `prescription.spec.ts` | writing and saving a prescription |
| `print-layout.spec.ts` | printed sheet fits its page |
| `print-sheet.spec.ts` | print sheet keyboard and focus |
| `records-oe.spec.ts` | records page On-examination |
| `restore.spec.ts` | auto-saved draft restored |
| `save-failure.spec.ts` | Save messages when save fails |
| `statistics.spec.ts` | Settings → Statistics UI |
| `taper-orphan.spec.ts` | `>>>` line never joins wrong medicine |

- `load/` (k6, against the throwaway load DB): `lib.js` (shared target guard), `login.js`, `medicine-search.js`, `patient-lookup.js`, `prescription-save.js`, `mixed.js` (clinic mix), `stress.js` (read-path stepping); `results/`.
- `scripts/test-repeat.mjs` — flaky-test detector: `node scripts/test-repeat.mjs <server|int|client> N`.
- `infra/enable-http2.sh` — run on the VPS: add `http2` to nginx TLS server blocks, test, reload.
- `.github/workflows/test.yml` (pull_request, manual, and `workflow_call` from `deploy.yml` — the deploy gate) — server: `npm ci` → `tsc` → `npm test --coverage` → build + `dist/main.js` check → compose up test DB → `test:db` → `test:int`; client: `npm ci` → `tsc` → `test:cov`.
- `.github/workflows/deploy.yml` (push to `main`) — the `test` job (`test.yml`) must be green first (`needs: test`) → SSH to VPS: reset lockfiles → `git fetch` + `git merge --ff-only <tested sha>` → server install + `prisma generate` + build → client install + build → admin build (failure tolerated) → `pm2 restart all`.
- `docker-compose.test.yml` — `postgres:16-alpine` `muqsit-testdb` on `127.0.0.1:5544`, tmpfs data, DB `muqsit_int_test`.
- Root `package.json` scripts: `dev` (concurrently api/web/admin), `dev:api`, `dev:web`, `dev:admin`, `build` (server → client → admin), `install:all`.
- Server scripts of note: `start:dev` (nodemon), `test`, `test:int`, `test:db`, `test:serve`, `seed`, `lint`, `format`; `postinstall` runs `prisma generate`.

## 5. Counts (from `git ls-files`)
| Item | Count |
|---|---|
| Server domain modules (folders with `*.module.ts`, excl. `AppModule`) | 31 |
| Controller files / `@Controller` classes | 29 / 32 |
| Prisma models | 35 |
| Server unit specs (`server/src/**/*.spec.ts`) | 38 |
| Integration specs (`server/test/*.int-spec.ts`) | 25 |
| Client components (`.tsx` in `src/components`, excl. tests) | 103 (196 incl. tests) |
| Client hook files (excl. tests) | 29 |
| Client lib files (all / excl. tests) | 275 / 174 |
| Client unit test files (`*.test.ts(x)` in `client/src`) | 213 |
| Calculators (registered in `CALCULATORS`) | 75 |
| E2E specs | 26 |

## 6. Where do I change X?
| Change | Server side | Client side |
|---|---|---|
| Add an API route | `server/src/<domain>/<domain>.controller.ts` (+ guards `JwtAuthGuard, WorkstationGuard`, `@WorkstationDoctorId()`), `dto/`, `*.service.ts`; `docs/API.md` (checked by `server/test/contract-routes.int-spec.ts`) | method on the `xxxApi` object in `client/src/lib/api.ts`; hook in `client/src/hooks/use*.ts` |
| Add a new server module | `server/src/<domain>/` + import in `server/src/app.module.ts` | new `xxxApi` in `client/src/lib/api.ts` |
| Add a field to the patient | `model Patient` in `server/prisma/schema.prisma`; new `server/prisma/manual-<name>.sql`; `server/src/patients/dto/patient.dto.ts`; `patients.service.ts` | `Patient` in `client/src/lib/api.ts`; `client/src/lib/patientForm.ts`; `client/src/components/tabs/PatientSettingsView.tsx` |
| Add a field to a request body | DTO in `server/src/<domain>/dto/` (whitelist drops undeclared; see `dto-whitelist`, `contract-dto` int-specs) | the call in `client/src/lib/api.ts` |
| Add a manual SQL migration | `server/prisma/manual-<name>.sql` (`IF NOT EXISTS`), `schema.prisma`, then `prisma db execute` + `prisma generate` | — |
| Add a tab | — | `TabId` in `client/src/types/index.ts`; `TABS` / `MOBILE_TABS` / `TAB_PATHS` in `client/src/components/layout/tabs.ts`; case in `client/src/components/TabRouter.tsx`; icon in `layout/TabIcon.tsx` |
| Add a Settings page | — | slug in `SETTINGS_SECTION_SLUGS` (`layout/tabs.ts`); card + section branch in `client/src/components/tabs/SettingsView.tsx`; new `tabs/<Name>SettingsView.tsx` |
| Change what the printed prescription shows | print settings: `server/src/prescription-layout/`, chamber layouts `server/src/chambers/` | `client/src/lib/prescriptionDoc.ts` (+ `lib/__snapshots__/prescriptionDoc.snap.test.ts.snap`); input assembled in `components/prescription/PrescriptionView.tsx`; shown by `PrintSheetModal.tsx`; settings UI `tabs/PrescriptionSettingsView.tsx` |
| Add a prescribing alert | — | rule in `client/src/data/rxAlerts.ts` (verbatim from physician); matcher `client/src/lib/rxAlerts.ts`; shown by `components/prescription/RxAlerts.tsx`, `RxPadAlerts.tsx`, `RxAlertBanner.tsx` |
| Add a calculator | — | `client/src/lib/calculators/<id>.ts`; entry in `calculator-registry.ts` `CALCULATORS`; `{calc:"<id>"}` in `client/src/data/investigations.ts`; special inputs in `components/investigation/CalcRenderer.tsx` |
| Add an investigation test | — | `INV_CATS` in `client/src/data/investigations.ts` (fields, units `u1/u2`, factors `c12/c21`) |
| Add a permission key | check `ws.permissions.includes('<key>')` via `@ActiveWorkstation()` in the controller | `PERMISSION_GROUPS` in `client/src/lib/permissions.ts` (grant UI `tabs/ManageAssistantsView.tsx`, `tabs/permissionUi.tsx`) |
| Change OPD queue behaviour | `server/src/opd/` (`opd.service.ts`, `queue-order.ts`, `schedule.ts`, `dhaka-day.ts`) | `components/tabs/OpdView.tsx`, `components/opd/`, `lib/opdDay.ts`, `lib/opdSchedule.ts`, `lib/opdPresence.ts`, `hooks/useOpd.ts` |
| Change IPD sheet | `server/src/ipd/`, `server/src/wards/` | `components/tabs/IpdView.tsx`, `components/ipd/IpdDetailView.tsx`, `lib/ipdClinical.ts`, `lib/ipdAnalogue.ts`, `hooks/useIpd.ts` |
| Change prescription save | `server/src/prescriptions/` (`prescriptions.service.ts`, `repeat.ts`) | `components/prescription/PrescriptionView.tsx`, `lib/sendAgain.ts`, `lib/saveNotice.ts`, `context/MuqsitContext.tsx` |
| Change Drug history | `server/src/patients/` (`POST`/`PATCH :id/drug-history`, `drug-history-edit.ts`) | `components/prescription/DrugHistoryField.tsx`, `DrugHistoryTable.tsx`, `lib/rxDrugHistory.ts`, `lib/drugHistory*.ts` |
| Change medicine search / catalogue | `server/src/medicines/` (raw `medicines`) | `hooks/useMedicineSearch.ts`, `components/prescription/MedicinePad.tsx` |
| Change learned "Your usual" lines | `server/src/rx-habits/`, `server/scripts/rebuild-rx-habits.js` | `hooks/useRxHabits.ts`, `lib/rxSuggest.ts`, `lib/rxHabitRows.ts` |
| Add a colour | — | `client/src/theme/palette.ts` + `theme/index.ts` (`C`); `rawColours.test.ts` fails on literals |
| Add an upload kind | `server/src/uploads/upload.controller.ts` (multer options, magic-byte check), `upload.service.ts` | `lib/imageFormats.ts`, `lib/api.ts#uploadImage`, `hooks/useImageUpload.ts` |
| Add an SMS / wallet feature | `server/src/sms/` | `hooks/useSms.ts`, `components/opd/OpdSmsDialog.tsx`, `tabs/PaymentSettingsView.tsx` |
| Add an admin action | `server/src/admin/admin.controller.ts` (`@Roles('admin')`) | `admin/src/lib/api.ts` `adminApi`, `admin/app/page.tsx` |
| Add an integration test | `server/test/<name>.int-spec.ts` using `server/test/support/app.ts`, `fixtures.ts` | — |
| Add a browser journey | — | `e2e/tests/<name>.spec.ts` using `e2e/tests/helpers.ts` |
