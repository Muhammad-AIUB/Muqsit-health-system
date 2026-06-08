import type { Drug, RxItem } from "@/types";

export const drugDB: Drug[] = [
  { name: "Tab. Paracetamol 500mg", cat: "Analgesic", price: 1.5 },
  { name: "Cap. Amoxicillin 500mg", cat: "Antibiotic", price: 4.0 },
  { name: "Cap. Omeprazole 20mg", cat: "PPI", price: 3.5 },
  { name: "Tab. Metformin 500mg", cat: "Antidiabetic", price: 2.5 },
  { name: "Tab. Amlodipine 5mg", cat: "Antihypertensive", price: 3.0 },
  { name: "Tab. Cetirizine 10mg", cat: "Antihistamine", price: 2.0 },
  { name: "Tab. Azithromycin 500mg", cat: "Antibiotic", price: 12.0 },
  { name: "Tab. Montelukast 10mg", cat: "Leukotriene", price: 8.0 },
  { name: "Tab. Pantoprazole 40mg", cat: "PPI", price: 4.0 },
  { name: "Tab. Losartan 50mg", cat: "ARB", price: 5.0 },
  { name: "Cap. Doxycycline 100mg", cat: "Antibiotic", price: 3.5 },
  { name: "Fluticasone nasal spray", cat: "Corticosteroid", price: 180.0 },
  { name: "Syp. Ambroxol 30mg/5ml", cat: "Mucolytic", price: 45.0 },
  { name: "Tab. Domperidone 10mg", cat: "Antiemetic", price: 2.0 },
  { name: "Tab. Diclofenac 50mg", cat: "NSAID", price: 2.5 },
  { name: "Tab. Levofloxacin 500mg", cat: "Antibiotic", price: 8.0 },
  { name: "Tab. Atorvastatin 10mg", cat: "Statin", price: 5.0 },
  { name: "Tab. Clopidogrel 75mg", cat: "Antiplatelet", price: 6.0 },
];

export const templateRx: Record<string, RxItem[]> = {
  "Fever + cold": [
    { drug: "Tab. Paracetamol 500mg", dose: "1+0+1", duration: "5 days", instruction: "After meal" },
    { drug: "Tab. Cetirizine 10mg", dose: "0+0+1", duration: "5 days", instruction: "At night" },
    { drug: "Cap. Amoxicillin 500mg", dose: "1+1+1", duration: "7 days", instruction: "After meal" },
  ],
  "Gastric": [
    { drug: "Cap. Omeprazole 20mg", dose: "1+0+1", duration: "14 days", instruction: "Before meal (30 min)" },
    { drug: "Tab. Domperidone 10mg", dose: "1+1+1", duration: "7 days", instruction: "Before meal" },
  ],
  "Hypertension": [
    { drug: "Tab. Amlodipine 5mg", dose: "1+0+0", duration: "30 days", instruction: "Morning" },
    { drug: "Tab. Losartan 50mg", dose: "0+0+1", duration: "30 days", instruction: "At night" },
  ],
  "Diabetes": [
    { drug: "Tab. Metformin 500mg", dose: "1+0+1", duration: "30 days", instruction: "After meal" },
  ],
};

export const DOSE_OPTIONS = ["1+0+0", "0+0+1", "1+0+1", "1+1+1", "1+1+1+1", "½+0+½", "5ml", "10ml", "As needed"];
export const DURATION_OPTIONS = ["3 days", "5 days", "7 days", "10 days", "14 days", "21 days", "30 days", "Continue"];
export const INSTRUCTION_OPTIONS = ["Before meal", "After meal", "Before meal (30 min)", "Empty stomach", "Morning", "At night", "SOS"];
