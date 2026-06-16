import type { Calculator } from '@/types/calculator'
import { calculateEGFR } from './egfr'
import { calculateChildPugh } from './child-pugh'
import { calculateMELDNa } from './meld-na'
import { calculateBMI } from './bmi'
import { calculateEDD } from './edd'
import { calculateSOFA } from './sofa'
import { calculateSOFA2 } from './sofa-2'
import { calculateGCS } from './gcs'
import { calculateAIH } from './aih'
import { calculateOriginalAIH } from './original-aih'
import { calculateFRAX } from './frax'
import { calculateCDAI } from './cdai'
import { calculateSDAI } from './sdai'
import { calculateBASDAI } from './basdai'
import { calculateSLEDAI } from './sledai'
import { calculateDAS28ESR } from './das28-esr'
import { calculateAPRI } from './apri'
import { calculateFIB4 } from './fib-4'
import { calculateVasopressor } from './vasopressor'
import { calculateTSAT } from './tsat'
import { calculateOsmolality } from './osmolality'
import { calculateOsmolarGap } from './osmolar-gap'
import { calculateCPP } from './cpp'
import { calculateSodiumCorrection } from './sodium-correction'
import { calculateCockcroftGault } from './cockcroft-gault'
import { calculateFENa } from './fena'
import { calculateAnionGap } from './anion-gap'
import { calculateWintersFormula } from './winters-formula'
import { calculateKtV } from './ktv'
import { calculateURR } from './urr'
import { calculateACR } from './acr'
import { calculateCha2ds2Vasc } from './cha2ds2-vasc'
import { calculateHasBled } from './has-bled'
import { calculateTimiUaNstemi } from './timi-ua-nstemi'
import { calculateGrace } from './grace'
import { calculateQTc } from './qtc'
import { calculateMAP } from './map'
import { calculateCardiacOutput } from './cardiac-output'
import { calculateLDL } from './ldl'
import { calculateWellsPE } from './wells-pe'
import { calculateShockIndex } from './shock-index'
import { calculateDapt } from './dapt'
import { calculateCorrectedReticulocyte } from './corrected-reticulocyte'
import { calculateANC } from './anc'
import { calculateMentzerIndex } from './mentzer-index'
import { calculateCalciumCorrection } from './calcium-correction'
import { calculateWellsDvt } from './wells-dvt'
import { calculateFLIPI } from './flipi'
import { calculateCllIpi } from './cll-ipi'
import { calculateIpssR } from './ipss-r'
import { calculateIPSS } from './ipss'
import { calculateBloodVolume } from './blood-volume'
import { calculateCCI } from './cci'
import { calculatePlasmaDosage } from './plasma-dosage'
import { calculateIronDeficit } from './iron-deficit'
import { calculateNIHSS } from './nihss'
import { calculateABCD2 } from './abcd2'
import { calculateNEWS } from './news'
import { calculateICH } from './ich'
import { calculateMRS } from './mrs'
import { calculateHuntHess } from './hunt-hess'
import { calculateEDSS } from './edss'
import { calculateASPECTS } from './aspects'
import { calculateApache2 } from './apache2'
import { calculateMoCA } from './moca'
import { calculateCURB65 } from './curb65'
import { calculateBODE } from './bode'
import { calculateGOLD } from './gold-copd'
import { calculatePERC } from './perc'
import { calculateStopBang } from './stop-bang'
import { calculateMMRC } from './mmrc'
import { calculateBSA } from './bsa'
import { calculateBSACosteff } from './bsa-costeff'
import { calculateEjectionFraction } from './ejection-fraction'
import { calculateSCAIShock } from './scai-shock'

export const CALCULATORS: Calculator[] = [
  {
    id: 'egfr',
    title: 'eGFR Calculator',
    shortTitle: 'eGFR',
    emoji: '🫘',
    description:
      'Estimate glomerular filtration rate using CKD-EPI 2021 or MDRD formula with automatic mg/dL ↔ µmol/L unit conversion',
    category: 'renal',
    icon: 'Droplets',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    tags: ['kidney', 'creatinine', 'CKD', 'renal function', 'nephrology'],
    inputs: [
      {
        id: 'creatinine',
        label: 'Serum Creatinine',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        min: 0.1,
        max: 20,
        precision: 2,
        clinicalRange: { min: 0.5, max: 5.0, warning: 'Value outside typical clinical range' },
        substance: 'creatinine',
      },
      { id: 'age', label: 'Age', type: 'number', required: true, min: 18, max: 120, precision: 0 },
      {
        id: 'sex',
        label: 'Biological Sex',
        type: 'radio',
        required: true,
        options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }],
      },
      {
        id: 'formula',
        label: 'Formula',
        type: 'select',
        required: false,
        options: [
          { value: 'ckd-epi-2021', label: 'CKD-EPI 2021 (Recommended)' },
          { value: 'mdrd', label: 'MDRD 4-Variable' },
        ],
      },
    ],
    calculate: (inputs) =>
      calculateEGFR({
        creatinine: Number(inputs.creatinine),
        creatinineUnit: String(inputs.creatinineUnit ?? 'mg/dL'),
        age: Number(inputs.age),
        sex: inputs.sex as 'male' | 'female',
        formula: (inputs.formula as 'ckd-epi-2021' | 'mdrd') ?? 'ckd-epi-2021',
      }),
  },
  {
    id: 'child-pugh',
    title: 'Child-Pugh Score',
    shortTitle: 'Child-Pugh',
    emoji: '🩺',
    description:
      'Assess severity of liver cirrhosis and predict surgical risk with Class A/B/C stratification',
    category: 'liver',
    icon: 'ClipboardList',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    tags: ['liver', 'cirrhosis', 'hepatology', 'surgical risk'],
    inputs: [
      {
        id: 'bilirubin',
        label: 'Total Bilirubin',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        substance: 'bilirubin',
      },
      {
        id: 'albumin',
        label: 'Serum Albumin',
        type: 'number',
        units: ['g/dL', 'g/L'],
        defaultUnit: 'g/dL',
        required: true,
      },
      { id: 'inr', label: 'INR (PT)', type: 'number', required: true, min: 0.8, max: 10 },
      {
        id: 'ascites',
        label: 'Ascites',
        type: 'radio',
        required: true,
        options: [
          { value: 'none', label: 'None' },
          { value: 'mild', label: 'Mild' },
          { value: 'moderate-severe', label: 'Moderate–Severe' },
        ],
      },
      {
        id: 'encephalopathy',
        label: 'Hepatic Encephalopathy',
        type: 'radio',
        required: true,
        options: [
          { value: 'none', label: 'None' },
          { value: 'grade1-2', label: 'Grade I–II' },
          { value: 'grade3-4', label: 'Grade III–IV' },
        ],
      },
    ],
    calculate: (inputs) =>
      calculateChildPugh({
        bilirubin: Number(inputs.bilirubin),
        bilirubinUnit: String(inputs.bilirubinUnit ?? 'mg/dL'),
        albumin: Number(inputs.albumin),
        albuminUnit: String(inputs.albuminUnit ?? 'g/dL'),
        inr: Number(inputs.inr),
        ascites: inputs.ascites as 'none' | 'mild' | 'moderate-severe',
        encephalopathy: inputs.encephalopathy as 'none' | 'grade1-2' | 'grade3-4',
      }),
  },
  {
    id: 'meld-na',
    title: 'MELD-Na Score',
    shortTitle: 'MELD-Na',
    emoji: '🧬',
    description:
      'Model for End-Stage Liver Disease with sodium for transplant priority and 90-day mortality estimation',
    category: 'liver',
    icon: 'ListOrdered',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    tags: ['liver', 'transplant', 'MELD', 'mortality', 'UNOS'],
    inputs: [
      {
        id: 'bilirubin',
        label: 'Total Bilirubin',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        substance: 'bilirubin',
      },
      { id: 'inr', label: 'INR', type: 'number', required: true, min: 0.8, max: 15 },
      {
        id: 'creatinine',
        label: 'Serum Creatinine',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        substance: 'creatinine',
      },
      {
        id: 'sodium',
        label: 'Serum Sodium',
        type: 'number',
        required: true,
        min: 100,
        max: 160,
        helpText: 'Normal: 135–145 mEq/L',
      },
      {
        id: 'onDialysis',
        label: 'On Dialysis',
        type: 'toggle',
        required: false,
        helpText: 'If yes, creatinine is set to 4.0 mg/dL',
      },
    ],
    calculate: (inputs) =>
      calculateMELDNa({
        bilirubin: Number(inputs.bilirubin),
        bilirubinUnit: String(inputs.bilirubinUnit ?? 'mg/dL'),
        inr: Number(inputs.inr),
        creatinine: Number(inputs.creatinine),
        creatinineUnit: String(inputs.creatinineUnit ?? 'mg/dL'),
        sodium: Number(inputs.sodium),
        onDialysis: Boolean(inputs.onDialysis),
      }),
  },
  {
    id: 'aih',
    title: 'AIH Score',
    shortTitle: 'AIH',
    emoji: 'AIH',
    description: 'Autoimmune Hepatitis Score',
    category: 'liver',
    icon: 'ClipboardCheck',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['AIH', 'autoimmune hepatitis', 'hepatology', 'liver'],
    inputs: [],
    calculate: (inputs) =>
      calculateAIH({
        anaSma: Number(inputs.anaSma ?? 1),
        lkm1: Number(inputs.lkm1 ?? 0),
        sla: Number(inputs.sla ?? 0),
        igg: Number(inputs.igg ?? 0),
        histology: Number(inputs.histology ?? 1),
        viralHepatitis: Number(inputs.viralHepatitis ?? 0),
      }),
  },
  {
    id: 'original-aih',
    title: 'Original AIH Score',
    shortTitle: 'Original AIH',
    emoji: 'AIH',
    description: 'Original Autoimmune Hepatitis Score',
    category: 'liver',
    icon: 'ClipboardCheck',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['AIH', 'original AIH', 'autoimmune hepatitis', 'hepatology', 'liver'],
    inputs: [],
    calculate: (inputs) =>
      calculateOriginalAIH({
        sex: Number(inputs.sex ?? 0),
        alpAstAltRatio: Number(inputs.alpAstAltRatio ?? 0),
        serumGlobulinsIgg: Number(inputs.serumGlobulinsIgg ?? 0),
        antibodies: Number(inputs.antibodies ?? 0),
        optionalAutoantibodies: Number(inputs.optionalAutoantibodies ?? 0),
        ama: Number(inputs.ama ?? 0),
        hepatitisViralMarkers: Number(inputs.hepatitisViralMarkers ?? 3),
        hepatotoxicDrugs: Number(inputs.hepatotoxicDrugs ?? 1),
        alcoholIntake: Number(inputs.alcoholIntake ?? 2),
        interfaceHepatitis: Number(inputs.interfaceHepatitis ?? 0),
        lymphoplasmacytic: Number(inputs.lymphoplasmacytic ?? 0),
        rosetting: Number(inputs.rosetting ?? 0),
        biliaryChanges: Number(inputs.biliaryChanges ?? 0),
        otherChanges: Number(inputs.otherChanges ?? 0),
        autoimmuneDisease: Number(inputs.autoimmuneDisease ?? 0),
        responseTherapy: Number(inputs.responseTherapy ?? 0),
      }),
  },
  {
    id: 'frax',
    title: 'FRACTURE Index',
    shortTitle: 'FRACTURE Index',
    emoji: '🦴',
    description: 'FRACTURE Index (Black 2001) — point score for fracture risk in postmenopausal women, with or without BMD',
    category: 'nutrition',
    icon: 'Bone',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['FRACTURE Index', 'fracture', 'osteoporosis', 'bone', 'BMD', 'FRAX'],
    inputs: [],
    calculate: (inputs) =>
      calculateFRAX({
        age: Number(inputs.age ?? 0),
        fractureHistory: Number(inputs.fractureHistory ?? 0),
        motherHipFracture: Number(inputs.motherHipFracture ?? 0),
        weight: Number(inputs.weight ?? 0),
        smoker: Number(inputs.smoker ?? 0),
        chairRise: Number(inputs.chairRise ?? 0),
        bmd: Number(inputs.bmd ?? 0),
      }),
  },
  {
    id: 'cdai',
    title: 'CDAI',
    shortTitle: 'CDAI',
    emoji: 'CDAI',
    description: 'Clinical Disease Activity Index for rheumatoid arthritis',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['CDAI', 'rheumatoid arthritis', 'arthritis', 'joint count'],
    inputs: [],
    calculate: (inputs) =>
      calculateCDAI({
        tenderJointCount: Number(inputs.tenderJointCount ?? 0),
        swollenJointCount: Number(inputs.swollenJointCount ?? 0),
        patientGlobal: Number(inputs.patientGlobal ?? 0),
        providerGlobal: Number(inputs.providerGlobal ?? 0),
      }),
  },
  {
    id: 'sdai',
    title: 'SDAI',
    shortTitle: 'SDAI',
    emoji: 'SDAI',
    description: 'Simplified Disease Activity Index for rheumatoid arthritis',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['SDAI', 'rheumatoid arthritis', 'arthritis', 'joint count', 'CRP'],
    inputs: [],
    calculate: (inputs) =>
      calculateSDAI({
        tenderJointCount: Number(inputs.tenderJointCount ?? 0),
        swollenJointCount: Number(inputs.swollenJointCount ?? 0),
        crpMgDl: Number(inputs.crpMgDl ?? 0),
        patientGlobal: Number(inputs.patientGlobal ?? 0),
        providerGlobal: Number(inputs.providerGlobal ?? 0),
      }),
  },
  {
    id: 'basdai',
    title: 'BASDAI Score',
    shortTitle: 'BASDAI',
    emoji: 'BASDAI',
    description: 'Bath Ankylosing Spondylitis Disease Activity Index',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['BASDAI', 'ankylosing spondylitis', 'arthritis', 'disease activity'],
    inputs: [],
    calculate: (inputs) =>
      calculateBASDAI({
        q1: Number(inputs.q1 ?? 0),
        q2: Number(inputs.q2 ?? 0),
        q3: Number(inputs.q3 ?? 0),
        q4: Number(inputs.q4 ?? 0),
        q5: Number(inputs.q5 ?? 0),
        q6: Number(inputs.q6 ?? 0),
      }),
  },
  {
    id: 'sledai',
    title: 'SLEDAI Score',
    shortTitle: 'SLEDAI',
    emoji: 'SLEDAI',
    description: 'Systemic Lupus Erythematosus Disease Activity Index',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['SLEDAI', 'SLE', 'lupus', 'disease activity'],
    inputs: [],
    calculate: (inputs) => calculateSLEDAI(inputs as Record<string, number>),
  },
  {
    id: 'das28-esr',
    title: 'DAS28-ESR Score',
    shortTitle: 'DAS28-ESR',
    emoji: 'DAS28',
    description: 'Disease Activity Score 28 using erythrocyte sedimentation rate',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['DAS28', 'DAS28-ESR', 'ESR', 'rheumatoid arthritis', 'arthritis'],
    inputs: [],
    calculate: (inputs) =>
      calculateDAS28ESR({
        tenderJointCount: Number(inputs.tenderJointCount ?? 0),
        swollenJointCount: Number(inputs.swollenJointCount ?? 0),
        esr: Number(inputs.esr ?? 1),
        globalHealth: Number(inputs.globalHealth ?? 0),
      }),
  },
  {
    id: 'apri',
    title: 'APRI Score',
    shortTitle: 'APRI',
    emoji: 'APRI',
    description: 'AST to Platelet Ratio Index',
    category: 'liver',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['APRI', 'AST', 'platelets', 'fibrosis', 'liver'],
    inputs: [],
    calculate: (inputs) =>
      calculateAPRI({
        ast: Number(inputs.ast ?? 0),
        astUpperLimit: Number(inputs.astUpperLimit ?? 1),
        platelets: Number(inputs.platelets ?? 1),
        plateletUnit: (inputs.plateletUnit as '10^9/L' | '10^3/uL') ?? '10^9/L',
      }),
  },
  {
    id: 'fib-4',
    title: 'FIB-4 Score',
    shortTitle: 'FIB-4',
    emoji: 'FIB-4',
    description: 'Fibrosis-4 index for liver fibrosis assessment',
    category: 'liver',
    icon: 'Activity',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['FIB-4', 'fibrosis', 'AST', 'ALT', 'platelets', 'liver'],
    inputs: [],
    calculate: (inputs) =>
      calculateFIB4({
        age: Number(inputs.age ?? 0),
        ast: Number(inputs.ast ?? 0),
        alt: Number(inputs.alt ?? 1),
        platelets: Number(inputs.platelets ?? 1),
        plateletUnit: (inputs.plateletUnit as '10^9/L' | '10^3/uL') ?? '10^9/L',
      }),
  },
  {
    id: 'bmi',
    title: 'BMI Calculator',
    shortTitle: 'BMI',
    emoji: '⚖️',
    description:
      'Body Mass Index with WHO classification and body surface area by the Mosteller formula',
    category: 'nutrition',
    icon: 'Scale',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    tags: ['BMI', 'BSA', 'Mosteller', 'obesity', 'weight', 'nutrition'],
    inputs: [
      {
        id: 'height',
        label: 'Height',
        type: 'composite',
        units: ['cm', 'm', 'ft+in'],
        defaultUnit: 'cm',
        required: true,
      },
      {
        id: 'weight',
        label: 'Weight',
        type: 'number',
        units: ['kg', 'lb'],
        defaultUnit: 'kg',
        required: true,
        min: 1,
        max: 500,
      },
      {
        id: 'sex',
        label: 'Biological Sex (for IBW)',
        type: 'radio',
        required: false,
        options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }],
        helpText: 'Optional — used for Devine IBW formula',
      },
    ],
    calculate: (inputs) => {
      let heightCm = Number(inputs.heightCm ?? inputs.height ?? 0)
      if (inputs.heightUnit === 'm') heightCm = Number(inputs.height) * 100
      else if (inputs.heightUnit === 'ft+in') {
        heightCm = Number(inputs.heightFeet ?? 0) * 30.48 + Number(inputs.heightInches ?? 0) * 2.54
      }
      let weightKg = Number(inputs.weight ?? 0)
      if (inputs.weightUnit === 'lb') weightKg = weightKg * 0.453592
      return calculateBMI({ heightCm, weightKg })
    },
  },
  {
    id: 'edd',
    title: 'EDD Calculator',
    shortTitle: 'EDD',
    emoji: '👶',
    description:
      "Estimate due date via Naegele's rule (LMP) or ultrasound dating with gestational milestones",
    category: 'obstetric',
    icon: 'Baby',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-950',
    tags: ['pregnancy', 'EDD', 'gestational age', 'obstetrics', 'LMP', 'ultrasound'],
    inputs: [
      {
        id: 'method',
        label: 'Dating Method',
        type: 'radio',
        required: true,
        options: [
          { value: 'lmp', label: 'Last Menstrual Period (LMP)' },
          { value: 'ultrasound', label: 'Ultrasound Dating' },
        ],
      },
      { id: 'lmpDate', label: 'Date of LMP', type: 'date', required: false },
      { id: 'cycleLength', label: 'Cycle Length (days)', type: 'number', required: false, min: 20, max: 45 },
      { id: 'scanDate', label: 'Date of Ultrasound', type: 'date', required: false },
      { id: 'gestationalWeeks', label: 'GA at Scan (weeks)', type: 'number', required: false, min: 0, max: 42 },
      { id: 'gestationalDays', label: 'Additional Days', type: 'number', required: false, min: 0, max: 6 },
    ],
    calculate: (inputs) =>
      calculateEDD({
        method: inputs.method as 'lmp' | 'ultrasound',
        lmpDate: inputs.lmpDate as string | undefined,
        cycleLength: inputs.cycleLength ? Number(inputs.cycleLength) : undefined,
        scanDate: inputs.scanDate as string | undefined,
        gestationalWeeks: inputs.gestationalWeeks ? Number(inputs.gestationalWeeks) : undefined,
        gestationalDays: inputs.gestationalDays ? Number(inputs.gestationalDays) : undefined,
      }),
  },
  {
    id: 'gcs',
    title: 'GCS',
    shortTitle: 'GCS',
    emoji: 'GCS',
    description: 'Glasgow Coma Score',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50 dark:bg-sky-950',
    tags: ['GCS', 'Glasgow Coma Score', 'critical care', 'neurology'],
    inputs: [],
    calculate: (inputs) =>
      calculateGCS({
        eye: (inputs.eye as number | 'NT') ?? 4,
        verbal: (inputs.verbal as number | 'NT') ?? 5,
        motor: (inputs.motor as number | 'NT') ?? 6,
      }),
  },
  {
    id: 'sofa-2',
    title: 'SOFA-2',
    shortTitle: 'SOFA-2',
    emoji: 'SOFA-2',
    description: 'SOFA-2 Score',
    category: 'critical-care',
    icon: 'ListChecks',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950',
    tags: ['SOFA-2', 'ICU', 'sepsis', 'organ failure', 'critical care'],
    inputs: [],
    calculate: (inputs) =>
      calculateSOFA2({
        brain: Number(inputs.brain ?? 0),
        respiratory: Number(inputs.respiratory ?? 0),
        cardiovascular: Number(inputs.cardiovascular ?? 0),
        liver: Number(inputs.liver ?? 0),
        kidney: Number(inputs.kidney ?? 0),
        hemostasis: Number(inputs.hemostasis ?? 0),
      }),
  },
  {
    id: 'sofa',
    title: 'SOFA Score',
    shortTitle: 'SOFA',
    emoji: '🫀',
    description:
      'Sequential Organ Failure Assessment for ICU mortality prediction and sepsis diagnosis (6 organ systems, 0–24)',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950',
    tags: ['ICU', 'sepsis', 'organ failure', 'critical care', 'mortality', 'ventilator'],
    inputs: [
      { id: 'pao2', label: 'PaO₂', type: 'number', required: false, min: 20, max: 600, helpText: 'mmHg' },
      { id: 'fio2', label: 'FiO₂', type: 'number', required: false, min: 0.21, max: 1.0, helpText: '0.21–1.0' },
      { id: 'spo2', label: 'SpO₂ (%)', type: 'number', required: false, min: 50, max: 100 },
      { id: 'ventilated', label: 'Mechanically Ventilated', type: 'toggle', required: false },
      { id: 'platelets', label: 'Platelets (×10³/µL)', type: 'number', required: true, min: 0, max: 1000 },
      {
        id: 'bilirubin',
        label: 'Total Bilirubin',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        substance: 'bilirubin',
      },
      { id: 'map', label: 'Mean Arterial Pressure (mmHg)', type: 'number', required: true, min: 20, max: 200 },
      { id: 'gcs', label: 'GCS Score', type: 'number', required: true, min: 3, max: 15 },
      {
        id: 'creatinine',
        label: 'Serum Creatinine',
        type: 'number',
        units: ['mg/dL', 'µmol/L'],
        defaultUnit: 'mg/dL',
        required: true,
        substance: 'creatinine',
      },
      { id: 'urineOutput', label: 'Urine Output (mL/24h)', type: 'number', required: false, min: 0, max: 10000 },
    ],
    calculate: (inputs) =>
      calculateSOFA({
        pao2: inputs.pao2 ? Number(inputs.pao2) : undefined,
        fio2: inputs.fio2 ? Number(inputs.fio2) : undefined,
        spo2: inputs.spo2 ? Number(inputs.spo2) : undefined,
        ventilated: Boolean(inputs.ventilated),
        platelets: Number(inputs.platelets),
        bilirubin: Number(inputs.bilirubin),
        bilirubinUnit: String(inputs.bilirubinUnit ?? 'mg/dL'),
        map: Number(inputs.map),
        vasopressor: inputs.vasopressor as string | undefined,
        vasopressorDose: inputs.vasopressorDose ? Number(inputs.vasopressorDose) : undefined,
        gcs: Number(inputs.gcs),
        creatinine: Number(inputs.creatinine),
        creatinineUnit: String(inputs.creatinineUnit ?? 'mg/dL'),
        urineOutput: inputs.urineOutput ? Number(inputs.urineOutput) : undefined,
      }),
  },
  {
    id: 'vasopressor',
    title: 'Vasopressor Score',
    shortTitle: 'VIS',
    emoji: '💉',
    description:
      'Vasoactive-Inotropic Score (VIS) with auto-conversion for dopamine, norepinephrine, epinephrine, vasopressin and more',
    category: 'critical-care',
    icon: 'Syringe',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950',
    tags: ['vasopressors', 'shock', 'VIS', 'ICU', 'hemodynamics', 'inotropes'],
    inputs: [
      { id: 'weight', label: 'Patient Weight', type: 'number', units: ['kg', 'lb'], defaultUnit: 'kg', required: true, min: 1, max: 300 },
    ],
    calculate: (inputs) =>
      calculateVasopressor({
        weight: Number(inputs.weight),
        weightUnit: String(inputs.weightUnit ?? 'kg'),
        drugs: (inputs.drugs as Array<{ name: string; dose: number; unit: string; enabled: boolean }>) ?? [],
      }),
  },
  {
    id: 'tsat',
    title: 'TSAT Calculator',
    shortTitle: 'TSAT',
    emoji: '🩸',
    description:
      'Transferrin Saturation for iron status assessment — iron deficiency, overload, and CKD anemia interpretation',
    category: 'nutrition',
    icon: 'TestTube',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-950',
    tags: ['iron', 'TSAT', 'anemia', 'ferritin', 'TIBC', 'transferrin', 'CKD anemia'],
    inputs: [
      {
        id: 'serumIron',
        label: 'Serum Iron',
        type: 'number',
        units: ['µg/dL', 'µmol/L'],
        defaultUnit: 'µg/dL',
        required: true,
        min: 0,
      },
      {
        id: 'tibcMethod',
        label: 'Input Method',
        type: 'radio',
        required: true,
        options: [{ value: 'tibc', label: 'TIBC' }, { value: 'transferrin', label: 'Transferrin (g/dL)' }],
      },
      { id: 'tibcValue', label: 'TIBC / Transferrin Value', type: 'number', required: true, min: 0 },
      { id: 'ferritin', label: 'Serum Ferritin (ng/mL)', type: 'number', required: false, min: 0 },
    ],
    calculate: (inputs) =>
      calculateTSAT({
        serumIron: Number(inputs.serumIron),
        serumIronUnit: String(inputs.serumIronUnit ?? 'µg/dL'),
        tibcMethod: inputs.tibcMethod as 'tibc' | 'transferrin',
        tibcValue: Number(inputs.tibcValue),
        tibcUnit: String(inputs.tibcUnit ?? 'µg/dL'),
        ferritin: inputs.ferritin ? Number(inputs.ferritin) : undefined,
      }),
  },
  {
    id: 'osmolality',
    title: 'Serum Osmolality',
    shortTitle: 'Osmolality',
    emoji: '🧪',
    description: 'Calculate serum osmolality from sodium, BUN, and glucose using the standard formula',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    tags: ['osmolality', 'sodium', 'BUN', 'glucose', 'hyponatremia', 'renal'],
    inputs: [
      { id: 'sodium', label: 'Sodium', type: 'number', required: true, min: 100, max: 200 },
      { id: 'bun', label: 'BUN', type: 'number', required: true, min: 1, max: 300 },
      { id: 'glucose', label: 'Glucose', type: 'number', required: true, min: 1, max: 2000 },
    ],
    calculate: (inputs) =>
      calculateOsmolality({
        sodium: Number(inputs.sodium),
        bun: Number(inputs.bun),
        glucose: Number(inputs.glucose),
      }),
  },
  {
    id: 'osmolar-gap',
    title: 'Osmolar Gap',
    shortTitle: 'Osm Gap',
    emoji: '🔬',
    description: 'Calculate osmolar gap to screen for toxic alcohol ingestion or unmeasured osmoles',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    tags: ['osmolar gap', 'toxic alcohol', 'methanol', 'ethylene glycol', 'toxicology'],
    inputs: [
      { id: 'measuredOsm', label: 'Measured Stool Osmolality (mOsm/kg)', type: 'number', required: false, min: 100, max: 400 },
      { id: 'sodium',      label: 'Stool Sodium (mEq/L)',                 type: 'number', required: true,  min: 0,   max: 200 },
      { id: 'potassium',   label: 'Stool Potassium (mEq/L)',              type: 'number', required: true,  min: 0,   max: 200 },
    ],
    calculate: (inputs) =>
      calculateOsmolarGap({
        method:      inputs.measuredOsm ? 'measured' : 'assumed',
        measuredOsm: inputs.measuredOsm ? Number(inputs.measuredOsm) : undefined,
        sodium:      Number(inputs.sodium),
        potassium:   Number(inputs.potassium),
      }),
  },
  {
    id: 'cpp',
    title: 'Cerebral Perfusion Pressure (CPP)',
    shortTitle: 'CPP',
    emoji: '🧠',
    description: 'Calculate cerebral perfusion pressure from MAP and intracranial pressure',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['CPP', 'MAP', 'ICP', 'intracranial pressure', 'neurocritical care'],
    inputs: [
      { id: 'map', label: 'MAP', type: 'number', required: true, min: 0, max: 200 },
      { id: 'icp', label: 'ICP', type: 'number', required: true, min: 0, max: 100 },
    ],
    calculate: (inputs) =>
      calculateCPP({ map: Number(inputs.map), icp: Number(inputs.icp) }),
  },
  {
    id: 'sodium-correction',
    title: 'Sodium Correction for Hyperglycemia',
    shortTitle: 'Na Correction',
    emoji: '🧂',
    description: 'Corrects measured sodium for hyperglycemia using Katz (1973) and Hillier (1999) formulas',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    tags: ['sodium', 'hyperglycemia', 'correction', 'Katz', 'Hillier', 'electrolytes'],
    inputs: [
      { id: 'sodium',  label: 'Sodium',        type: 'number', required: true, min: 100, max: 180 },
      { id: 'glucose', label: 'Serum Glucose',  type: 'number', required: true, min: 100, max: 2000 },
    ],
    calculate: (inputs) => {
      const result = calculateSodiumCorrection({ sodium: Number(inputs.sodium), glucose: Number(inputs.glucose) });
      return {
        calculatorId: 'sodium-correction',
        score: result.katz,
        unit: 'mEq/L',
        severity: 'neutral' as const,
        label: 'Corrected Sodium',
        interpretation: `Katz: ${result.katz} mEq/L | Hillier: ${result.hillier} mEq/L`,
      };
    },
  },
  {
    id: 'cockcroft-gault',
    title: 'Creatinine Clearance (Cockcroft-Gault)',
    shortTitle: 'CrCl',
    emoji: '🫘',
    description: 'Estimates creatinine clearance using Cockcroft-Gault equation with IBW and ABW adjustments',
    category: 'renal',
    icon: 'Droplets',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    tags: ['creatinine clearance', 'CrCl', 'Cockcroft-Gault', 'renal function', 'IBW', 'ABW'],
    inputs: [
      { id: 'sex',        label: 'Sex',         type: 'radio',  required: true  },
      { id: 'age',        label: 'Age',         type: 'number', required: true,  min: 1, max: 120 },
      { id: 'weight',     label: 'Weight (kg)', type: 'number', required: true,  min: 1, max: 300 },
      { id: 'creatinine', label: 'Creatinine',  type: 'number', required: true,  min: 0.1, max: 30 },
      { id: 'height',     label: 'Height (cm)', type: 'number', required: false, min: 100, max: 250 },
    ],
    calculate: (inputs) =>
      calculateCockcroftGault({
        sex: inputs.sex as 'male' | 'female',
        age: Number(inputs.age),
        weightKg: Number(inputs.weight),
        creatinineMgDl: Number(inputs.creatinine),
        heightCm: inputs.height ? Number(inputs.height) : undefined,
      }),
  },
  {
    id: 'fena',
    title: 'Fractional Excretion of Sodium (FENa)',
    shortTitle: 'FENa',
    emoji: '🧪',
    description: 'Calculates FENa to differentiate prerenal azotemia from intrinsic renal disease',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    tags: ['FENa', 'sodium', 'acute kidney injury', 'AKI', 'ATN', 'prerenal', 'renal'],
    inputs: [
      { id: 'serumSodium',     label: 'Serum Sodium',      type: 'number', required: true },
      { id: 'serumCreatinine', label: 'Serum Creatinine',  type: 'number', required: true },
      { id: 'urineSodium',     label: 'Urine Sodium',      type: 'number', required: true },
      { id: 'urineCreatinine', label: 'Urine Creatinine',  type: 'number', required: true },
    ],
    calculate: (inputs) =>
      calculateFENa({
        serumSodium:     Number(inputs.serumSodium),
        serumCreatinine: Number(inputs.serumCreatinine),
        urineSodium:     Number(inputs.urineSodium),
        urineCreatinine: Number(inputs.urineCreatinine),
      }),
  },
  {
    id: 'anion-gap',
    title: 'Serum Anion Gap',
    shortTitle: 'Anion Gap',
    emoji: '⚗️',
    description: 'Calculates anion gap, delta gap, delta ratio and albumin-corrected values',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    tags: ['anion gap', 'metabolic acidosis', 'delta gap', 'albumin', 'electrolytes', 'MUDPILES'],
    inputs: [
      { id: 'sodium',      label: 'Sodium',      type: 'number', required: true },
      { id: 'chloride',    label: 'Chloride',    type: 'number', required: true },
      { id: 'bicarbonate', label: 'Bicarbonate', type: 'number', required: true },
      { id: 'albumin',     label: 'Albumin',     type: 'number', required: false },
    ],
    calculate: (inputs) =>
      calculateAnionGap({
        sodium:      Number(inputs.sodium),
        chloride:    Number(inputs.chloride),
        bicarbonate: Number(inputs.bicarbonate),
        albumin:     inputs.albumin ? Number(inputs.albumin) : undefined,
      }),
  },
  {
    id: 'winters-formula',
    title: "Winters' Formula for Metabolic Acidosis Compensation",
    shortTitle: "Winters' Formula",
    emoji: '🫁',
    description: 'Calculates expected pCO2 compensation in metabolic acidosis using bicarbonate',
    category: 'critical-care',
    icon: 'Wind',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    tags: ["Winters", 'metabolic acidosis', 'pCO2', 'bicarbonate', 'compensation', 'ABG'],
    inputs: [
      { id: 'bicarbonate', label: 'Bicarbonate', type: 'number', required: true, min: 1, max: 45 },
    ],
    calculate: (inputs) =>
      calculateWintersFormula({ bicarbonate: Number(inputs.bicarbonate) }),
  },
  {
    id: 'ktv',
    title: 'Kt/V for Dialysis Adequacy',
    shortTitle: 'Kt/V',
    emoji: '🩺',
    description: 'Calculates Kt/V to assess adequacy of hemodialysis using clearance, time, and patient weight',
    category: 'renal',
    icon: 'Droplets',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    tags: ['Kt/V', 'dialysis', 'hemodialysis', 'adequacy', 'KDOQI', 'urea clearance'],
    inputs: [
      { id: 'clearance', label: 'Dialyzer Clearance of Urea (mL/min)', type: 'number', required: true, min: 0, max: 500 },
      { id: 'timeHours', label: 'Dialysis Time (hours)',                type: 'number', required: true, min: 0, max: 12  },
      { id: 'weightKg',  label: 'Weight (kg)',                          type: 'number', required: true, min: 1, max: 300 },
    ],
    calculate: (inputs) => {
      const result = calculateKtV({
        clearance: Number(inputs.clearance),
        timeHours: Number(inputs.timeHours),
        weightKg:  Number(inputs.weightKg),
      });
      return {
        calculatorId: 'ktv',
        score: result.ktv,
        unit: '',
        severity: result.severity,
        label: 'Kt/V',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'shock-index',
    title: 'Shock Index',
    shortTitle: 'Shock Index',
    emoji: '🩺',
    description: 'Calculates shock index (HR/SBP) to assess hemodynamic instability and shock severity',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['shock index', 'hemodynamics', 'shock', 'HR', 'SBP', 'trauma', 'ICU'],
    inputs: [
      { id: 'heartRate', label: 'Heart Rate (beats/min)', type: 'number', required: true, min: 20,  max: 300 },
      { id: 'sbp',       label: 'Systolic BP (mm Hg)',   type: 'number', required: true, min: 40,  max: 300 },
    ],
    calculate: (inputs) => {
      const result = calculateShockIndex({ heartRate: Number(inputs.heartRate), sbp: Number(inputs.sbp) });
      return {
        calculatorId: 'shock-index',
        score: result.shockIndex,
        unit: '',
        severity: result.severity,
        label: 'Shock Index',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'wells-pe',
    title: "Wells' Criteria for Pulmonary Embolism",
    shortTitle: "Wells' PE",
    emoji: '🫁',
    description: 'Stratifies PE probability using clinical criteria; guides D-dimer or CTPA decision',
    category: 'critical-care',
    icon: 'Wind',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    tags: ["Wells", 'pulmonary embolism', 'PE', 'DVT', 'D-dimer', 'CTPA', 'thrombosis'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateWellsPE({
        dvtSigns:       Number(inputs.dvtSigns)       as 0|3,
        pe1stDiagnosis: Number(inputs.pe1st)          as 0|3,
        heartRate100:   Number(inputs.heartRate)      as 0|1.5,
        immobilization: Number(inputs.immobilization) as 0|1.5,
        previousPeDvt:  Number(inputs.previousPeDvt)  as 0|1.5,
        hemoptysis:     Number(inputs.hemoptysis)     as 0|1,
        malignancy:     Number(inputs.malignancy)     as 0|1,
      });
      return {
        calculatorId: 'wells-pe',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: "Wells' PE Score",
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'ldl',
    title: 'LDL Cholesterol (Friedewald)',
    shortTitle: 'LDL',
    emoji: '🩸',
    description: 'Calculates LDL cholesterol from total cholesterol, HDL, and triglycerides using Friedewald equation',
    category: 'nutrition',
    icon: 'TestTube',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    tags: ['LDL', 'cholesterol', 'HDL', 'triglycerides', 'Friedewald', 'lipids', 'cardiovascular'],
    inputs: [
      { id: 'tcMgDl',  label: 'Total Cholesterol (mg/dL)', type: 'number', required: true, min: 0, max: 800  },
      { id: 'hdlMgDl', label: 'HDL Cholesterol (mg/dL)',   type: 'number', required: true, min: 0, max: 200  },
      { id: 'tgMgDl',  label: 'Triglycerides (mg/dL)',     type: 'number', required: true, min: 0, max: 4500 },
    ],
    calculate: (inputs) => {
      const result = calculateLDL({
        tcMgDl:  Number(inputs.tcMgDl),
        hdlMgDl: Number(inputs.hdlMgDl),
        tgMgDl:  Number(inputs.tgMgDl),
      });
      return {
        calculatorId: 'ldl',
        score: result.ldlMgDl,
        unit: 'mg/dL',
        severity: result.severity,
        label: 'LDL Cholesterol',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'cardiac-output',
    title: 'Cardiac Output (Fick Principle)',
    shortTitle: 'Cardiac Output',
    emoji: '🫀',
    description: 'Calculates cardiac output, cardiac index, and stroke volume using the Fick equation',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['cardiac output', 'Fick', 'cardiac index', 'stroke volume', 'hemodynamics', 'BSA', 'ICU'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateCardiacOutput({
        weightKg:  Number(inputs.weightKg),
        heightCm:  Number(inputs.heightCm),
        sao2Pct:   Number(inputs.sao2Pct),
        svo2Pct:   Number(inputs.svo2Pct),
        hbGdl:     Number(inputs.hbGdl),
        heartRate: Number(inputs.heartRate),
        age70plus: Boolean(inputs.age70plus),
      });
      return {
        calculatorId: 'cardiac-output',
        score: result.co,
        unit: 'L/min',
        severity: result.co >= 4 && result.co <= 8 ? 'success' as const : result.co < 4 ? 'danger' as const : 'warning' as const,
        label: 'Cardiac Output',
        interpretation: `CO: ${result.co} L/min | CI: ${result.ci} L/min/m² | SV: ${result.sv} mL/beat`,
      };
    },
  },
  {
    id: 'map',
    title: 'Mean Arterial Pressure (MAP)',
    shortTitle: 'MAP',
    emoji: '🩺',
    description: 'Calculates mean arterial pressure from systolic and diastolic blood pressure',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['MAP', 'mean arterial pressure', 'blood pressure', 'hemodynamics', 'critical care'],
    inputs: [
      { id: 'sbp', label: 'Systolic BP (mm Hg)',  type: 'number', required: true, min: 40,  max: 300 },
      { id: 'dbp', label: 'Diastolic BP (mm Hg)', type: 'number', required: true, min: 20,  max: 200 },
    ],
    calculate: (inputs) => {
      const result = calculateMAP({ sbp: Number(inputs.sbp), dbp: Number(inputs.dbp) });
      return {
        calculatorId: 'map',
        score: result.map,
        unit: 'mm Hg',
        severity: result.severity,
        label: 'MAP',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'qtc',
    title: 'Corrected QT Interval (QTc)',
    shortTitle: 'QTc',
    emoji: '❤️',
    description: 'Calculates corrected QT interval using Bazett, Fridericia, Framingham, Hodges, and Rautaharju formulas',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['QTc', 'QT interval', 'Bazett', 'Fridericia', 'EKG', 'arrhythmia', 'TdP', 'cardiology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateQTc({ qtMs: Number(inputs.qtMs), heartRate: Number(inputs.heartRate) });
      const formula = (inputs.formula as string) ?? 'bazett';
      const qtcValue = result.results[formula as keyof typeof result.results];
      const interp   = result.interpretation(qtcValue);
      return {
        calculatorId: 'qtc',
        score: qtcValue,
        unit: 'ms',
        severity: interp.severity,
        label: `QTc (${formula})`,
        interpretation: interp.text,
      };
    },
  },
  {
    id: 'grace',
    title: 'GRACE ACS Risk Score',
    shortTitle: 'GRACE',
    emoji: '❤️',
    description: 'Predicts in-hospital and 6-month mortality after acute coronary syndrome using the Fox nomogram',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['GRACE', 'ACS', 'NSTEMI', 'STEMI', 'mortality', 'cardiology', 'risk score'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateGrace({
        age:             Number(inputs.age),
        heartRate:       Number(inputs.heartRate),
        systolicBP:      Number(inputs.systolicBP),
        creatinineMgDl:  Number(inputs.creatinineMgDl),
        cardiacArrest:   Number(inputs.cardiacArrest)   as 0|1,
        stDeviation:     Number(inputs.stDeviation)     as 0|1,
        abnormalEnzymes: Number(inputs.abnormalEnzymes) as 0|1,
        killipClass:     Number(inputs.killip)          as 1|2|3|4,
      });
      return {
        calculatorId: 'grace',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'GRACE Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'timi-ua-nstemi',
    title: 'TIMI Risk Score for UA/NSTEMI',
    shortTitle: 'TIMI UA/NSTEMI',
    emoji: '❤️',
    description: 'Predicts 14-day risk of adverse cardiac events in unstable angina and NSTEMI',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['TIMI', 'UA', 'NSTEMI', 'ACS', 'chest pain', 'cardiology', 'risk score'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateTimiUaNstemi({
        age65:          Number(inputs.age65)          as 0|1,
        cadRiskFactors: Number(inputs.cadRiskFactors) as 0|1,
        knownCAD:       Number(inputs.knownCAD)       as 0|1,
        asaUse:         Number(inputs.asaUse)         as 0|1,
        severeAngina:   Number(inputs.severeAngina)   as 0|1,
        stChanges:      Number(inputs.stChanges)      as 0|1,
        cardiacMarker:  Number(inputs.cardiacMarker)  as 0|1,
      });
      return {
        calculatorId: 'timi-ua-nstemi',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'TIMI Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'has-bled',
    title: 'HAS-BLED Score for Major Bleeding Risk',
    shortTitle: 'HAS-BLED',
    emoji: '🩸',
    description: 'Estimates risk of major bleeding in patients on anticoagulation for atrial fibrillation',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['HAS-BLED', 'bleeding risk', 'anticoagulation', 'atrial fibrillation', 'AF', 'warfarin'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateHasBled({
        hypertension:  Number(inputs.hypertension)  as 0|1,
        renalDisease:  Number(inputs.renalDisease)  as 0|1,
        liverDisease:  Number(inputs.liverDisease)  as 0|1,
        strokeHistory: Number(inputs.stroke)        as 0|1,
        priorBleeding: Number(inputs.bleeding)      as 0|1,
        labileINR:     Number(inputs.labileINR)     as 0|1,
        elderly:       Number(inputs.elderly)       as 0|1,
        medications:   Number(inputs.medications)   as 0|1,
        alcoholUse:    Number(inputs.alcohol)       as 0|1,
      });
      return {
        calculatorId: 'has-bled',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'HAS-BLED Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'cha2ds2-vasc',
    title: 'CHA₂DS₂-VASc Score',
    shortTitle: 'CHA₂DS₂-VASc',
    emoji: '❤️',
    description: 'Estimates stroke risk in atrial fibrillation to guide anticoagulation therapy',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['CHA2DS2-VASc', 'atrial fibrillation', 'AF', 'stroke', 'anticoagulation', 'cardiology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateCha2ds2Vasc({
        age:          Number(inputs.age)          as 0|1|2,
        sex:          Number(inputs.sex)          as 0|1,
        chf:          Number(inputs.chf)          as 0|1,
        hypertension: Number(inputs.hypertension) as 0|1,
        stroke:       Number(inputs.stroke)       as 0|2,
        vascular:     Number(inputs.vascular)     as 0|1,
        diabetes:     Number(inputs.diabetes)     as 0|1,
      });
      return {
        calculatorId: 'cha2ds2-vasc',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'CHA₂DS₂-VASc Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'acr',
    title: 'Albumin-Creatinine Ratio (ACR)',
    shortTitle: 'ACR',
    emoji: '🧪',
    description: 'Calculates urine albumin-to-creatinine ratio for CKD staging and proteinuria classification',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    tags: ['ACR', 'albumin', 'creatinine', 'proteinuria', 'microalbuminuria', 'CKD', 'KDIGO'],
    inputs: [
      { id: 'albumin',    label: 'Urine Albumin (mg/dL)',    type: 'number', required: true, min: 0, max: 500  },
      { id: 'creatinine', label: 'Urine Creatinine (g/dL)',  type: 'number', required: true, min: 0, max: 5    },
    ],
    calculate: (inputs) => {
      const result = calculateACR({
        albuminMgDl:   Number(inputs.albumin),
        creatinineGDl: Number(inputs.creatinine),
      });
      return {
        calculatorId: 'acr',
        score: result.acr,
        unit: 'mg/g',
        severity: result.severity,
        label: 'ACR',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'plasma-dosage',
    title: 'Plasma Dosage (FFP)',
    shortTitle: 'Plasma Dosage',
    emoji: '🩸',
    description: 'Calculates total FFP volume and number of units required based on patient weight and desired dosage',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    tags: ['FFP', 'fresh frozen plasma', 'plasma dosage', 'transfusion', 'coagulation', 'hematology'],
    inputs: [
      { id: 'weightKg',     label: 'Patient weight (kg)',         type: 'number', required: true, min: 1,  max: 300 },
      { id: 'dosageMlKg',   label: 'Desired plasma dosage (mL/kg)', type: 'number', required: true, min: 1, max: 30  },
      { id: 'unitVolumeMl', label: 'Unit volume (mL)',            type: 'number', required: true, min: 50, max: 500 },
    ],
    calculate: (inputs) => {
      const result = calculatePlasmaDosage({
        weightKg:     Number(inputs.weightKg),
        dosageMlKg:   Number(inputs.dosageMlKg),
        unitVolumeMl: Number(inputs.unitVolumeMl),
      });
      return {
        calculatorId: 'plasma-dosage',
        score: result.totalMl,
        unit: 'mL',
        severity: result.severity,
        label: 'Total Plasma Dosage',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'cci',
    title: 'Corrected Count Increment (CCI)',
    shortTitle: 'CCI',
    emoji: '🩸',
    description: 'Assesses platelet transfusion response using corrected count increment to detect refractoriness',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['CCI', 'platelet', 'transfusion', 'refractoriness', 'BSA', 'hematology', 'oncology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateCCI({
        prePlt:      Number(inputs.prePlt),
        postPlt:     Number(inputs.postPlt),
        timeHour:    Number(inputs.timeHour) as 1|20,
        heightCm:    Number(inputs.heightCm),
        weightKg:    Number(inputs.weightKg),
        unitContent: Number(inputs.unitContent),
      });
      return {
        calculatorId: 'cci',
        score: result.cci,
        unit: '',
        severity: result.severity,
        label: 'CCI',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'blood-volume',
    title: 'Blood Volume Calculation',
    shortTitle: 'Blood Volume',
    emoji: '🩸',
    description: 'Calculates total blood volume, RBC volume, and plasma volume for adults, children, and neonates',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['blood volume', 'TBV', 'RBC volume', 'plasma volume', 'Nadler', 'hematocrit', 'hematology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateBloodVolume({
        patientType: inputs.patientType as any,
        sex:         inputs.sex as any,
        heightCm:    Number(inputs.heightCm)  || undefined,
        weightKg:    Number(inputs.weightKg),
        hematocrit:  Number(inputs.hematocrit) || undefined,
      });
      return {
        calculatorId: 'blood-volume',
        score: result.tbvMl,
        unit: 'mL',
        severity: result.severity,
        label: 'Total Blood Volume',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'ipss-r',
    title: 'IPSS-R for MDS',
    shortTitle: 'IPSS-R',
    emoji: '🩸',
    description: 'Revised International Prognostic Scoring System for myelodysplastic syndromes — 5 weighted criteria',
    category: 'hematology',
    icon: 'FlaskConical',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    tags: ['IPSS-R', 'MDS', 'myelodysplastic', 'prognosis', 'cytogenetics', 'hematology', 'oncology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateIpssR({
        cytogenetics: Number(inputs.cytogenetics) as 0|1|2|3|4,
        blasts:       Number(inputs.blasts)       as 0|1|2|3,
        hemoglobin:   Number(inputs.hemoglobin)   as 0|1|1.5,
        platelets:    Number(inputs.platelets)    as 0|0.5|1,
        anc:          Number(inputs.anc)          as 0|0.5,
      });
      return {
        calculatorId: 'ipss-r',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'IPSS-R Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'ipss',
    title: 'IPSS for MDS (Original)',
    shortTitle: 'IPSS',
    emoji: '🩸',
    description: 'Original International Prognostic Scoring System for myelodysplastic syndromes — karyotype, blasts, cytopenias',
    category: 'hematology',
    icon: 'FlaskConical',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    tags: ['IPSS', 'MDS', 'myelodysplastic', 'prognosis', 'karyotype', 'hematology', 'oncology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateIPSS({
        karyotype:  Number(inputs.karyotype)  as 0|0.5|1,
        blasts:     Number(inputs.blasts)     as 0|0.5|1.5|2,
        cytopenias: Number(inputs.cytopenias) as 0|0.5,
      });
      return {
        calculatorId: 'ipss',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'IPSS Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'flipi',
    title: 'FLIPI Score for Follicular Lymphoma',
    shortTitle: 'FLIPI',
    emoji: '🩸',
    description: 'Estimates prognosis in follicular lymphoma using 5 clinical factors',
    category: 'hematology',
    icon: 'FlaskConical',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    tags: ['FLIPI', 'follicular lymphoma', 'lymphoma', 'prognosis', 'hematology', 'oncology', 'LDH'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateFLIPI({
        age60:       Number(inputs.age60)      as 0|1,
        nodalSites:  Number(inputs.nodalSites) as 0|1,
        ldhElevated: Number(inputs.ldh)        as 0|1,
        hemoglobin:  Number(inputs.hemoglobin) as 0|1,
        stageIIIIV:  Number(inputs.stageIIIIV) as 0|1,
      });
      return {
        calculatorId: 'flipi',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'FLIPI Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'cll-ipi',
    title: 'CLL-IPI',
    shortTitle: 'CLL-IPI',
    emoji: '🩸',
    description: 'International Prognostic Index for chronic lymphocytic leukaemia using 5 weighted criteria',
    category: 'hematology',
    icon: 'FlaskConical',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    tags: ['CLL', 'CLL-IPI', 'chronic lymphocytic leukaemia', 'IGHV', 'TP53', 'β2-microglobulin', 'prognosis'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateCllIpi({
        age:           Number(inputs.age)           as 0|1,
        clinicalStage: Number(inputs.clinicalStage) as 0|1,
        b2m:           Number(inputs.b2m)           as 0|2,
        ighv:          Number(inputs.ighv)          as 0|2,
        tp53:          Number(inputs.tp53)          as 0|4,
      });
      return {
        calculatorId: 'cll-ipi',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'CLL-IPI Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'wells-dvt',
    title: "Wells' Criteria for DVT",
    shortTitle: "Wells' DVT",
    emoji: '🩺',
    description: 'Stratifies pre-test probability of deep vein thrombosis using 10 clinical criteria',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ["Wells", 'DVT', 'deep vein thrombosis', 'thrombosis', 'D-dimer', 'ultrasound', 'hematology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateWellsDvt({
        activeCancer:     Number(inputs.activeCancer)    as 0|1,
        bedridden:        Number(inputs.bedridden)       as 0|1,
        calfSwelling:     Number(inputs.calfSwelling)    as 0|1,
        collateralVeins:  Number(inputs.collateralVeins) as 0|1,
        entireLegSwollen: Number(inputs.entireLeg)       as 0|1,
        localTenderness:  Number(inputs.localTenderness) as 0|1,
        pittingEdema:     Number(inputs.pittingEdema)    as 0|1,
        paralysis:        Number(inputs.paralysis)       as 0|1,
        priorDvt:         Number(inputs.priorDvt)        as 0|1,
        altDiagnosis:     Number(inputs.altDiagnosis)    as 0|-2,
      });
      return {
        calculatorId: 'wells-dvt',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: "Wells' DVT Score",
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'calcium-correction',
    title: 'Calcium Correction for Hypoalbuminaemia',
    shortTitle: 'Calcium Correction',
    emoji: '🧪',
    description: 'Corrects total serum calcium for low albumin levels to estimate physiologically active calcium',
    category: 'renal',
    icon: 'FlaskConical',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    tags: ['calcium', 'albumin', 'hypoalbuminaemia', 'corrected calcium', 'hypocalcaemia', 'hypercalcaemia'],
    inputs: [
      { id: 'calciumMgDl',      label: 'Calcium (mg/dL)',        type: 'number', required: true, min: 0, max: 20 },
      { id: 'albuminGdl',       label: 'Albumin (g/dL)',         type: 'number', required: true, min: 0, max: 6  },
      { id: 'normalAlbuminGdl', label: 'Normal Albumin (g/dL)',  type: 'number', required: true, min: 0, max: 6  },
    ],
    calculate: (inputs) => {
      const result = calculateCalciumCorrection({
        calciumMgDl:      Number(inputs.calciumMgDl),
        albuminGdl:       Number(inputs.albuminGdl),
        normalAlbuminGdl: Number(inputs.normalAlbuminGdl),
      });
      return {
        calculatorId: 'calcium-correction',
        score: result.correctedCaMgDl,
        unit: 'mg/dL',
        severity: result.severity,
        label: 'Corrected Calcium',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'mentzer-index',
    title: 'Mentzer Index',
    shortTitle: 'Mentzer Index',
    emoji: '🩸',
    description: 'Differentiates iron deficiency anaemia from thalassaemia trait using MCV and RBC count',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['Mentzer', 'MCV', 'RBC', 'thalassaemia', 'iron deficiency', 'anaemia', 'hematology'],
    inputs: [
      { id: 'mcv',      label: 'MCV (fL)',                   type: 'number', required: true, min: 0, max: 150 },
      { id: 'rbcCount', label: 'RBC count (×10⁶ cells/µL)', type: 'number', required: true, min: 0, max: 10  },
    ],
    calculate: (inputs) => {
      const result = calculateMentzerIndex({
        mcv:      Number(inputs.mcv),
        rbcCount: Number(inputs.rbcCount),
      });
      return {
        calculatorId: 'mentzer-index',
        score: result.index,
        unit: '',
        severity: result.severity,
        label: 'Mentzer Index',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'anc',
    title: 'Absolute Neutrophil Count (ANC)',
    shortTitle: 'ANC',
    emoji: '🧪',
    description: 'Calculates ANC from WBC count and differential to assess neutropenia severity',
    category: 'hematology',
    icon: 'FlaskConical',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    tags: ['ANC', 'neutrophil', 'neutropenia', 'WBC', 'differential', 'hematology', 'CBC'],
    inputs: [
      { id: 'neutrophilsPct', label: '% neutrophils',     type: 'number', required: true, min: 0, max: 100 },
      { id: 'bandsPct',       label: '% bands',           type: 'number', required: true, min: 0, max: 100 },
      { id: 'wbcCount',       label: 'WBC count (×10³/µL)', type: 'number', required: true, min: 0, max: 100 },
    ],
    calculate: (inputs) => {
      const result = calculateANC({
        neutrophilsPct: Number(inputs.neutrophilsPct),
        bandsPct:       Number(inputs.bandsPct),
        wbcCount:       Number(inputs.wbcCount),
      });
      return {
        calculatorId: 'anc',
        score: result.anc,
        unit: 'cells/µL',
        severity: result.severity,
        label: 'ANC',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'corrected-reticulocyte',
    title: 'Corrected Reticulocyte Percentage',
    shortTitle: 'Corrected Retic',
    emoji: '🩸',
    description: 'Calculates corrected reticulocyte %, absolute reticulocyte count, and reticulocyte production index (RPI)',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['reticulocyte', 'corrected reticulocyte', 'RPI', 'ARC', 'anemia', 'hematology', 'hematocrit'],
    inputs: [
      { id: 'reticulocytePct', label: '% reticulocytes',        type: 'number', required: true, min: 0, max: 100 },
      { id: 'rbcCount',        label: 'RBC count (×10⁶ cells/µL)', type: 'number', required: true, min: 0, max: 10 },
      { id: 'measuredHct',     label: 'Measured hematocrit (%)', type: 'number', required: true, min: 0, max: 70 },
      { id: 'normalHct',       label: 'Normal hematocrit (%)',   type: 'number', required: true, min: 0, max: 70 },
    ],
    calculate: (inputs) => {
      const result = calculateCorrectedReticulocyte({
        reticulocytePct: Number(inputs.reticulocytePct),
        rbcCount:        Number(inputs.rbcCount),
        measuredHct:     Number(inputs.measuredHct),
        normalHct:       Number(inputs.normalHct),
      });
      return {
        calculatorId: 'corrected-reticulocyte',
        score: result.correctedRetic,
        unit: '%',
        severity: result.severity,
        label: 'Corrected Reticulocyte %',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'dapt',
    title: 'DAPT Score',
    shortTitle: 'DAPT',
    emoji: '❤️',
    description: 'Predicts net benefit of prolonged dual antiplatelet therapy after coronary stent implantation',
    category: 'critical-care',
    icon: 'HeartPulse',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['DAPT', 'dual antiplatelet', 'stent', 'PCI', 'ischemia', 'bleeding', 'cardiology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateDapt({
        age:             Number(inputs.age)            as -2|-1|0,
        smoking:         Number(inputs.smoking)         as 0|1,
        diabetes:        Number(inputs.diabetes)        as 0|1,
        miPresentation:  Number(inputs.miPresentation)  as 0|1,
        priorPciMi:      Number(inputs.priorPciMi)      as 0|1,
        paclitaxelStent: Number(inputs.paclitaxel)      as 0|1,
        stentDiameter:   Number(inputs.stentDiam)       as 0|1,
        chfLvef:         Number(inputs.chfLvef)         as 0|2,
        veinGraft:       Number(inputs.veinGraft)       as 0|2,
      });
      return {
        calculatorId: 'dapt',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'DAPT Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'aspects',
    title: 'ASPECTS Score',
    shortTitle: 'ASPECTS',
    emoji: '🧠',
    description: 'Alberta Stroke Program Early CT Score — quantifies early ischemic change in MCA territory (10 regions, score 0–10)',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['ASPECTS', 'stroke', 'CT', 'MCA', 'ischemia', 'thrombolysis', 'tPA', 'neurology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateASPECTS({
        caudate:         Number(inputs.caudate         ?? 0) as 0|-1,
        internalCapsule: Number(inputs.internalCapsule ?? 0) as 0|-1,
        lentiform:       Number(inputs.lentiform       ?? 0) as 0|-1,
        insularRibbon:   Number(inputs.insularRibbon   ?? 0) as 0|-1,
        m1:              Number(inputs.m1              ?? 0) as 0|-1,
        m2:              Number(inputs.m2              ?? 0) as 0|-1,
        m3:              Number(inputs.m3              ?? 0) as 0|-1,
        m4:              Number(inputs.m4              ?? 0) as 0|-1,
        m5:              Number(inputs.m5              ?? 0) as 0|-1,
        m6:              Number(inputs.m6              ?? 0) as 0|-1,
      });
      return { calculatorId: 'aspects', score: result.score, unit: '', severity: result.severity, label: 'ASPECTS Score', interpretation: result.interpretation };
    },
  },
  {
    id: 'edss',
    title: 'Expanded Disability Status Scale (EDSS)',
    shortTitle: 'EDSS',
    emoji: '🧠',
    description: 'Quantifies MS disability from 0–10 using ambulation and 8 functional systems (pyramidal, cerebellar, brainstem, sensory, bowel/bladder, visual, cerebral, other)',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['EDSS', 'multiple sclerosis', 'MS', 'disability', 'FSS', 'Kurtzke', 'neurology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateEDSS({
        ambulation: Number(inputs.ambulation ?? 0),
        fss: {
          pyramidal:    Number(inputs.pyramidal    ?? 0),
          cerebellar:   Number(inputs.cerebellar   ?? 0),
          brainstem:    Number(inputs.brainstem    ?? 0),
          sensory:      Number(inputs.sensory      ?? 0),
          bowelBladder: Number(inputs.bowelBladder ?? 0),
          visual:       Number(inputs.visual       ?? 0),
          cerebral:     Number(inputs.cerebral     ?? 0),
          other:        Number(inputs.other        ?? 0),
        },
      });
      return { calculatorId: 'edss', score: result.score, unit: '', severity: result.severity, label: 'EDSS Score', interpretation: result.interpretation };
    },
  },
  {
    id: 'abcd2',
    title: 'ABCD² Score for TIA',
    shortTitle: 'ABCD²',
    emoji: '🧠',
    description: 'Stratifies 2-day stroke risk after TIA using age, blood pressure, clinical features, duration, and diabetes',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['ABCD2', 'TIA', 'transient ischemic attack', 'stroke risk', 'neurology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateABCD2({
        age60:    Number(inputs.age60)    as 0|1,
        bp:       Number(inputs.bp)       as 0|1,
        clinical: Number(inputs.clinical) as 0|1|2,
        duration: Number(inputs.duration) as 0|1|2,
        diabetes: Number(inputs.diabetes) as 0|1,
      });
      return { calculatorId: 'abcd2', score: result.score, unit: '', severity: result.severity, label: 'ABCD² Score', interpretation: result.interpretation };
    },
  },
  {
    id: 'news',
    title: 'National Early Warning Score (NEWS)',
    shortTitle: 'NEWS',
    emoji: '🚨',
    description: 'Aggregate physiological score (respiratory rate, SpO₂, supplemental O₂, temperature, blood pressure, heart rate, consciousness) to detect acute clinical deterioration',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['NEWS', 'early warning', 'deterioration', 'sepsis', 'vital signs', 'acute', 'critical care'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateNEWS({
        respiratory:    Number(inputs.respiratory ?? 0),
        spo2:           Number(inputs.spo2 ?? 0),
        supplementalO2: Number(inputs.supplementalO2 ?? 0),
        temperature:    Number(inputs.temperature ?? 0),
        systolicBP:     Number(inputs.systolicBP ?? 0),
        heartRate:      Number(inputs.heartRate ?? 0),
        consciousness:  Number(inputs.consciousness ?? 0),
      });
      return { calculatorId: 'news', score: result.score, unit: 'points', severity: result.severity, label: 'NEWS', interpretation: result.interpretation };
    },
  },
  {
    id: 'ich',
    title: 'Intracerebral Hemorrhage (ICH) Score',
    shortTitle: 'ICH Score',
    emoji: '🧠',
    description: 'Predicts 30-day mortality after intracerebral hemorrhage using GCS, age, volume, IVH, and location',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['ICH', 'intracerebral hemorrhage', 'stroke', 'mortality', 'GCS', 'neurology'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateICH({
        gcs:            Number(inputs.gcs)            as 0|1|2,
        age80:          Number(inputs.age80)          as 0|1,
        ichVolume:      Number(inputs.ichVolume)      as 0|1,
        ivh:            Number(inputs.ivh)            as 0|1,
        infratentorial: Number(inputs.infratentorial) as 0|1,
      });
      return { calculatorId: 'ich', score: result.score, unit: '', severity: result.severity, label: 'ICH Score', interpretation: result.interpretation };
    },
  },
  {
    id: 'mrs',
    title: 'Modified Rankin Scale (mRS)',
    shortTitle: 'mRS',
    emoji: '🧠',
    description: 'Measures degree of disability or dependence after stroke on a 0–6 scale',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['mRS', 'modified Rankin scale', 'disability', 'stroke outcome', 'neurology', 'function'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateMRS(Number(inputs.score ?? 0));
      return { calculatorId: 'mrs', score: result.score, unit: '', severity: result.severity, label: 'mRS Score', interpretation: result.interpretation };
    },
  },
  {
    id: 'hunt-hess',
    title: 'Hunt and Hess Scale',
    shortTitle: 'Hunt-Hess',
    emoji: '🧠',
    description: 'Grades subarachnoid hemorrhage clinical severity to predict surgical risk and outcome (Grade I–V)',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['Hunt-Hess', 'subarachnoid hemorrhage', 'SAH', 'aneurysm', 'neurology', 'grading'],
    inputs: [],
    calculate: (inputs) => {
      const result = calculateHuntHess(Number(inputs.grade ?? 1));
      return { calculatorId: 'hunt-hess', score: result.score, unit: '', severity: result.severity, label: 'Hunt-Hess Grade', interpretation: result.interpretation };
    },
  },
  {
    id: 'nihss',
    title: 'NIH Stroke Scale (NIHSS)',
    shortTitle: 'NIHSS',
    emoji: '🧠',
    description: 'Quantifies stroke severity across 15 neurological domains to guide treatment and predict outcomes',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    tags: ['NIHSS', 'stroke', 'NIH', 'neurological', 'tPA', 'thrombolysis', 'neurology', 'cerebral infarction'],
    inputs: [],
    calculate: (inputs) => {
      const total =
        Number(inputs.loc ?? 0) + Number(inputs.locQ ?? 0) + Number(inputs.locC ?? 0) +
        Number(inputs.gaze ?? 0) + Number(inputs.visual ?? 0) + Number(inputs.facial ?? 0) +
        Number(inputs.leftArm ?? 0) + Number(inputs.rightArm ?? 0) +
        Number(inputs.leftLeg ?? 0) + Number(inputs.rightLeg ?? 0) +
        Number(inputs.ataxia ?? 0) + Number(inputs.sensation ?? 0) +
        Number(inputs.language ?? 0) + Number(inputs.dysarthria ?? 0) +
        Number(inputs.extinction ?? 0);
      const result = calculateNIHSS(total);
      return {
        calculatorId: 'nihss',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'NIHSS Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'iron-deficit',
    title: 'Iron Deficit Calculation (Ganzoni)',
    shortTitle: 'Iron Deficit',
    emoji: '🩸',
    description: 'Calculates total iron deficit using the Ganzoni formula from weight, target and actual hemoglobin, and iron stores',
    category: 'hematology',
    icon: 'Droplets',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    tags: ['iron deficit', 'Ganzoni', 'anemia', 'hemoglobin', 'iron therapy', 'hematology'],
    inputs: [
      { id: 'weightKg',     label: 'Weight (kg)',            type: 'number', required: true, min: 0, max: 300  },
      { id: 'targetHbGdl',  label: 'Target Hb (g/dL)',      type: 'number', required: true, min: 0, max: 25   },
      { id: 'actualHbGdl',  label: 'Actual Hb (g/dL)',      type: 'number', required: true, min: 0, max: 25   },
      { id: 'ironStoresMg', label: 'Iron stores (mg)',       type: 'number', required: true, min: 0, max: 2000 },
    ],
    calculate: (inputs) => {
      const result = calculateIronDeficit({
        weightKg:     Number(inputs.weightKg),
        targetHbGdl:  Number(inputs.targetHbGdl),
        actualHbGdl:  Number(inputs.actualHbGdl),
        ironStoresMg: Number(inputs.ironStoresMg),
      });
      return {
        calculatorId: 'iron-deficit',
        score: result.ironDeficitMg,
        unit: 'mg',
        severity: result.severity,
        label: 'Total Iron Deficit',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'apache2',
    title: 'APACHE II Score',
    shortTitle: 'APACHE II',
    emoji: '🏥',
    description: 'Acute Physiology and Chronic Health Evaluation II — ICU severity of illness and predicted hospital mortality',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950',
    tags: ['APACHE II', 'ICU', 'critical care', 'severity', 'mortality', 'APS'],
    inputs: [
      { id: 'chronicHealth',    label: 'Chronic health',     type: 'number', required: true },
      { id: 'age',              label: 'Age',                type: 'number', required: true },
      { id: 'tempC',            label: 'Temperature (°C)',   type: 'number', required: true },
      { id: 'map',              label: 'MAP (mmHg)',         type: 'number', required: true },
      { id: 'ph',               label: 'Arterial pH',        type: 'number', required: true },
      { id: 'hr',               label: 'Heart rate',         type: 'number', required: true },
      { id: 'rr',               label: 'Respiratory rate',   type: 'number', required: true },
      { id: 'sodium',           label: 'Sodium (mmol/L)',    type: 'number', required: true },
      { id: 'potassium',        label: 'Potassium (mmol/L)', type: 'number', required: true },
      { id: 'creatinine',       label: 'Creatinine (mg/dL)', type: 'number', required: true },
      { id: 'acuteRenalFailure',label: 'Acute renal failure',type: 'number', required: true },
      { id: 'hematocrit',       label: 'Hematocrit (%)',     type: 'number', required: true },
      { id: 'wbc',              label: 'WBC (×10³/µL)',      type: 'number', required: true },
      { id: 'gcs',              label: 'GCS',                type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateApache2({
        chronicHealth:    Number(inputs.chronicHealth) as 0 | 1,
        age:              Number(inputs.age),
        tempC:            Number(inputs.tempC),
        map:              Number(inputs.map),
        ph:               Number(inputs.ph),
        hr:               Number(inputs.hr),
        rr:               Number(inputs.rr),
        sodium:           Number(inputs.sodium),
        potassium:        Number(inputs.potassium),
        creatinine:       Number(inputs.creatinine),
        acuteRenalFailure: Number(inputs.acuteRenalFailure) as 0 | 1,
        hematocrit:       Number(inputs.hematocrit),
        wbc:              Number(inputs.wbc),
        gcs:              Number(inputs.gcs),
        fio2High:         Boolean(inputs.fio2High),
        pao2:             inputs.pao2 ? Number(inputs.pao2) : undefined,
        aado2:            inputs.aado2 ? Number(inputs.aado2) : undefined,
      });
      return {
        calculatorId: 'apache2',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'APACHE II Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'moca',
    title: 'Montreal Cognitive Assessment (MoCA)',
    shortTitle: 'MoCA',
    emoji: '🧠',
    description: 'Screen for mild cognitive impairment across visuospatial, naming, attention, language, abstraction, recall, and orientation domains',
    category: 'critical-care',
    icon: 'Brain',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    tags: ['MoCA', 'cognitive', 'dementia', 'MCI', 'neurology', 'Montreal'],
    inputs: [
      { id: 'score', label: 'MoCA Score', type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateMoCA(Number(inputs.score));
      return {
        calculatorId: 'moca',
        score: result.score,
        unit: '/ 30',
        severity: result.severity,
        label: 'MoCA Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'curb65',
    title: 'CURB-65 Score',
    shortTitle: 'CURB-65',
    emoji: '🫁',
    description: 'Predicts 30-day mortality in community-acquired pneumonia to guide inpatient vs outpatient management',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    tags: ['CURB-65', 'pneumonia', 'CAP', 'severity', 'mortality', 'pulmonary'],
    inputs: [
      { id: 'confusion', label: 'Confusion',        type: 'number', required: true },
      { id: 'bun',       label: 'BUN >19 mg/dL',    type: 'number', required: true },
      { id: 'rr',        label: 'Resp Rate ≥30',     type: 'number', required: true },
      { id: 'bp',        label: 'Low BP',            type: 'number', required: true },
      { id: 'age65',     label: 'Age ≥65',           type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateCURB65({
        confusion: Number(inputs.confusion) as 0 | 1,
        bun:       Number(inputs.bun)       as 0 | 1,
        rr:        Number(inputs.rr)        as 0 | 1,
        bp:        Number(inputs.bp)        as 0 | 1,
        age65:     Number(inputs.age65)     as 0 | 1,
      });
      return {
        calculatorId: 'curb65',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'CURB-65 Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'bode',
    title: 'BODE Index for COPD Survival',
    shortTitle: 'BODE Index',
    emoji: '🫁',
    description: 'Predicts COPD survival using Body-mass index, airflow Obstruction, Dyspnea, and Exercise capacity',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50 dark:bg-sky-950',
    tags: ['BODE', 'COPD', 'survival', 'spirometry', 'FEV1', 'dyspnea', 'pulmonary'],
    inputs: [
      { id: 'fev1', label: 'FEV₁ (% predicted)', type: 'number', required: true },
      { id: 'mwd',  label: '6MWD (m)',            type: 'number', required: true },
      { id: 'mmrc', label: 'mMRC',                type: 'number', required: true },
      { id: 'bmi',  label: 'BMI',                 type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const score = Number(inputs.fev1) + Number(inputs.mwd) + Number(inputs.mmrc) + Number(inputs.bmi);
      const result = calculateBODE(score);
      return {
        calculatorId: 'bode',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'BODE Index',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'gold-copd',
    title: 'GOLD COPD Assessment',
    shortTitle: 'GOLD COPD',
    emoji: '🫁',
    description: 'Classifies COPD severity (Grade 1–4) and guides treatment (Group A/B/E) based on FEV₁, symptoms, and exacerbation history (GOLD 2024)',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    tags: ['GOLD', 'COPD', 'FEV1', 'spirometry', 'dyspnea', 'exacerbation', 'pulmonary'],
    inputs: [
      { id: 'symptoms',       label: 'Symptom burden',      type: 'number', required: true },
      { id: 'exacerbation',   label: 'Exacerbation history', type: 'number', required: true },
      { id: 'fev1',           label: 'FEV₁ % predicted',    type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateGOLD({
        symptoms:        Number(inputs.symptoms) === 0 ? 'lower' : 'higher',
        exacerbationIdx: Number(inputs.exacerbation) as 0 | 1 | 2 | 3,
        fev1Idx:         Number(inputs.fev1) as 0 | 1 | 2 | 3,
      });
      return {
        calculatorId: 'gold-copd',
        score: result.grade,
        unit: '',
        severity: result.groupSeverity,
        label: `GOLD ${result.grade} / Group ${result.group}`,
        interpretation: `${result.gradeInterpretation}; ${result.groupInterpretation}`,
      };
    },
  },
  {
    id: 'perc',
    title: 'PERC Rule for Pulmonary Embolism',
    shortTitle: 'PERC Rule',
    emoji: '🫀',
    description: 'Rules out PE without further testing in low pre-test probability patients when all 8 criteria are absent',
    category: 'cardiovascular',
    icon: 'Activity',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950',
    tags: ['PERC', 'pulmonary embolism', 'PE', 'rule-out', 'DVT', 'thrombosis'],
    inputs: [
      { id: 'age50',       label: 'Age ≥50',            type: 'number', required: true },
      { id: 'hr100',       label: 'HR ≥100',             type: 'number', required: true },
      { id: 'o2sat',       label: 'O₂ sat <95%',         type: 'number', required: true },
      { id: 'legSwelling', label: 'Leg swelling',         type: 'number', required: true },
      { id: 'hemoptysis',  label: 'Hemoptysis',           type: 'number', required: true },
      { id: 'surgery',     label: 'Recent surgery/trauma', type: 'number', required: true },
      { id: 'priorPeDvt',  label: 'Prior PE or DVT',      type: 'number', required: true },
      { id: 'hormones',    label: 'Hormone use',           type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculatePERC({
        age50:       Number(inputs.age50)       as 0 | 1,
        hr100:       Number(inputs.hr100)       as 0 | 1,
        o2sat:       Number(inputs.o2sat)       as 0 | 1,
        legSwelling: Number(inputs.legSwelling) as 0 | 1,
        hemoptysis:  Number(inputs.hemoptysis)  as 0 | 1,
        surgery:     Number(inputs.surgery)     as 0 | 1,
        priorPeDvt:  Number(inputs.priorPeDvt)  as 0 | 1,
        hormones:    Number(inputs.hormones)    as 0 | 1,
      });
      return {
        calculatorId: 'perc',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'PERC Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'stop-bang',
    title: 'STOP-BANG Score for Sleep Apnea',
    shortTitle: 'STOP-BANG',
    emoji: '😴',
    description: 'Screens for obstructive sleep apnea risk using 8 clinical criteria across subjective symptoms and objective measures',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950',
    tags: ['STOP-BANG', 'sleep apnea', 'OSA', 'snoring', 'sleep', 'screening'],
    inputs: [
      { id: 'snore',    label: 'Snore loudly',   type: 'number', required: true },
      { id: 'tired',    label: 'Daytime tired',   type: 'number', required: true },
      { id: 'observed', label: 'Observed apnea',  type: 'number', required: true },
      { id: 'pressure', label: 'High BP',         type: 'number', required: true },
      { id: 'bmi',      label: 'BMI >35',         type: 'number', required: true },
      { id: 'age',      label: 'Age >50',         type: 'number', required: true },
      { id: 'neck',     label: 'Neck >40 cm',     type: 'number', required: true },
      { id: 'gender',   label: 'Gender male',     type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateStopBang({
        snore:    Number(inputs.snore)    as 0|1,
        tired:    Number(inputs.tired)    as 0|1,
        observed: Number(inputs.observed) as 0|1,
        pressure: Number(inputs.pressure) as 0|1,
        bmi:      Number(inputs.bmi)      as 0|1,
        age:      Number(inputs.age)      as 0|1,
        neck:     Number(inputs.neck)     as 0|1,
        gender:   Number(inputs.gender)   as 0|1,
      });
      return {
        calculatorId: 'stop-bang',
        score: result.score,
        unit: '',
        severity: result.severity,
        label: 'STOP-BANG Score',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'mmrc',
    title: 'mMRC Dyspnea Scale',
    shortTitle: 'mMRC',
    emoji: '🫁',
    description: 'Classifies dyspnea severity using the Modified Medical Research Council scale (Grade 0–4)',
    category: 'critical-care',
    icon: 'Activity',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50 dark:bg-sky-950',
    tags: ['mMRC', 'dyspnea', 'COPD', 'breathlessness', 'MRC', 'pulmonary'],
    inputs: [
      { id: 'grade', label: 'mMRC Grade', type: 'number', required: true },
    ],
    calculate: (inputs) => {
      const result = calculateMMRC(Number(inputs.grade));
      return {
        calculatorId: 'mmrc',
        score: result.grade,
        unit: '',
        severity: result.severity,
        label: 'mMRC Grade',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'urr',
    title: 'Urea Reduction Ratio (URR)',
    shortTitle: 'URR',
    emoji: '🩺',
    description: 'Calculates URR to assess hemodialysis adequacy from pre- and post-dialysis urea levels',
    category: 'renal',
    icon: 'Droplets',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    tags: ['URR', 'urea reduction ratio', 'dialysis', 'hemodialysis', 'adequacy', 'KDOQI'],
    inputs: [
      { id: 'upre',  label: 'Pre-dialysis Urea (mg/dL)',  type: 'number', required: true, min: 1, max: 500 },
      { id: 'upost', label: 'Post-dialysis Urea (mg/dL)', type: 'number', required: true, min: 1, max: 500 },
    ],
    calculate: (inputs) => {
      const result = calculateURR({ upre: Number(inputs.upre), upost: Number(inputs.upost) });
      return {
        calculatorId: 'urr',
        score: result.urr,
        unit: '%',
        severity: result.severity,
        label: 'URR',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'bsa',
    title: 'BSA Mosteller formula',
    shortTitle: 'BSA Mosteller',
    emoji: '📐',
    description: 'Calculates Body Surface Area (BSA) using the Mosteller formula',
    category: 'nutrition',
    icon: 'Ruler',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    tags: ['BSA', 'body surface area', 'Mosteller', 'dosing', 'chemotherapy'],
    inputs: [
      { id: 'heightCm', label: 'Height (cm)', type: 'number', required: true, min: 1, max: 300 },
      { id: 'weightKg', label: 'Weight (kg)', type: 'number', required: true, min: 1, max: 500 },
    ],
    calculate: (inputs) => {
      const result = calculateBSA({ heightCm: Number(inputs.heightCm), weightKg: Number(inputs.weightKg) });
      return {
        calculatorId: 'bsa',
        score: result.bsa,
        unit: 'm²',
        severity: result.severity,
        label: 'Body Surface Area',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'bsa-costeff',
    title: 'BSA Costeff formula',
    shortTitle: 'BSA Costeff',
    emoji: '📐',
    description: 'Calculates Body Surface Area (BSA) using the Costeff formula (weight only)',
    category: 'nutrition',
    icon: 'Ruler',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    tags: ['BSA', 'body surface area', 'Costeff', 'dosing', 'pediatric'],
    inputs: [
      { id: 'weightKg', label: 'Weight (kg)', type: 'number', required: true, min: 1, max: 500 },
    ],
    calculate: (inputs) => {
      const result = calculateBSACosteff({ weightKg: Number(inputs.weightKg) });
      return {
        calculatorId: 'bsa-costeff',
        score: result.bsa,
        unit: 'm²',
        severity: result.severity,
        label: 'Body Surface Area',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'ejection-fraction',
    title: 'Ejection Fraction (EF)',
    shortTitle: 'EF',
    emoji: '🫀',
    description: 'Left ventricular ejection fraction and stroke volume from end-diastolic and end-systolic volumes',
    category: 'cardiovascular',
    icon: 'HeartPulse',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    tags: ['ejection fraction', 'EF', 'LVEF', 'stroke volume', 'heart failure', 'HFrEF'],
    inputs: [
      { id: 'edv', label: 'End-diastolic volume (mL)', type: 'number', required: true, min: 1, max: 600 },
      { id: 'esv', label: 'End-systolic volume (mL)',  type: 'number', required: true, min: 0, max: 600 },
    ],
    calculate: (inputs) => {
      const result = calculateEjectionFraction({ edv: Number(inputs.edv), esv: Number(inputs.esv) });
      return {
        calculatorId: 'ejection-fraction',
        score: result.ef,
        unit: '%',
        severity: result.severity,
        label: 'Ejection Fraction',
        interpretation: result.interpretation,
      };
    },
  },
  {
    id: 'scai-shock',
    title: 'SCAI Cardiogenic Shock Stage',
    shortTitle: 'SCAI Shock',
    emoji: '🫀',
    description: 'SCAI SHOCK classification (Stage A–E) for cardiogenic shock severity with in-hospital mortality',
    category: 'cardiovascular',
    icon: 'HeartPulse',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    tags: ['SCAI', 'cardiogenic shock', 'shock stage', 'mortality', 'critical care'],
    inputs: [
      {
        id: 'stage', label: 'SCAI Stage', type: 'select', required: true,
        options: [
          { value: 'A', label: 'A — At Risk' },
          { value: 'B', label: 'B — Beginning' },
          { value: 'C', label: 'C — Classic' },
          { value: 'D', label: 'D — Deteriorating' },
          { value: 'E', label: 'E — Extremis' },
        ],
      },
    ],
    calculate: (inputs) => {
      const result = calculateSCAIShock({ stage: (inputs.stage as any) ?? 'A' });
      return {
        calculatorId: 'scai-shock',
        score: result.stage as any,
        unit: '',
        severity: result.severity,
        label: `SCAI Stage ${result.stage}`,
        interpretation: result.interpretation,
      };
    },
  },
]

CALCULATORS.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

export function getCalculator(id: string): Calculator | undefined {
  return CALCULATORS.find((c) => c.id === id)
}

export function getCalculatorsByCategory(category: string): Calculator[] {
  return CALCULATORS.filter((c) => c.category === category)
}

export const CALCULATOR_CATEGORIES = [
  'critical-care',
  'renal',
  'liver',
  'nutrition',
  'obstetric',
  'hematology',
] as const
