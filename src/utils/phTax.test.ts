import { describe, it, expect } from 'vitest';
import { computePhTax } from './phTax';

describe('computePhTax', () => {
  describe('zero and invalid input', () => {
    it('returns all zeros for gross of 0', () => {
      const r = computePhTax(0);
      expect(r.sss).toBe(0);
      expect(r.philHealth).toBe(0);
      expect(r.pagIbig).toBe(0);
      expect(r.totalContributions).toBe(0);
      expect(r.taxableIncome).toBe(0);
      expect(r.withholdingTax).toBe(0);
      expect(r.netTakeHome).toBe(0);
    });

    it('returns all zeros for negative gross', () => {
      const r = computePhTax(-1000);
      expect(r.sss).toBe(0);
      expect(r.netTakeHome).toBe(0);
    });

    it('returns all zeros for NaN gross', () => {
      const r = computePhTax(NaN);
      expect(r.sss).toBe(0);
    });
  });

  describe('SSS employee share', () => {
    it('clamps gross below floor to MSC 5000 (sss = 225)', () => {
      const r = computePhTax(4000);
      expect(r.sss).toBe(225);
    });

    it('computes 4.5% of MSC rounded down to nearest 500 at mid range (gross 27300 -> MSC 27000 -> 1215)', () => {
      const r = computePhTax(27300);
      expect(r.sss).toBe(1215);
    });

    it('clamps gross above ceiling to MSC 35000 (sss = 1575)', () => {
      const r = computePhTax(150000);
      expect(r.sss).toBe(1575);
    });
  });
});
