import type {
  OpdPatient,
  IpdPatient,
  IpdEvent,
  RecentPatient,
  QuestionPatient,
  ResearchPatient,
} from "@/types";

export const opdQueue: OpdPatient[] = [
  { id: 1, name: "Fatima Khatun", phone: "+880 1712-345678", age: 34, gender: "F", init: "FK", type: "Follow-up", token: "T-07", color: "pri" },
  { id: 2, name: "Akhtar Rahman", phone: "+880 1945-678901", age: 52, gender: "M", init: "AR", type: "New", token: "T-08", color: "warn" },
  { id: 3, name: "Sadia Begum", phone: "+880 1678-234567", age: 28, gender: "F", init: "SB", type: "Urgent", token: "T-09", color: "danger" },
  { id: 4, name: "Monir Hossain", phone: "+880 1834-567890", age: 45, gender: "M", init: "MH", type: "New", token: "T-10", color: "info" },
  { id: 5, name: "Taslima Akter", phone: "+880 1556-123456", age: 38, gender: "F", init: "TA", type: "Follow-up", token: "T-11", color: "pri" },
];

export const ipdData: IpdPatient[] = [
  { bed: "B-3", name: "Rashida Sultana", diagnosis: "Pneumonia", status: "Stable", admitted: "Apr 2", color: "pri" },
  { bed: "B-5", name: "Kamal Uddin", diagnosis: "Chest pain", status: "Observation", admitted: "Apr 4", color: "warn" },
  { bed: "B-7", name: "Nusrat Jahan", diagnosis: "Dengue", status: "Critical", admitted: "Apr 1", color: "danger" },
  { bed: "B-9", name: "Hasan Ali", diagnosis: "Post-op", status: "Discharge", admitted: "Mar 30", color: "info" },
];

// NOTE: mutated in place by the IPD events dialog (matches original prototype behavior).
export const ipdEvents: Record<string, IpdEvent[]> = {
  "B-3": [],
  "B-5": [],
  "B-7": [
    { ts: "15 May 2026 · 20:23", author: "Dr. Zahid", role: "Intern", note: "Pt. have severe RUQ pain", report: null },
    { ts: "15 May 2026 · 21:00", author: "Prof. Imtiaz", role: "", note: "Keep NPO TFO, Inj. Nalbun SOS, do MRCP if available, if not USG", report: null },
    { ts: "15 May 2026 · 22:30", author: "Dr. Fahim", role: "CA", note: "Pain subsided to tolerable level, MRCP arrangement in process", report: null },
    { ts: "16 May 2026 · 06:23", author: "Dr. Tushar", role: "", note: "MRCP finding: dilated CBD 14 mm", report: "MRCP Report" },
  ],
  "B-9": [],
};

export const recentlySeenPatients: RecentPatient[] = [
  { id: "r1", name: "Fatima Khatun",   age: 34, gender: "F", init: "FK", phone: "+880 1712-345678", lastSeen: "Today, 10:30 AM",    diagnosis: "Diabetes · Hypertension",   color: "pri" },
  { id: "r2", name: "Akhtar Rahman",   age: 52, gender: "M", init: "AR", phone: "+880 1945-678901", lastSeen: "Yesterday, 3:00 PM", diagnosis: "COPD · Hypertension",        color: "warn" },
  { id: "r3", name: "Sadia Begum",     age: 28, gender: "F", init: "SB", phone: "+880 1678-234567", lastSeen: "16 May, 11:15 AM",  diagnosis: "Dengue · Anaemia",           color: "danger" },
  { id: "r4", name: "Monir Hossain",   age: 45, gender: "M", init: "MH", phone: "+880 1834-567890", lastSeen: "15 May, 9:00 AM",   diagnosis: "Diabetes · Fatty liver",     color: "info" },
  { id: "r5", name: "Taslima Akter",   age: 38, gender: "F", init: "TA", phone: "+880 1556-123456", lastSeen: "14 May, 4:45 PM",   diagnosis: "Thyroid disorder",           color: "pri" },
];

export const questionPatients: QuestionPatient[] = [
  { id: "q1", name: "Nusrat Jahan",   age: 24, gender: "F", init: "NJ", phone: "+880 1712-000003", time: "2 min ago",   msg: "Vitals deteriorating — needs immediate review",       type: "alert",      color: "danger" },
  { id: "q2", name: "Fatima Khatun", age: 34, gender: "F", init: "FK", phone: "+880 1712-345678", time: "15 min ago",  msg: "Lab results ready — CBC, CRP reports available",      type: "info",       color: "pri" },
  { id: "q3", name: "Akhtar Rahman", age: 52, gender: "M", init: "AR", phone: "+880 1945-678901", time: "1 hr ago",    msg: "Consider checking HbA1c — last checked 3 months ago", type: "suggestion",  color: "warn" },
  { id: "q4", name: "Kamal Uddin",   age: 62, gender: "M", init: "KU", phone: "+880 1712-000002", time: "2 hrs ago",   msg: "Patient asks: can I resume normal diet today?",       type: "question",    color: "info" },
];

export const researchPatients: ResearchPatient[] = [
  { id: "p1", name: "Fatima Khatun",   age: 34, gender: "F", phone: "+880 1712-345678", source: "OPD", diseases: ["Diabetes", "Hypertension", "Gastric"],          tags: ["Diabetic", "Hypertensive", "Follow-up", "Chronic"] },
  { id: "p2", name: "Akhtar Rahman",   age: 52, gender: "M", phone: "+880 1945-678901", source: "OPD", diseases: ["COPD", "Hypertension"],                          tags: ["Hypertensive", "Smoker", "New patient"] },
  { id: "p3", name: "Sadia Begum",     age: 28, gender: "F", phone: "+880 1678-234567", source: "OPD", diseases: ["Dengue", "Anaemia"],                             tags: ["Urgent", "Febrile illness", "Young adult"] },
  { id: "p4", name: "Monir Hossain",   age: 45, gender: "M", phone: "+880 1834-567890", source: "OPD", diseases: ["Diabetes", "Fatty liver"],                      tags: ["Diabetic", "Obese", "New patient"] },
  { id: "p5", name: "Taslima Akter",   age: 38, gender: "F", phone: "+880 1556-123456", source: "OPD", diseases: ["Thyroid disorder", "Hypertension"],             tags: ["Hypertensive", "Follow-up", "Hormonal"] },
  { id: "p6", name: "Rashida Sultana", age: 58, gender: "F", phone: "+880 1712-000001", source: "IPD", diseases: ["Pneumonia"],                                    tags: ["Stable", "Elderly", "Respiratory"] },
  { id: "p7", name: "Kamal Uddin",     age: 62, gender: "M", phone: "+880 1712-000002", source: "IPD", diseases: ["Chest pain", "Hypertension", "Dyslipidaemia"],  tags: ["Observation", "Cardiac risk", "Elderly"] },
  { id: "p8", name: "Nusrat Jahan",    age: 24, gender: "F", phone: "+880 1712-000003", source: "IPD", diseases: ["Dengue", "Choledocholithiasis"],                tags: ["Critical", "Young adult", "Febrile illness", "Surgical candidate"] },
  { id: "p9", name: "Hasan Ali",       age: 48, gender: "M", phone: "+880 1712-000004", source: "IPD", diseases: ["Post-cholecystectomy"],                        tags: ["Post-op", "Discharge", "Surgical"] },
];
