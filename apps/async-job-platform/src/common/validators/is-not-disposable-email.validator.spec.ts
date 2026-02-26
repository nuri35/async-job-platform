import { validate } from 'class-validator';
import {
  IsNotDisposableEmail,
  IsNotDisposableEmailConstraint,
} from './is-not-disposable-email.validator';

class TestDto {
  @IsNotDisposableEmail()
  email!: string;
}

describe('IsNotDisposableEmail', () => {
  let constraint: IsNotDisposableEmailConstraint;

  beforeEach(() => {
    constraint = new IsNotDisposableEmailConstraint();
  });

  describe('Constraint - validate()', () => {
    it('should return true for normal email domains', () => {
      expect(constraint.validate('supsucirtu@necub.com', {} as any)).toBe(true);
      expect(constraint.validate('user@hotmail.com', {} as any)).toBe(true);
      expect(constraint.validate('user@yahoo.com', {} as any)).toBe(true);
      expect(constraint.validate('user@outlook.com', {} as any)).toBe(true);
    });

    it('should return false for disposable email domains', () => {
      expect(constraint.validate('user@mailinator.com', {} as any)).toBe(false);
      expect(constraint.validate('user@guerrillamail.com', {} as any)).toBe(
        false,
      );
      expect(constraint.validate('user@yopmail.com', {} as any)).toBe(false);
      expect(constraint.validate('user@sharklasers.com', {} as any)).toBe(
        false,
      );
    });

    it('should be case-insensitive for domain', () => {
      expect(constraint.validate('user@MAILINATOR.COM', {} as any)).toBe(false);
      expect(constraint.validate('user@Yopmail.Com', {} as any)).toBe(false);
    });

    it('should return true for empty/invalid emails (let @IsEmail handle those)', () => {
      expect(constraint.validate('', {} as any)).toBe(true);
      expect(constraint.validate('no-at-sign', {} as any)).toBe(true);
      expect(constraint.validate(null as any, {} as any)).toBe(true);
      expect(constraint.validate(undefined as any, {} as any)).toBe(true);
    });

    it('should return correct default message', () => {
      expect(constraint.defaultMessage({} as any)).toBe(
        'Disposable email addresses are not allowed',
      );
    });
  });

  describe('Decorator - DTO validation', () => {
    it('should pass validation for normal email', async () => {
      const dto = new TestDto();
      dto.email = 'user@gmail.com';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for disposable email', async () => {
      const dto = new TestDto();
      dto.email = 'user@mailinator.com';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isNotDisposableEmail');
    });
  });
});
