// UPDATED: 2026-04-11 — verify against
// https://www.bir.gov.ph/ (TRAIN law tax table, 2023+)
// https://www.sss.gov.ph/ (contribution schedule)
// https://www.philhealth.gov.ph/ (premium contribution table)
// https://www.pagibigfund.gov.ph/ (HDMF contribution rates)

export interface PhTaxBreakdown {
  sss: number;
  philHealth: number;
  pagIbig: number;
  totalContributions: number;
  taxableIncome: number;
  withholdingTax: number;
  netTakeHome: number;
}

const SSS_EMPLOYEE_RATE = 0.045;
const SSS_MSC_FLOOR = 5000;
const SSS_MSC_CEILING = 35000;
const SSS_MSC_STEP = 500;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeSss(gross: number): number {
  const stepped = Math.floor(gross / SSS_MSC_STEP) * SSS_MSC_STEP;
  const msc = clamp(stepped, SSS_MSC_FLOOR, SSS_MSC_CEILING);
  return round2(msc * SSS_EMPLOYEE_RATE);
}

const EMPTY: PhTaxBreakdown = {
  sss: 0,
  philHealth: 0,
  pagIbig: 0,
  totalContributions: 0,
  taxableIncome: 0,
  withholdingTax: 0,
  netTakeHome: 0,
};

export function computePhTax(monthlyGross: number): PhTaxBreakdown {
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) {
    return EMPTY;
  }

  const sss = computeSss(monthlyGross);

  return {
    sss,
    philHealth: 0,
    pagIbig: 0,
    totalContributions: sss,
    taxableIncome: 0,
    withholdingTax: 0,
    netTakeHome: 0,
  };
}
