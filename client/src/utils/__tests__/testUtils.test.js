import { describe, it, expect } from 'vitest';

// Simple utility functions to test
export const add = (a, b) => a + b;
export const multiply = (a, b) => a * b;
export const divide = (a, b) => {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
};
export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

describe('Utility Functions', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(add(-1, -2)).toBe(-3);
    });

    it('should add zero', () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(multiply(3, 4)).toBe(12);
    });

    it('should multiply by zero', () => {
      expect(multiply(5, 0)).toBe(0);
    });

    it('should multiply negative numbers', () => {
      expect(multiply(-2, -3)).toBe(6);
    });
  });

  describe('divide', () => {
    it('should divide two positive numbers', () => {
      expect(divide(10, 2)).toBe(5);
    });

    it('should handle decimal results', () => {
      expect(divide(7, 2)).toBe(3.5);
    });

    it('should throw error when dividing by zero', () => {
      expect(() => divide(10, 0)).toThrow('Division by zero');
    });
  });

  describe('formatDate', () => {
    it('should format a valid date', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const formatted = formatDate(date);
      expect(formatted).toContain('2024');
      expect(formatted).toContain('January');
    });

    it('should handle date string input', () => {
      const formatted = formatDate('2024-12-25T12:00:00Z');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('December');
    });

    it('should handle timestamp input', () => {
      const timestamp = new Date('2024-06-01T12:00:00Z').getTime();
      const formatted = formatDate(timestamp);
      expect(formatted).toContain('2024');
      expect(formatted).toContain('June');
    });
  });
});
