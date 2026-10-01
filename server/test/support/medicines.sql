-- TEST DATABASE ONLY. The raw `medicines` table is not in schema.prisma, so
-- `prisma db push` cannot create it. Columns are exactly the ones
-- medicines.service.ts selects. The rows are the few names the existing unit
-- tests already use — search fixtures, not a drug reference.
CREATE TABLE IF NOT EXISTS medicines (
  id            TEXT PRIMARY KEY,
  "brandName"   TEXT NOT NULL,
  "genericName" TEXT,
  "dosageForm"  TEXT,
  strength      TEXT,
  company       TEXT,
  "priceRaw"    TEXT
);

INSERT INTO medicines (id, "brandName", "genericName", "dosageForm", strength, company, "priceRaw") VALUES
  ('t-napa-500',     'Napa',     'Paracetamol', 'Tablet',  '500 mg', 'Test Pharma', NULL),
  ('t-napa-syrup',   'Napa',     'Paracetamol', 'Syrup',   '120 mg/5 ml', 'Test Pharma', NULL),
  ('t-barcavir-05',  'Barcavir', 'Entecavir',   'Tablet',  '0.5 mg', 'Test Pharma', NULL),
  ('t-entaliv-05',   'Entaliv',  'Entecavir',   'Tablet',  '0.5 mg', 'Test Pharma', NULL),
  ('t-sergel-40',    'Sergel',   'Esomeprazole','Capsule (Enteric Coated)', '40 mg', 'Test Pharma', NULL),
  ('t-maxpro-40',    'Maxpro',   'Esomeprazole','Capsule (Enteric Coated)', '40 mg', 'Test Pharma', NULL)
ON CONFLICT (id) DO NOTHING;
