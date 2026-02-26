import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import disposableDomains from 'disposable-email-domains';

const disposableSet = new Set<string>(disposableDomains);

@ValidatorConstraint({ name: 'isNotDisposableEmail', async: false })
export class IsNotDisposableEmailConstraint implements ValidatorConstraintInterface {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(email: string, _args: ValidationArguments): boolean {
    if (!email || !email.includes('@')) return true; // let @IsEmail() handle format
    const domain = email.split('@')[1].toLowerCase();
    return !disposableSet.has(domain);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultMessage(_args: ValidationArguments): string {
    return 'Disposable email addresses are not allowed';
  }
}

export function IsNotDisposableEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotDisposableEmailConstraint,
    });
  };
}
